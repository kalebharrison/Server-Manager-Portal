import { fetchPlexServerHistory } from './analytics-plex-history-service.js';
import { aggregateAnalyticsWindow } from './analytics-shared.js';
import { buildTrendingStats } from './trending-stats-builder.js';
import {
    ANALYTICS_CACHE_VERSION,
    COLD_ANALYTICS_TIMEFRAMES,
    HOT_ANALYTICS_TIMEFRAMES,
} from './analytics-cache-helpers.js';
import { hiddenLeaderboardAccountIds } from '../users/user-profile.js';

export const buildAnalyticsStatsData = async ({
    config,
    uri,
    existingStats,
    shouldBuildColdWindows,
    historyStore,
    loadFile,
    usersPath,
    plexImageUrl,
    log,
}) => {
    const nowSec = Math.floor(Date.now() / 1000);
    const timeframes = shouldBuildColdWindows
        ? [...HOT_ANALYTICS_TIMEFRAMES, ...COLD_ANALYTICS_TIMEFRAMES]
        : HOT_ANALYTICS_TIMEFRAMES;
    const oldestHotCompareDays = Math.max(...HOT_ANALYTICS_TIMEFRAMES) * 2;
    const hotCutoffTs = nowSec - (oldestHotCompareDays * 24 * 60 * 60);
    let historyItems = null;
    if (historyStore) {
        // Hot + cold rebuilds both incremental-sync from Plex. Hot used to only
        // read the history file, so new plays could sit unseen for up to 12h.
        historyItems = await historyStore.fetchIncrementalServerHistory(uri, config, { maxItems: 250000 });
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
    const users = await loadFile(usersPath, []);

    if (!Array.isArray(historyItems) || historyItems.length === 0) {
        return null;
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
    return statsData;
};

export const buildTrendingCacheData = async ({
    config,
    uri,
    historyStore,
    loadFile,
    usersPath,
    enrichRecentItemsWithMediaTags,
}) => {
    let history = [];
    if (historyStore) {
        const items = await historyStore.fetchIncrementalServerHistory(uri, config, { maxItems: 250000 });
        const cutoff = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);
        history = (items || []).filter((item) => Number(item?.viewedAt || 0) >= cutoff).slice(0, 10000);
    } else {
        const response = await fetch(`${uri}/status/sessions/history/all?sort=viewedAt%3Adesc&limit=10000&X-Plex-Token=${config.plexToken}`, { headers: { 'Accept': 'application/json' } }).catch(() => null);
        if (!response) return null;
        const historyRes = await response.json().catch(() => null);
        history = historyRes?.MediaContainer?.Metadata || [];
    }
    if (!history.length) return null;

    const users = await loadFile(usersPath, []);
    const stats = await buildTrendingStats({
        history,
        uri,
        config,
        enrichRecentItemsWithMediaTags,
        hiddenAccountIds: hiddenLeaderboardAccountIds(users),
    });
    return {
        ...stats,
        version: ANALYTICS_CACHE_VERSION,
        serverIdentifier: config.serverIdentifier,
    };
};
