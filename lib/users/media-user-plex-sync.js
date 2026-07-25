import { ensureAdminPortalUser, isAdminPortalUser } from './ensure-admin-portal-user.js';

export const createPlexUserSync = ({
    plexApi,
    usersPath,
    deletedUsersPath,
    loadFile,
    saveFile,
    apiFetch,
    isDeletedUser,
    ensureRequestAppMembership,
    ensureActiveRequestAppMembership,
    removeRequestAppMembership,
    appendAuditLog,
    log,
}) => {
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

        const adminPlexId = String(config.adminPlexId || '');

        for (const localUser of localUsers) {
            if (!matchedLocalUserIds.has(localUser.id)) {
                // Plex owner is not in /users shared list — never revoke the admin row.
                if (isAdminPortalUser(localUser, adminPlexId)) {
                    localUser.plexAccessStatus = 'active';
                    if (localUser.expiryDate != null) localUser.expiryDate = null;
                    syncedUsers.push(localUser);
                    matchedLocalUserIds.add(localUser.id);
                    continue;
                }
                if (localUser.plexAccessStatus !== 'pending') {
                    if (localUser.plexAccessStatus !== 'revoked') {
                        removeRequestAppMembership(localUser, config);
                    }
                    localUser.plexAccessStatus = 'revoked';
                }
                syncedUsers.push(localUser);
            }
        }

        // Ensure admin (server owner) exists as a normal portal member.
        if (adminPlexId && config.plexToken) {
            try {
                const ownerRes = await apiFetch('https://plex.tv/api/v2/user', config.plexToken);
                if (ownerRes.ok) {
                    const owner = await ownerRes.json();
                    const ownerId = owner?.id != null ? String(owner.id) : adminPlexId;
                    const ensured = ensureAdminPortalUser(syncedUsers, {
                        id: owner?.uuid || ownerId,
                        plexId: ownerId,
                        username: owner?.username || owner?.title || 'Admin',
                        email: owner?.email || '',
                        thumb: owner?.thumb || null,
                    });
                    if (ensured.changed) {
                        syncedUsers.splice(0, syncedUsers.length, ...ensured.users);
                        if (ensured.created) {
                            log(`Admin portal user ensured during sync: ${ensured.user.username}`);
                            appendAuditLog('admin_portal_user_ensured', null, ensured.user).catch(() => {});
                            ensureRequestAppMembership(ensured.user, config);
                        }
                    }
                }
            } catch (error) {
                log(`Admin portal user ensure during sync skipped: ${error.message}`);
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

    return { syncUsers };
};
