import assert from 'node:assert/strict';
import test from 'node:test';

import { createPlexDashboardService } from '../../lib/plex/plex-dashboard-service.js';

test('Plex dashboard service serves and slices a persisted library snapshot', async () => {
    let fetchCalls = 0;
    const service = createPlexDashboardService({
        configPath: 'config.json',
        cachePath: 'dashboard.json',
        loadFile: async (path) => path === 'dashboard.json' ? {
            version: 4,
            generatedAt: Date.now(),
            serverIdentifier: 'server-id',
            uri: 'http://plex',
            data: {
                recentMovies: [{ title: 'One' }, { title: 'Two' }],
                recentShows: [{ title: 'Show' }],
                recentMusic: [],
            },
        } : {},
        saveFile: async () => {},
        getPlexConnectionUri: async () => 'http://plex',
        fetch: async () => { fetchCalls++; throw new Error('should not fetch'); },
    });

    const result = await service.getRecentData({ serverIdentifier: 'server-id' }, 'http://plex', 1);
    assert.deepEqual(result.recentMovies.map((item) => item.title), ['One']);
    assert.equal(result.recentShows.length, 1);
    assert.equal(fetchCalls, 0);
});

test('Plex dashboard service awaits a stale rebuild instead of returning old recent items', async () => {
    let builds = 0;
    const service = createPlexDashboardService({
        configPath: 'config.json',
        cachePath: 'dashboard.json',
        loadFile: async (path) => {
            if (path === 'dashboard.json') {
                return {
                    version: 4,
                    generatedAt: Date.now() - (10 * 60 * 1000),
                    serverIdentifier: 'server-id',
                    uri: 'http://plex',
                    data: {
                        recentMovies: [{ title: 'Stale', addedAt: 1 }],
                        recentShows: [],
                        recentMusic: [],
                    },
                };
            }
            return { plexToken: 'token', serverIdentifier: 'server-id', cacheRefreshMinutes: 1 };
        },
        saveFile: async () => {},
        getPlexConnectionUri: async () => 'http://plex',
        fetch: async (url) => {
            builds += 1;
            if (String(url).includes('/library/sections?')) {
                return {
                    ok: true,
                    json: async () => ({ MediaContainer: { Directory: [{ key: '1', type: 'movie' }] } }),
                };
            }
            return {
                ok: true,
                json: async () => ({
                    MediaContainer: {
                        Metadata: [{
                            ratingKey: '99',
                            key: '/library/metadata/99',
                            title: 'Fresh',
                            type: 'movie',
                            addedAt: Math.floor(Date.now() / 1000),
                            Guid: [{ id: 'tmdb://123' }],
                        }],
                    },
                }),
            };
        },
    });

    const result = await service.getRecentData(
        { plexToken: 'token', serverIdentifier: 'server-id', cacheRefreshMinutes: 1 },
        'http://plex',
        10,
    );
    assert.equal(result.recentMovies[0]?.title, 'Fresh');
    assert.ok(builds >= 1);
});
