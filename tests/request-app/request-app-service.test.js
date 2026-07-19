import assert from 'node:assert/strict';
import test from 'node:test';

import { createRequestAppService } from '../../lib/request-app/request-app-service.js';

test('request discovery serves recent cached results during a transient outage', async () => {
    const originalNow = Date.now;
    let now = 1_000_000;
    let calls = 0;
    Date.now = () => now;
    try {
        const service = createRequestAppService({
            resolveIntegrationUrlForFetch: async (value) => value,
            fetchWithTimeout: async () => {
                calls++;
                if (calls > 1) throw new Error('temporary outage');
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        pageInfo: { page: 1, pages: 2 },
                        results: [{ id: 42, mediaType: 'movie', title: 'Cached title', originalLanguage: 'en' }],
                    }),
                };
            },
        });
        const config = { requestAppType: 'seerr', requestAppUrl: 'http://seerr', requestAppApiKey: 'secret' };

        const initial = await service.discover(config);
        now += 301_000;
        const stale = await service.discover(config);

        assert.equal(calls, 2);
        assert.equal(initial.results[0].title, 'Cached title');
        assert.equal(stale.results[0].title, 'Cached title');
    } finally {
        Date.now = originalNow;
    }
});

test('accepted requests are requested until an active download is matched', async () => {
    const payload = {
        pageInfo: { page: 1, pages: 1 },
        results: [
            { id: 1, mediaType: 'movie', title: 'Waiting', originalLanguage: 'en', mediaInfo: { status: 3 } },
            { id: 2, mediaType: 'movie', title: 'Downloading', originalLanguage: 'en', mediaInfo: { status: 3 } },
        ],
    };
    const service = createRequestAppService({
        resolveIntegrationUrlForFetch: async (value) => value,
        fetchWithTimeout: async () => ({ ok: true, status: 200, json: async () => payload }),
        getActiveAcquisitionKeys: async () => new Set(['tmdb:2']),
    });
    const result = await service.discover({ requestAppType: 'seerr', requestAppUrl: 'http://seerr', requestAppApiKey: 'key' });

    assert.equal(result.results[0].requested, true);
    assert.equal(result.results[0].processing, false);
    assert.equal(result.results[1].requested, false);
    assert.equal(result.results[1].processing, true);
});

test('requestMedia forwards seasons all for TV so one-click requests work', async () => {
    const bodies = [];
    const service = createRequestAppService({
        resolveIntegrationUrlForFetch: async (value) => value,
        fetchWithTimeout: async (url, options = {}) => {
            if (options.method === 'POST' && String(url).includes('/api/v1/request')) {
                bodies.push(JSON.parse(options.body));
                return { ok: true, status: 201, json: async () => ({ id: 7 }) };
            }
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    id: 99,
                    mediaType: 'tv',
                    title: 'One Click Show',
                    seasons: [{ seasonNumber: 1 }, { seasonNumber: 2 }],
                }),
            };
        },
    });

    await service.requestMedia(
        { requestAppType: 'seerr', requestAppUrl: 'http://seerr', requestAppApiKey: 'key' },
        { mediaType: 'tv', tmdbId: 99, seasons: 'all' },
    );

    assert.equal(bodies.length, 1);
    assert.equal(bodies[0].mediaType, 'tv');
    assert.equal(bodies[0].mediaId, 99);
    assert.equal(bodies[0].seasons, 'all');
});
