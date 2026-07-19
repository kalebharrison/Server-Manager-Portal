import assert from 'node:assert/strict';
import test from 'node:test';

import { createRequestAppClient, encodeSeerrQueryPath } from '../../lib/request-app/request-app-client.js';

test('encodeSeerrQueryPath replaces URLSearchParams space + with %20', () => {
    const raw = `/api/v1/search?${new URLSearchParams({ query: 'star wars', page: '1' }).toString()}`;
    assert.equal(raw.includes('star+wars'), true);
    assert.equal(encodeSeerrQueryPath(raw), '/api/v1/search?query=star%20wars&page=1');
});

test('encodeSeerrQueryPath keeps literal plus as %2B and leaves paths without query alone', () => {
    const raw = `/api/v1/search?${new URLSearchParams({ query: 'c++' }).toString()}`;
    assert.equal(encodeSeerrQueryPath(raw), '/api/v1/search?query=c%2B%2B');
    assert.equal(encodeSeerrQueryPath('/api/v1/request/count'), '/api/v1/request/count');
});

test('fetchSeerrJson sends search queries with %20 spaces for Seerr openapi validator', async () => {
    const calls = [];
    const client = createRequestAppClient({
        fetchWithTimeout: async (url) => {
            calls.push(url);
            return { ok: true, status: 200, json: async () => ({ results: [] }) };
        },
        resolveIntegrationUrlForFetch: async (url) => String(url || '').replace(/\/$/, ''),
    });

    await client.fetchSeerrJson({
        requestAppType: 'seerr',
        requestAppUrl: 'https://seerr.example',
        requestAppApiKey: 'key',
    }, `/api/v1/search?${new URLSearchParams({ query: 'the office' }).toString()}`);

    assert.equal(calls.length, 1);
    assert.equal(calls[0], 'https://seerr.example/api/v1/search?query=the%20office');
    assert.equal(calls[0].includes('+'), false);
});
