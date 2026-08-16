import assert from 'node:assert/strict';
import test from 'node:test';

import {
    historyRecordIsUpgrade,
    listRecentUpgradedDiscoverItems,
} from '../../lib/discovery/discover-recent-upgrades.js';

test('historyRecordIsUpgrade accepts Arr True strings and reasons', () => {
    assert.equal(historyRecordIsUpgrade({ data: { isUpgrade: 'True' } }), true);
    assert.equal(historyRecordIsUpgrade({ data: { isUpgrade: 'False' } }), false);
    assert.equal(historyRecordIsUpgrade({ eventType: 'upgrade' }), true);
    assert.equal(historyRecordIsUpgrade({ data: { reason: 'Upgrade' } }), true);
    assert.equal(historyRecordIsUpgrade({ eventType: 'downloadFolderImported', data: {} }), false);
});

test('listRecentUpgradedDiscoverItems returns upgrades and hydrates tmdb from movie id', async () => {
    const originalFetch = global.fetch;
    global.fetch = async (url) => {
        const href = String(url);
        if (href.includes('/api/v3/history')) {
            return {
                ok: true,
                status: 200,
                headers: { get: () => 'application/json' },
                json: async () => ({
                    records: [{
                        eventType: 'downloadFolderImported',
                        date: new Date().toISOString(),
                        movieId: 77,
                        data: { isUpgrade: 'True', importedPath: '/movies/Dune.mkv' },
                    }],
                }),
                text: async () => '',
            };
        }
        if (href.includes('/api/v3/movie/77')) {
            return {
                ok: true,
                status: 200,
                headers: { get: () => 'application/json' },
                json: async () => ({
                    id: 77,
                    title: 'Dune',
                    year: 2021,
                    tmdbId: 438631,
                    overview: 'Sand.',
                }),
                text: async () => '',
            };
        }
        return {
            ok: false,
            status: 404,
            headers: { get: () => 'application/json' },
            json: async () => ({}),
            text: async () => '',
        };
    };

    try {
        const { results } = await listRecentUpgradedDiscoverItems({
            arrInstances: [{
                id: 'radarr-1',
                type: 'radarr',
                name: 'Radarr',
                url: 'http://radarr.test',
                apiKey: 'key',
                enabled: true,
            }],
        }, {
            mediaType: 'movie',
            take: 10,
            resolveUrl: (url) => url,
        });

        assert.equal(results.length, 1);
        assert.equal(results[0].tmdbId, 438631);
        assert.equal(results[0].title, 'Dune');
        assert.equal(results[0].acquisitionKind, 'upgrade');
    } finally {
        global.fetch = originalFetch;
    }
});
