import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
    collectIntegrityCandidates,
    createQcIntegrity,
    mapArrPath,
    scheduleDecodeWindows,
    probeMediaFile,
} from '../../lib/upgrader/qc-integrity.js';
import { computeImohash } from '../../lib/upgrader/qc-integrity-hash.js';
import {
    durationMatchesExpected,
    extractExpectedRuntimeSec,
    parseRuntimeToSec,
} from '../../lib/upgrader/qc-integrity-runtime.js';

test('mapArrPath prefers longest Arr prefix', () => {
    const mapped = mapArrPath('/movies/4k/Film.mkv', [
        { from: '/movies', to: '/media/movies' },
        { from: '/movies/4k', to: '/media/movies-4k' },
    ]);
    assert.equal(mapped, '/media/movies-4k/Film.mkv');
});

test('scheduleDecodeWindows uses start mid end for long files', () => {
    assert.deepEqual(
        scheduleDecodeWindows(3600, 10).map((entry) => entry.id),
        ['start', 'mid', 'end'],
    );
    const short = scheduleDecodeWindows(12, 10);
    assert.deepEqual(short.map((entry) => entry.id), ['start', 'end']);
    assert.deepEqual(scheduleDecodeWindows(5, 10).map((entry) => entry.id), ['start']);
});

test('parseRuntimeToSec handles mediaInfo and Arr minutes/ms', () => {
    assert.equal(parseRuntimeToSec('01:45:30'), 6330);
    assert.equal(parseRuntimeToSec(120), 7200); // minutes
    assert.equal(parseRuntimeToSec(180000), 180); // ms
});

test('durationMatchesExpected flags large video deltas', () => {
    assert.equal(durationMatchesExpected(3600, 3600).ok, true);
    assert.equal(durationMatchesExpected(14400, 3600).ok, false); // 4h vs 1h
    assert.equal(durationMatchesExpected(null, 3600).ok, true); // skipped
});

test('extractExpectedRuntimeSec prefers MediaInfo runTime', () => {
    assert.equal(extractExpectedRuntimeSec({
        file: { mediaInfo: { runTime: '00:42:10' } },
        record: { runtime: 40 },
        mediaKind: 'video',
    }), 2530);
});

test('collectIntegrityCandidates includes lidarr track files when enabled', () => {
    const candidates = collectIntegrityCandidates([
        {
            ratingKey: 'radarr:1:9',
            title: 'Movie',
            monitored: true,
            hasFile: true,
            mediaType: 'movie',
            arrType: 'radarr',
            arrInstanceId: '1',
            entityId: 9,
            movieFileId: 44,
            filePath: '/movies/Movie.mkv',
            expectedRuntimeSec: 7200,
        },
        {
            ratingKey: 'sonarr:2:3',
            title: 'Show',
            monitored: true,
            mediaType: 'show',
            arrType: 'sonarr',
            arrInstanceId: '2',
            entityId: 3,
            episodes: [
                { episodeId: 10, episodeFileId: 11, filePath: '/tv/Show/S01E01.mkv', seasonNumber: 1, episodeNumber: 1 },
                { episodeId: 12, episodeFileId: null, filePath: null },
            ],
        },
        {
            ratingKey: 'lidarr:3:1',
            title: 'Album',
            mediaType: 'album',
            arrType: 'lidarr',
            arrInstanceId: '3',
            entityId: 1,
            hasFile: true,
            trackFiles: [
                { trackFileId: 9, filePath: '/music/Album/01.flac', expectedRuntimeSec: 210 },
                { trackFileId: 10, filePath: '/music/Album/02.flac', expectedRuntimeSec: 200 },
            ],
        },
    ]);
    assert.equal(candidates.length, 4);
    assert.equal(candidates[0].movieFileId, 44);
    assert.equal(candidates[1].episodeFileId, 11);
    assert.equal(candidates[2].trackFileId, 9);
    assert.equal(candidates[2].mediaKind, 'audio');
    assert.equal(collectIntegrityCandidates([{
        ratingKey: 'lidarr:3:1',
        title: 'Album',
        mediaType: 'album',
        arrType: 'lidarr',
        arrInstanceId: '3',
        entityId: 1,
        monitored: true,
        trackFiles: [{ trackFileId: 1, filePath: '/a.flac' }],
    }], { includeMusic: false }).length, 0);
});

test('probeMediaFile allows audio-only for music', async () => {
    const result = await probeMediaFile('/tmp/track.flac', {
        mediaKind: 'audio',
        execImpl: async () => ({
            ok: true,
            code: 0,
            timedOut: false,
            stdout: JSON.stringify({
                format: { duration: '210' },
                streams: [{ codec_type: 'audio' }],
            }),
            stderr: '',
        }),
    });
    assert.equal(result.ok, true);
    assert.equal(result.hasAudio, true);
});

test('computeImohash is stable for identical content', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'imo-'));
    const filePath = path.join(dir, 'sample.bin');
    const buf = Buffer.alloc(64 * 1024, 7);
    await fs.writeFile(filePath, buf);
    const a = await computeImohash(filePath);
    const b = await computeImohash(filePath);
    assert.equal(a.ok, true);
    assert.equal(a.imohash, b.imohash);
    assert.match(a.imohash, /^imo:[a-f0-9]+$/);
    await fs.rm(dir, { recursive: true, force: true });
});

test('scanIntegrity dry-run does not delete Arr files', async () => {
    const requests = [];
    const integrity = createQcIntegrity({
        request: async (instance, path, options = {}) => {
            requests.push({ path, method: options.method || 'GET' });
            return {};
        },
        loadIndex: async () => ({
            items: [{
                ratingKey: 'radarr:r1:1',
                title: 'Bad Movie',
                monitored: true,
                hasFile: true,
                mediaType: 'movie',
                arrType: 'radarr',
                arrInstanceId: 'r1',
                entityId: 1,
                movieFileId: 7,
                filePath: '/movies/Bad.mkv',
            }],
        }),
        loadPrefs: async () => ({}),
        savePrefs: async () => {},
        appendAudit: async () => {},
        loadCache: async () => ({ entries: {} }),
        saveCache: async () => {},
        statImpl: async () => ({ ok: true, size: 100, mtimeMs: 1 }),
        execImpl: async (bin, args = []) => {
            if (args.includes('-version')) {
                return { ok: true, code: 0, timedOut: false, stdout: `${bin} version test`, stderr: '' };
            }
            if (bin === 'ffprobe') {
                return {
                    ok: true,
                    code: 0,
                    timedOut: false,
                    stdout: JSON.stringify({
                        format: { duration: '120' },
                        streams: [{ codec_type: 'video' }, { codec_type: 'audio' }],
                    }),
                    stderr: '',
                };
            }
            return { ok: false, code: 1, timedOut: false, stdout: '', stderr: 'decode error' };
        },
    });

    const result = await integrity.scanIntegrity({
        upgraderEnabled: true,
        qcIntegrityEnabled: true,
        qcIntegrityRequireAudio: true,
        qcIntegrityMaxPerCycle: 10,
        arrInstances: [{
            id: 'r1',
            type: 'radarr',
            name: 'Radarr',
            url: 'http://radarr.local',
            apiKey: 'x',
            enabled: true,
        }],
    }, { dryRun: true, replaceFindings: false, force: true, mode: 'playability' });

    assert.equal(result.ran, true);
    assert.equal(result.findingCount, 1);
    assert.equal(result.findings[0].reason, 'decode_start');
    assert.equal(requests.length, 0);
});

test('imohash mismatch does not blocklist', async () => {
    const blocklistCalls = [];
    const integrity = createQcIntegrity({
        request: async (instance, reqPath, options = {}) => {
            if (String(reqPath).includes('blocklist') || String(reqPath).includes('failed')) {
                blocklistCalls.push({ reqPath, method: options.method });
            }
            return {};
        },
        loadIndex: async () => ({
            items: [{
                ratingKey: 'radarr:r1:1',
                title: 'Movie',
                monitored: true,
                hasFile: true,
                mediaType: 'movie',
                arrType: 'radarr',
                arrInstanceId: 'r1',
                entityId: 1,
                movieFileId: 7,
                filePath: '/movies/Ok.mkv',
            }],
        }),
        loadPrefs: async () => ({}),
        savePrefs: async () => {},
        appendAudit: async () => {},
        loadCache: async () => ({
            entries: {
                'radarr:r1:1:file:7': {
                    ok: true,
                    playabilityOk: true,
                    size: 100,
                    mtimeMs: 1,
                    imohash: 'imo:old',
                    baselinedAt: '2026-01-01T00:00:00.000Z',
                    baselineSource: 'backfill',
                    mediaKind: 'video',
                },
            },
        }),
        saveCache: async () => {},
        statImpl: async () => ({ ok: true, size: 100, mtimeMs: 1 }),
        imohashImpl: async () => ({ ok: true, imohash: 'imo:new' }),
        execImpl: async (bin, args = []) => {
            if (args.includes('-version')) {
                return { ok: true, code: 0, timedOut: false, stdout: `${bin} version`, stderr: '' };
            }
            return { ok: true, code: 0, timedOut: false, stdout: '', stderr: '' };
        },
    });

    const result = await integrity.scanIntegrity({
        upgraderEnabled: true,
        qcIntegrityEnabled: true,
        qcIntegrityMaxPerCycle: 10,
        arrInstances: [{
            id: 'r1', type: 'radarr', name: 'Radarr', url: 'http://radarr.local', apiKey: 'x', enabled: true,
        }],
    }, { dryRun: true, force: true, mode: 'imohash' });

    assert.equal(result.ran, true);
    assert.equal(result.findingCount, 1);
    assert.equal(result.findings[0].reason, 'imohash_mismatch');
    assert.equal(result.findings[0].shouldBlocklist, false);
    assert.equal(blocklistCalls.length, 0);
});

test('import baseline playability fail requests blocklist', async () => {
    const requests = [];
    const integrity = createQcIntegrity({
        request: async (instance, reqPath, options = {}) => {
            requests.push({ path: reqPath, method: options.method || 'GET', body: options.body });
            return {};
        },
        loadIndex: async () => ({ items: [] }),
        loadPrefs: async () => ({}),
        savePrefs: async () => {},
        appendAudit: async () => {},
        loadCache: async () => ({ entries: {} }),
        saveCache: async () => {},
        statImpl: async () => ({ ok: true, size: 100, mtimeMs: 1 }),
        execImpl: async (bin, args = []) => {
            if (args.includes('-version')) {
                return { ok: true, code: 0, timedOut: false, stdout: `${bin} version`, stderr: '' };
            }
            if (bin === 'ffprobe') {
                return {
                    ok: true,
                    code: 0,
                    timedOut: false,
                    stdout: JSON.stringify({
                        format: { duration: '120' },
                        streams: [{ codec_type: 'video' }, { codec_type: 'audio' }],
                    }),
                    stderr: '',
                };
            }
            return { ok: false, code: 1, timedOut: false, stdout: '', stderr: 'decode error' };
        },
    });

    const result = await integrity.baselineImport({
        upgraderEnabled: true,
        qcIntegrityEnabled: true,
        arrInstances: [{
            id: 'r1', type: 'radarr', name: 'Radarr', url: 'http://radarr.local', apiKey: 'x', enabled: true,
        }],
    }, {
        arrType: 'radarr',
        arrInstanceId: 'r1',
        entityId: 1,
        movieFileId: 7,
        filePath: '/movies/Bad.mkv',
        title: 'Bad',
        downloadId: 'dl-1',
        sourceTitle: 'Bad.Release',
    });

    assert.equal(result.ran, true);
    assert.equal(result.ok, false);
    assert.equal(result.blocklisted, true);
    assert.ok(requests.some((entry) => String(entry.path).includes('failed') || String(entry.path).includes('blocklist')));
});

test('replaceCorrupt deletes moviefile then searches', async () => {
    const requests = [];
    let marked = 0;
    const integrity = createQcIntegrity({
        request: async (instance, reqPath, options = {}) => {
            requests.push({ path: reqPath, method: options.method || 'GET', body: options.body });
            return { id: 1 };
        },
        loadIndex: async () => ({ items: [] }),
        loadPrefs: async () => ({}),
        savePrefs: async () => {},
        appendAudit: async () => {},
        loadCache: async () => ({ entries: {} }),
        saveCache: async () => {},
        actionsRemaining: () => 5,
        markAction: () => { marked += 1; },
    });

    const result = await integrity.replaceCorrupt({
        arrInstances: [{
            id: 'r1',
            type: 'radarr',
            name: 'Radarr',
            url: 'http://radarr.local',
            apiKey: 'x',
            enabled: true,
        }],
        upgraderMaxActionsPerHour: 25,
    }, {
        title: 'Bad Movie',
        ratingKey: 'radarr:r1:1',
        arrType: 'radarr',
        arrInstanceId: 'r1',
        entityId: 1,
        movieFileId: 7,
        filePath: '/movies/Bad.mkv',
        reason: 'decode_end',
    });

    assert.equal(result.success, true);
    assert.equal(requests[0].method, 'DELETE');
    assert.equal(requests[0].path, '/api/v3/moviefile/7');
    assert.equal(requests[1].body.name, 'MoviesSearch');
    assert.equal(marked, 1);
});

test('replaceCorrupt lidarr deletes trackfile and AlbumSearch', async () => {
    const requests = [];
    const integrity = createQcIntegrity({
        request: async (instance, reqPath, options = {}) => {
            requests.push({ path: reqPath, method: options.method || 'GET', body: options.body });
            return { id: 1 };
        },
        loadIndex: async () => ({ items: [] }),
        loadPrefs: async () => ({}),
        savePrefs: async () => {},
        appendAudit: async () => {},
        loadCache: async () => ({ entries: {} }),
        saveCache: async () => {},
        actionsRemaining: () => 5,
        markAction: () => {},
    });

    const result = await integrity.replaceCorrupt({
        arrInstances: [{
            id: 'l1', type: 'lidarr', name: 'Lidarr', url: 'http://lidarr.local', apiKey: 'x', enabled: true,
        }],
    }, {
        title: 'Album',
        arrType: 'lidarr',
        arrInstanceId: 'l1',
        entityId: 3,
        trackFileId: 99,
        filePath: '/music/a.flac',
        reason: 'imohash_mismatch',
    });

    assert.equal(result.success, true);
    assert.equal(requests[0].path, '/api/v1/trackfile/99');
    assert.equal(requests[1].body.name, 'AlbumSearch');
});

test('plex playing paths are skipped', async () => {
    const integrity = createQcIntegrity({
        request: async () => ({}),
        loadIndex: async () => ({
            items: [{
                ratingKey: 'radarr:r1:1',
                title: 'Playing',
                monitored: true,
                hasFile: true,
                mediaType: 'movie',
                arrType: 'radarr',
                arrInstanceId: 'r1',
                entityId: 1,
                movieFileId: 7,
                filePath: '/movies/Playing.mkv',
            }],
        }),
        loadPrefs: async () => ({}),
        savePrefs: async () => {},
        appendAudit: async () => {},
        loadCache: async () => ({ entries: {} }),
        saveCache: async () => {},
        statImpl: async () => ({ ok: true, size: 100, mtimeMs: 1 }),
        getPlayingPaths: async () => ['/movies/Playing.mkv'],
        execImpl: async (bin, args = []) => {
            if (args.includes('-version')) {
                return { ok: true, code: 0, timedOut: false, stdout: `${bin} version`, stderr: '' };
            }
            return { ok: true, code: 0, timedOut: false, stdout: '', stderr: '' };
        },
        imohashImpl: async () => ({ ok: true, imohash: 'imo:x' }),
    });

    const result = await integrity.scanIntegrity({
        upgraderEnabled: true,
        qcIntegrityEnabled: true,
        qcIntegrityMaxPerCycle: 10,
        arrInstances: [{
            id: 'r1', type: 'radarr', name: 'Radarr', url: 'http://radarr.local', apiKey: 'x', enabled: true,
        }],
    }, { dryRun: true, force: true, mode: 'imohash' });

    assert.equal(result.ran, true);
    assert.equal(result.skippedPlaying >= 1, true);
    assert.equal(result.findingCount, 0);
});

test('clearBreaker resets tripped state', async () => {
    let prefs = {
        integrityBreaker: { tripped: true, at: '2026-01-01T00:00:00.000Z', reason: 'too many', findingCount: 99 },
    };
    const integrity = createQcIntegrity({
        request: async () => ({}),
        loadIndex: async () => ({ items: [] }),
        loadPrefs: async () => prefs,
        savePrefs: async (next) => { prefs = next; },
        appendAudit: async () => {},
        loadCache: async () => ({ entries: {} }),
        saveCache: async () => {},
    });
    const cleared = await integrity.clearBreaker();
    assert.equal(cleared.tripped, false);
    assert.equal(prefs.integrityBreaker.tripped, false);
});
