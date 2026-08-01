import assert from 'node:assert/strict';
import test from 'node:test';

import { createMetadataHealthProbe } from '../../lib/metadata/metadata-health.js';

test('metadata health probes authenticate and cache external checks', async () => {
    let now = 1000;
    let tmdbCalls = 0;
    let tvdbCalls = 0;
    const probe = createMetadataHealthProbe({
        loadConfig: async () => ({ tmdbApiKey: 'tmdb', tvdbApiKey: 'tvdb' }),
        fetchWithTimeout: async () => {
            tmdbCalls++;
            return { ok: true, status: 200, json: async () => ({ images: { secure_base_url: 'https://image/' } }) };
        },
        tvdbService: { checkHealth: async () => { tvdbCalls++; return { ok: true, httpCode: 200 }; } },
        now: () => now,
    });

    assert.equal((await probe({ id: 'tmdb' })).status, 'online');
    assert.equal((await probe({ id: 'tmdb' })).status, 'online');
    assert.equal((await probe({ id: 'tvdb' })).status, 'online');
    assert.equal(await probe({ id: 'custom' }), null);
    assert.equal(tmdbCalls, 1);
    assert.equal(tvdbCalls, 1);
    now += 5 * 60 * 1000 + 1;
    await probe({ id: 'tmdb' });
    assert.equal(tmdbCalls, 2);
});
