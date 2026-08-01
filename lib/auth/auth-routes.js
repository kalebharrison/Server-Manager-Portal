import { getDaysUntilExpiry } from '../core/date-utils.js';
import { isDeletedUser } from '../users/deleted-users.js';
import { registerJellyfinAuthRoutes } from './auth-jellyfin-routes.js';
import { registerPlexAuthRoutes } from './auth-plex-routes.js';
import { registerAuthMemberRoutes } from './auth-member-routes.js';

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
    log,
    fetchImpl = fetch,
}) => {
    registerJellyfinAuthRoutes({
        app,
        authRateLimit,
        jellyfinQuickConnectPollRateLimit,
        configPath,
        usersPath,
        deletedUsersPath,
        jwtSecret,
        forceSecureCookies,
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
        configPath,
        usersPath,
        deletedUsersPath,
        jwtSecret,
        forceSecureCookies,
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
        log,
        fetchImpl,
    });

    registerAuthMemberRoutes({
        app,
        requireAuth,
        requireMember,
        requireAdmin,
        publicReadRateLimit,
        configPath,
        usersPath,
        deletedUsersPath,
        jwtSecret,
        loadFile,
        saveFile,
        clearSessionCookie,
        appendAuditLog,
        findLocalUserForSession,
        resolveCurrentAdmin,
        resolveConfiguredPlexServerUrl,
        getPlexConnectionUri,
        resolveLocalPlexAccountId,
        fetchPlexServerAccounts,
        getAdminProfile,
        isPortalConfigured,
        getClientId,
        appVersion,
        forceSecureCookies,
        log,
    });
};
