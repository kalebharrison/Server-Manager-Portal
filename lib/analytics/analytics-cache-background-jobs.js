import {
    ANALYTICS_CACHE_INTERVAL_MS,
    INITIAL_CACHE_BUILD_DELAY_MS,
    TRENDING_CACHE_INTERVAL_MS,
    getCacheAgeMs,
    isValidAnalyticsCache,
    isValidTrendingCache,
    matchesCacheIdentity,
} from './analytics-cache-helpers.js';

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
