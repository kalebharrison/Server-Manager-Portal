import { isRequestAppMembershipSyncEnabled } from './request-app-gate.js';

export const createRequestAppUsers = ({
    fetchSeerrJson,
    cachedSeerrJson,
    invalidateUserLists,
    log = () => {},
}) => {
    const listRequestUsers = async (config, { bypassCache = false } = {}) => {
        const loader = () => fetchSeerrJson(config, '/api/v1/user?take=1000&sort=displayname');
        const payload = bypassCache
            ? await loader()
            : await cachedSeerrJson(config, '/api/v1/user?take=1000&sort=displayname', 300_000, 30 * 60_000);
        const results = Array.isArray(payload?.results) ? payload.results : [];
        return results.map((user) => ({
            id: Number(user.id) || null,
            displayName: user.displayName || user.username || user.email || `User #${user.id}`,
            email: user.email || null,
            username: user.username || user.plexUsername || null,
            plexId: user.plexId != null ? String(user.plexId) : null,
            jellyfinUserId: user.jellyfinUserId ? String(user.jellyfinUserId) : null,
        })).filter((user) => user.id);
    };

    const portalPlexId = (portalUser = {}) => {
        const plexId = portalUser.plexId || portalUser.id;
        if (plexId == null || plexId === '') return '';
        const raw = String(plexId);
        if (raw.startsWith('jellyfin:')) return '';
        return raw;
    };

    const portalJellyfinId = (portalUser = {}) => {
        if (portalUser.jellyfinId) return String(portalUser.jellyfinId);
        const raw = String(portalUser.id || '');
        return raw.startsWith('jellyfin:') ? raw.slice('jellyfin:'.length) : '';
    };

    const findRequestAppUser = (users, portalUser = {}) => {
        const email = String(portalUser.email || '').trim().toLowerCase();
        const username = String(portalUser.username || '').trim().toLowerCase();
        const plexId = portalPlexId(portalUser);
        const jellyfinId = portalJellyfinId(portalUser).replace(/-/g, '').toLowerCase();
        return users.find((user) => {
            if (plexId && String(user.plexId || '') === plexId) return true;
            if (jellyfinId) {
                const candidate = String(user.jellyfinUserId || '').replace(/-/g, '').toLowerCase();
                if (candidate && candidate === jellyfinId) return true;
            }
            if (email && String(user.email || '').toLowerCase() === email) return true;
            if (username && String(user.username || user.displayName || '').toLowerCase() === username) return true;
            return false;
        }) || null;
    };

    const resolveRequestUserId = async (config, sessionUser = {}) => {
        const email = String(sessionUser.email || '').trim().toLowerCase();
        const username = String(sessionUser.username || '').trim().toLowerCase();
        const plexId = portalPlexId(sessionUser);
        const jellyfinId = portalJellyfinId(sessionUser);
        if (!email && !username && !plexId && !jellyfinId) return null;
        try {
            const users = await listRequestUsers(config);
            return findRequestAppUser(users, sessionUser)?.id || null;
        } catch (err) {
            log(`Request app user mapping skipped: ${err.message}`);
            return null;
        }
    };

    /**
     * Ensure a Seerr-family user exists for request attribution (members never open Seerr).
     * Import only succeeds once the user has active media-server access.
     */
    const ensureRequestAppUser = async (config, portalUser = {}) => {
        if (!isRequestAppMembershipSyncEnabled(config)) return { ok: false, reason: 'disabled' };
        try {
            let users = await listRequestUsers(config, { bypassCache: true });
            let match = findRequestAppUser(users, portalUser);
            if (match?.id) return { ok: true, userId: match.id, created: false };

            const mediaServerType = String(config.mediaServerType || 'plex').toLowerCase();
            const plexId = portalPlexId(portalUser);
            const jellyfinId = portalJellyfinId(portalUser);
            if (mediaServerType === 'jellyfin' && jellyfinId) {
                await fetchSeerrJson(config, '/api/v1/user/import-from-jellyfin', {
                    method: 'POST',
                    body: { jellyfinUserIds: [jellyfinId] },
                });
            } else if (plexId) {
                await fetchSeerrJson(config, '/api/v1/user/import-from-plex', {
                    method: 'POST',
                    body: { plexIds: [String(plexId)] },
                });
            } else {
                return { ok: false, reason: 'missing_media_id' };
            }

            invalidateUserLists();
            users = await listRequestUsers(config, { bypassCache: true });
            match = findRequestAppUser(users, portalUser);
            if (match?.id) {
                log(`Request app user ensured for ${portalUser.username || portalUser.email || plexId || jellyfinId} (id=${match.id})`);
                return { ok: true, userId: match.id, created: true };
            }
            return { ok: false, reason: 'not_imported' };
        } catch (err) {
            log(`Request app user ensure failed for ${portalUser.username || portalUser.email || 'user'}: ${err.message}`);
            return { ok: false, reason: 'error', error: err.message };
        }
    };

    /** Backfill/import missing Seerr users for a list of active portal members (batched imports). */
    const ensureRequestAppUsers = async (config, portalUsers = []) => {
        if (!isRequestAppMembershipSyncEnabled(config)) return { ok: false, reason: 'disabled', created: 0, existing: 0, failed: 0 };
        const candidates = (Array.isArray(portalUsers) ? portalUsers : [])
            .filter((user) => user && String(user.plexAccessStatus || '') === 'active');
        if (!candidates.length) return { ok: true, created: 0, existing: 0, failed: 0 };

        try {
            let users = await listRequestUsers(config, { bypassCache: true });
            let existing = 0;
            let failed = 0;
            const mediaServerType = String(config.mediaServerType || 'plex').toLowerCase();
            const missingPlexIds = [];
            const missingJellyfinIds = [];
            const missingUsers = [];

            for (const portalUser of candidates) {
                if (findRequestAppUser(users, portalUser)?.id) {
                    existing += 1;
                    continue;
                }
                const plexId = portalPlexId(portalUser);
                const jellyfinId = portalJellyfinId(portalUser);
                if (mediaServerType === 'jellyfin' && jellyfinId) {
                    missingJellyfinIds.push(jellyfinId);
                    missingUsers.push(portalUser);
                } else if (plexId) {
                    missingPlexIds.push(String(plexId));
                    missingUsers.push(portalUser);
                } else {
                    failed += 1;
                }
            }

            if (missingJellyfinIds.length) {
                await fetchSeerrJson(config, '/api/v1/user/import-from-jellyfin', {
                    method: 'POST',
                    body: { jellyfinUserIds: missingJellyfinIds },
                });
            }
            if (missingPlexIds.length) {
                await fetchSeerrJson(config, '/api/v1/user/import-from-plex', {
                    method: 'POST',
                    body: { plexIds: missingPlexIds },
                });
            }

            let created = 0;
            if (missingUsers.length) {
                invalidateUserLists();
                users = await listRequestUsers(config, { bypassCache: true });
                for (const portalUser of missingUsers) {
                    if (findRequestAppUser(users, portalUser)?.id) {
                        created += 1;
                        log(`Request app user backfilled for ${portalUser.username || portalUser.email || portalPlexId(portalUser) || portalJellyfinId(portalUser)}`);
                    } else {
                        failed += 1;
                    }
                }
            }
            return { ok: true, created, existing, failed };
        } catch (err) {
            log(`Request app membership backfill failed: ${err.message}`);
            return { ok: false, reason: 'error', error: err.message, created: 0, existing: 0, failed: candidates.length };
        }
    };

    /** Remove Seerr-family user when portal membership ends (no disable API). */
    const removeRequestAppUser = async (config, portalUser = {}) => {
        if (!isRequestAppMembershipSyncEnabled(config)) return { ok: false, reason: 'disabled' };
        try {
            const users = await listRequestUsers(config, { bypassCache: true });
            const match = findRequestAppUser(users, portalUser);
            if (!match?.id) return { ok: true, removed: false, reason: 'not_found' };
            if (Number(match.id) === 1) return { ok: false, reason: 'protected_admin' };

            await fetchSeerrJson(config, `/api/v1/user/${encodeURIComponent(match.id)}`, { method: 'DELETE' });
            invalidateUserLists();
            log(`Request app user removed for ${portalUser.username || portalUser.email || match.id} (id=${match.id})`);
            return { ok: true, removed: true, userId: match.id };
        } catch (err) {
            log(`Request app user remove failed for ${portalUser.username || portalUser.email || 'user'}: ${err.message}`);
            return { ok: false, reason: 'error', error: err.message };
        }
    };

    return {
        listRequestUsers,
        portalPlexId,
        portalJellyfinId,
        findRequestAppUser,
        resolveRequestUserId,
        ensureRequestAppUser,
        ensureRequestAppUsers,
        removeRequestAppUser,
    };
};
