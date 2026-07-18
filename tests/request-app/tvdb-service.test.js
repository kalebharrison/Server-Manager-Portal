import assert from 'node:assert/strict';
import test from 'node:test';

import { createTvdbService } from '../../lib/request-app/tvdb-service.js';

test('TVDB enriches missing TV metadata and reuses its authentication token', async () => {
    let loginCalls = 0;
    let detailCalls = 0;
    const fetchWithTimeout = async (url) => {
        if (url.endsWith('/login')) {
            loginCalls++;
            return { ok: true, json: async () => ({ data: { token: 'tvdb-token' } }) };
        }
        detailCalls++;
        return {
            ok: true,
            json: async () => ({
                data: {
                    overview: 'TVDB summary',
                    firstAired: '2024-01-02',
                    status: { name: 'Continuing' },
                    genres: [{ id: 1, name: 'Drama' }],
                    companies: [{ name: 'Example Network', companyType: { companyTypeName: 'Network' } }],
                },
            }),
        };
    };
    const service = createTvdbService({ fetchWithTimeout });
    const config = { tvdbApiKey: 'api-key' };
    const item = { mediaType: 'tv', tvdbId: 123, title: 'Example', overview: '', genres: [] };

    const first = await service.enrichSeries(config, item);
    const second = await service.enrichSeries(config, item);
    assert.equal(first.overview, 'TVDB summary');
    assert.equal(first.network, 'Example Network');
    assert.deepEqual(first.genres, [{ id: 1, name: 'Drama' }]);
    assert.deepEqual(first.metadataSources, ['TVDB', 'TMDB']);
    assert.equal(second.overview, 'TVDB summary');
    assert.equal(loginCalls, 1);
    assert.equal(detailCalls, 1);
});

test('TVDB resolves an IMDb ID and takes priority for TV metadata', async () => {
    const urls = [];
    const fetchWithTimeout = async (url) => {
        urls.push(url);
        if (url.endsWith('/login')) return { ok: true, json: async () => ({ data: { token: 'token' } }) };
        if (url.includes('/search/remoteid/')) return { ok: true, json: async () => ({ data: [{ series: { id: 456 } }] }) };
        return { ok: true, json: async () => ({ data: { name: 'TVDB title', overview: 'TVDB overview' } }) };
    };
    const service = createTvdbService({ fetchWithTimeout });
    const result = await service.enrichSeries(
        { tvdbApiKey: 'key' },
        { mediaType: 'tv', imdbId: 'tt1234567', title: 'TMDB title', overview: 'TMDB overview' },
    );

    assert.equal(result.tvdbId, 456);
    assert.equal(result.title, 'TVDB title');
    assert.equal(result.overview, 'TVDB overview');
    assert.ok(urls.some((url) => url.endsWith('/search/remoteid/tt1234567')));
});
