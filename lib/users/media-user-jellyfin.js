export const createJellyfinUserOps = ({
    usersPath,
    deletedUsersPath,
    loadFile,
    saveFile,
    fetchWithTimeout,
    resolveIntegrationUrlForFetch,
    jellyfinHeaders,
    isJellyfinConfigured,
    withBasePath,
    isDeletedUser,
    addDays,
    ensureRequestAppMembership,
    ensureActiveRequestAppMembership,
    removeRequestAppMembership,
    appendAuditLog,
    log,
}) => {
    const syncJellyfinUsers = async (config) => {
        log('Starting user sync from Jellyfin...');
        if (!isJellyfinConfigured(config)) {
            throw new Error('Jellyfin is not configured.');
        }

        const baseUrl = await resolveIntegrationUrlForFetch(config.jellyfinUrl);
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

    return {
        syncJellyfinUsers,
    };
};
