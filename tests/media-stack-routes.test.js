import assert from 'node:assert/strict';
import test from 'node:test';

import { registerMediaStackRoutes } from '../lib/media-stack-routes.js';

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

    let result;
    await routeHandler({ query: { monthOffset: '0' } }, {
        json(value) { result = value; },
        status() { return this; },
    });

    assert.equal(result.sonarr.queue.records[0].episode.hasFile, true);
    assert.equal(result.radarr.queue.records[0].movie.hasFile, true);
});
