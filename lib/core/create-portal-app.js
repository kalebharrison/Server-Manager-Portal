import { randomUUID } from 'crypto';
import { migrateConfigFiles } from '../config/data-paths.js';
import { createPortalServices } from './portal-services.js';
import { registerPortalRoutes } from './portal-routes.js';

export const createPortalRuntime = ({
    app,
    appVersion,
    env,
    basePath,
    withBasePath,
    stripBasePathFromUrl,
    clearSessionCookie,
    setSessionCookie,
}) => {
    const services = createPortalServices({
        app,
        appVersion,
        env,
        basePath,
        withBasePath,
        clearSessionCookie,
    });

    const mediaStackRoutes = registerPortalRoutes({
        app,
        appVersion,
        basePath,
        stripBasePathFromUrl,
        clearSessionCookie,
        setSessionCookie,
        withBasePath,
        services,
    });

    const {
        log,
        loadFile,
        saveFile,
        secureConfigAtRest,
        secureStoredBackups,
        syncAdminPlexIdFromConfigToken,
        statusRuntime,
        monitorConcurrentSessions,
        startBackgroundService,
        startPlexStatsBackgroundTask,
        plexDashboardService,
        requestAppService,
        syncDiscordBot,
        startTrendingStatsBackgroundTask,
        startAnalyticsStatsBackgroundTask,
        startPersonalAnalyticsCacheWarmer,
        computeNextBackupRun,
        systemJobs,
        runAutoBackupCycle,
        setClientId,
        paths: { CONFIG_PATH, CONFIG_DIR },
        env: { PORT, BIND_HOST, FORCE_SECURE_COOKIES },
    } = services;

    const preparePortalStorage = async () => {
        await migrateConfigFiles((message) => log(`[config] ${message}`));
        if (await secureConfigAtRest()) log('[config] Migrated stored credentials to encrypted values.');
        const migratedBackups = await secureStoredBackups();
        if (migratedBackups > 0) log(`[config] Encrypted ${migratedBackups} legacy backup file(s).`);
    };

    const startPortalService = async () => {
        log(`--- Server Manager Portal Service starting on http://${BIND_HOST}:${PORT} ---`);
        log(`Runtime: CONFIG_DIR=${CONFIG_DIR}, FORCE_SECURE_COOKIES=${FORCE_SECURE_COOKIES}, BASE_PATH=${basePath || '/'}, appVersion=${appVersion}`);
        if (FORCE_SECURE_COOKIES) {
            log('WARNING: FORCE_SECURE_COOKIES=true — plain HTTP logins (http://LAN-IP:2121) will fail until this is set to false.');
        }

        // Ensure unique CLIENT_ID per installation to avoid Plex Auth blocking
        let config = await loadFile(CONFIG_PATH, {});
        await syncAdminPlexIdFromConfigToken(config, { persist: true });
        if (!config.clientId || config.clientId.startsWith('smp-')) {
            config.clientId = randomUUID();
            await saveFile(CONFIG_PATH, config);
        }
        if (!process.env.CLIENT_ID) {
            setClientId(config.clientId);
        }

        await statusRuntime.loadStatusState();
        statusRuntime.runMonitorCycle();
        setInterval(statusRuntime.runMonitorCycle, 15000);
        monitorConcurrentSessions();
        setInterval(monitorConcurrentSessions, 15000);
        startBackgroundService();
        startPlexStatsBackgroundTask();
        await plexDashboardService.start();
        mediaStackRoutes.startCacheWarmer();
        requestAppService.startCacheWarmer(() => loadFile(CONFIG_PATH, {}));
        void syncDiscordBot().catch((error) => log(`[Discord] Startup failed: ${error.message}`));

        startTrendingStatsBackgroundTask();
        startAnalyticsStatsBackgroundTask();
        void startPersonalAnalyticsCacheWarmer().catch((error) => log(`[PersonalAnalyticsCache] Startup failed: ${error.message}`));

        const backupConfig = await loadFile(CONFIG_PATH, {});
        systemJobs.autoBackup.nextRun = backupConfig.autoBackupEnabled ? computeNextBackupRun(backupConfig) : null;
        setInterval(async () => {
            const cfg = await loadFile(CONFIG_PATH, {});
            if (!cfg.autoBackupEnabled) {
                systemJobs.autoBackup.nextRun = null;
                return;
            }
            const nextRunTs = Date.parse(computeNextBackupRun(cfg));
            systemJobs.autoBackup.nextRun = new Date(nextRunTs).toISOString();
            if (Date.now() >= nextRunTs) {
                await runAutoBackupCycle('scheduled');
            }
        }, 60 * 60 * 1000);
    };

    return {
        preparePortalStorage,
        startPortalService,
        log,
    };
};
