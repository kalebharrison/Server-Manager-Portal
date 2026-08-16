import assert from 'node:assert/strict';
import test from 'node:test';

import {
    historyRecordIsUpgrade,
    historyRecordIsUpgradeDelete,
    listRecentUpgradedDiscoverItems,
} from '../../lib/discovery/discover-recent-upgrades.js';

test('historyRecordIsUpgrade accepts Arr True strings and delete reasons', () => {
    assert.equal(historyRecordIsUpgrade({ data: { isUpgrade: 'True' } }), true);
    assert.equal(historyRecordIsUpgrade({ data: { isUpgrade: 'False' } }), false);
    assert.equal(historyRecordIsUpgrade({ eventType: 'movieFileDeleted', data: { reason: 'Upgrade' } }), true);
    assert.equal(historyRecordIsUpgradeDelete({ eventType: 'movieFileDeleted', data: { reason: 'Upgrade' } }), true);
    assert.equal(historyRecordIsUpgradeDelete({ eventType: 'downloadFolderImported', data: { reason: 'Upgrade' } }), false);
    assert.equal(historyRecordIsUpgrade({ eventType: 'downloadFolderImported', data: {} }), false);
});

test('listRecentUpgradedDiscoverItems uses file-deleted Upgrade reason when isUpgrade is missing', async () => {
    const originalFetch = global.fetch;
    global.fetch = async (url) => {
        const href = String(url);
        if (href.includes('/api/v3/history')) {
            return {
                ok: true,
                status: 200,
                headers: { get: () => 'application/json' },
                json: async () => ({
                    records: [
                        {
                            eventType: 'downloadFolderImported',
                            date: new Date().toISOString(),
                            movieId: 1088,
                            data: {
                                // Modern Radarr often omits isUpgrade on the import row.
                                droppedPath: '/downloads/Dune.mkv',
                                importedPath: '/movies/Dune.mkv',
                            },
                        },
                        {
                            eventType: 'movieFileDeleted',
                            date: new Date(Date.now() - 1000).toISOString(),
                            movieId: 1088,
                            data: { reason: 'Upgrade', size: '57048425720' },
                        },
                    ],
                }),
                text: async () => '',
            };
        }
        if (href.includes('/api/v3/movie/1088')) {
            return {
                ok: true,
                status: 200,
                headers: { get: () => 'application/json' },
                json: async () => ({
                    id: 1088,
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
