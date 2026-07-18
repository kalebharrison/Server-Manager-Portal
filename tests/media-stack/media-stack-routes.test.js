import assert from 'node:assert/strict';
import test from 'node:test';

import { registerMediaStackRoutes } from '../../lib/media-stack/media-stack-routes.js';

test('media stack summary hydrates hasFile state for queue classification', async () => {
    let routeHandler;
    const app = {
        get(path, ...handlers) {
            if (path === '/api/media-stack/summary') routeHandler = handlers.at(-1);
        },
    };
    const payloadFor = (rawUrl) => {
        const url = new URL(rawUrl);
        if (url.pathname.endsWith('/queue')) {
            return url.hostname === 'sonarr'
                ? { records: [{ id: 1, seriesId: 10, episodeId: 20, series: { title: 'Show', images: [] }, episode: { title: 'Episode' } }] }
                : { records: [{ id: 2, movieId: 30, movie: { title: 'Movie', images: [] } }] };
        }
        if (url.pathname.endsWith('/episode/20')) return { id: 20, title: 'Episode', hasFile: true };
        if (url.pathname.endsWith('/movie/30')) return { id: 30, title: 'Movie', hasFile: true, images: [] };
        if (url.pathname.endsWith('/calendar') || url.pathname.endsWith('/diskspace')) return [];
        if (url.pathname.endsWith('/history')) return { records: [] };
        return {};
    };

    registerMediaStackRoutes({
        app,
        requireAuth: (_req, _res, next) => next(),
        requireMember: (_req, _res, next) => next(),
        configPath: 'config.json',
        loadFile: async () => ({
            sonarrUrl: 'http://sonarr',
            sonarrApiKey: 'sonarr-key',
            radarrUrl: 'http://radarr',
            radarrApiKey: 'radarr-key',
        }),
        withCache: async (_key, _ttl, load) => load(),
        fetch: async (url) => ({ ok: true, json: async () => payloadFor(url) }),
        normalizeExternalBaseUrl: (url) => `${url.replace(/\/+$/, '')}/`,
    });

    let memberResult;
    await routeHandler({ query: { monthOffset: '0' }, user: { isAdmin: false } }, {
        json(value) { memberResult = value; },
        status() { return this; },
    });
    assert.equal(memberResult.sonarr.queue.records[0].episode.hasFile, true);
    assert.equal(memberResult.radarr.queue.records[0].movie.hasFile, true);
    assert.equal(memberResult.sonarr.disk, undefined);
    assert.equal(memberResult.sonarr.history, undefined);
    assert.equal(memberResult.sonarr.status, undefined);

    let adminResult;
    await routeHandler({ query: { monthOffset: '0' }, user: { isAdmin: true } }, {
        json(value) { adminResult = value; },
        status() { return this; },
    });
    assert.ok(adminResult.sonarr.history);
    assert.ok(Array.isArray(adminResult.sonarr.disk));
});

test('media stack calendar returns a bounded cached week', async () => {
    let routeHandler;
    const app = { get(path, ...handlers) { if (path === '/api/media-stack/calendar') routeHandler = handlers.at(-1); } };
    registerMediaStackRoutes({
        app,
        requireAuth: (_req, _res, next) => next(),
        requireMember: (_req, _res, next) => next(),
        configPath: 'config.json',
        loadFile: async () => ({ sonarrUrl: 'http://sonarr', sonarrApiKey: 'key' }),
        withCache: async (_key, _ttl, load) => load(),
        fetch: async (url) => ({ ok: true, json: async () => url.includes('sonarr') ? [{ id: 1 }] : [] }),
        normalizeExternalBaseUrl: (url) => `${url}/`,
    });
    let result;
    await routeHandler({ query: { weekOffset: '1' } }, { json(value) { result = value; }, status() { return this; } });
    assert.equal(result.sonarr.configured, true);
    assert.equal(result.sonarr.calendar.length, 1);
    assert.equal((new Date(`${result.end}T00:00:00`) - new Date(`${result.start}T00:00:00`)) / 86400000, 7);
});

test('media stack calendar returns a quarter beginning with the current week', async () => {
    let routeHandler;
    const app = { get(path, ...handlers) { if (path === '/api/media-stack/calendar') routeHandler = handlers.at(-1); } };
    registerMediaStackRoutes({
        app,
        requireAuth: (_req, _res, next) => next(),
        requireMember: (_req, _res, next) => next(),
        configPath: 'config.json',
        loadFile: async () => ({ sonarrUrl: 'http://sonarr', sonarrApiKey: 'key' }),
        withCache: async (_key, _ttl, load) => load(),
        fetch: async () => ({ ok: true, json: async () => [] }),
        normalizeExternalBaseUrl: (url) => `${url}/`,
    });
    let result;
    await routeHandler({ query: { horizon: 'quarter' } }, { json(value) { result = value; }, status() { return this; } });
    const start = new Date(`${result.start}T00:00:00`);
    const end = new Date(`${result.end}T00:00:00`);
    assert.equal(start.getDay(), 0);
    assert.equal(end.getMonth(), (start.getMonth() + 3) % 12);
});

test('media stack combines enabled instances and annotates their records', async () => {
    let routeHandler;
    const app = { get(path, ...handlers) { if (path === '/api/media-stack/calendar') routeHandler = handlers.at(-1); } };
    registerMediaStackRoutes({
        app,
        requireAuth: (_req, _res, next) => next(),
        requireMember: (_req, _res, next) => next(),
        configPath: 'config.json',
        loadFile: async () => ({
            arrInstances: [
                { id: 'main', type: 'sonarr', name: 'Main', url: 'http://main', apiKey: 'one', enabled: true, isDefault: true },
                { id: 'anime', type: 'sonarr', name: 'Anime', url: 'http://anime', apiKey: 'two', enabled: true, isDefault: false },
            ],
        }),
        withCache: async (_key, _ttl, load) => load(),
        fetch: async (url) => ({ ok: true, json: async () => [{ id: new URL(url).hostname }] }),
        normalizeExternalBaseUrl: (url) => `${url}/`,
    });
    let result;
    await routeHandler({ query: {} }, { json(value) { result = value; }, status() { return this; } });
    assert.deepEqual(result.sonarr.calendar.map((item) => item.arrInstanceName), ['Main', 'Anime']);
});

test('media stack exposes only actively downloading acquisition keys', async () => {
    const routes = registerMediaStackRoutes({
        app: { get() {} },
        requireAuth: (_req, _res, next) => next(),
        requireMember: (_req, _res, next) => next(),
        configPath: 'config.json',
        loadFile: async () => ({ radarrUrl: 'http://radarr', radarrApiKey: 'key' }),
        withCache: async (_key, _ttl, load) => load(),
        fetch: async (url) => ({
            ok: true,
            json: async () => url.includes('/queue') ? {
                records: [
                    { movieId: 1, status: 'downloading', movie: { title: 'Active', tmdbId: 100 } },
                    { movieId: 2, status: 'queued', movie: { title: 'Waiting', tmdbId: 200 } },
                ],
            } : {},
        }),
        normalizeExternalBaseUrl: (url) => `${url}/`,
    });

    const keys = await routes.getActiveAcquisitionKeys();
    assert.equal(keys.has('tmdb:100'), true);
    assert.equal(keys.has('tmdb:200'), false);
});
