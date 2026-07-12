import assert from 'node:assert/strict';
import test from 'node:test';

import { createRequestAppService } from '../lib/request-app-service.js';

test('request discovery serves recent cached results during a transient outage', async () => {
    const originalNow = Date.now;
    let now = 1_000_000;
    let calls = 0;
    Date.now = () => now;
    try {
        const service = createRequestAppService({
            resolveIntegrationUrlForFetch: (value) => value,
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
        now += 61_000;
        const stale = await service.discover(config);

        assert.equal(calls, 2);
        assert.equal(initial.results[0].title, 'Cached title');
        assert.equal(stale.results[0].title, 'Cached title');
    } finally {
        Date.now = originalNow;
    }
});
