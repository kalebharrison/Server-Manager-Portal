import { updateFile as updateJsonFile } from '../core/json-file-store.js';
import {
    registerInvitePlexDiscoveryRoutes,
    resolvePlexDiscoveryToken,
} from './invite-plex-discovery-routes.js';
import { registerInviteManagementRoutes } from './invite-management-routes.js';
import { registerInviteClaimRoute } from './invite-claim-route.js';

export { resolvePlexDiscoveryToken };
export { InviteClaimError, recordInviteClaim } from './invite-claim.js';

export const registerInviteRoutes = ({
    app,
    requireAdmin,
    authRateLimit,
    adminSensitiveRateLimit = (req, res, next) => next(),
    publicReadRateLimit,
    setupRateLimit,
    configPath,
    usersPath,
    invitesPath,
    jwtSecret,
    secretMask,
    loadFile,
    saveFile,
    updateFile = updateJsonFile,
    normalizePlexToken,
    isPortalConfigured,
    resolveCurrentAdmin,
    fetchOwnedPlexServers,
    validatePlexServerAdminToken,
    canRunInitialSetup,
    resolveConfiguredPlexServerUrl,
    resolveIntegrationUrlForFetch,
    sanitizeIntegrationUrl = null,
    fetchWithTimeout,
    syncUsers,
    syncJellyfinUsers,
    appendAuditLog,
    sendEmail,
    getAdminProfile,
    getClientId,
    inviteUserToPlex,
    getAdminId,
    setSessionCookie,
    log,
}) => {
    const CONFIG_PATH = configPath;

    registerInvitePlexDiscoveryRoutes({
        app,
        setupRateLimit,
        configPath: CONFIG_PATH,
        jwtSecret,
        secretMask,
        loadFile,
        normalizePlexToken,
        isPortalConfigured,
        resolveCurrentAdmin,
        fetchOwnedPlexServers,
        validatePlexServerAdminToken,
        canRunInitialSetup,
        resolveConfiguredPlexServerUrl,
        resolveIntegrationUrlForFetch,
        sanitizeIntegrationUrl,
        fetchWithTimeout,
        log,
    });

    app.post('/api/sync', requireAdmin, adminSensitiveRateLimit, async (req, res) => {
        const config = await loadFile(CONFIG_PATH, null);
        if (!config) return res.status(400).json({ error: 'App not configured.' });
        const isJellyfinPortal = String(config.mediaServerType || '').toLowerCase() === 'jellyfin';
        try {
            const result = isJellyfinPortal ? await syncJellyfinUsers(config) : await syncUsers(config);
            await appendAuditLog(isJellyfinPortal ? 'jellyfin_sync_completed' : 'plex_sync_completed', req.user || null, null, { count: result.count });
            res.json(result);
        } catch (error) {
            await appendAuditLog(isJellyfinPortal ? 'jellyfin_sync_failed' : 'plex_sync_failed', req.user || null, null, { error: error.message });
            log(`User sync failed: ${error.message}`);
            res.status(500).json({ error: 'User sync failed.' });
        }
    });

    registerInviteManagementRoutes({
        app,
        requireAdmin,
        publicReadRateLimit,
        configPath: CONFIG_PATH,
        invitesPath,
        loadFile,
        saveFile,
        sendEmail,
        getAdminProfile,
        log,
    });

    registerInviteClaimRoute({
        app,
        authRateLimit,
        configPath: CONFIG_PATH,
        usersPath,
        invitesPath,
        jwtSecret,
        loadFile,
        updateFile,
        getClientId,
        inviteUserToPlex,
        appendAuditLog,
        getAdminId,
        setSessionCookie,
        log,
    });
};
