import { buildAnalyticsStatsData, buildTrendingCacheData } from './analytics-cache-builders.js';
import {
    ANALYTICS_CACHE_INTERVAL_MS,
    ANALYTICS_COLD_CACHE_INTERVAL_MS,
    COLD_ANALYTICS_TIMEFRAMES,
    INITIAL_CACHE_BUILD_DELAY_MS,
    TRENDING_CACHE_INTERVAL_MS,
    getCacheAgeMs,
    isValidAnalyticsCache,
    isValidTrendingCache,
    matchesCacheIdentity,
} from './analytics-cache-helpers.js';

export const createAnalyticsCacheBuilders = ({
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
    runHeavyJob = (_name, task) => task(),
    log,
}) => {
    const CONFIG_PATH = configPath;
    const USERS_PATH = usersPath;
    const ANALYTICS_CACHE_PATH = analyticsCachePath;
    const TRENDING_CACHE_PATH = trendingCachePath;

    let isBuildingAnalyticsStats = false;
    let isBuildingTrendingStats = false;
    let analyticsBuildPromise = null;
    let trendingBuildPromise = null;

    async function calculateAnalyticsStatsNow() {
        if (isBuildingAnalyticsStats) {
            log('[AnalyticsStats] Build already in progress, skipping.');
            return;
        }
        isBuildingAnalyticsStats = true;
        try {
            markTaskStart(systemJobs.analyticsCache);
            const config = await loadFile(CONFIG_PATH, null);
            if (!config?.plexToken || !config?.serverIdentifier) {
                markTaskEnd(systemJobs.analyticsCache, null);
                return;
            }

            const uri = await getPlexConnectionUri(config);
            if (!uri) {
                markTaskEnd(systemJobs.analyticsCache, null);
                return;
            }

            log('Starting background calculation of Plex Analytics Stats...');

            const storedStats = await loadFile(ANALYTICS_CACHE_PATH, {});
            const existingStats = matchesCacheIdentity(storedStats, config) ? storedStats : {};
            const missingColdWindow = COLD_ANALYTICS_TIMEFRAMES.some((days) => existingStats?.[days] == null);
            const coldAgeMs = Date.now() - Number(existingStats?.coldLastUpdated || existingStats?.lastUpdated || 0);
            const shouldBuildColdWindows = missingColdWindow || coldAgeMs >= ANALYTICS_COLD_CACHE_INTERVAL_MS;

            const statsData = await buildAnalyticsStatsData({
                config,
                uri,
                existingStats,
                shouldBuildColdWindows,
                historyStore,
                loadFile,
                usersPath: USERS_PATH,
                plexImageUrl,
                log,
            });
            if (!statsData) {
                markTaskEnd(systemJobs.analyticsCache, null);
                return;
            }

            await saveFile(ANALYTICS_CACHE_PATH, statsData);
            log(`Successfully calculated and cached Plex Analytics Stats (${shouldBuildColdWindows ? 'hot+cold' : 'hot'} windows).`);
            markTaskEnd(systemJobs.analyticsCache, null);
        } catch (e) {
            log(`Error calculating analytics stats: ${e.message}`);
            markTaskEnd(systemJobs.analyticsCache, e);
        } finally {
            isBuildingAnalyticsStats = false;
        }
    }

    async function calculateAnalyticsStats() {
        if (analyticsBuildPromise) {
            log('[AnalyticsStats] Build already queued or in progress, reusing it.');
            return analyticsBuildPromise;
        }
        analyticsBuildPromise = runHeavyJob('analyticsCache', calculateAnalyticsStatsNow)
            .finally(() => { analyticsBuildPromise = null; });
        return analyticsBuildPromise;
    }

    async function calculateTrendingStatsNow() {
        if (isBuildingTrendingStats) {
            log('[TrendingStats] Build already in progress, skipping.');
            return;
        }
        isBuildingTrendingStats = true;
        try {
            markTaskStart(systemJobs.trendingCache);
            const config = await loadFile(CONFIG_PATH, null);
            if (!config?.plexToken || !config?.serverIdentifier) {
                markTaskEnd(systemJobs.trendingCache, null);
                return;
            }

            const uri = await getPlexConnectionUri(config);
            if (!uri) {
                markTaskEnd(systemJobs.trendingCache, null);
                return;
            }

            log('Starting background calculation of Plex Trending Stats...');

            const stats = await buildTrendingCacheData({
                config,
                uri,
                historyStore,
                loadFile,
                usersPath: USERS_PATH,
                enrichRecentItemsWithMediaTags,
            });
            if (!stats) {
                log('No history found for trending stats.');
                markTaskEnd(systemJobs.trendingCache, null);
                return;
            }

            await saveFile(TRENDING_CACHE_PATH, stats);
            log('Successfully calculated and cached Plex Trending Stats.');
            markTaskEnd(systemJobs.trendingCache, null);
        } catch (e) {
            log(`Error calculating trending stats: ${e.message}`);
            markTaskEnd(systemJobs.trendingCache, e);
        } finally {
            isBuildingTrendingStats = false;
        }
    }

    async function calculateTrendingStats() {
        if (trendingBuildPromise) {
            log('[TrendingStats] Build already queued or in progress, reusing it.');
            return trendingBuildPromise;
        }
        trendingBuildPromise = runHeavyJob('trendingCache', calculateTrendingStatsNow)
            .finally(() => { trendingBuildPromise = null; });
        return trendingBuildPromise;
    }

    return { calculateAnalyticsStats, calculateTrendingStats };
};

export const createAnalyticsCacheBackgroundTasks = ({
    configPath,
    analyticsCachePath,
    trendingCachePath,
    loadFile,
    calculateAnalyticsStats,
    calculateTrendingStats,
    systemJobs,
    log,
}) => {
    const CONFIG_PATH = configPath;
    const ANALYTICS_CACHE_PATH = analyticsCachePath;
    const TRENDING_CACHE_PATH = trendingCachePath;

    let trendingRebuildTimer = null;
    let analyticsRebuildTimer = null;

    const scheduleTrendingRebuild = (delayMs) => {
        if (trendingRebuildTimer) clearTimeout(trendingRebuildTimer);
        const safeDelay = Math.max(0, delayMs);
        systemJobs.trendingCache.nextRun = new Date(Date.now() + safeDelay).toISOString();
        trendingRebuildTimer = setTimeout(async () => {
            await calculateTrendingStats();
            scheduleTrendingRebuild(TRENDING_CACHE_INTERVAL_MS);
        }, safeDelay);
    };

    const scheduleAnalyticsRebuild = (delayMs) => {
        if (analyticsRebuildTimer) clearTimeout(analyticsRebuildTimer);
        const safeDelay = Math.max(0, delayMs);
        systemJobs.analyticsCache.nextRun = new Date(Date.now() + safeDelay).toISOString();
        analyticsRebuildTimer = setTimeout(async () => {
            await calculateAnalyticsStats();
            scheduleAnalyticsRebuild(ANALYTICS_CACHE_INTERVAL_MS);
        }, safeDelay);
    };

    const startTrendingStatsBackgroundTask = async () => {
        let existing = null;
        try {
            const config = await loadFile(CONFIG_PATH, null);
            const loaded = await loadFile(TRENDING_CACHE_PATH, null);
            if (matchesCacheIdentity(loaded, config) && isValidTrendingCache(loaded)) existing = loaded;
        } catch { /* no cache yet */ }

        if (existing) {
            const ageMs = await getCacheAgeMs(TRENDING_CACHE_PATH, existing);
            if (ageMs == null) {
                log('[TrendingStats] Loaded existing cache.');
                scheduleTrendingRebuild(TRENDING_CACHE_INTERVAL_MS);
                return;
            }
            const remainingMs = Math.max(0, TRENDING_CACHE_INTERVAL_MS - ageMs);
            log(`[TrendingStats] Loaded existing cache (age: ${Math.round(ageMs / 60000)} min). Next rebuild in ${Math.round(remainingMs / 60000)} min.`);
            if (ageMs >= TRENDING_CACHE_INTERVAL_MS) {
                log('[TrendingStats] Cache is stale — triggering immediate rebuild.');
                scheduleTrendingRebuild(0);
            } else {
                scheduleTrendingRebuild(remainingMs);
            }
            return;
        }

        log('[TrendingStats] No cache found — triggering initial build.');
        scheduleTrendingRebuild(INITIAL_CACHE_BUILD_DELAY_MS);
    };

    const startAnalyticsStatsBackgroundTask = async () => {
        let existing = null;
        try {
            const config = await loadFile(CONFIG_PATH, null);
            const loaded = await loadFile(ANALYTICS_CACHE_PATH, null);
            if (matchesCacheIdentity(loaded, config) && isValidAnalyticsCache(loaded)) existing = loaded;
        } catch { /* no cache yet */ }

        if (existing) {
            const ageMs = await getCacheAgeMs(ANALYTICS_CACHE_PATH, existing);
            if (ageMs == null) {
                log('[AnalyticsStats] Loaded existing cache.');
                scheduleAnalyticsRebuild(ANALYTICS_CACHE_INTERVAL_MS);
                return;
            }
            const remainingMs = Math.max(0, ANALYTICS_CACHE_INTERVAL_MS - ageMs);
            log(`[AnalyticsStats] Loaded existing cache (age: ${Math.round(ageMs / 60000)} min). Next rebuild in ${Math.round(remainingMs / 60000)} min.`);
            if (ageMs >= ANALYTICS_CACHE_INTERVAL_MS) {
                log('[AnalyticsStats] Cache is stale — triggering immediate rebuild.');
                scheduleAnalyticsRebuild(0);
            } else {
                scheduleAnalyticsRebuild(remainingMs);
            }
            return;
        }

        log('[AnalyticsStats] No cache found — triggering initial build.');
        scheduleAnalyticsRebuild(INITIAL_CACHE_BUILD_DELAY_MS + 5000);
    };

    return { startTrendingStatsBackgroundTask, startAnalyticsStatsBackgroundTask };
};
