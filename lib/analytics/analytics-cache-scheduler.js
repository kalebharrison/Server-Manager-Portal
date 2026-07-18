import fs from 'fs/promises';

import { createAnalyticsHistoryStore, fetchPlexServerHistory } from './analytics-plex-history-service.js';
import { aggregateAnalyticsWindow } from './analytics-shared.js';
import { buildTrendingStats } from './trending-stats-builder.js';
import { hiddenLeaderboardAccountIds } from '../users/user-profile.js';

const ANALYTICS_CACHE_VERSION = 1;

const matchesCacheIdentity = (cache, config) => {
    const serverIdentifier = String(config?.serverIdentifier || '');
    return !!serverIdentifier
        && cache?.version === ANALYTICS_CACHE_VERSION
        && String(cache?.serverIdentifier || '') === serverIdentifier;
};

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
    const USERS_PATH = usersPath;
    const ANALYTICS_CACHE_PATH = analyticsCachePath;
    const TRENDING_CACHE_PATH = trendingCachePath;
    const historyStore = analyticsHistoryCachePath
        ? createAnalyticsHistoryStore({
            historyCachePath: analyticsHistoryCachePath,
            loadFile,
            saveFile,
            log,
        })
        : null;
    const HOT_ANALYTICS_TIMEFRAMES = [1, 7, 30, 60];
    const COLD_ANALYTICS_TIMEFRAMES = [90, 180, 365, 1825, 'all'];
    const ANALYTICS_COLD_CACHE_INTERVAL_MS = 12 * 60 * 60 * 1000;

    const loadScopedCache = async (filePath, fallback) => {
        const config = await loadFile(CONFIG_PATH, null);
        if (!config?.serverIdentifier) return fallback;
        const cache = await loadFile(filePath, null);
        return matchesCacheIdentity(cache, config) ? cache : fallback;
    };

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
            if (!config || !config.plexToken || !config.serverIdentifier) {
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
            const nowSec = Math.floor(Date.now() / 1000);
            const missingColdWindow = COLD_ANALYTICS_TIMEFRAMES.some((days) => existingStats?.[days] == null);
            const coldAgeMs = Date.now() - Number(existingStats?.coldLastUpdated || existingStats?.lastUpdated || 0);
            const shouldBuildColdWindows = missingColdWindow || coldAgeMs >= ANALYTICS_COLD_CACHE_INTERVAL_MS;
            const timeframes = shouldBuildColdWindows
                ? [...HOT_ANALYTICS_TIMEFRAMES, ...COLD_ANALYTICS_TIMEFRAMES]
                : HOT_ANALYTICS_TIMEFRAMES;
            const oldestHotCompareDays = Math.max(...HOT_ANALYTICS_TIMEFRAMES) * 2;
            const hotCutoffTs = nowSec - (oldestHotCompareDays * 24 * 60 * 60);
            let historyItems = null;
            if (historyStore) {
                // Hot rebuilds should reuse the on-disk store without forcing another incremental merge.
                if (shouldBuildColdWindows) {
                    historyItems = await historyStore.fetchIncrementalServerHistory(uri, config, { maxItems: 250000 });
                } else {
                    historyItems = await historyStore.loadItems(config);
                    if (!historyItems?.length) {
                        historyItems = await historyStore.fetchIncrementalServerHistory(uri, config, { maxItems: 250000 });
                    }
                }
            } else {
                historyItems = await fetchPlexServerHistory(uri, config, {
                    maxItems: shouldBuildColdWindows ? 250000 : 50000,
                    stopBeforeTs: shouldBuildColdWindows ? 0 : hotCutoffTs,
                    log,
                });
            }
            if (!shouldBuildColdWindows && Array.isArray(historyItems)) {
                historyItems = historyItems.filter((item) => Number(item?.viewedAt || 0) >= hotCutoffTs);
            }
    
            const sectionsRes = await fetch(`${uri}/library/sections?X-Plex-Token=${config.plexToken}`, { headers: { 'Accept': 'application/json' } }).then(r => r.json()).catch(() => null);
            const accountsRes = await fetch(`${uri}/accounts?X-Plex-Token=${config.plexToken}`, { headers: { 'Accept': 'application/json' } }).then(r => r.json()).catch(() => null);
            const devicesRes = await fetch(`${uri}/devices?X-Plex-Token=${config.plexToken}`, { headers: { 'Accept': 'application/json' } }).then(r => r.json()).catch(() => null);
            const users = await loadFile(USERS_PATH, []);
    
            if (!Array.isArray(historyItems) || historyItems.length === 0) {
                markTaskEnd(systemJobs.analyticsCache, null);
                return;
            }
    
            const accountsMap = {};
            if (accountsRes && accountsRes.MediaContainer && accountsRes.MediaContainer.Account) {
                accountsRes.MediaContainer.Account.forEach(acc => accountsMap[acc.id] = { name: acc.name, thumb: acc.thumb });
            }
    
            const sectionsMap = {};
            if (sectionsRes && sectionsRes.MediaContainer && sectionsRes.MediaContainer.Directory) {
                sectionsRes.MediaContainer.Directory.forEach(s => sectionsMap[s.key] = s.title);
            }
    
            const devicesMap = {};
            if (devicesRes && devicesRes.MediaContainer && devicesRes.MediaContainer.Device) {
                devicesRes.MediaContainer.Device.forEach(d => devicesMap[d.id] = d.name || d.platform || 'Unknown Device');
            }
    
            const richMetadataCache = new Map();
            const fetchRichMetadata = async (c) => {
                if (c.thumb) c.thumbUrl = plexImageUrl(c.thumb);
                const metadataId = c.key?.split('/').pop();
                if (!metadataId) return c;
                try {
                    let metadata = richMetadataCache.get(metadataId);
                    if (!metadata) {
                        metadata = fetch(`${uri}/library/metadata/${metadataId}?X-Plex-Token=${config.plexToken}`, { headers: { 'Accept': 'application/json' } })
                            .then(r => r.json())
                            .then((metaRes) => metaRes?.MediaContainer?.Metadata?.[0] || null)
                            .catch(() => null);
                        richMetadataCache.set(metadataId, metadata);
                    }
                    const meta = await metadata;
                    if (meta) {
                        c.summary = meta.summary || '';
                        c.year = meta.year || '';
                        c.rating = meta.rating || meta.audienceRating || '';
                        c.contentRating = meta.contentRating || '';
                        c.duration = meta.duration || 0;
                        c.genres = meta.Genre ? meta.Genre.map(g => g.tag) : [];
                    }
                } catch (e) {}
                return c;
            };
    
            const statsData = existingStats && typeof existingStats === 'object' ? { ...existingStats } : {};
            const aggCtx = { accountsMap, sectionsMap, devicesMap, users, config };
    
            for (const days of timeframes) {
                const afterTs = days === 'all' ? 0 : nowSec - (days * 24 * 60 * 60);
                const windowStats = aggregateAnalyticsWindow(historyItems, { afterTs, beforeTs: null }, aggCtx, { includePortalUsers: true });
    
                const topMovies = await Promise.all(Object.values(windowStats.contentCountsMovies).sort((a, b) => b.plays - a.plays).slice(0, 10).map(fetchRichMetadata));
                const topShows = await Promise.all(Object.values(windowStats.contentCountsShows).sort((a, b) => b.plays - a.plays).slice(0, 10).map(fetchRichMetadata));
                const topMusic = await Promise.all(Object.values(windowStats.contentCountsMusic).sort((a, b) => b.plays - a.plays).slice(0, 10).map(fetchRichMetadata));
    
                const entry = {
                    topUsers: windowStats.topUsers,
                    topLibraries: windowStats.topLibraries,
                    topMovies,
                    topShows,
                    topMusic,
                    topDevices: windowStats.topDevices,
                    peakHours: windowStats.peakHours,
                    totalPlaybacks: windowStats.totalPlaybacks
                };
    
                if (days !== 'all') {
                    const daySeconds = Number(days) * 24 * 60 * 60;
                    const priorStats = aggregateAnalyticsWindow(
                        historyItems,
                        { afterTs: nowSec - daySeconds * 2, beforeTs: nowSec - daySeconds },
                        aggCtx,
                        { includePortalUsers: false }
                    );
                    entry.priorPeriod = {
                        totalPlaybacks: priorStats.totalPlaybacks,
                        topUsers: priorStats.topUsers,
                        topLibraries: priorStats.topLibraries
                    };
                }
    
                statsData[days] = entry;
            }
    
            statsData.lastUpdated = Date.now();
            if (shouldBuildColdWindows) statsData.coldLastUpdated = statsData.lastUpdated;
            statsData.version = ANALYTICS_CACHE_VERSION;
            statsData.serverIdentifier = config.serverIdentifier;
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
            if (!config || !config.plexToken || !config.serverIdentifier) {
                markTaskEnd(systemJobs.trendingCache, null);
                return;
            }
    
            const uri = await getPlexConnectionUri(config);
            if (!uri) {
                markTaskEnd(systemJobs.trendingCache, null);
                return;
            }
    
            log('Starting background calculation of Plex Trending Stats...');

            let history = [];
            if (historyStore) {
                let items = await historyStore.loadItems(config);
                if (!items?.length) {
                    items = await historyStore.fetchIncrementalServerHistory(uri, config, { maxItems: 250000 });
                }
                const cutoff = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);
                history = (items || []).filter((item) => Number(item?.viewedAt || 0) >= cutoff).slice(0, 10000);
            } else {
                const response = await fetch(`${uri}/status/sessions/history/all?sort=viewedAt%3Adesc&limit=10000&X-Plex-Token=${config.plexToken}`, { headers: { 'Accept': 'application/json' } }).catch(() => null);
                if (!response) {
                    markTaskEnd(systemJobs.trendingCache, null);
                    return;
                }
                const historyRes = await response.json().catch(() => null);
                history = historyRes?.MediaContainer?.Metadata || [];
            }
            if (!history.length) {
                log('No history found for trending stats.');
                markTaskEnd(systemJobs.trendingCache, null);
                return;
            }
    
            const users = await loadFile(USERS_PATH, []);
            const stats = await buildTrendingStats({
                history,
                uri,
                config,
                enrichRecentItemsWithMediaTags,
                hiddenAccountIds: hiddenLeaderboardAccountIds(users),
            });
            await saveFile(TRENDING_CACHE_PATH, {
                ...stats,
                version: ANALYTICS_CACHE_VERSION,
                serverIdentifier: config.serverIdentifier,
            });
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
    
    const TRENDING_CACHE_INTERVAL_MS = 12 * 60 * 60 * 1000;
    const ANALYTICS_CACHE_INTERVAL_MS = 30 * 60 * 1000;
    const INITIAL_CACHE_BUILD_DELAY_MS = 10 * 1000;
    
    let trendingRebuildTimer = null;
    let analyticsRebuildTimer = null;
    
    const getCacheAgeMs = async (filePath, parsed, timestampFields = ['lastUpdated', 'generatedAt']) => {
        for (const field of timestampFields) {
            const value = parsed?.[field];
            if (value) return Date.now() - Number(value);
        }
        try {
            const stat = await fs.stat(filePath);
            return Date.now() - stat.mtimeMs;
        } catch {
            return null;
        }
    };
    
    const isValidTrendingCache = (data) => (
        data && typeof data === 'object' && !!data.lastUpdated && Array.isArray(data.trending7Days)
    );
    
    const isValidAnalyticsCache = (data) => {
        if (!data || typeof data !== 'object') return false;
        return data.all !== undefined || data['7'] !== undefined || data['30'] !== undefined || data[7] !== undefined || data[30] !== undefined;
    };
    
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
