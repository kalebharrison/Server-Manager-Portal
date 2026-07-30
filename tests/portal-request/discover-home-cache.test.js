import assert from 'node:assert/strict';
import test from 'node:test';
import { createDiscoverHomeCache } from '../../lib/portal-request/discoverHomeCache.js';

const page = (ids) => ({
    page: 1,
    totalPages: 1,
    totalResults: ids.length,
    results: ids.map((id) => ({ id, mediaType: 'movie', title: `Title ${id}`, popularity: id })),
});

const seedSnapshot = (overrides = {}) => ({
    version: 3,
    generatedAt: Date.now(),
    language: 'en',
    region: 'US',
    rails: {
        trending: page([10]),
        upcomingMovies: page([20]),
        popularSeries: page([30]),
        upcomingSeries: page([40]),
        popularMoviesPage1: page([50]),
        popularTvPage1: page([30]),
        ...overrides.rails,
    },
    ...overrides,
});

test('discoverHomeCache loads versioned snapshot and ignores stale versions', async () => {
    const files = new Map();
    files.set('/tmp/discover-home-cache.json', {
        version: 0,
        generatedAt: Date.now(),
        rails: { trending: page([1]) },
    });

    const cache = createDiscoverHomeCache({
        configPath: '/tmp/config.json',
        cachePath: '/tmp/discover-home-cache.json',
        loadFile: async (path, fallback) => files.get(path) ?? fallback,
        saveFile: async (path, data) => { files.set(path, data); },
    });

    const stale = await cache.getSnapshot({ allowRefresh: false });
    assert.equal(stale, null);

    files.set('/tmp/discover-home-cache.json', seedSnapshot());
    const fresh = await cache.getSnapshot({ allowRefresh: false });
    assert.equal(fresh.version, 3);
    assert.equal(fresh.rails.trending.results[0].id, 10);
});

test('discoverHomeCache getHomeRails clones pages so callers cannot mutate the store', async () => {
    const files = new Map();
    files.set('/tmp/discover-home-cache.json', seedSnapshot());

    const cache = createDiscoverHomeCache({
        configPath: '/tmp/config.json',
        cachePath: '/tmp/discover-home-cache.json',
        loadFile: async (path, fallback) => {
            if (String(path).includes('config')) {
                return { requestEngine: 'portal', discoverySource: 'tmdb', cacheRefreshMinutes: 60 };
            }
            return files.get(path) ?? fallback;
        },
        saveFile: async (path, data) => { files.set(path, data); },
    });

    const home = await cache.getHomeRails();
    assert.ok(home.trending.results.length);
    assert.ok(home.upcomingMovies.results.length);
    assert.ok(home.popularSeries.results.length);
    assert.ok(home.upcomingSeries.results.length);
    home.trending.results.push({ id: 999 });
    home.trending.results[0].id = 1;

    const again = await cache.getHomeRails();
    assert.equal(again.trending.results.some((row) => row.id === 999), false);
    assert.equal(again.trending.results[0].id, 10);
});

test('discoverHomeCache getCachedPage returns page-1 rails without mutating store', async () => {
    const files = new Map();
    files.set('/tmp/discover-home-cache.json', seedSnapshot());

    const cache = createDiscoverHomeCache({
        configPath: '/tmp/config.json',
        cachePath: '/tmp/discover-home-cache.json',
        loadFile: async (path, fallback) => {
            if (String(path).includes('config')) {
                return { requestEngine: 'portal', discoverySource: 'tmdb', cacheRefreshMinutes: 60 };
            }
            return files.get(path) ?? fallback;
        },
        saveFile: async (path, data) => { files.set(path, data); },
    });

    const trending = await cache.getCachedPage('trending');
    assert.equal(trending.results[0].id, 10);
    trending.results[0].id = 1;
    const again = await cache.getCachedPage('trending');
    assert.equal(again.results[0].id, 10);

    const movies = await cache.getCachedPage('popularMoviesPage1');
    assert.equal(movies.results[0].id, 50);
});
