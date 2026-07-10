import fs from 'fs/promises';
import fetch from 'node-fetch';

import { aggregateAnalyticsWindow } from './analytics-shared.js';

export const createAnalyticsCacheScheduler = ({
    app,
    requireAuth,
    requireMember,
    configPath,
    usersPath,
    analyticsCachePath,
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

    app.get('/api/media-stack/trending', requireAuth, requireMember, async (req, res) => {
        const stats = await loadFile(TRENDING_CACHE_PATH, { movies: 0, series: 0 });
        res.json(stats);
    });
    
    // (Endpoints moved up before wildcard route)
    
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
    
            const pageSize = 5000;
            const maxHistoryItems = 250000;
            let historyItems = [];
            let start = 0;
    
            while (start < maxHistoryItems) {
                const pageRes = await fetch(
                    `${uri}/status/sessions/history/all?X-Plex-Token=${config.plexToken}&sort=viewedAt:desc&X-Plex-Container-Start=${start}&X-Plex-Container-Size=${pageSize}`,
                    { headers: { 'Accept': 'application/json' } }
                ).then(r => r.json()).catch(() => null);
    
                const pageContainer = pageRes && pageRes.MediaContainer ? pageRes.MediaContainer : null;
                const pageItems = pageContainer && Array.isArray(pageContainer.Metadata) ? pageContainer.Metadata : [];
                if (pageItems.length === 0) break;
    
                historyItems = historyItems.concat(pageItems);
                start += pageItems.length;
    
                const totalSize = Number(pageContainer.totalSize || 0);
                if ((totalSize > 0 && start >= totalSize) || pageItems.length < pageSize) break;
            }
    
            if (historyItems.length >= maxHistoryItems) {
                log(`Analytics history fetch reached safety cap (${maxHistoryItems}). Results may be truncated.`);
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
    
            const timeframes = [1, 7, 30, 60, 90, 180, 365, 1825, 'all'];
            const statsData = {};
            const nowSec = Math.floor(Date.now() / 1000);
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
            await saveFile(ANALYTICS_CACHE_PATH, statsData);
            log('Successfully calculated and cached Plex Analytics Stats.');
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
    
            // Fetch up to 10,000 most recent history items
            const response = await fetch(`${uri}/status/sessions/history/all?sort=viewedAt%3Adesc&limit=10000&X-Plex-Token=${config.plexToken}`, { headers: { 'Accept': 'application/json' } }).catch(() => null);
            if (!response) {
                markTaskEnd(systemJobs.trendingCache, null);
                return;
            }
            const historyRes = await response.json().catch(() => null);
            if (!historyRes || !historyRes.MediaContainer || !historyRes.MediaContainer.Metadata) {
                log('No history found or failed to parse history JSON.');
                markTaskEnd(systemJobs.trendingCache, null);
                return;
            }
    
            const history = historyRes.MediaContainer.Metadata;
    
            const now = Date.now() / 1000;
            const days7 = now - (7 * 24 * 60 * 60);
            const days30 = now - (30 * 24 * 60 * 60);
            const days60 = now - (60 * 24 * 60 * 60);
            const days90 = now - (90 * 24 * 60 * 60);
            const days180 = now - (180 * 24 * 60 * 60);
            const days365 = now - (365 * 24 * 60 * 60);
    
            const counts = {
                trending7Days: {},
                movies30Days: {},
                shows30Days: {},
                top365Days: {},
                allTime: {},
                weekendWarriors: {},
                nightOwls: {},
                retroHits: {},
                cultClassics: {}
            };
            const userPlays = {
                '7': {},
                '30': {},
                '60': {},
                '90': {},
                '180': {},
                '365': {},
                'all': {}
            };
    
            history.forEach(item => {
                const viewedAt = item.viewedAt;
                const isMovie = item.type === 'movie';
                const isEpisode = item.type === 'episode';
    
                if (!isMovie && !isEpisode) return;
    
                const groupKey = isMovie ? item.ratingKey : item.grandparentKey;
    
                const metaId = String(groupKey).split('/').pop();
                const baseItem = {
                    ratingKey: metaId,
                    title: isMovie ? item.title : item.grandparentTitle,
                    thumb: isMovie ? item.thumb : (item.grandparentThumb || item.parentThumb || item.thumb),
                    type: isMovie ? 'movie' : 'show',
                    plexUrl: `https://app.plex.tv/desktop/#!/server/${config.serverIdentifier}/details?key=${encodeURIComponent('/library/metadata/' + metaId)}`
                };
    
                const increment = (obj) => {
                    if (!obj[groupKey]) {
                        obj[groupKey] = { ...baseItem, views: 0, users: new Set() };
                    }
                    obj[groupKey].views++;
                    obj[groupKey].users.add(item.accountID);
                };
    
                increment(counts.allTime); // All time gets incremented for every view
                userPlays['all'][item.accountID] = (userPlays['all'][item.accountID] || 0) + 1;
    
                // Time-based stats
                if (viewedAt >= days7) {
                    increment(counts.trending7Days);
                    userPlays['7'][item.accountID] = (userPlays['7'][item.accountID] || 0) + 1;
                }
                if (viewedAt >= days30) userPlays['30'][item.accountID] = (userPlays['30'][item.accountID] || 0) + 1;
                if (viewedAt >= days60) userPlays['60'][item.accountID] = (userPlays['60'][item.accountID] || 0) + 1;
                if (viewedAt >= days90) userPlays['90'][item.accountID] = (userPlays['90'][item.accountID] || 0) + 1;
                if (viewedAt >= days180) userPlays['180'][item.accountID] = (userPlays['180'][item.accountID] || 0) + 1;
                if (viewedAt >= days365) {
                    increment(counts.top365Days);
                    userPlays['365'][item.accountID] = (userPlays['365'][item.accountID] || 0) + 1;
                }
    
                // Movie / Show 30 days
                if (viewedAt >= days30) {
                    if (item.type === 'movie') increment(counts.movies30Days);
                    if (item.type === 'episode') increment(counts.shows30Days);
                }
    
                // Wacky Stats Logic
                const date = new Date(viewedAt * 1000);
                const dayOfWeek = date.getDay(); // 0 is Sunday, 5 is Friday, 6 is Saturday
                const hourOfDay = date.getHours(); // 0 to 23
    
                // Weekend Warriors (Friday, Saturday, Sunday)
                if (dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6) {
                    increment(counts.weekendWarriors);
                }
    
                // Night Owl Club (Midnight to 5am)
                if (hourOfDay >= 0 && hourOfDay < 5) {
                    increment(counts.nightOwls);
                }
    
                // Blast from the Past (Retro Hits - released before 2000)
                if (item.originallyAvailableAt && item.originallyAvailableAt.startsWith('19')) {
                    increment(counts.retroHits);
                }
    
                // Cult Classics (Track all-time for density later)
                increment(counts.cultClassics);
            });
    
            const excludedKeys = new Set();
    
            const getTopUnique = (obj, limit = 20) => {
                const sorted = Object.values(obj).sort((a, b) => b.views - a.views);
                const result = [];
                for (const item of sorted) {
                    if (result.length >= limit) break;
                    if (!excludedKeys.has(item.ratingKey)) {
                        result.push(item);
                        excludedKeys.add(item.ratingKey);
                    }
                }
                return result;
            };
    
            const getCultClassicsUnique = (obj) => {
                const sorted = Object.values(obj)
                    .filter(a => a.views > 10 && a.users.size <= 2)
                    .sort((a, b) => (b.views / b.users.size) - (a.views / a.users.size));
    
                const result = [];
                for (const item of sorted) {
                    if (result.length >= 20) break;
                    if (!excludedKeys.has(item.ratingKey)) {
                        result.push(item);
                        excludedKeys.add(item.ratingKey);
                    }
                }
                return result;
            };
    
            const leaderboards = {};
            const leaderboardsSorted = {};
            const totalActiveUsers = {};
            Object.keys(userPlays).forEach(period => {
                const sortedUsers = Object.entries(userPlays[period]).sort((a, b) => b[1] - a[1]);
                leaderboards[period] = {};
                leaderboardsSorted[period] = sortedUsers.map(([accountId, plays], index) => ({ accountId, plays, rank: index + 1 }));
                sortedUsers.forEach(([accountId, plays], index) => {
                    leaderboards[period][accountId] = { rank: index + 1, plays };
                });
                totalActiveUsers[period] = sortedUsers.length;
            });
    
            // Replace the in-memory `users` Set with a serializable count, since a Set
            // becomes {} under JSON.stringify and loses its size on reload.
            const stripUsers = (arr) => arr.map(({ users, ...rest }) => ({
                ...rest,
                userCount: users instanceof Set ? users.size : (rest.userCount || 0)
            }));
    
            const trendingLists = await Promise.all([
                enrichRecentItemsWithMediaTags(uri, config, stripUsers(getTopUnique(counts.trending7Days))),
                enrichRecentItemsWithMediaTags(uri, config, stripUsers(getTopUnique(counts.movies30Days))),
                enrichRecentItemsWithMediaTags(uri, config, stripUsers(getTopUnique(counts.shows30Days))),
                enrichRecentItemsWithMediaTags(uri, config, stripUsers(getTopUnique(counts.top365Days))),
                enrichRecentItemsWithMediaTags(uri, config, stripUsers(getTopUnique(counts.allTime))),
                enrichRecentItemsWithMediaTags(uri, config, stripUsers(getTopUnique(counts.weekendWarriors))),
                enrichRecentItemsWithMediaTags(uri, config, stripUsers(getTopUnique(counts.nightOwls))),
                enrichRecentItemsWithMediaTags(uri, config, stripUsers(getTopUnique(counts.retroHits))),
                enrichRecentItemsWithMediaTags(uri, config, stripUsers(getCultClassicsUnique(counts.cultClassics)))
            ]);
            const [
                trending7Days,
                movies30Days,
                shows30Days,
                top365Days,
                allTime,
                weekendWarriors,
                nightOwls,
                retroHits,
                cultClassics
            ] = trendingLists;
    
            const stats = {
                trending7Days,
                movies30Days,
                shows30Days,
                top365Days,
                allTime,
                weekendWarriors,
                nightOwls,
                retroHits,
                cultClassics,
                leaderboards,
                leaderboardsSorted,
                totalActiveUsers,
                lastUpdated: Date.now()
            };
    
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
            const loaded = await loadFile(TRENDING_CACHE_PATH, null);
            if (isValidTrendingCache(loaded)) existing = loaded;
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
            const loaded = await loadFile(ANALYTICS_CACHE_PATH, null);
            if (isValidAnalyticsCache(loaded)) existing = loaded;
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
            const stats = await loadFile(TRENDING_CACHE_PATH, {
                trending7Days: [],
                movies30Days: [],
                shows30Days: [],
                top365Days: [],
                allTime: [],
                weekendWarriors: [],
                nightOwls: [],
                retroHits: [],
                cultClassics: []
            });
            if (req.query.includeLeaderboards === '1') return res.json(stats);
            const { leaderboards, leaderboardsSorted, totalActiveUsers, ...visibleStats } = stats;
            res.json(visibleStats);
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
