import { expandLocalPlexAccountIds } from '../plex/plex-connection-accounts.js';
import {
    analyticsHistoryItemIdentity,
    filterHistoryByAccounts,
} from './analytics-history.js';
import {
    fetchPlexAccountHistory,
    historyFetchLimitForPeriod,
    resolveHistoryCutoff,
} from './analytics-plex-history-service.js';
import { aggregatePersonalHistory, resolveHourDistribution } from './personal-analytics-aggregates.js';
import { enrichTopMediaMetadata } from './personal-analytics-metadata.js';
import {
    buildPersonalInsights,
    resolveLeaderboardContext,
} from './personal-analytics-insights.js';
import {
    buildRecentHistory,
    emptyPersonalAnalytics,
} from './personal-analytics-helpers.js';

const mergeAccountHistory = (chunks = [], maxItems = 5000) => {
    const merged = [];
    const seen = new Set();
    const flat = chunks.flat().sort((a, b) => Number(b?.viewedAt || 0) - Number(a?.viewedAt || 0));
    for (const item of flat) {
        const id = analyticsHistoryItemIdentity(item);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        merged.push(item);
        if (merged.length >= maxItems) break;
    }
    return merged;
};

export const buildPersonalAnalytics = async ({
    config,
    uri,
    accountID,
    sessionUser = null,
    period,
    historyStore,
    loadFile,
    usersPath,
    trendingCachePath,
    fetchPlexServerAccounts,
    plexImageUrl,
    getCachedPlexMetadata,
    setCachedPlexMetadata,
    tautulli,
    log,
}) => {
    const {
        getHourInTimezone,
        getWeekdayInTimezone,
        resolvePeakHour,
        resolveTimeOfDayPersona,
        fetchTautulliTimezone,
        resolveTautulliHourStats,
    } = tautulli;

    const cutoffDate = resolveHistoryCutoff(period, 30);
    const maxItems = historyFetchLimitForPeriod(period, 30);
    const { list: plexAccounts } = await fetchPlexServerAccounts(uri, config);
    // Owner history lives on local account 1; shared/old aliases may use another id.
    // Merge every id that matches this session so Recently Watched isn't a single stray play.
    const accountIDs = expandLocalPlexAccountIds(accountID, plexAccounts, sessionUser || {});
    const plexAccountName = accountIDs
        .map((id) => plexAccounts.find((a) => String(a.id) === String(id))?.name)
        .find(Boolean) || null;

    // Always pull live account history so Recently Watched isn't stuck on a
    // history-file snapshot that only refreshed on cold analytics rebuilds.
    const liveChunks = await Promise.all(accountIDs.map((id) => fetchPlexAccountHistory(uri, config, id, {
        maxItems,
        stopBeforeTs: cutoffDate,
        log,
    })));
    let historyItems = mergeAccountHistory(liveChunks, maxItems);
    if (historyStore) {
        const stored = await historyStore.loadItems(config);
        if (Array.isArray(stored) && stored.length) {
            const filtered = filterHistoryByAccounts(stored, accountIDs, cutoffDate);
            if (filtered.length) {
                historyItems = mergeAccountHistory([historyItems, filtered], maxItems);
            }
        }
    }
    const sectionsRes = await fetch(`${uri}/library/sections?X-Plex-Token=${config.plexToken}`, { headers: { 'Accept': 'application/json' } }).then(r => r.json()).catch(() => null);

    if (!historyItems.length) {
        return emptyPersonalAnalytics();
    }

    const sectionsMap = {};
    if (sectionsRes?.MediaContainer?.Directory) {
        sectionsRes.MediaContainer.Directory.forEach((s) => { sectionsMap[s.key] = s.title; });
    }

    const recentHistory = buildRecentHistory(historyItems, config.serverIdentifier);
    const statsTimezone = await fetchTautulliTimezone(config);

    const aggregates = aggregatePersonalHistory(historyItems, sectionsMap, {
        getHourInTimezone,
        getWeekdayInTimezone,
        statsTimezone,
        cutoffDate,
        serverIdentifier: config.serverIdentifier,
    });

    const allUsersMap = await loadFile(usersPath, []);
    const accountIdSet = new Set(accountIDs.map(String));
    const targetDbUser = allUsersMap.find((u) => accountIdSet.has(String(u.plexAccountId || '')))
        || allUsersMap.find((u) => String(u.plexAccountId) === String(accountID));

    const tautulliHourStats = await resolveTautulliHourStats(config, {
        username: targetDbUser?.username,
        email: targetDbUser?.email,
        plexAccountName,
        days: period,
        afterUnixSec: cutoffDate,
        maxItems: historyItems.length,
        plexPlayCount: aggregates.totalPlays,
    });
    const hourDistribution = resolveHourDistribution(tautulliHourStats, aggregates);

    const allLibraries = Object.values(aggregates.libraryCounts).sort((a, b) => b.plays - a.plays);
    const topLibraries = allLibraries.slice(0, 5);
    const topWatched = Object.values(aggregates.contentCounts).filter((c) => c.type !== 'track').sort((a, b) => b.plays - a.plays).slice(0, 30).map((c) => {
        if (c.thumb) c.thumbUrl = plexImageUrl(c.thumb);
        return c;
    });
    const topMusic = Object.values(aggregates.contentCounts).filter((c) => c.type === 'track').sort((a, b) => b.plays - a.plays).slice(0, 30).map((c) => {
        if (c.thumb) c.thumbUrl = plexImageUrl(c.thumb);
        return c;
    });

    const allShowsList = Object.values(aggregates.contentCounts).filter((c) => c.type === 'show').sort((a, b) => b.plays - a.plays);
    const topShowsRaw = allShowsList.slice(0, 5);
    await enrichTopMediaMetadata({
        uri,
        config,
        items: topShowsRaw,
        getCachedPlexMetadata,
        setCachedPlexMetadata,
        mediaType: 'show',
    });
    const topShows = topShowsRaw.map((s) => ({ ...s, artUrl: s.art ? plexImageUrl(s.art) : null, thumbUrl: s.thumb ? plexImageUrl(s.thumb) : null }));
    const topBinge = topShows.length > 0 ? topShows[0] : null;

    const allMoviesList = Object.values(aggregates.contentCounts).filter((c) => c.type === 'movie').sort((a, b) => b.plays - a.plays);
    const topMoviesRaw = allMoviesList.slice(0, 5);
    await enrichTopMediaMetadata({
        uri,
        config,
        items: topMoviesRaw,
        getCachedPlexMetadata,
        setCachedPlexMetadata,
        mediaType: 'movie',
    });
    const topMovies = topMoviesRaw.map((m) => ({ ...m, artUrl: m.art ? plexImageUrl(m.art) : null, thumbUrl: m.thumb ? plexImageUrl(m.thumb) : null }));
    const topMovie = topMovies.length > 0 ? topMovies[0] : null;

    const insights = buildPersonalInsights({
        totalPlays: aggregates.totalPlays,
        contentCounts: aggregates.contentCounts,
        dayOfWeekCounts: aggregates.dayOfWeekCounts,
        topLibraries,
        moviesCount: aggregates.moviesCount,
        showsCount: aggregates.showsCount,
        musicCount: aggregates.musicCount,
        hourDistribution,
        resolvePeakHour,
        resolveTimeOfDayPersona,
    });

    const trendingStats = await loadFile(trendingCachePath, {});
    const leaderboard = resolveLeaderboardContext(trendingStats, period, accountID);

    return {
        totalPlays: aggregates.totalPlays,
        topLibraries,
        topWatched,
        topMusic,
        topBinge,
        topMovie,
        topShows,
        topMovies,
        ...insights,
        ...leaderboard,
        moviesCount: aggregates.moviesCount,
        showsCount: aggregates.showsCount,
        musicCount: aggregates.musicCount,
        dayOfWeekCounts: aggregates.dayOfWeekCounts,
        hourDistribution: hourDistribution.hourDistribution,
        allLibraries,
        recentHistory: recentHistory.map((h) => {
            if (h.thumb) h.thumbUrl = plexImageUrl(h.thumb);
            return h;
        }),
    };
};
