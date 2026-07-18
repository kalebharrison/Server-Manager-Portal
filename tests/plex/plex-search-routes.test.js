import assert from 'node:assert/strict';
import test from 'node:test';

import { registerPlexRoutes } from '../../lib/plex/plex-routes.js';

test('Plex search returns launchable movies and shows while excluding explicit media', async () => {
    let routeHandler;
    const app = {
        get(path, ...handlers) { if (path === '/api/plex/search') routeHandler = handlers.at(-1); },
        post() {},
    };
    const payloadFor = (url) => {
        if (url.includes('/library/sections?')) return { MediaContainer: { Directory: [{ key: '1', type: 'movie' }, { key: '2', type: 'show' }] } };
        if (url.includes('/library/sections/1/all')) return { MediaContainer: { Metadata: [
            { ratingKey: '10', key: '/library/metadata/10', type: 'movie', title: 'Movie', year: 2026, thumb: '/library/metadata/10/thumb/1', Guid: [{ id: 'tmdb://42' }] },
            { ratingKey: '11', key: '/library/metadata/11', type: 'movie', title: 'Explicit', contentRating: 'XXX' },
        ] } };
        return { MediaContainer: { Metadata: [{ ratingKey: '20', key: '/library/metadata/20', type: 'show', title: 'Show', Guid: [{ id: 'tmdb://84' }] }] } };
    };
    registerPlexRoutes({
        app,
        requireAuth: (_req, _res, next) => next(),
        requireMember: (_req, _res, next) => next(),
        requireAdmin: (_req, _res, next) => next(),
        configPath: 'config.json',
        loadFile: async () => ({ plexToken: 'token', serverIdentifier: 'server-id' }),
        getPlexConnectionUri: async () => 'http://plex',
        fetch: async () => ({ ok: true, json: async () => ({}) }),
        fetchWithTimeout: async (url) => ({ ok: true, json: async () => payloadFor(url) }),
        plexImageService: {},
        plexDashboardService: {},
        plexStatsService: { getCachedPlexStats: () => null, isPlexStatsBuilding: () => false },
        loadPlexStatsFromDisk: async () => null,
        buildPlexStatsCache() {},
        withBasePath: (value) => `/portal${value}`,
    });
    let result;
    await routeHandler({ query: { query: 'title' } }, {
        json(value) { result = value; },
        status() { return this; },
        setHeader() {},
    });
    assert.deepEqual(result.results.map((item) => item.title), ['Movie', 'Show']);
    assert.equal(result.results[0].tmdbId, 42);
    assert.match(result.results[0].plexUrl, /app\.plex\.tv/);
    assert.match(result.results[0].posterUrl, /^\/portal\/api\/plex\/image/);
});
