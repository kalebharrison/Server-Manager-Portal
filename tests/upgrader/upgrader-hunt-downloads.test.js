import test from 'node:test';
import assert from 'node:assert/strict';
import {
    countDownloadsByLibrary,
    downloadSlotKey,
    entityIdFromQueueRecord,
    libraryKeyForQueueRecord,
    remainingDownloadSlots,
} from '../../lib/upgrader/upgrader-hunt-downloads.js';
import { buildHuntQueue } from '../../lib/upgrader/upgrader-hunt-queue.js';
import { createUpgraderHunt } from '../../lib/upgrader/upgrader-hunt.js';

test('entityIdFromQueueRecord reads nested Arr ids', () => {
    assert.equal(entityIdFromQueueRecord({ movieId: 9 }, 'radarr'), 9);
    assert.equal(entityIdFromQueueRecord({ series: { id: 4 } }, 'sonarr'), 4);
    assert.equal(entityIdFromQueueRecord({ albumId: 2 }, 'lidarr'), 2);
});

test('countDownloadsByLibrary uses unique downloadIds and index library keys', () => {
    const instances = [{
        id: 'radarr-1',
        type: 'radarr',
        name: 'Radarr',
        activeDirectory: '/media/movies',
        activeAnimeDirectory: '/media/anime.movies',
    }];
    const indexItems = [
        {
            entityId: 1,
            arrType: 'radarr',
            arrInstanceId: 'radarr-1',
            libraryKey: 'radarr:radarr-1:movies',
            libraryName: 'Movies',
        },
        {
            entityId: 2,
            arrType: 'radarr',
            arrInstanceId: 'radarr-1',
            libraryKey: 'radarr:radarr-1:anime-movies',
            libraryName: 'Anime Movies',
        },
    ];
    const counts = countDownloadsByLibrary([
        { id: 10, downloadId: 'aaa', movieId: 1, arrType: 'radarr', arrInstanceId: 'radarr-1' },
        { id: 11, downloadId: 'aaa', movieId: 1, arrType: 'radarr', arrInstanceId: 'radarr-1' },
        { id: 12, downloadId: 'bbb', movieId: 2, arrType: 'radarr', arrInstanceId: 'radarr-1' },
        { id: 13, downloadId: 'ccc', movieId: 2, arrType: 'radarr', arrInstanceId: 'radarr-1' },
    ], { instances, indexItems });

    assert.equal(counts.get('radarr:radarr-1:movies'), 1);
    assert.equal(counts.get('radarr:radarr-1:anime-movies'), 2);
    assert.equal(remainingDownloadSlots(counts, 'radarr:radarr-1:movies', 5), 4);
    assert.equal(remainingDownloadSlots(counts, 'radarr:radarr-1:anime-movies', 2), 0);
    assert.equal(downloadSlotKey({ downloadId: 'AAA' }), 'dl:aaa');
});

test('downloadSlotKey collapses season-pack episode rows without downloadId', () => {
    const a = downloadSlotKey({
        id: 1,
        title: 'Catch-22.S01.2160p',
        seriesId: 42,
        arrInstanceId: 'sonarr-1',
    });
    const b = downloadSlotKey({
        id: 2,
        title: 'Catch-22.S01.2160p',
        seriesId: 42,
        arrInstanceId: 'sonarr-1',
    });
    assert.equal(a, b);
    assert.match(a, /^pack:sonarr-1:42:/);
});

test('libraryKeyForQueueRecord falls back to root-folder classify', () => {
    const instance = {
        id: 'radarr-1',
        type: 'radarr',
        name: 'Radarr',
        activeDirectory: '/media/movies',
        activeAnimeDirectory: '/media/anime.movies',
    };
    const key = libraryKeyForQueueRecord({
        movie: { id: 99, path: '/media/anime.movies/Akira' },
    }, instance, new Map());
    assert.equal(key, 'radarr:radarr-1:anime-movies');
});

test('buildHuntQueue honors libraryCapacity download slots', () => {
    const items = Array.from({ length: 6 }, (_, index) => ({
        ratingKey: `radarr:r1:${index + 1}`,
        title: `Movie ${index + 1}`,
        mediaType: 'movie',
        arrType: 'radarr',
        arrInstanceId: 'r1',
        arrInstanceName: 'Movies',
        libraryKey: 'radarr:r1:movies',
        libraryName: 'Movies',
        hasFile: true,
        avgCustomFormatScore: index,
        scoreUnknown: false,
    }));
    const planned = buildHuntQueue(items, {
        maxPerLibrary: 5,
        libraryCapacity: () => 2,
    });
    assert.equal(planned.queue.length, 2);
    assert.equal(planned.libraries[0].downloadSlots, 2);
});

test('runHunt skips grabs when library download cap is full', async () => {
    const posts = [];
    const hunt = createUpgraderHunt({
        request: async (instance, path, options = {}) => {
            if (path.includes('/queue')) {
                return {
                    records: Array.from({ length: 5 }, (_, index) => ({
                        id: index + 1,
                        downloadId: `dl-${index}`,
                        movieId: 100 + index,
                    })),
                };
            }
            if (path.startsWith('/api/v3/release') && options.method === 'POST') {
                posts.push(options.body);
                return { id: 1 };
            }
            if (path.startsWith('/api/v3/release?movieId=')) {
                return [{ title: 'Better.Remux', rejected: false, customFormatScore: 500, quality: { quality: { name: 'Remux-2160p', resolution: 2160 } } }];
            }
            return {};
        },
        loadIndex: async () => ({
            items: [{
                ratingKey: 'radarr:radarr-1:1',
                title: 'Candidate',
                mediaType: 'movie',
                arrType: 'radarr',
                arrInstanceId: 'radarr-1',
                arrInstanceName: 'Movies',
                libraryKey: 'radarr:radarr-1:movies',
                libraryName: 'Movies',
                entityId: 1,
                hasFile: true,
                avgCustomFormatScore: 10,
                customFormatScore: 10,
                scoreUnknown: false,
                qualityName: 'Bluray-1080p',
                resolution: 1080,
            }],
        }),
        loadPrefs: async () => ({}),
        savePrefs: async () => {},
        appendAudit: async () => {},
    });

    const result = await hunt.runHunt({
        upgraderEnabled: true,
        upgraderAutomationEnabled: true,
        upgraderMaxDownloadsPerLibrary: 5,
        upgraderMaxActionsPerHour: 25,
        upgraderMinScoreDelta: 1,
        arrInstances: [{
            id: 'radarr-1',
            type: 'radarr',
            name: 'Movies',
            url: 'http://radarr.local',
            apiKey: 'x',
            enabled: true,
            activeDirectory: '/media/movies',
        }],
    });

    assert.equal(result.ran, true);
    assert.equal(result.grabbed, 0);
    assert.equal(posts.length, 0);
    assert.ok((result.downloadCapped || 0) >= 1 || /download caps/i.test(result.reason || ''));
});
