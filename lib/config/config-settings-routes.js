import jwt from 'jsonwebtoken';
import { verifySessionJwt } from '../auth/jwt-session.js';
import { buildConfigGetResponse } from './config-settings-view.js';
import { buildConfigFromPostBody } from './config-settings-write.js';

export const registerConfigSettingsRoutes = ({
    app,
    requireAdmin,
    setupRateLimit,
    configPath,
    secretMask,
    setupToken,
    jwtSecret,
    defaultDashboardLayout,
    loadFile,
    saveFile,
    isPortalConfigured,
    normalizePlexToken,
    resolveConfiguredPlexServerUrl,
    verifyInitialSetupPlexOwner,
    resolveCurrentAdmin,
    canRunInitialSetup,
    sanitizeIntegrationUrl,
    syncAdminPlexIdFromConfigToken,
    invalidatePlexConnectionCaches,
    invalidateAdminProfileCache,
    reconcileStatusConfig,
    computeNextBackupRun,
    systemJobs,
    startBackgroundService,
    normalizeSectionLayout,
    log,
}) => {
    const CONFIG_PATH = configPath;
    const SECRET_MASK = secretMask;
    const SETUP_TOKEN = setupToken;
    const JWT_SECRET = jwtSecret;
    const DEFAULT_DASHBOARD_LAYOUT = defaultDashboardLayout;

    app.get('/api/config', requireAdmin, async (req, res) => {
        const config = await loadFile(CONFIG_PATH, {});
        res.json(buildConfigGetResponse(config, {
            isPortalConfigured,
            secretMask: SECRET_MASK,
            defaultDashboardLayout: DEFAULT_DASHBOARD_LAYOUT,
            normalizeSectionLayout,
        }));
    });

    app.post('/api/config', setupRateLimit, async (req, res) => {
        const {
            token, mediaServerType, serverIdentifier,
            jellyfinUrl, jellyfinApiKey,
        } = req.body;

        const existingConfig = await loadFile(CONFIG_PATH, {});
        const normalizedMediaServerType = ['plex', 'jellyfin'].includes(String(mediaServerType || '').toLowerCase())
            ? String(mediaServerType || '').toLowerCase()
            : (existingConfig.mediaServerType || 'plex');
        const normalizedToken = normalizePlexToken(token);
        const normalizedServerIdentifier = String(serverIdentifier).trim();
        const isConfigured = isPortalConfigured(existingConfig);

        if (normalizedMediaServerType === 'plex' && (!normalizedToken || !normalizedServerIdentifier)) {
            return res.status(400).json({ error: 'Plex token and serverIdentifier are required.' });
        }
        if (normalizedMediaServerType === 'jellyfin' && (!jellyfinUrl || !jellyfinApiKey)) {
            return res.status(400).json({ error: 'Jellyfin URL and API key are required.' });
        }

        if (isConfigured) {
            const sessionToken = req.cookies && req.cookies.session;
            if (!sessionToken) {
                return res.status(403).json({ error: 'Forbidden: App is already configured. Please log in as admin to modify settings.' });
            }
            try {
                const decoded = verifySessionJwt(jwt, sessionToken, JWT_SECRET);
                const isAdmin = await resolveCurrentAdmin(decoded, existingConfig);
                if (!isAdmin) {
                    return res.status(403).json({ error: 'Forbidden: Admins only.' });
                }
                req.user = decoded;
            } catch (e) {
                return res.status(403).json({ error: 'Forbidden: Invalid or expired session. Please log in again.' });
            }
        } else if (!canRunInitialSetup(req)) {
            if (normalizedMediaServerType === 'jellyfin') {
                return res.status(403).json({ error: 'Initial setup is restricted. Configure SETUP_TOKEN or run setup from localhost.' });
            }
            const candidatePlexServerUrl = (req.body.plexServerUrl !== undefined
                ? String(req.body.plexServerUrl || '').trim()
                : String(existingConfig.plexServerUrl || '').trim()) || resolveConfiguredPlexServerUrl(existingConfig);
            const verifiedPlexOwner = await verifyInitialSetupPlexOwner(normalizedToken, normalizedServerIdentifier, candidatePlexServerUrl);
            if (!verifiedPlexOwner) {
                if (!SETUP_TOKEN) {
                    return res.status(403).json({ error: 'Initial setup is restricted. Sign in with the Plex server owner account, configure SETUP_TOKEN, or run setup from localhost.' });
                }
                return res.status(403).json({ error: 'Initial setup denied: invalid setup token or Plex server owner verification failed.' });
            }
        }

        let builtConfig;
        try {
            builtConfig = await buildConfigFromPostBody({
                body: req.body,
                existingConfig,
                secretMask: SECRET_MASK,
                normalizePlexToken,
                sanitizeIntegrationUrl,
                normalizeSectionLayout,
            });
        } catch (e) {
            const message = String(e.message || '');
            if (
                message.startsWith('Invalid integration URL:')
                || message.startsWith('Invalid automation instance:')
                || message.startsWith('Invalid settings URL:')
            ) {
                return res.status(400).json({ error: message });
            }
            throw e;
        }

        const { config } = builtConfig;

        await saveFile(CONFIG_PATH, config);
        await syncAdminPlexIdFromConfigToken(config, { persist: true });
        // Invalidate caches tied to the Plex token/server so changes take effect immediately.
        invalidatePlexConnectionCaches();
        invalidateAdminProfileCache();
        if (reconcileStatusConfig) await reconcileStatusConfig();
        systemJobs.autoBackup.nextRun = config.autoBackupEnabled ? computeNextBackupRun(config) : null;
        log('Configuration saved successfully.');
        startBackgroundService(); // (Re)start service with new config
        res.json({ message: 'Configuration saved.' });
    });

};
