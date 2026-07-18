import { registerRequestAppMemberRoutes } from './request-app-member-routes.js';
import { registerRequestAppAdminRoutes } from './request-app-admin-routes.js';

export const registerRequestAppRoutes = ({
    app,
    requireAuth,
    requireMember,
    requireAdmin,
    memberApiRateLimit = null,
    configPath,
    loadFile,
    requestAppService,
    appendAuditLog,
    notifyRequestUpdate = null,
    log,
}) => {
    const loadConfig = () => loadFile(configPath, {});

    const sendGateOrRun = async (req, res, action) => {
        const config = await loadConfig();
        const gate = requestAppService.getRequestAppGate(config);
        if (!gate.ready) {
            return res.status(503).json({ ...gate, connected: false });
        }
        return action(config, gate);
    };

    const handleError = (res, err, fallback = 'Request app operation failed') => {
        const message = err?.message || fallback;
        return res.status(502).json({ error: message, connected: false });
    };

    registerRequestAppMemberRoutes({
        app,
        requireAuth,
        requireMember,
        memberApiRateLimit,
        loadConfig,
        requestAppService,
        sendGateOrRun,
        handleError,
        appendAuditLog,
    });

    registerRequestAppAdminRoutes({
        app,
        requireAdmin,
        sendGateOrRun,
        handleError,
        requestAppService,
        appendAuditLog,
        notifyRequestUpdate,
        log,
    });
};
