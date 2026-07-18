import { createIntegrationTestAccess } from './config-integration-test-access.js';
import { runIntegrationTest } from './config-integration-test-handlers.js';

export const registerConfigIntegrationTestRoutes = ({
    app,
    setupRateLimit,
    configPath,
    secretMask,
    jwtSecret,
    loadFile,
    isPortalConfigured,
    resolveCurrentAdmin,
    normalizePlexToken,
    fetchOwnedPlexServers,
    validatePlexServerAdminToken,
    verifyInitialSetupPlexOwner,
    canRunInitialSetup,
    sanitizeIntegrationUrl,
    resolveIntegrationUrlForFetch,
    fetchWithTimeout,
    invalidatePlexConnectionCaches,
    getPlexConnectionUri,
    log,
}) => {
    const CONFIG_PATH = configPath;

    const { assertIntegrationTestAccess } = createIntegrationTestAccess({
        configPath: CONFIG_PATH,
        secretMask,
        jwtSecret,
        loadFile,
        isPortalConfigured,
        resolveCurrentAdmin,
        normalizePlexToken,
        fetchOwnedPlexServers,
        validatePlexServerAdminToken,
        verifyInitialSetupPlexOwner,
        canRunInitialSetup,
        log,
    });

    app.post('/api/config/test-integration', setupRateLimit, async (req, res) => {
        if (!(await assertIntegrationTestAccess(req, res))) return;

        const { type, instanceId } = req.body || {};
        const stored = await loadFile(CONFIG_PATH, {});

        try {
            const result = await runIntegrationTest({
                type,
                instanceId,
                body: req.body,
                stored,
                secretMask,
                sanitizeIntegrationUrl,
                resolveIntegrationUrlForFetch,
                fetchWithTimeout,
                invalidatePlexConnectionCaches,
                getPlexConnectionUri,
            });
            if (result.status) return res.status(result.status).json({ error: result.error });
            return res.json({ ok: true, message: result.message, details: result.details });
        } catch (e) {
            log(`Integration test failed (${type}): ${e.message}`);
            const isPolicyError = /private or local|invalid url|not allowed/i.test(String(e.message || ''));
            res.status(isPolicyError ? 400 : 500).json({
                error: isPolicyError ? e.message : 'Connection test failed.',
            });
        }
    });
};
