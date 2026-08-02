import test from 'node:test';
import assert from 'node:assert/strict';
import { createUpgraderService } from '../../lib/upgrader/index.js';

test('upgrader request keeps query string after base URL resolve', async () => {
    const calls = [];
    const service = createUpgraderService({
        indexPath: '/tmp/upgrader-index-test.json',
        prefsPath: '/tmp/upgrader-prefs-test.json',
        auditPath: '/tmp/upgrader-audit-test.json',
        loadFile: async (_path, fallback) => fallback,
        saveFile: async () => {},
        resolveIntegrationUrlForFetch: async (url) => {
            // Mimic normalizeExternalBaseUrl: strip search.
            const parsed = new URL(url);
            parsed.search = '';
            return parsed.toString().replace(/\/+$/, '');
        },
        fetchWithTimeout: async (url) => {
            calls.push(url);
            return {
                ok: true,
                status: 200,
                json: async () => [{ id: 1, seriesId: 9, seasonNumber: 1, customFormatScore: 100 }],
            };
        },
        log: () => {},
    });

    const files = await service.request(
        { name: 'Sonarr', url: 'http://sonarr:8989/sonarr', apiKey: 'test' },
        '/api/v3/episodefile?seriesId=9',
    );
    assert.equal(calls.length, 1);
    assert.equal(calls[0], 'http://sonarr:8989/sonarr/api/v3/episodefile?seriesId=9');
    assert.equal(files[0].customFormatScore, 100);
});
