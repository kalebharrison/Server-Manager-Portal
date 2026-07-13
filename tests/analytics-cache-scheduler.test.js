import assert from 'node:assert/strict';
import test from 'node:test';

import { createAnalyticsCacheScheduler } from '../lib/analytics-cache-scheduler.js';

const createScheduler = ({ config, files, routes, systemJobs = { analyticsCache: {}, trendingCache: {} } }) => (
    createAnalyticsCacheScheduler({
        app: {
            get: (routePath, ...handlers) => { routes.set(routePath, handlers.at(-1)); },
        },
        requireAuth: (_req, _res, next) => next(),
        requireMember: (_req, _res, next) => next(),
        configPath: 'config.json',
        usersPath: 'users.json',
        analyticsCachePath: 'analytics.json',
        trendingCachePath: 'trending.json',
        loadFile: async (filePath, fallback) => {
            if (filePath === 'config.json') return config.current;
            return files.get(filePath) ?? fallback;
        },
        saveFile: async (filePath, value) => { files.set(filePath, value); },
        getPlexConnectionUri: async () => 'http://plex',
        plexImageUrl: (value) => value,
        enrichRecentItemsWithMediaTags: async (_uri, _config, items) => items,
        markTaskStart: () => {},
        markTaskEnd: () => {},
        systemJobs,
        log: () => {},
    })
);

const invokeJsonRoute = async (handler, query = {}) => {
    let body;
    await handler({ query }, { json: (value) => { body = value; } });
    return body;
};

test('trending cache routes reject another server or cache version', async () => {
    const routes = new Map();
    const files = new Map();
    const config = { current: { serverIdentifier: 'server-a' } };
    files.set('trending.json', {
        version: 1,
        serverIdentifier: 'server-a',
        trending7Days: [{ title: 'Server A title' }],
        movies30Days: [],
        shows30Days: [],
        lastUpdated: 123,
    });
    createScheduler({ config, files, routes });

    const handler = routes.get('/api/plex/stats/trending');
    assert.deepEqual((await invokeJsonRoute(handler)).trending7Days, [{ title: 'Server A title' }]);

    config.current = { serverIdentifier: 'server-b' };
    assert.deepEqual(await invokeJsonRoute(handler), {
        trending7Days: [],
        movies30Days: [],
        shows30Days: [],
        lastUpdated: null,
    });

    config.current = { serverIdentifier: 'server-a' };
    files.set('trending.json', { ...files.get('trending.json'), version: 2 });
    assert.deepEqual((await invokeJsonRoute(handler)).trending7Days, []);
});

test('background cache startup treats another server cache as missing', { concurrency: false }, async () => {
    const routes = new Map();
    const files = new Map();
    const config = { current: { serverIdentifier: 'server-b' } };
    const systemJobs = { analyticsCache: {}, trendingCache: {} };
    files.set('trending.json', {
        version: 1,
        serverIdentifier: 'server-a',
        trending7Days: [],
        lastUpdated: Date.now(),
    });
    files.set('analytics.json', {
        version: 1,
        serverIdentifier: 'server-a',
        7: {},
        lastUpdated: Date.now(),
    });
    const scheduler = createScheduler({ config, files, routes, systemJobs });
    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;
    const delays = [];

    try {
        globalThis.setTimeout = (_callback, delay) => {
            delays.push(delay);
            return {};
        };
        globalThis.clearTimeout = () => {};

        await scheduler.startTrendingStatsBackgroundTask();
        await scheduler.startAnalyticsStatsBackgroundTask();

        assert.deepEqual(delays, [10_000, 15_000]);
    } finally {
        globalThis.setTimeout = originalSetTimeout;
        globalThis.clearTimeout = originalClearTimeout;
    }
});
