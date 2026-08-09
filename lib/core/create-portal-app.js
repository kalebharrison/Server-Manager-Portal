import { randomBytes, randomUUID } from 'crypto';
import path from 'path';
import {
    migrateConfigFiles,
    DISCOVER_HOME_CACHE_PATH,
    DISCOVERY_AVAILABILITY_CACHE_PATH,
} from '../config/data-paths.js';
import { createPortalServices } from './portal-services.js';
import { registerPortalRoutes } from './portal-routes.js';
import { createLibraryAvailability } from '../portal-request/libraryAvailability.js';
import { rebuildDiscoveryAvailabilityCache } from '../portal-request/discoveryAvailabilityCache.js';
import { startDiscoverHomeCacheWarmer, getDiscoverHomeCache, ensureDiscoverHomeCache } from '../portal-request/discoverHomeCache.js';

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
        syncDiscordBot,
        startTrendingStatsBackgroundTask,
        startAnalyticsStatsBackgroundTask,
        startPersonalAnalyticsCacheWarmer,
        computeNextBackupRun,
        systemJobs,
        runAutoBackupCycle,
        setClientId,
        upgrader,
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
        let configSecretsChanged = false;
        if (!String(config.mailjetInboundSecret || '').trim()) {
            config.mailjetInboundSecret = randomBytes(32).toString('hex');
            configSecretsChanged = true;
        }
        if (!String(config.inboundWebhookToken || '').trim()) {
            config.inboundWebhookToken = randomBytes(32).toString('hex');
            configSecretsChanged = true;
        }
        if (configSecretsChanged) {
            log('[email] Generated inbound reply signing secret and webhook token');
        }
        if (
            String(config.qcIntegrityWebhookUsername || '').trim()
            && !String(config.qcIntegrityWebhookPassword || '').trim()
        ) {
            config.qcIntegrityWebhookPassword = randomBytes(24).toString('hex');
            configSecretsChanged = true;
            log('[integrity] Generated missing Arr hook password — update Sonarr/Radarr/Lidarr Connect basic auth to match');
        }
        if (configSecretsChanged) {
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
        void syncDiscordBot().catch((error) => log(`[Discord] Startup failed: ${error.message}`));

        const syncPortalRequestStatuses = async () => {
            const currentConfig = await loadFile(CONFIG_PATH, {});
            try {
                const { createPortalRequestService } = await import('../portal-request/portalRequestService.js');
                const service = createPortalRequestService({
                    dataDir: path.join(CONFIG_DIR, 'requests'),
                    config: currentConfig,
                    resolveUrl: services.resolveIntegrationUrlForFetch,
                });
                await service.syncRequestStatuses();
            } catch (error) {
                log(`[portal-request] Status sync failed: ${error?.message || error}`);
            }
        };
        void syncPortalRequestStatuses();
        setInterval(() => { void syncPortalRequestStatuses(); }, 5 * 60 * 1000);

        // Warm Radarr/Sonarr catalogs so Discover browse can stamp Available badges quickly.
        const warmPortalLibraryCatalogs = async () => {
            const currentConfig = await loadFile(CONFIG_PATH, {});
            try {
                createLibraryAvailability(currentConfig, {
                    resolveUrl: services.resolveIntegrationUrlForFetch,
                    warmOnCreate: true,
                });
            } catch (error) {
                log(`[portal-request] Library catalog warm failed: ${error?.message || error}`);
            }
        };

        const rebuildAvailabilityDiskCache = async () => {
            const currentConfig = await loadFile(CONFIG_PATH, {});
            try {
                const result = await rebuildDiscoveryAvailabilityCache({
                    config: currentConfig,
                    createLibraryAvailability,
                    saveFile,
                    cachePath: DISCOVERY_AVAILABILITY_CACHE_PATH,
                });
                const homeCache = getDiscoverHomeCache();
                if (homeCache?.setAvailabilityDiskCache) {
                    const raw = await loadFile(DISCOVERY_AVAILABILITY_CACHE_PATH, null);
                    homeCache.setAvailabilityDiskCache(raw);
                }
                log(`[discovery-availability] Cache rebuilt: ${result.itemCount} titles`);
            } catch (error) {
                log(`[discovery-availability] Cache rebuild failed: ${error?.message || error}`);
            }
        };

        void warmPortalLibraryCatalogs();
        setInterval(() => { void warmPortalLibraryCatalogs(); }, 5 * 60 * 1000);

        // Disk availability (~12h) + Discover home rails (shared TMDB pages, ~5m).
        const discoverHomeCache = ensureDiscoverHomeCache({
            configPath: CONFIG_PATH,
            cachePath: DISCOVER_HOME_CACHE_PATH,
            availabilityCachePath: DISCOVERY_AVAILABILITY_CACHE_PATH,
            loadFile,
            saveFile,
            resolveUrl: services.resolveIntegrationUrlForFetch,
            log,
        });
        void (async () => {
            try {
                await warmPortalLibraryCatalogs();
                await rebuildAvailabilityDiskCache();
                await startDiscoverHomeCacheWarmer({
                    configPath: CONFIG_PATH,
                    cachePath: DISCOVER_HOME_CACHE_PATH,
                    availabilityCachePath: DISCOVERY_AVAILABILITY_CACHE_PATH,
                    loadFile,
                    saveFile,
                    resolveUrl: services.resolveIntegrationUrlForFetch,
                    log,
                });
            } catch (error) {
                log(`[DiscoverHomeCache] Startup failed: ${error?.message || error}`);
                // Still try to start warmer even if availability rebuild failed.
                void discoverHomeCache.start().catch((err) => {
                    log(`[DiscoverHomeCache] Late start failed: ${err?.message || err}`);
                });
            }
        })();
        setInterval(() => { void rebuildAvailabilityDiskCache(); }, 12 * 60 * 60 * 1000);

        startTrendingStatsBackgroundTask();
        startAnalyticsStatsBackgroundTask();
        void startPersonalAnalyticsCacheWarmer().catch((error) => log(`[PersonalAnalyticsCache] Startup failed: ${error.message}`));

        const backupConfig = await loadFile(CONFIG_PATH, {});
        upgrader.startIndexJob(() => loadFile(CONFIG_PATH, {}));
        upgrader.startHuntJob(() => loadFile(CONFIG_PATH, {}));
        upgrader.startCleanupJob?.(() => loadFile(CONFIG_PATH, {}));
        upgrader.startSnapshotJob?.(() => loadFile(CONFIG_PATH, {}));
        upgrader.startIntegrityJob?.(() => loadFile(CONFIG_PATH, {}));
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
