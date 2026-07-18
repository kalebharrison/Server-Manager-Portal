import fs from 'fs/promises';
import path from 'path';

export const createMediaUserService = ({
    plexApi,
    usersPath,
    deletedUsersPath,
    loadFile,
    saveFile,
    apiFetch,
    fetchWithTimeout,
    resolveIntegrationUrlForFetch,
    jellyfinHeaders,
    isJellyfinConfigured,
    withBasePath,
    isDeletedUser,
    addDays,
    getDaysUntilExpiry,
    sendExpiryEmail,
    appendAuditLog,
    membershipSync = null,
    log,
}) => {
    const ensureRequestAppMembership = (user, config) => {
        if (!membershipSync?.ensure || !user) return;
        Promise.resolve(membershipSync.ensure(user, config)).catch((error) => {
            log(`Request app membership ensure skipped: ${error.message}`);
        });
    };
    const ensureActiveRequestAppMembership = (users, config) => {
        if (!membershipSync?.ensureActive || !users?.length) return;
        Promise.resolve(membershipSync.ensureActive(users, config)).catch((error) => {
            log(`Request app membership backfill skipped: ${error.message}`);
        });
    };
    const removeRequestAppMembership = (user, config) => {
        if (!membershipSync?.remove || !user) return;
        Promise.resolve(membershipSync.remove(user, config)).catch((error) => {
            log(`Request app membership remove skipped: ${error.message}`);
        });
    };
    const syncUsers = async (config) => {
        log('Starting user sync from Plex...');
        let res;
        try {
            res = await apiFetch(
                `${plexApi}/users`,
                config.plexToken
            );
        } catch (error) {
            const reason = error?.cause?.message || error?.cause?.code || error?.message || 'network error';
            throw new Error(`request to ${plexApi}/users failed, reason: ${reason}`);
        }

        if (!res.ok) {
            await res.text();
            log(`Error fetching Plex shared users. Status: ${res.status}.`);
            throw new Error(`Failed to fetch Plex shared users. Status: ${res.status}`);
        }

        const xmlText = await res.text();
        // Use regex to find all <User>...</User> blocks, then filter by server identifier
        const userBlocks = xmlText.match(/<User\b[^>]*>.*?<\/User>/gs) || [];

        const plexUsers = userBlocks
            .filter(block => block.includes(`machineIdentifier="${config.serverIdentifier}"`))
            .map(block => {
                const userTagMatch = block.match(/<User\b[^>]*>/);
                if (!userTagMatch) return null;
                const userTag = userTagMatch[0];
                return {
                    id: userTag.match(/id="([^"]+)"/)?.[1],
                    username: userTag.match(/title="([^"]+)"/)?.[1],
                    email: userTag.match(/email="([^"]+)"/)?.[1],
                    thumb: userTag.match(/thumb="([^"]+)"/)?.[1],
                };
            }).filter(user => user && user.id && user.username);


        const localUsers = await loadFile(usersPath, []);
        const deletedUsers = await loadFile(deletedUsersPath, []);
        const existingUserMap = new Map(localUsers.map(u => [String(u.id), u]));
        const plexIdUserMap = new Map(localUsers.filter(u => u.plexId).map(u => [String(u.plexId), u]));
        const emailUserMap = new Map(localUsers.filter(u => u.email).map(u => [u.email.toLowerCase(), u]));
        const usernameUserMap = new Map(localUsers.filter(u => u.username).map(u => [u.username.toLowerCase(), u]));
        const matchedLocalUserIds = new Set();

        const syncedUsers = plexUsers.map(pUser => {
            if (isDeletedUser(deletedUsers, pUser)) {
                log(`Skipping deleted user during sync: ${pUser.username}`);
                return null;
            }

            const existingUser =
                existingUserMap.get(String(pUser.id)) ||
                plexIdUserMap.get(String(pUser.id)) ||
                (pUser.email ? emailUserMap.get(pUser.email.toLowerCase()) : null) ||
                (pUser.username ? usernameUserMap.get(pUser.username.toLowerCase()) : null);

            if (existingUser) {
                matchedLocalUserIds.add(existingUser.id);
                const becameActive = existingUser.plexAccessStatus === 'pending';
                if (becameActive) {
                    appendAuditLog('invite_accepted_synced', null, { ...existingUser, id: pUser.id, username: pUser.username, email: pUser.email }).catch(() => { });
                }
                // Update existing user with latest info from Plex, but keep local expiry/trial data.
                const synced = { ...existingUser, id: pUser.id, plexId: existingUser.plexId || pUser.id, username: pUser.username, email: pUser.email, thumb: pUser.thumb, plexAccessStatus: 'active' };
                if (becameActive || existingUser.plexAccessStatus !== 'active') {
                    ensureRequestAppMembership(synced, config);
                }
                return synced;
            }
            log(`New user found: ${pUser.username}. Setting default unlimited expiry.`);
            appendAuditLog('plex_sync_new_user_added', null, pUser).catch(() => { });
            const created = {
                id: pUser.id,
                plexId: pUser.id,
                username: pUser.username,
                email: pUser.email,
                thumb: pUser.thumb,
                joiningDate: new Date().toISOString(),
                expiryDate: null,
                plexAccessStatus: 'active',
                isTrial: false
            };
            ensureRequestAppMembership(created, config);
            return created;
        }).filter(Boolean);

        for (const localUser of localUsers) {
            if (!matchedLocalUserIds.has(localUser.id)) {
                if (localUser.plexAccessStatus !== 'pending') {
                    // If they are no longer on Plex (e.g., they expired and were removed, or manually removed from Plex), 
                    // keep them in the app but mark their access as revoked so they stay visible until manually deleted.
                    if (localUser.plexAccessStatus !== 'revoked') {
                        removeRequestAppMembership(localUser, config);
                    }
                    localUser.plexAccessStatus = 'revoked';
                }
                syncedUsers.push(localUser);
            }
        }

        await saveFile(usersPath, syncedUsers);
        ensureActiveRequestAppMembership(
            syncedUsers.filter((user) => user.plexAccessStatus === 'active'),
            config,
        );
        const message = `Sync complete. Synced ${plexUsers.length} users.`;
        log(message);
        return { message, count: plexUsers.length };
    };

    const syncJellyfinUsers = async (config) => {
        log('Starting user sync from Jellyfin...');
        if (!isJellyfinConfigured(config)) {
            throw new Error('Jellyfin is not configured.');
        }

        const baseUrl = resolveIntegrationUrlForFetch(config.jellyfinUrl);
        const response = await fetchWithTimeout(`${baseUrl}/Users`, {
            headers: jellyfinHeaders(config.jellyfinApiKey),
        }, 15000);
        if (!response.ok) {
            await response.text().catch(() => '');
            log(`Error fetching Jellyfin users. Status: ${response.status}.`);
            throw new Error(`Failed to fetch Jellyfin users. Status: ${response.status}`);
        }

        const jellyfinUsers = (await response.json())
            .filter((user) => user?.Id && user?.Name)
            .map((user) => ({
                id: `jellyfin:${user.Id}`,
                jellyfinId: user.Id,
                username: user.Name,
                email: '',
                thumb: user.PrimaryImageTag ? withBasePath(`/api/jellyfin/user-image?userId=${encodeURIComponent(user.Id)}`) : null,
                isDisabled: user.Policy?.IsDisabled === true,
                isAdmin: user.Policy?.IsAdministrator === true,
            }));

        const localUsers = await loadFile(usersPath, []);
        const deletedUsers = await loadFile(deletedUsersPath, []);
        const existingUserMap = new Map(localUsers.map((user) => [String(user.id), user]));
        const jellyfinIdUserMap = new Map(localUsers.filter((user) => user.jellyfinId).map((user) => [String(user.jellyfinId), user]));
        const usernameUserMap = new Map(localUsers.filter((user) => user.username).map((user) => [user.username.toLowerCase(), user]));
        const matchedLocalUserIds = new Set();

        const syncedUsers = jellyfinUsers.map((jUser) => {
            const deletedLookup = { id: jUser.id, jellyfinId: jUser.jellyfinId, username: jUser.username, email: jUser.email };
            if (isDeletedUser(deletedUsers, deletedLookup)) {
                log(`Skipping deleted Jellyfin user during sync: ${jUser.username}`);
                return null;
            }

            const existingUser =
                existingUserMap.get(String(jUser.id)) ||
                jellyfinIdUserMap.get(String(jUser.jellyfinId)) ||
                usernameUserMap.get(jUser.username.toLowerCase());

            const accessStatus = jUser.isDisabled ? 'revoked' : 'active';
            if (existingUser) {
                matchedLocalUserIds.add(existingUser.id);
                const synced = {
                    ...existingUser,
                    id: jUser.id,
                    jellyfinId: jUser.jellyfinId,
                    username: jUser.username,
                    email: existingUser.email || '',
                    thumb: jUser.thumb,
                    authProvider: 'jellyfin',
                    plexAccessStatus: accessStatus,
                };
                if (accessStatus === 'active' && existingUser.plexAccessStatus !== 'active') {
                    ensureRequestAppMembership(synced, config);
                } else if (accessStatus === 'revoked' && existingUser.plexAccessStatus !== 'revoked') {
                    removeRequestAppMembership(synced, config);
                }
                return synced;
            }

            log(`New Jellyfin user found: ${jUser.username}. Setting default 1-day expiry.`);
            appendAuditLog('jellyfin_sync_new_user_added', null, jUser).catch(() => { });
            const created = {
                id: jUser.id,
                jellyfinId: jUser.jellyfinId,
                authProvider: 'jellyfin',
                username: jUser.username,
                email: '',
                thumb: jUser.thumb,
                joiningDate: new Date().toISOString(),
                expiryDate: jUser.isAdmin ? null : addDays(new Date(), 1).toISOString(),
                plexAccessStatus: accessStatus,
                isTrial: false,
            };
            if (accessStatus === 'active') ensureRequestAppMembership(created, config);
            return created;
        }).filter(Boolean);

        for (const localUser of localUsers) {
            const belongsToJellyfin = localUser.authProvider === 'jellyfin' || localUser.jellyfinId || String(localUser.id || '').startsWith('jellyfin:');
            if (!belongsToJellyfin) {
                syncedUsers.push(localUser);
                continue;
            }
            if (!matchedLocalUserIds.has(localUser.id)) {
                if (localUser.plexAccessStatus !== 'pending') {
                    if (localUser.plexAccessStatus !== 'revoked') {
                        removeRequestAppMembership(localUser, config);
                    }
                    localUser.plexAccessStatus = 'revoked';
                }
                syncedUsers.push(localUser);
            }
        }

        await saveFile(usersPath, syncedUsers);
        ensureActiveRequestAppMembership(
            syncedUsers.filter((user) => user.plexAccessStatus === 'active'),
            config,
        );
        const message = `Sync complete. Synced ${jellyfinUsers.length} Jellyfin users.`;
        log(message);
        return { message, count: jellyfinUsers.length };
    };

    const revokePlexAccess = async (user, config) => {
        // The Plex friends list keys users by their Plex account id, which is stored
        // in plexId. Invite/referral users keep a portal UUID in `id`, so always
        // prefer plexId when matching against the Plex API.
        const plexUserId = user.plexId || user.id;
        if (!plexUserId || !config.serverIdentifier) {
            log(`Error: Cannot revoke access for ${user.username} due to missing user ID or server ID.`);
            return false;
        }
        log(`Revoking Plex access for expired user: ${user.username} (ID: ${plexUserId})`);

        try {
            // Step 1: Find the Share ID for the user on the specific server by fetching ALL users
            const usersListRes = await apiFetch(
                `${plexApi}/users`,
                config.plexToken
            );

            if (!usersListRes.ok) {
                await usersListRes.text();
                log(`Error fetching Plex users list for revocation. Status: ${usersListRes.status}.`);
                return false;
            }

            const xmlText = await usersListRes.text();

            const userBlockRegex = new RegExp(`<User\\b[^>]*id="${plexUserId}"[^>]*>.*?<\\/User>`, 's');
            const userBlockMatch = xmlText.match(userBlockRegex);

            if (!userBlockMatch) {
                log(`User ${user.username} not found in friends list. Assuming already revoked.`);
                return true;
            }

            const serverTagRegex = new RegExp(`<Server\\b[^>]*machineIdentifier="${config.serverIdentifier}"[^>]*>`);
            const serverTagMatch = userBlockMatch[0].match(serverTagRegex);

            if (!serverTagMatch) {
                log(`User ${user.username} does not have access to server ${config.serverIdentifier}. Assuming already revoked.`);
                return true;
            }

            const shareIdMatch = serverTagMatch[0].match(/id="([^"]+)"/);
            if (!shareIdMatch || !shareIdMatch[1]) {
                log(`Could not find share ID for user ${user.username} on server ${config.serverIdentifier}.`);
                return false;
            }
            const shareId = shareIdMatch[1];

            // Step 2: Delete the share entirely using a DELETE request
            const res = await apiFetch(
                `https://plex.tv/api/servers/${config.serverIdentifier}/shared_servers/${shareId}`,
                config.plexToken,
                {
                    method: 'DELETE'
                }
            );

            if (!res.ok) {
                await res.text();
                log(`Failed to revoke access for ${user.username}. Status: ${res.status}.`);
                return false;
            }

            log(`Successfully revoked access for ${user.username}.`);
            return true;

        } catch (error) {
            log(`An exception occurred while revoking access for ${user.username}: ${error.message}`);
            return false;
        }
    };

    const inviteUserToPlex = async (user, config, libraryIds = null) => {
        if (!user.email || !config.serverIdentifier) {
            log(`Error: Cannot invite ${user.username} due to missing email or server ID.`);
            return false;
        }
        log(`Inviting user to Plex: ${user.username} (${user.email})`);
        try {
            const sharedServer = { invited_email: user.email };
            if (libraryIds && Array.isArray(libraryIds) && libraryIds.length > 0) {
                sharedServer.library_section_ids = libraryIds;
            }

            const inviteRes = await apiFetch(`https://plex.tv/api/servers/${config.serverIdentifier}/shared_servers`, config.plexToken, {
                method: 'POST',
                body: JSON.stringify({
                    server_id: config.serverIdentifier,
                    shared_server: sharedServer
                }),
                headers: { 'Content-Type': 'application/json' }
            });

            if (!inviteRes.ok) {
                const errText = await inviteRes.text();
                log(`Note: Plex API returned an error during invite (${inviteRes.status}): ${errText}`);
                return false;
            }
            return true;
        } catch (error) {
            log(`An exception occurred while inviting user ${user.username}: ${error.message}`);
            return false;
        }
    };


    const checkAndRevoke = async (config) => {
        log('Running periodic check for expired users...');
        const users = await loadFile(usersPath, []);
        const expiredUsers = users.filter(u => {
            const days = getDaysUntilExpiry(u.expiryDate);
            return u.plexAccessStatus !== 'revoked' && days !== null && days < 0;
        });

        if (expiredUsers.length === 0) {
            log('No expired users found.');
            return;
        }

        // Check if logo exists for email template
        const logoPath = path.join(process.cwd(), 'static', 'logo.png');
        let hasLogo = false;
        try {
            await fs.access(logoPath);
            hasLogo = true;
        } catch (e) { }

        log(`Found ${expiredUsers.length} expired user(s).`);
        let usersModified = false;
        for (const user of expiredUsers) {
            const revoked = await revokePlexAccess(user, config);
            if (revoked) {
                const userInList = users.find(u => u.id === user.id);
                if (userInList) {
                    userInList.plexAccessStatus = 'revoked';
                    usersModified = true;
                    removeRequestAppMembership(userInList, config);

                    // Send expiry notification email if not already sent
                    if (!userInList.expiryEmailSent) {
                        const emailSent = await sendExpiryEmail(config, userInList, hasLogo);
                        if (emailSent) {
                            userInList.expiryEmailSent = true;
                        }
                    }
                }
            }
        }

        if (usersModified) {
            await saveFile(usersPath, users);
            log('Updated local user file with revocation status.');
        }
    };

    return {
        syncUsers,
        syncJellyfinUsers,
        revokePlexAccess,
        inviteUserToPlex,
        checkAndRevoke,
    };
};
