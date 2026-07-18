import test from 'node:test';
import assert from 'node:assert/strict';

import {
    ANALYTICS_HISTORY_CACHE_VERSION,
    buildWatchStatsFromHistory,
    compactAnalyticsHistoryItem,
    filterHistoryByAccount,
    filterHistoryByCutoff,
    mergeAnalyticsHistoryItems,
    matchesAnalyticsHistoryCache,
} from '../lib/analytics-history.js';

test('mergeAnalyticsHistoryItems prepends new plays and dedupes identities', () => {
    const older = [
        { historyKey: 'a', viewedAt: 100, accountID: 1, ratingKey: '1', type: 'movie' },
        { historyKey: 'b', viewedAt: 90, accountID: 1, ratingKey: '2', type: 'movie' },
    ];
    const newer = [
        { historyKey: 'c', viewedAt: 110, accountID: 1, ratingKey: '3', type: 'movie' },
        { historyKey: 'a', viewedAt: 100, accountID: 1, ratingKey: '1', type: 'movie' },
    ];

    const merged = mergeAnalyticsHistoryItems(newer, older, 250000);
    assert.deepEqual(merged.map((item) => item.historyKey), ['c', 'a', 'b']);
});

test('mergeAnalyticsHistoryItems respects safety cap without dropping newest first', () => {
    const newer = [
        { historyKey: 'n1', viewedAt: 3 },
        { historyKey: 'n2', viewedAt: 2 },
    ];
    const older = [
        { historyKey: 'o1', viewedAt: 1 },
        { historyKey: 'o2', viewedAt: 0 },
    ];
    const merged = mergeAnalyticsHistoryItems(newer, older, 3);
    assert.deepEqual(merged.map((item) => item.historyKey), ['n1', 'n2', 'o1']);
});

test('compactAnalyticsHistoryItem keeps aggregation fields only', () => {
    const compact = compactAnalyticsHistoryItem({
        viewedAt: 123,
        accountID: 9,
        librarySectionID: 2,
        deviceID: 4,
        type: 'episode',
        ratingKey: '10',
        grandparentKey: '5',
        grandparentTitle: 'Show',
        title: 'Episode',
        Player: { product: 'Plex for TV', address: '1.2.3.4' },
        junk: 'drop-me',
        historyKey: 'h1',
    });
    assert.equal(compact.viewedAt, 123);
    assert.equal(compact.Player.product, 'Plex for TV');
    assert.equal(compact.junk, undefined);
    assert.equal(compact.historyKey, 'h1');
});

test('matchesAnalyticsHistoryCache requires version and server identity', () => {
    const config = { serverIdentifier: 'abc' };
    assert.equal(matchesAnalyticsHistoryCache({
        version: ANALYTICS_HISTORY_CACHE_VERSION,
        serverIdentifier: 'abc',
        items: [{ historyKey: '1' }],
    }, config), true);
    assert.equal(matchesAnalyticsHistoryCache({
        version: ANALYTICS_HISTORY_CACHE_VERSION,
        serverIdentifier: 'other',
        items: [{ historyKey: '1' }],
    }, config), false);
});

test('filterHistoryByAccount and cutoff keep matching plays only', () => {
    const items = [
        { historyKey: 'a', viewedAt: 100, accountID: 1, ratingKey: '10', type: 'movie' },
        { historyKey: 'b', viewedAt: 90, accountID: 2, ratingKey: '11', type: 'movie' },
        { historyKey: 'c', viewedAt: 80, accountID: 1, ratingKey: '12', type: 'movie' },
    ];
    assert.deepEqual(filterHistoryByCutoff(items, 90).map((item) => item.historyKey), ['a', 'b']);
    assert.deepEqual(filterHistoryByAccount(items, '1', 90).map((item) => item.historyKey), ['a']);
});

test('buildWatchStatsFromHistory aggregates movies and shows', () => {
    const stats = buildWatchStatsFromHistory([
        { type: 'movie', ratingKey: '10', viewedAt: 100 },
        { type: 'movie', ratingKey: '10', viewedAt: 120 },
        { type: 'episode', grandparentKey: '/library/metadata/5', viewedAt: 110 },
    ]);
    assert.equal(stats.get('10').watchCount, 2);
    assert.equal(stats.get('10').lastViewedAt, 120);
    assert.equal(stats.get('5').watchCount, 1);
});

test('includeLeaderboards stays admin-only on trending route', async () => {
    const routes = new Map();
    const { createAnalyticsCacheScheduler } = await import('../lib/analytics-cache-scheduler.js');
    createAnalyticsCacheScheduler({
        app: { get: (routePath, ...handlers) => { routes.set(routePath, handlers.at(-1)); } },
        requireAuth: (_req, _res, next) => next(),
        requireMember: (_req, _res, next) => next(),
        configPath: 'config.json',
        usersPath: 'users.json',
        analyticsCachePath: 'analytics.json',
        trendingCachePath: 'trending.json',
        loadFile: async (filePath, fallback) => {
            if (filePath === 'config.json') return { serverIdentifier: 'server-a' };
            if (filePath === 'trending.json') {
                return {
                    version: 1,
                    serverIdentifier: 'server-a',
                    trending7Days: [{ title: 'A' }],
                    movies30Days: [],
                    shows30Days: [],
                    leaderboards: { '30': { '1': { rank: 1, plays: 9 } } },
                    leaderboardsSorted: { '30': [{ accountId: '1', plays: 9, rank: 1 }] },
                    lastUpdated: 1,
                };
            }
            return fallback;
        },
        saveFile: async () => {},
        getPlexConnectionUri: async () => 'http://plex',
        plexImageUrl: (value) => value,
        enrichRecentItemsWithMediaTags: async (_uri, _config, items) => items,
        markTaskStart: () => {},
        markTaskEnd: () => {},
        systemJobs: { analyticsCache: {}, trendingCache: {} },
        log: () => {},
    });

    const handler = routes.get('/api/plex/stats/trending');
    let memberBody;
    await handler({ query: { includeLeaderboards: '1' }, user: { isAdmin: false } }, { json: (value) => { memberBody = value; } });
    assert.equal(memberBody.leaderboards, undefined);
    assert.deepEqual(memberBody.trending7Days, [{ title: 'A' }]);

    let adminBody;
    await handler({ query: { includeLeaderboards: '1' }, user: { isAdmin: true } }, { json: (value) => { adminBody = value; } });
    assert.ok(adminBody.leaderboards);
});
