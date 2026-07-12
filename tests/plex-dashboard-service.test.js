import assert from 'node:assert/strict';
import test from 'node:test';

import { createPlexDashboardService } from '../lib/plex-dashboard-service.js';

test('Plex dashboard service serves and slices a persisted library snapshot', async () => {
    let fetchCalls = 0;
    const service = createPlexDashboardService({
        configPath: 'config.json',
        cachePath: 'dashboard.json',
        loadFile: async (path) => path === 'dashboard.json' ? {
            version: 1,
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
