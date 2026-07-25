import { createRequestAppDiscoverChat } from './request-app-discover-chat.js';
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
    fetchImpl = fetch,
}) => {
    const loadConfig = () => loadFile(configPath, {});
    const discoverChat = createRequestAppDiscoverChat({
        requestAppService,
        fetchImpl,
        log,
    });

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
        discoverChat,
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
