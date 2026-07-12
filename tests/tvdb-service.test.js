import assert from 'node:assert/strict';
import test from 'node:test';

import { createTvdbService } from '../lib/tvdb-service.js';

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
    assert.deepEqual(first.metadataSources, ['TMDB', 'TVDB']);
    assert.equal(second.overview, 'TVDB summary');
    assert.equal(loginCalls, 1);
    assert.equal(detailCalls, 1);
});
