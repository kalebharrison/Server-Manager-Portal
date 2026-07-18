import { createAnalyticsHistoryStore } from './analytics-plex-history-service.js';
import { createAnalyticsCacheBuilders, createAnalyticsCacheBackgroundTasks } from './analytics-cache-scheduler-jobs.js';
import { matchesCacheIdentity } from './analytics-cache-helpers.js';

export const createAnalyticsCacheScheduler = ({
    app,
    requireAuth,
    requireMember,
    configPath,
    usersPath,
    analyticsCachePath,
    analyticsHistoryCachePath = null,
    trendingCachePath,
    loadFile,
    saveFile,
    getPlexConnectionUri,
    plexImageUrl,
    enrichRecentItemsWithMediaTags,
    markTaskStart,
    markTaskEnd,
    systemJobs,
    runHeavyJob = (_name, task) => task(),
    log,
}) => {
    const CONFIG_PATH = configPath;
    const TRENDING_CACHE_PATH = trendingCachePath;
    const historyStore = analyticsHistoryCachePath
        ? createAnalyticsHistoryStore({
            historyCachePath: analyticsHistoryCachePath,
            loadFile,
            saveFile,
            log,
        })
        : null;

    const loadScopedCache = async (filePath, fallback) => {
        const config = await loadFile(CONFIG_PATH, null);
        if (!config?.serverIdentifier) return fallback;
        const cache = await loadFile(filePath, null);
        return matchesCacheIdentity(cache, config) ? cache : fallback;
    };

    const { calculateAnalyticsStats, calculateTrendingStats } = createAnalyticsCacheBuilders({
        configPath,
        usersPath,
        analyticsCachePath,
        trendingCachePath,
        historyStore,
        loadFile,
        saveFile,
        getPlexConnectionUri,
        plexImageUrl,
        enrichRecentItemsWithMediaTags,
        markTaskStart,
        markTaskEnd,
        systemJobs,
        runHeavyJob,
        log,
    });

    const { startTrendingStatsBackgroundTask, startAnalyticsStatsBackgroundTask } = createAnalyticsCacheBackgroundTasks({
        configPath,
        analyticsCachePath,
        trendingCachePath,
        loadFile,
        calculateAnalyticsStats,
        calculateTrendingStats,
        systemJobs,
        log,
    });

    app.get('/api/plex/stats/trending', requireAuth, requireMember, async (req, res) => {
        try {
            const stats = await loadScopedCache(TRENDING_CACHE_PATH, {
                trending7Days: [],
                movies30Days: [],
                shows30Days: [],
            });
            if (req.query.includeLeaderboards === '1' && req.user?.isAdmin === true) {
                return res.json(stats);
            }
            res.json({
                trending7Days: stats.trending7Days || [],
                movies30Days: stats.movies30Days || [],
                shows30Days: stats.shows30Days || [],
                lastUpdated: stats.lastUpdated || null,
            });
        } catch (e) {
            res.status(500).json({ error: 'Failed to load trending stats' });
        }
    });

    return {
        calculateAnalyticsStats,
        calculateTrendingStats,
        startTrendingStatsBackgroundTask,
        startAnalyticsStatsBackgroundTask,
    };
};
