import { isDeletedUser } from '../users/deleted-users.js';
import { getSessionActor, isImpersonatingSession } from './impersonation.js';
import { reconcileTrialAccessFlag } from './trial-access.js';

export const buildCurrentUserPayload = async ({
    req,
    res,
    usersPath,
    deletedUsersPath,
    configPath,
    loadFile,
    saveFile,
    clearSessionCookie,
    appendAuditLog,
    findLocalUserForSession,
    resolveCurrentAdmin,
    getAdminProfile,
    getPlexConnectionUri,
    resolveLocalPlexAccountId,
    fetchPlexServerAccounts,
}) => {
    const users = await loadFile(usersPath, []);
    const localUser = findLocalUserForSession(users, req.user);
    const deletedUsers = await loadFile(deletedUsersPath, []);
    const config = await loadFile(configPath, {});
    const impersonating = isImpersonatingSession(req.user);
    const actor = getSessionActor(req.user);
    const realIsAdmin = await resolveCurrentAdmin(actor, config);
    const isAdmin = impersonating ? false : realIsAdmin;
    req.user.isAdmin = isAdmin;

    if (!localUser && !isAdmin && isDeletedUser(deletedUsers, req.user)) {
        await appendAuditLog('session_blocked_deleted_user', req.user, req.user);
        clearSessionCookie(req, res);
        return {
            status: 403,
            body: { error: 'Your portal session has expired. Please contact the admin for access.' },
        };
    }

    const isJellyfinPortal = String(config?.mediaServerType || '').toLowerCase() === 'jellyfin';
    let serverName = isJellyfinPortal ? 'Jellyfin Server' : 'Plex Server';
    let adminThumb = null;
    let sessionThumb = req.user.thumb || null;
    let requestUrl = config.requestUrl || 'https://yourdomain.com';
    if ((requestUrl === 'https://yourdomain.com' || !requestUrl) && config.requestAppUrl) {
        requestUrl = config.requestAppUrl;
    }
    const navOrder = (config.navOrder || ['home', 'discover', 'users', 'status', 'analytics', 'mediastack', 'request', 'settings', 'logout'])
        .filter((key) => key !== 'maintenance');
    try {
        if (isJellyfinPortal && config?.jellyfinUrl && config?.jellyfinApiKey) {
            const profile = await getAdminProfile(config);
            serverName = profile.serverName || 'Jellyfin Server';
        } else if (config && config.plexToken && config.serverIdentifier) {
            const profile = await getAdminProfile(config);
            serverName = profile.serverName || 'Plex Server';
            adminThumb = profile.thumb;

            if (!sessionThumb) {
                const uri = await getPlexConnectionUri(config);
                if (uri) {
                    const accountId = await resolveLocalPlexAccountId(config, uri, req.user);
                    const { map } = await fetchPlexServerAccounts(uri, config);
                    if (accountId && map[accountId]?.thumb) {
                        sessionThumb = map[accountId].thumb;
                    }
                }
            }
        }
    } catch {
        // Best-effort profile enrichment; session payload still returns.
    }

    if (!impersonating && localUser && reconcileTrialAccessFlag(localUser)) {
        await saveFile(usersPath, users);
    }

    const requestAppType = config.requestAppType === 'overseerr' ? 'seerr' : (config.requestAppType || 'none');
    const navFeatures = {
        request: !!(requestAppType && requestAppType !== 'none' && requestUrl && requestUrl !== 'https://yourdomain.com'),
    };

    const { actor: _actor, impersonatingUserId, ...sessionPublic } = req.user;
    return {
        status: 200,
        body: {
            session: { ...sessionPublic, thumb: localUser?.thumb || sessionThumb, isAdmin },
            account: localUser || null,
            serverName,
            adminThumb,
            mediaServerType: config.mediaServerType || 'plex',
            requestUrl,
            navOrder,
            navFeatures,
            impersonation: impersonating ? {
                active: true,
                targetUserId: impersonatingUserId,
                targetUsername: localUser?.username || req.user.username,
                adminUsername: actor?.username || null,
            } : { active: false },
        },
    };
};
