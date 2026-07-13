import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createPlexStatsService } from '../lib/plex-stats-service.js';

const createService = ({ config, cachePath, systemJobs = { plexStats: {} } }) => createPlexStatsService({
    configPath: 'config.json',
    plexStatsCachePath: cachePath,
    loadFile: async (filePath, fallback) => filePath === 'config.json' ? config.current : fallback,
    getPlexConnectionUri: async () => 'http://plex',
    markTaskStart: () => {},
    markTaskEnd: () => {},
    systemJobs,
    log: () => {},
});

test('Plex stats cache requires the current server and cache version', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'plex-stats-cache-'));
    const cachePath = path.join(directory, 'plex-stats.json');
    const config = { current: { serverIdentifier: 'server-a' } };
    const service = createService({ config, cachePath });

    try {
        await writeFile(cachePath, JSON.stringify({
            version: 1,
            serverIdentifier: 'server-a',
            moviesBytes: 100,
            generatedAt: Date.now(),
        }));
        assert.equal((await service.loadPlexStatsFromDisk()).moviesBytes, 100);

        config.current = { serverIdentifier: 'server-b' };
        assert.equal(await service.loadPlexStatsFromDisk(), null);

        config.current = { serverIdentifier: 'server-a' };
        await writeFile(cachePath, JSON.stringify({
            version: 2,
            serverIdentifier: 'server-a',
            moviesBytes: 100,
        }));
        assert.equal(await service.loadPlexStatsFromDisk(), null);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test('Plex stats schedules the next build from cache age with a timeout', { concurrency: false }, async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'plex-stats-schedule-'));
    const cachePath = path.join(directory, 'plex-stats.json');
    const now = Date.now();
    const systemJobs = { plexStats: {} };
    const config = { current: { serverIdentifier: 'server-a' } };
    const service = createService({ config, cachePath, systemJobs });
    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;
    const originalSetInterval = globalThis.setInterval;
    const delays = [];

    try {
        await writeFile(cachePath, JSON.stringify({
            version: 1,
            serverIdentifier: 'server-a',
            moviesBytes: 100,
            generatedAt: now - (60 * 60 * 1000),
        }));
        globalThis.setTimeout = (callback, delay) => {
            delays.push(delay);
            return { callback };
        };
        globalThis.clearTimeout = () => {};
        globalThis.setInterval = () => { throw new Error('fixed intervals must not be used'); };

        await service.startPlexStatsBackgroundTask();

        assert.equal(delays.length, 1);
        assert.ok(Math.abs(delays[0] - (23 * 60 * 60 * 1000)) < 1000);
        assert.ok(Math.abs(Date.parse(systemJobs.plexStats.nextRun) - (now + delays[0])) < 1000);
    } finally {
        globalThis.setTimeout = originalSetTimeout;
        globalThis.clearTimeout = originalClearTimeout;
        globalThis.setInterval = originalSetInterval;
        await rm(directory, { recursive: true, force: true });
    }
});
