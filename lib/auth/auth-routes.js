import fsSync from 'fs';
import jwt from 'jsonwebtoken';

import { getDaysUntilExpiry } from '../core/date-utils.js';
import { isDeletedUser, normalized } from '../users/deleted-users.js';
import { blockIfImpersonating, getSessionActor, isImpersonatingSession } from './impersonation.js';
import { registerJellyfinAuthRoutes } from './auth-jellyfin-routes.js';
import { registerPlexAuthRoutes } from './auth-plex-routes.js';
import { applyAccountPreferencePatch } from '../users/user-profile.js';

export const isEligibleMember = (user) => {
    if (!user) return false;
    const status = String(user.plexAccessStatus || '').trim().toLowerCase();
    if (status === 'revoked' || status === 'expired') return false;
    const daysUntilExpiry = getDaysUntilExpiry(user.expiryDate);
    return daysUntilExpiry === null || (Number.isFinite(daysUntilExpiry) && daysUntilExpiry >= 0);
};

export const createRequireMember = ({
    configPath,
    usersPath,
    deletedUsersPath,
    loadFile,
    resolveCurrentAdmin,
    findLocalUserForSession,
    appendAuditLog,
    clearSessionCookie,
}) => async (req, res, next) => {
    try {
        const config = await loadFile(configPath, {});
        const isAdmin = await resolveCurrentAdmin(req.user, config);
        req.user.isAdmin = isAdmin;
        if (isAdmin) return next();

        const users = await loadFile(usersPath, []);
        const localUser = findLocalUserForSession(users, req.user);
        const deletedUsers = await loadFile(deletedUsersPath, []);
        if (!isEligibleMember(localUser) || isDeletedUser(deletedUsers, req.user)) {
            await appendAuditLog('session_blocked_non_member', req.user, req.user);
            clearSessionCookie(req, res);
            return res.status(403).json({ error: 'Your account does not have active portal access.' });
        }
        req.localUser = localUser;
        return next();
    } catch (e) {
        return res.status(500).json({ error: 'Membership verification failed' });
    }
};

export const registerAuthRoutes = ({
    app,
    authRateLimit,
    authCallbackRateLimit,
    jellyfinQuickConnectPollRateLimit,
    publicReadRateLimit,
    setupRateLimit,
    requireAuth,
    requireMember,
    requireAdmin,
    appVersion,
    configPath,
    usersPath,
    deletedUsersPath,
    jwtSecret,
    forceSecureCookies,
    loadFile,
    saveFile,
    apiFetch,
    jellyfinHeaders,
    isJellyfinConfigured,
    isPortalConfigured,
    resolveIntegrationUrlForFetch,
    getClientId,
    withBasePath,
    clearSessionCookie,
    setSessionCookie,
    appendAuditLog,
    findLocalUserForSession,
    syncAdminPlexIdFromConfigToken,
    getAdminId,
    resolveCurrentAdmin,
    resolveConfiguredPlexServerUrl,
    fetchOwnedPlexServers,
    canRunInitialSetup,
    inviteUserToPlex,
    getPlexConnectionUri,
    resolveLocalPlexAccountId,
    fetchPlexServerAccounts,
    getAdminProfile,
    membershipSync = null,
    log,
    fetchImpl = fetch,
}) => {
    const CONFIG_PATH = configPath;
    const USERS_PATH = usersPath;
    const DELETED_USERS_PATH = deletedUsersPath;
    const JWT_SECRET = jwtSecret;
    const FORCE_SECURE_COOKIES = forceSecureCookies;

    const reconcileTrialAccessFlag = (user) => {
        if (!user?.isTrial) return false;
        const days = getDaysUntilExpiry(user.expiryDate);
        if (days === null || days > 3) {
            user.isTrial = false;
            return true;
        }
        return false;
    };

    registerJellyfinAuthRoutes({
        app,
        authRateLimit,
        jellyfinQuickConnectPollRateLimit,
        configPath: CONFIG_PATH,
        usersPath: USERS_PATH,
        deletedUsersPath: DELETED_USERS_PATH,
        jwtSecret: JWT_SECRET,
        forceSecureCookies: FORCE_SECURE_COOKIES,
        loadFile,
        saveFile,
        jellyfinHeaders,
        isJellyfinConfigured,
        resolveIntegrationUrlForFetch,
        withBasePath,
        clearSessionCookie,
        setSessionCookie,
        appendAuditLog,
        findLocalUserForSession,
        isEligibleMember,
        log,
        fetchImpl,
    });

    registerPlexAuthRoutes({
        app,
        authRateLimit,
        authCallbackRateLimit,
        setupRateLimit,
        configPath: CONFIG_PATH,
        usersPath: USERS_PATH,
        deletedUsersPath: DELETED_USERS_PATH,
        jwtSecret: JWT_SECRET,
        forceSecureCookies: FORCE_SECURE_COOKIES,
        loadFile,
        saveFile,
        apiFetch,
        getClientId,
        withBasePath,
        clearSessionCookie,
        setSessionCookie,
        appendAuditLog,
        findLocalUserForSession,
        syncAdminPlexIdFromConfigToken,
        getAdminId,
        isPortalConfigured,
        canRunInitialSetup,
        inviteUserToPlex,
        fetchOwnedPlexServers,
        isEligibleMember,
        membershipSync,
        log,
        fetchImpl,
    });

    app.get('/api/auth/diagnostics', requireAdmin, async (req, res) => {
        const config = await loadFile(CONFIG_PATH, {});
        const clientId = getClientId();
        res.json({
            appVersion,
            forceSecureCookies: FORCE_SECURE_COOKIES,
            configured: isPortalConfigured(config),
            hasAdminPlexId: !!config?.adminPlexId,
            plexServerUrlConfigured: !!resolveConfiguredPlexServerUrl(config),
            dockerRuntime: fsSync.existsSync('/.dockerenv'),
            clientId: clientId ? `${String(clientId).slice(0, 8)}…` : null,
        });
    });
    
    app.get('/api/auth/session', publicReadRateLimit, async (req, res) => {
        const token = req.cookies?.session;
        if (!token) return res.json({ authenticated: false });
        try {
            const user = jwt.verify(token, JWT_SECRET);
            const config = await loadFile(CONFIG_PATH, {});
            const isAdmin = await resolveCurrentAdmin(user, config);
            return res.json({
                authenticated: true,
                user: {
                    username: user.username,
                    plexId: user.plexId,
                    jellyfinId: user.jellyfinId,
                    authProvider: user.authProvider || 'plex',
                    isAdmin,
                },
            });
        } catch {
            return res.json({ authenticated: false, reason: 'invalid_token' });
        }
    });
    
    app.post('/api/auth/logout', requireAuth, (req, res) => {
        clearSessionCookie(req, res);
        res.json({ message: 'Logged out' });
    });
    
    app.post('/api/users/preferences', requireAuth, requireMember, async (req, res) => {
        if (blockIfImpersonating(req, res)) return;
        try {
            const users = await loadFile(USERS_PATH, []);
            const localUser = findLocalUserForSession(users, req.user);
            const userIndex = localUser ? users.findIndex(u => normalized(u.id) === normalized(localUser.id)) : -1;
    
            if (userIndex === -1) {
                return res.status(404).json({ error: 'User not found' });
            }

            const previousNewsletter = users[userIndex].newsletterOptIn === true;
            const { changed, errors } = applyAccountPreferencePatch(users[userIndex], req.body || {});
            if (errors.length) {
                return res.status(400).json({ error: errors[0] });
            }

            if (changed) {
                await saveFile(USERS_PATH, users);
                const nextNewsletter = users[userIndex].newsletterOptIn === true;
                if (previousNewsletter !== nextNewsletter) {
                    await appendAuditLog(nextNewsletter ? 'newsletter_opt_in' : 'newsletter_opt_out', req.user, req.user);
                }
            }
    
            res.json({ success: true, user: users[userIndex] });
        } catch (e) {
            log(`Error updating preferences: ${e.message}`);
            res.status(500).json({ error: 'Failed to update preferences' });
        }
    });
    
    app.get('/api/users/me', requireAuth, async (req, res) => {
        const users = await loadFile(USERS_PATH, []);
        const localUser = findLocalUserForSession(users, req.user);
        const deletedUsers = await loadFile(DELETED_USERS_PATH, []);
        const config = await loadFile(CONFIG_PATH, {});
        const impersonating = isImpersonatingSession(req.user);
        const actor = getSessionActor(req.user);
        const realIsAdmin = await resolveCurrentAdmin(actor, config);
        const isAdmin = impersonating ? false : realIsAdmin;
        req.user.isAdmin = isAdmin;
    
        if (!localUser && !isAdmin && isDeletedUser(deletedUsers, req.user)) {
            await appendAuditLog('session_blocked_deleted_user', req.user, req.user);
            clearSessionCookie(req, res);
            return res.status(403).json({ error: 'Your portal session has expired. Please contact the admin for access.' });
        }
    
        const isJellyfinPortal = String(config?.mediaServerType || '').toLowerCase() === 'jellyfin';
        let serverName = isJellyfinPortal ? 'Jellyfin Server' : 'Plex Server';
        let adminThumb = null;
        let sessionThumb = req.user.thumb || null;
        let requestUrl = config.requestUrl || 'https://yourdomain.com';
        if ((requestUrl === 'https://yourdomain.com' || !requestUrl) && config.requestAppUrl) {
            requestUrl = config.requestAppUrl;
        }
        let navOrder = (config.navOrder || ['home', 'discover', 'users', 'status', 'analytics', 'mediastack', 'request', 'settings', 'logout'])
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
        } catch (e) { }
    
        if (!impersonating && localUser && reconcileTrialAccessFlag(localUser)) {
            await saveFile(USERS_PATH, users);
        }

        const requestAppType = config.requestAppType === 'overseerr' ? 'seerr' : (config.requestAppType || 'none');
        const resolvedRequestUrl = requestUrl;
        const navFeatures = {
            request: !!(requestAppType && requestAppType !== 'none' && resolvedRequestUrl && resolvedRequestUrl !== 'https://yourdomain.com'),
        };

        const { actor: _actor, impersonatingUserId, ...sessionPublic } = req.user;
        res.json({
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
        });
    });
};
