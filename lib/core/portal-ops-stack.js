import { createLruCache, createTtlCache } from '../cache/cache.js';
import { enrichRecentItemsWithMediaTags } from '../plex/plex-media-tags.js';
import { createBackgroundService } from '../admin/background-service.js';
import { createAnalyticsService } from '../analytics/analytics-service.js';
import { createStreamMonitor } from '../status/stream-monitor.js';
import { computeNextBackupRun, findRunnableTask, getTasksSnapshot, markTaskEnd, markTaskStart, systemJobs, tasksInfo } from '../admin/task-state.js';
import { createBackupService } from '../admin/backup.js';
import { normalizeExternalBaseUrl } from '../http/network-policy.js';
import { createUpgraderService } from '../upgrader/index.js';
import {
    CONFIG_PATH,
    ANALYTICS_CACHE_PATH,
    ANALYTICS_HISTORY_CACHE_PATH,
    PERSONAL_ANALYTICS_CACHE_PATH,
    TRENDING_CACHE_PATH,
    KILL_RULES_PATH,
    PLEX_STATS_CACHE_PATH,
    USERS_PATH,
    UPGRADER_INDEX_PATH,
    UPGRADER_PREFS_PATH,
    UPGRADER_AUDIT_PATH,
    UPGRADER_INTEGRITY_CACHE_PATH,
} from '../config/data-paths.js';

export { createPortalStatusRuntime } from './portal-status-runtime.js';

export const createPortalOpsStack = ({
    app,
    requireAuth,
    requireMember,
    requireAdmin,
    loadFile,
    loadFileShared,
    saveFile,
    configSecretProtector,
    log,
    runHeavyJob,
    getPlexConnectionUri,
    resolveIntegrationUrlForFetch,
    fetchWithTimeout,
    fetchPlexServerAccounts,
    resolveLocalPlexAccountId,
    resolveCurrentAdmin,
    plexImageUrl,
    withBasePath,
    jellyfinItemUrl,
    isJellyfinConfigured,
    buildPlexStatsCache,
    getCachedPlexMetadata,
    setCachedPlexMetadata,
    sendEmail,
    escapeHtmlAttr,
    syncUsers,
    checkAndSendNotifications,
    checkAndRevoke,
    checkAndSendNewsletter,
    backgroundExtras,
    appendAuditLog,
    plexSessionsSnapshot,
    statusRuntime,
    discordNotifier = null,
}) => {
    if (typeof resolveIntegrationUrlForFetch !== 'function') {
        throw new Error('createPortalOpsStack requires resolveIntegrationUrlForFetch.');
    }
    const apiCache = createTtlCache({ maxEntries: 500 });
    const upgrader = createUpgraderService({
        indexPath: UPGRADER_INDEX_PATH,
        prefsPath: UPGRADER_PREFS_PATH,
        auditPath: UPGRADER_AUDIT_PATH,
        integrityCachePath: UPGRADER_INTEGRITY_CACHE_PATH,
        loadFile,
        loadFileShared,
        saveFile,
        fetchWithTimeout,
        resolveIntegrationUrlForFetch,
        log,
        discordNotifier,
    });

    const withCache = async (key, ttlMs, fetcher) => {
        return apiCache.getOrSet(key, ttlMs, fetcher);
    };

    const {
        applyBackupPayload,
        createBackupObject,
        enforceBackupRetention,
        listBackupFiles,
        secureStoredBackups,
        writeBackupToFolder,
        backupDir: BACKUP_DIR,
    } = createBackupService({
        loadFile,
        saveFile,
        sealBackup: configSecretProtector.sealBackup,
        openBackup: configSecretProtector.openBackup,
    });

    const analyticsService = createAnalyticsService({
        app,
        requireAuth,
        requireMember,
        requireAdmin,
        configPath: CONFIG_PATH,
        usersPath: USERS_PATH,
        analyticsCachePath: ANALYTICS_CACHE_PATH,
        analyticsHistoryCachePath: ANALYTICS_HISTORY_CACHE_PATH,
        personalAnalyticsCachePath: PERSONAL_ANALYTICS_CACHE_PATH,
        trendingCachePath: TRENDING_CACHE_PATH,
        plexStatsCachePath: PLEX_STATS_CACHE_PATH,
        loadFile,
        saveFile,
        getPlexConnectionUri,
        resolveIntegrationUrlForFetch,
        fetchWithTimeout,
        fetchPlexServerAccounts,
        resolveLocalPlexAccountId,
        resolveCurrentAdmin,
        plexImageUrl,
        withBasePath,
        jellyfinItemUrl,
        isJellyfinConfigured,
        buildPlexStatsCache,
        getCachedPlexMetadata,
        setCachedPlexMetadata,
        enrichRecentItemsWithMediaTags,
        sendEmail,
        escapeHtmlAttr,
        markTaskStart,
        markTaskEnd,
        systemJobs,
        runHeavyJob,
        log,
    });
    const {
        calculateAnalyticsStats,
        calculateTrendingStats,
        startTrendingStatsBackgroundTask,
        startAnalyticsStatsBackgroundTask,
        startPersonalAnalyticsCacheWarmer,
    } = analyticsService;

    const { checkAndCleanupInactive, runAutoBackupCycle, startBackgroundService } = createBackgroundService({
        configPath: CONFIG_PATH,
        usersPath: USERS_PATH,
        loadFile,
        saveFile,
        fetch,
        getPlexConnectionUri,
        syncUsers,
        checkAndSendNotifications,
        checkAndRevoke,
        checkAndSendNewsletter,
        backgroundExtras,
        createBackupObject,
        writeBackupToFolder,
        enforceBackupRetention,
        computeNextBackupRun,
        tasksInfo,
        systemJobs,
        markTaskStart,
        markTaskEnd,
        appendAuditLog,
        log,
    });

    const { monitorConcurrentSessions } = createStreamMonitor({
        configPath: CONFIG_PATH,
        killRulesPath: KILL_RULES_PATH,
        plexStatsCachePath: PLEX_STATS_CACHE_PATH,
        loadFile,
        saveFile,
        getPlexConnectionUri,
        fetchWithTimeout,
        plexSessionsSnapshot,
        appendAuditLog,
        log,
    });

    return {
        withCache,
        statusRuntime,
        applyBackupPayload,
        createBackupObject,
        enforceBackupRetention,
        listBackupFiles,
        secureStoredBackups,
        writeBackupToFolder,
        BACKUP_DIR,
        analyticsService,
        calculateAnalyticsStats,
        calculateTrendingStats,
        startTrendingStatsBackgroundTask,
        startAnalyticsStatsBackgroundTask,
        startPersonalAnalyticsCacheWarmer,
        checkAndCleanupInactive,
        runAutoBackupCycle,
        startBackgroundService,
        monitorConcurrentSessions,
        computeNextBackupRun,
        getTasksSnapshot,
        findRunnableTask,
        markTaskStart,
        markTaskEnd,
        systemJobs,
        normalizeExternalBaseUrl,
        upgrader,
    };
};
