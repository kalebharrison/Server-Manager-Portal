import { registerPublicStatusRoutes } from '../status/public-status-routes.js';
import { registerStatusSpeedTestRoutes } from '../status/status-speedtest-routes.js';
import { registerStaticShellRoutes } from '../http/static-shell-routes.js';
import { registerCommunicationRoutes } from '../comms/communication-routes.js';
import { registerKillRuleRoutes } from '../admin/kill-rule-routes.js';
import { registerScannerRoutes } from '../scanner/scanner-routes.js';
import { registerUpgraderRoutes } from '../upgrader/upgrader-routes.js';

export const registerPortalOpsRoutes = ({
    app,
    basePath,
    stripBasePathFromUrl,
    services,
}) => {
    const {
        env: {
            PORT,
            PUBLIC_BASE_URL,
        },
        paths: {
            CONFIG_PATH,
            USERS_PATH,
            KILL_RULES_PATH,
        },
        publicReadRateLimit,
        speedtestRateLimit,
        adminSensitiveRateLimit,
        requireAuth,
        requireAdmin,
        requireMember,
        loadFile,
        saveFile,
        statusRuntime,
        getSessionUser,
        getAdminProfile,
        isPortalConfigured,
        plexStatsService,
        loadPlexStatsFromDisk,
        sanitizeIntegrationUrl,
        resolveConfiguredPlexServerUrl,
        startBroadcast,
        sendTestBroadcast,
        sendTestNewsletter,
        sendManualNewsletter,
        sendEmail,
        escapeHtmlAttr,
        log,
        appendAuditLog,
        upgrader,
    } = services;

    registerPublicStatusRoutes({
        app,
        publicReadRateLimit,
        requireAuth,
        requireAdmin,
        configPath: CONFIG_PATH,
        loadFile,
        statusRuntime,
        getSessionUser,
        getAdminProfile,
        isPortalConfigured,
        getCachedPlexStats: () => plexStatsService.getCachedPlexStats(),
        loadPlexStatsFromDisk,
        sanitizeIntegrationUrl,
    });

    registerStatusSpeedTestRoutes({
        app,
        requireAuth,
        requireMember,
        speedtestRateLimit,
    });

    registerCommunicationRoutes({
        app,
        requireAdmin,
        adminSensitiveRateLimit,
        configPath: CONFIG_PATH,
        usersPath: USERS_PATH,
        loadFile,
        saveFile,
        startBroadcast,
        sendTestBroadcast,
        sendTestNewsletter,
        sendManualNewsletter,
        sendEmail,
        escapeHtmlAttr,
        log,
    });

    registerKillRuleRoutes({
        app,
        requireAdmin,
        killRulesPath: KILL_RULES_PATH,
        loadFile,
        saveFile,
    });

    registerScannerRoutes({
        app,
        requireAdmin,
        configPath: CONFIG_PATH,
        loadFile,
        resolveConfiguredPlexServerUrl,
        log,
    });

    registerUpgraderRoutes({
        app,
        requireAdmin,
        configPath: CONFIG_PATH,
        loadFile,
        appendAuditLog,
        upgrader,
    });

    registerStaticShellRoutes({
        app,
        basePath,
        publicBaseUrl: PUBLIC_BASE_URL,
        port: PORT,
        configPath: CONFIG_PATH,
        loadFile,
        getAdminProfile,
        stripBasePathFromUrl,
        log,
    });
};
