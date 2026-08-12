import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
    assertSafeMediaPath,
    collectIntegrityCandidates,
    createQcIntegrity,
    mapArrPath,
    reconcileIntegrityFindings,
    scheduleDecodeWindows,
    probeMediaFile,
} from '../../lib/upgrader/qc-integrity.js';
import { computeImohash } from '../../lib/upgrader/qc-integrity-hash.js';
import {
    durationMatchesExpected,
    extractExpectedRuntimeSec,
    parseRuntimeToSec,
} from '../../lib/upgrader/qc-integrity-runtime.js';


/** Identity maps so unit tests can use /movies|/tv|/music without a real /media jail. */
const TEST_PATH_MAPS = [
    { from: '/movies', to: '/movies' },
    { from: '/tv', to: '/tv' },
    { from: '/music', to: '/music' },
    { from: '/anime', to: '/anime' },
    { from: '/media', to: '/media' },
];

const withTestMaps = (config = {}) => ({
    ...config,
    qcIntegrityPathMaps: config.qcIntegrityPathMaps || TEST_PATH_MAPS,
});

test('mapArrPath prefers longest Arr prefix', () => {
    const mapped = mapArrPath('/movies/4k/Film.mkv', [
        { from: '/movies', to: '/media/movies' },
        { from: '/movies/4k', to: '/media/movies-4k' },
    ]);
    assert.equal(mapped, '/media/movies-4k/Film.mkv');
});

test('assertSafeMediaPath rejects parent traversal', async () => {
    const maps = [{ from: '/movies', to: '/media/movies' }];
    const identityRealpath = async (target) => target;
    const result = await assertSafeMediaPath('../../../etc/passwd', maps, { realpathImpl: identityRealpath });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'unsafe_path');
    assert.match(result.detail, /parent traversal/i);
});

test('assertSafeMediaPath rejects null byte paths', async () => {
    const maps = [{ from: '/movies', to: '/media/movies' }];
    const identityRealpath = async (target) => target;
    const result = await assertSafeMediaPath('/media/movies/evil.mkv\0/../../etc/passwd', maps, {
        realpathImpl: identityRealpath,
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'unsafe_path');
    assert.match(result.detail, /null byte/i);
});

test('assertSafeMediaPath allows normal mapped media path', async () => {
    const maps = [{ from: '/movies', to: '/media/movies' }];
    const identityRealpath = async (target) => target;
    const result = await assertSafeMediaPath('/media/movies/Film.mkv', maps, { realpathImpl: identityRealpath });
    assert.equal(result.ok, true);
    assert.equal(result.path, '/media/movies/Film.mkv');
});

test('assertSafeMediaPath rejects paths outside configured map roots', async () => {
    const maps = [{ from: '/movies', to: '/media/movies' }];
    const identityRealpath = async (target) => target;
    const result = await assertSafeMediaPath('/etc/passwd', maps, { realpathImpl: identityRealpath });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'unsafe_path');
});

test('assertSafeMediaPath confines to /media when no maps configured', async () => {
    const identityRealpath = async (target) => target;
    const outside = await assertSafeMediaPath('/movies/Film.mkv', [], { realpathImpl: identityRealpath });
    assert.equal(outside.ok, false);
    assert.equal(outside.reason, 'unsafe_path');
    const inside = await assertSafeMediaPath('/media/movies/Film.mkv', [], { realpathImpl: identityRealpath });
    assert.equal(inside.ok, true);
    assert.equal(inside.path, '/media/movies/Film.mkv');
});

test('validateCandidate rejects unsafe mapped paths before stat', async () => {
    const statCalls = [];
    const integrity = createQcIntegrity({
        request: async () => ({}),
        loadIndex: async () => ({ items: [] }),
        loadPrefs: async () => ({}),
        savePrefs: async () => {},
        appendAudit: async () => {},
        loadCache: async () => ({ entries: {} }),
        saveCache: async () => {},
        statImpl: async (localPath) => {
            statCalls.push(localPath);
            return { ok: true, size: 100, mtimeMs: 1 };
        },
        realpathImpl: async (target) => target,
        execImpl: async () => ({ ok: true, code: 0, timedOut: false, stdout: '', stderr: '' }),
    });

    const result = await integrity.validateCandidate({
        qcIntegrityPathMaps: [{ from: '/movies', to: '/media/movies' }],
    }, {
        key: 'radarr:r1:1:file:7',
        title: 'Evil',
        arrType: 'radarr',
        arrInstanceId: 'r1',
        entityId: 1,
        movieFileId: 7,
        filePath: '/movies/../../etc/passwd',
        mediaKind: 'video',
    }, { mode: 'imohash' });

    assert.equal(result.ok, false);
    assert.equal(result.reason, 'unsafe_path');
    assert.equal(statCalls.length, 0);
});

test('reconcileIntegrityFindings drops replaced Arr file ids and passed keys', () => {
    const findings = reconcileIntegrityFindings([
        { key: 'radarr:r1:1:file:10', reason: 'missing_file', title: 'Old' },
        { key: 'radarr:r1:1:file:20', reason: 'missing_file', title: 'Current miss' },
        { key: 'radarr:r1:2:file:30', reason: 'decode_start', title: 'Will pass' },
    ], {
        liveKeys: ['radarr:r1:1:file:20', 'radarr:r1:2:file:30'],
        passedKeys: ['radarr:r1:2:file:30'],
        incoming: [{ key: 'radarr:r1:1:file:20', reason: 'missing_file', title: 'Current miss again' }],
    });
    assert.deepEqual(findings.map((entry) => entry.key), ['radarr:r1:1:file:20']);
    assert.equal(findings[0].title, 'Current miss again');
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

test('extractExpectedRuntimeSec prefers catalog runtime over MediaInfo', () => {
    assert.equal(extractExpectedRuntimeSec({
        file: { mediaInfo: { runTime: '00:42:10' } },
        record: { runtime: 40 },
        mediaKind: 'video',
    }), 2400);
    assert.equal(extractExpectedRuntimeSec({
        file: { mediaInfo: { runTime: '00:42:10' } },
        episode: { runtime: 45 },
        record: { runtime: 40 },
        mediaKind: 'video',
    }), 2700);
    assert.equal(extractExpectedRuntimeSec({
        file: { mediaInfo: { runTime: '00:42:10' } },
        mediaKind: 'video',
    }), null);
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

test('collectIntegrityCandidates includes unmonitored Arr files', () => {
    const candidates = collectIntegrityCandidates([
        {
            ratingKey: 'radarr:1:9',
            title: 'Unmonitored Movie',
            monitored: false,
            hasFile: true,
            mediaType: 'movie',
            arrType: 'radarr',
            arrInstanceId: '1',
            entityId: 9,
            movieFileId: 44,
            filePath: '/movies/Movie.mkv',
        },
        {
            ratingKey: 'sonarr:2:3',
            title: 'Unmonitored Show',
            monitored: false,
            mediaType: 'show',
            arrType: 'sonarr',
            arrInstanceId: '2',
            entityId: 3,
            episodes: [
                { episodeId: 10, episodeFileId: 11, filePath: '/tv/Show/S01E01.mkv', seasonNumber: 1, episodeNumber: 1 },
            ],
        },
    ]);
    assert.equal(candidates.length, 2);
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

    const result = await integrity.scanIntegrity(withTestMaps({
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
    }), { dryRun: true, replaceFindings: false, force: true, mode: 'playability' });

    assert.equal(result.ran, true);
    assert.equal(result.findingCount, 1);
    assert.equal(result.findings[0].reason, 'decode_start');
    assert.equal(requests.length, 0);
});

test('scanIntegrity and getStatus prune findings for replaced Arr file ids', async () => {
    let prefs = {
        integrityFindings: [
            { key: 'radarr:r1:1:file:7', reason: 'missing_file', title: 'Old file id' },
            { key: 'radarr:r1:1:file:99', reason: 'missing_file', title: 'Current' },
        ],
    };
    const saved = [];
    const integrity = createQcIntegrity({
        request: async () => ({}),
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
                movieFileId: 99,
                filePath: '/movies/Movie.mkv',
            }],
        }),
        loadPrefs: async () => prefs,
        savePrefs: async (next) => {
            prefs = next;
            saved.push(next);
        },
        appendAudit: async () => {},
        loadCache: async () => ({
            entries: {
                'radarr:r1:1:file:7': { ok: false, size: 1, mtimeMs: 1 },
                'radarr:r1:1:file:99': {
                    ok: true,
                    playabilityAt: new Date().toISOString(),
                    playabilityOk: true,
                    size: 100,
                    mtimeMs: 1,
                    imohash: 'imo:abc',
                },
            },
        }),
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
            return { ok: true, code: 0, timedOut: false, stdout: '', stderr: '' };
        },
    });

    const status = await integrity.getStatus({
        upgraderEnabled: true,
        qcIntegrityEnabled: true,
    });
    assert.deepEqual(status.findings.map((entry) => entry.key), ['radarr:r1:1:file:99']);
    assert.equal(saved.length, 1);

    prefs = {
        integrityFindings: [
            { key: 'radarr:r1:1:file:7', reason: 'missing_file', title: 'Old file id' },
            { key: 'radarr:r1:1:file:99', reason: 'missing_file', title: 'Current' },
        ],
    };
    const scan = await integrity.scanIntegrity(withTestMaps({
        upgraderEnabled: true,
        qcIntegrityEnabled: true,
        qcIntegrityMaxPerCycle: 10,
        arrInstances: [{
            id: 'r1',
            type: 'radarr',
            name: 'Radarr',
            url: 'http://radarr.local',
            apiKey: 'x',
            enabled: true,
        }],
    }), { dryRun: true, force: true, mode: 'playability' });

    assert.equal(scan.ran, true);
    assert.equal(scan.findingCount, 0);
    assert.deepEqual((prefs.integrityFindings || []).map((entry) => entry.key), []);
});

test('scanIntegrity skips missing_file when Arr file id is already gone', async () => {
    let prefs = {
        integrityFindings: [
            {
                key: 'sonarr:s1:38:file:39807',
                reason: 'missing_file',
                title: 'The Grand Tour (2016)',
                episodeFileId: 39807,
            },
        ],
    };
    const requests = [];
    const integrity = createQcIntegrity({
        request: async (_instance, reqPath) => {
            requests.push(reqPath);
            if (String(reqPath).includes('/episodefile/39807')) {
                throw new Error('Sonarr returned 404: NotFound');
            }
            return {};
        },
        loadIndex: async () => ({
            items: [{
                ratingKey: 'sonarr:s1:38',
                title: 'The Grand Tour (2016)',
                monitored: true,
                mediaType: 'show',
                arrType: 'sonarr',
                arrInstanceId: 's1',
                entityId: 38,
                episodes: [{
                    episodeId: 7734,
                    episodeFileId: 39807,
                    filePath: '/media/tv/The.Grand.Tour/Season03/S03E01-x265.mkv',
                    seasonNumber: 3,
                    episodeNumber: 1,
                }],
            }],
        }),
        loadPrefs: async () => prefs,
        savePrefs: async (next) => { prefs = next; },
        appendAudit: async () => {},
        loadCache: async () => ({ entries: {} }),
        saveCache: async () => {},
        statImpl: async () => ({ ok: false, reason: 'missing_file', detail: 'ENOENT' }),
        execImpl: async (bin, args = []) => {
            if (args.includes('-version')) {
                return { ok: true, code: 0, timedOut: false, stdout: `${bin} version test`, stderr: '' };
            }
            return { ok: true, code: 0, timedOut: false, stdout: '', stderr: '' };
        },
    });

    const scan = await integrity.scanIntegrity(withTestMaps({
        upgraderEnabled: true,
        qcIntegrityEnabled: true,
        qcIntegrityMaxPerCycle: 10,
        arrInstances: [{
            id: 's1',
            type: 'sonarr',
            name: 'Sonarr',
            url: 'http://sonarr.local',
            apiKey: 'x',
            enabled: true,
        }],
    }), { dryRun: true, force: true, mode: 'imohash' });

    assert.equal(scan.ran, true);
    assert.equal(scan.findingCount, 0);
    assert.equal((prefs.integrityFindings || []).length, 0);
    assert.equal(requests.some((path) => String(path).includes('/episodefile/39807')), true);
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

    const result = await integrity.scanIntegrity(withTestMaps({
        upgraderEnabled: true,
        qcIntegrityEnabled: true,
        qcIntegrityMaxPerCycle: 10,
        arrInstances: [{
            id: 'r1', type: 'radarr', name: 'Radarr', url: 'http://radarr.local', apiKey: 'x', enabled: true,
        }],
    }), { dryRun: true, force: true, mode: 'imohash' });

    assert.equal(result.ran, true);
    assert.equal(result.findingCount, 1);
    assert.equal(result.findings[0].reason, 'imohash_mismatch');
    assert.equal(result.findings[0].shouldBlocklist, false);
    assert.equal(blocklistCalls.length, 0);
});

test('import baseline playability fail requests blocklist', async () => {
    const requests = [];
    let cache = { entries: {} };
    const integrity = createQcIntegrity({
        request: async (instance, reqPath, options = {}) => {
            requests.push({ path: reqPath, method: options.method || 'GET', body: options.body });
            return {};
        },
        loadIndex: async () => ({ items: [] }),
        loadPrefs: async () => ({}),
        savePrefs: async () => {},
        appendAudit: async () => {},
        loadCache: async () => cache,
        saveCache: async (next) => { cache = next; },
        imohashImpl: async () => ({ ok: true, imohash: 'imo:bad' }),
        statImpl: async () => ({ ok: true, size: 100, mtimeMs: 1 }),
        realpathImpl: async (target) => target,
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
        qcIntegrityPathMaps: [{ from: '/movies', to: '/movies' }],
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
        ratingKey: 'radarr:r1:1',
        key: 'radarr:r1:1:file:7',
    });

    assert.equal(result.ran, true);
    assert.equal(result.ok, false);
    assert.equal(result.blocklisted, true);
    assert.equal(cache.entries['radarr:r1:1:file:7']?.imohash, undefined);
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

    const result = await integrity.scanIntegrity(withTestMaps({
        upgraderEnabled: true,
        qcIntegrityEnabled: true,
        qcIntegrityMaxPerCycle: 10,
        arrInstances: [{
            id: 'r1', type: 'radarr', name: 'Radarr', url: 'http://radarr.local', apiKey: 'x', enabled: true,
        }],
    }), { dryRun: true, force: true, mode: 'imohash' });

    assert.equal(result.ran, true);
    assert.equal(result.skippedPlaying >= 1, true);
    assert.equal(result.findingCount, 0);
});

test('full imohash pass ignores maxPerCycle batch cap', async () => {
    const titles = ['A', 'B', 'C', 'D', 'E'];
    const integrity = createQcIntegrity({
        request: async () => ({}),
        loadIndex: async () => ({
            items: titles.map((title, index) => ({
                ratingKey: `radarr:r1:${index + 1}`,
                title,
                hasFile: true,
                mediaType: 'movie',
                arrType: 'radarr',
                arrInstanceId: 'r1',
                entityId: index + 1,
                movieFileId: index + 1,
                filePath: `/movies/${title}.mkv`,
            })),
        }),
        loadPrefs: async () => ({}),
        savePrefs: async () => {},
        appendAudit: async () => {},
        loadCache: async () => ({ entries: {} }),
        saveCache: async () => {},
        statImpl: async () => ({ ok: true, size: 100, mtimeMs: 1 }),
        imohashImpl: async () => ({ ok: true, imohash: 'imo:x' }),
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
            return { ok: true, code: 0, timedOut: false, stdout: '', stderr: '' };
        },
    });

    const result = await integrity.scanIntegrity(withTestMaps({
        upgraderEnabled: true,
        qcIntegrityEnabled: true,
        qcIntegrityMaxPerCycle: 2,
        arrInstances: [{
            id: 'r1', type: 'radarr', name: 'Radarr', url: 'http://radarr.local', apiKey: 'x', enabled: true,
        }],
    }), { dryRun: true, force: true, mode: 'baseline', full: true });

    assert.equal(result.ran, true);
    assert.equal(result.full, true);
    assert.equal(result.scanned, 5);
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

test('getStatus reuses prefs integrityCoverage without re-expanding candidates', async () => {
    const generatedAt = '2026-08-05T12:00:00.000Z';
    let prefs = {};
    const saved = [];
    let itemAccessCount = 0;
    const movieItem = {
        ratingKey: 'radarr:r1:1',
        title: 'Movie',
        hasFile: true,
        mediaType: 'movie',
        arrType: 'radarr',
        arrInstanceId: 'r1',
        entityId: 1,
        movieFileId: 7,
        filePath: '/movies/Movie.mkv',
    };
    const heavyItems = new Proxy([movieItem], {
        get(target, prop, receiver) {
            if (prop === 'length' || prop === Symbol.iterator) {
                itemAccessCount += 1;
            }
            return Reflect.get(target, prop, receiver);
        },
    });
    const integrity = createQcIntegrity({
        request: async () => ({}),
        loadIndex: async () => ({
            generatedAt,
            items: heavyItems,
        }),
        loadPrefs: async () => prefs,
        savePrefs: async (next) => {
            prefs = next;
            saved.push(next);
        },
        appendAudit: async () => {},
        loadCache: async () => ({
            entries: {
                'radarr:r1:1:file:7': {
                    ok: true,
                    playabilityAt: generatedAt,
                    imohash: 'imo:abc',
                    size: 100,
                    mtimeMs: 1,
                },
            },
        }),
        saveCache: async () => {},
    });

    itemAccessCount = 0;
    const first = await integrity.getStatus({
        upgraderEnabled: true,
        qcIntegrityEnabled: true,
    });
    assert.ok(itemAccessCount > 0, 'first getStatus should expand index items');
    assert.equal(first.coverage.movie.total, 1);
    assert.ok(Array.isArray(first.coverage.byLibrary));
    assert.equal(first.coverage.byLibrary.length, 1);
    assert.equal(first.coverage.byLibrary[0].total, 1);
    assert.equal(saved.length, 1);
    assert.equal(prefs.integrityCoverageIndexAt, generatedAt);
    assert.equal(prefs.integrityCoverageIncludeMusic, true);

    itemAccessCount = 0;
    const second = await integrity.getStatus({
        upgraderEnabled: true,
        qcIntegrityEnabled: true,
    }, { index: { generatedAt, items: heavyItems } });
    assert.equal(itemAccessCount, 0, 'cached getStatus should not expand index items');
    assert.deepEqual(second.coverage, first.coverage);
    assert.equal(saved.length, 1, 'cached getStatus should not rewrite prefs');
});

test('recheckFinding clears a playability finding when decode passes', async () => {
    let prefs = {
        integrityFindings: [{
            key: 'radarr:r1:1:file:7',
            ratingKey: 'radarr:r1:1',
            title: 'Timeout Movie',
            arrType: 'radarr',
            arrInstanceId: 'r1',
            entityId: 1,
            movieFileId: 7,
            filePath: '/movies/Timeout.mkv',
            mediaType: 'movie',
            mediaKind: 'video',
            reason: 'decode_mid_timeout',
            mode: 'playability',
            ok: false,
        }],
    };
    let cache = { entries: {} };
    const audits = [];
    const integrity = createQcIntegrity({
        request: async () => ({}),
        loadIndex: async () => ({
            items: [{
                ratingKey: 'radarr:r1:1',
                title: 'Timeout Movie',
                monitored: true,
                hasFile: true,
                mediaType: 'movie',
                arrType: 'radarr',
                arrInstanceId: 'r1',
                entityId: 1,
                movieFileId: 7,
                filePath: '/movies/Timeout.mkv',
            }],
        }),
        loadPrefs: async () => prefs,
        savePrefs: async (next) => { prefs = next; },
        appendAudit: async (entry) => { audits.push(entry); },
        loadCache: async () => cache,
        saveCache: async (next) => { cache = next; },
        statImpl: async () => ({ ok: true, size: 100, mtimeMs: 1 }),
        realpathImpl: async (target) => target,
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
            return { ok: true, code: 0, timedOut: false, stdout: '', stderr: '' };
        },
    });

    const result = await integrity.recheckFinding({
        upgraderEnabled: true,
        qcIntegrityEnabled: true,
        qcIntegrityRequireAudio: true,
        qcIntegrityPathMaps: [{ from: '/movies', to: '/movies' }],
    }, { key: 'radarr:r1:1:file:7' });

    assert.equal(result.ok, true);
    assert.equal(result.cleared, true);
    assert.equal(prefs.integrityFindings.length, 0);
    assert.ok(cache.entries['radarr:r1:1:file:7']?.playabilityAt);
    assert.equal(audits.at(-1)?.action, 'qc_integrity_recheck');
    assert.equal(audits.at(-1)?.cleared, true);
});

test('recheckFinding keeps and refreshes finding when still failing', async () => {
    let prefs = {
        integrityFindings: [{
            key: 'radarr:r1:1:file:7',
            ratingKey: 'radarr:r1:1',
            title: 'Bad Movie',
            arrType: 'radarr',
            arrInstanceId: 'r1',
            entityId: 1,
            movieFileId: 7,
            filePath: '/movies/Bad.mkv',
            mediaType: 'movie',
            mediaKind: 'video',
            reason: 'decode_mid_timeout',
            mode: 'playability',
            ok: false,
        }],
    };
    const integrity = createQcIntegrity({
        request: async () => ({}),
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
        loadPrefs: async () => prefs,
        savePrefs: async (next) => { prefs = next; },
        appendAudit: async () => {},
        loadCache: async () => ({ entries: {} }),
        saveCache: async () => {},
        statImpl: async () => ({ ok: true, size: 100, mtimeMs: 1 }),
        realpathImpl: async (target) => target,
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

    const result = await integrity.recheckFinding({
        upgraderEnabled: true,
        qcIntegrityEnabled: true,
        qcIntegrityRequireAudio: true,
        qcIntegrityPathMaps: [{ from: '/movies', to: '/movies' }],
    }, { key: 'radarr:r1:1:file:7' });

    assert.equal(result.ok, true);
    assert.equal(result.cleared, false);
    assert.equal(prefs.integrityFindings.length, 1);
    assert.equal(prefs.integrityFindings[0].reason, 'decode_start');
    assert.equal(result.finding.reason, 'decode_start');
});

test('recheckFinding remuxes trim_pending even when dry-run is on', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'qc-trim-recheck-'));
    const filePath = path.join(dir, 'Movie.mkv');
    await fs.writeFile(filePath, Buffer.alloc(1000));
    let prefs = {
        integrityFindings: [{
            key: 'radarr:r1:1:file:7',
            title: 'Eternal Sunshine',
            arrType: 'radarr',
            arrInstanceId: 'r1',
            entityId: 1,
            movieFileId: 7,
            filePath,
            mediaType: 'movie',
            mediaKind: 'video',
            reason: 'trim_pending',
            mode: 'trim',
            ok: true,
        }],
    };
    let cache = { entries: {} };
    const remuxArgs = [];
    const integrity = createQcIntegrity({
        request: async () => ({}),
        loadIndex: async () => ({
            items: [{
                ratingKey: 'radarr:r1:1',
                title: 'Eternal Sunshine',
                monitored: true,
                hasFile: true,
                mediaType: 'movie',
                arrType: 'radarr',
                arrInstanceId: 'r1',
                entityId: 1,
                movieFileId: 7,
                filePath,
            }],
        }),
        loadPrefs: async () => prefs,
        savePrefs: async (next) => { prefs = next; },
        appendAudit: async () => {},
        loadCache: async () => cache,
        saveCache: async (next) => { cache = next; },
        statImpl: async () => ({ ok: true, size: 1000, mtimeMs: 1 }),
        realpathImpl: async (target) => target,
        execImpl: async (bin, args = []) => {
            if (args.includes('-version') || args.includes('--version')) {
                return { ok: true, code: 0, timedOut: false, stdout: `${bin} version test`, stderr: '' };
            }
            if (bin === 'mkvmerge' && args.includes('-J')) {
                return {
                    ok: true,
                    code: 0,
                    timedOut: false,
                    stdout: JSON.stringify({
                        container: { properties: { title: 'wipe me' } },
                        tracks: [
                            { id: 0, type: 'video', properties: {} },
                            { id: 1, type: 'audio', properties: { language: 'eng', audio_channels: 6 } },
                            { id: 2, type: 'audio', properties: { language: 'ger', audio_channels: 2 } },
                        ],
                    }),
                    stderr: '',
                };
            }
            if (bin === 'mkvmerge') {
                remuxArgs.push(args);
                const outIdx = args.indexOf('-o');
                if (outIdx >= 0) await fs.writeFile(args[outIdx + 1], Buffer.alloc(800));
                return { ok: true, code: 0, timedOut: false, stdout: '', stderr: '' };
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
            return { ok: true, code: 0, timedOut: false, stdout: '', stderr: '' };
        },
    });

    const result = await integrity.recheckFinding({
        upgraderEnabled: true,
        qcIntegrityEnabled: true,
        qcTrimEnabled: true,
        qcTrimDryRun: true,
        qcTrimKeepNativeAudio: false,
        qcIntegrityPathMaps: [{ from: dir, to: dir }],
    }, { key: 'radarr:r1:1:file:7' });

    assert.equal(result.ok, true);
    assert.equal(result.cleared, true);
    assert.equal(prefs.integrityFindings.length, 0);
    assert.equal(remuxArgs.length, 1);
    await fs.rm(dir, { recursive: true, force: true });
});

test('baselineImport soft timeout does not blocklist and queues recheck', async () => {
    let prefs = {};
    let cache = { entries: {} };
    const blocklistCalls = [];
    const integrity = createQcIntegrity({
        request: async () => {
            blocklistCalls.push(1);
            return {};
        },
        loadIndex: async () => ({ items: [] }),
        loadPrefs: async () => prefs,
        savePrefs: async (next) => { prefs = next; },
        appendAudit: async () => {},
        loadCache: async () => cache,
        saveCache: async (next) => { cache = next; },
        imohashImpl: async () => ({ ok: true, imohash: 'imo:soft' }),
        statImpl: async () => ({ ok: true, size: 100, mtimeMs: 1 }),
        realpathImpl: async (target) => target,
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
            return { ok: false, code: 1, timedOut: true, stdout: '', stderr: 'timeout' };
        },
    });

    const result = await integrity.baselineImport({
        upgraderEnabled: true,
        qcIntegrityEnabled: true,
        qcIntegritySoftDecodeTimeouts: true,
        qcIntegrityDecodeRetries: 0,
        qcIntegrityPathMaps: [{ from: '/movies', to: '/movies' }],
        arrInstances: [{
            id: 'r1', type: 'radarr', name: 'Radarr', url: 'http://radarr.local', apiKey: 'x', enabled: true,
        }],
    }, {
        ratingKey: 'radarr:r1:1',
        title: 'Soft Timeout',
        arrType: 'radarr',
        arrInstanceId: 'r1',
        entityId: 1,
        movieFileId: 7,
        filePath: '/movies/Soft.mkv',
    });

    assert.equal(result.ok, false);
    assert.equal(result.softTimeout, true);
    assert.equal(result.blocklisted, false);
    assert.equal(blocklistCalls.length, 0);
    assert.ok((prefs.integritySoftRecheckQueue || []).includes(result.result.key));
    assert.equal(cache.entries['radarr:r1:1:file:7']?.imohash, undefined);
});

test('baselineImport hard decode fail blocklists on import', async () => {
    let prefs = {};
    let cache = { entries: {} };
    const requests = [];
    const integrity = createQcIntegrity({
        request: async (_instance, path, options = {}) => {
            requests.push({ path, method: options.method || 'GET' });
            if (String(path).includes('/history')) return [];
            return {};
        },
        loadIndex: async () => ({ items: [] }),
        loadPrefs: async () => prefs,
        savePrefs: async (next) => { prefs = next; },
        appendAudit: async () => {},
        loadCache: async () => cache,
        saveCache: async (next) => { cache = next; },
        imohashImpl: async () => ({ ok: true, imohash: 'imo:hard' }),
        statImpl: async () => ({ ok: true, size: 100, mtimeMs: 1 }),
        realpathImpl: async (target) => target,
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

    const result = await integrity.baselineImport({
        upgraderEnabled: true,
        qcIntegrityEnabled: true,
        qcIntegritySoftDecodeTimeouts: true,
        qcIntegrityPathMaps: [{ from: '/movies', to: '/movies' }],
        arrInstances: [{
            id: 'r1', type: 'radarr', name: 'Radarr', url: 'http://radarr.local', apiKey: 'x', enabled: true,
        }],
    }, {
        ratingKey: 'radarr:r1:1',
        title: 'Hard Fail',
        arrType: 'radarr',
        arrInstanceId: 'r1',
        entityId: 1,
        movieFileId: 7,
        filePath: '/movies/Hard.mkv',
        downloadId: 'abc',
        sourceTitle: 'Hard.Fail.mkv',
    });

    assert.equal(result.ok, false);
    assert.equal(result.result.shouldBlocklist, true);
    assert.equal(cache.entries['radarr:r1:1:file:7']?.imohash, undefined);
    assert.ok(requests.some((entry) => String(entry.path).includes('blocklist') || String(entry.path).includes('history')));
});

test('scanIntegrity libraryKey only probes that library and keeps other cache', async () => {
    let cache = {
        entries: {
            'radarr:r1:1:file:1': {
                ok: true, imohash: 'imo:keep', size: 10, mtimeMs: 1, playabilityAt: '2026-01-01T00:00:00.000Z',
            },
            'radarr:r1:2:file:2': {
                ok: true, size: 10, mtimeMs: 1,
            },
        },
    };
    let prefs = {};
    const probed = [];
    const integrity = createQcIntegrity({
        request: async () => ({}),
        loadIndex: async () => ({
            generatedAt: '2026-08-07T00:00:00.000Z',
            items: [
                {
                    ratingKey: 'radarr:r1:1',
                    title: 'Movies Title',
                    hasFile: true,
                    mediaType: 'movie',
                    arrType: 'radarr',
                    arrInstanceId: 'r1',
                    entityId: 1,
                    movieFileId: 1,
                    filePath: '/movies/A.mkv',
                    libraryKey: 'radarr:r1:movies',
                    libraryName: 'Movies',
                },
                {
                    ratingKey: 'radarr:r1:2',
                    title: 'Anime Title',
                    hasFile: true,
                    mediaType: 'movie',
                    arrType: 'radarr',
                    arrInstanceId: 'r1',
                    entityId: 2,
                    movieFileId: 2,
                    filePath: '/anime/B.mkv',
                    libraryKey: 'radarr:r1:anime-movies',
                    libraryName: 'Anime Movies',
                },
            ],
        }),
        loadPrefs: async () => prefs,
        savePrefs: async (next) => { prefs = next; },
        appendAudit: async () => {},
        loadCache: async () => cache,
        saveCache: async (next) => { cache = next; },
        imohashImpl: async (filePath) => {
            probed.push(filePath);
            return { ok: true, imohash: 'imo:new' };
        },
        statImpl: async () => ({ ok: true, size: 10, mtimeMs: 1 }),
        realpathImpl: async (target) => target,
        execImpl: async (bin, args = []) => {
            if (args.includes('-version')) {
                return { ok: true, code: 0, timedOut: false, stdout: `${bin} version`, stderr: '' };
            }
            return { ok: true, code: 0, timedOut: false, stdout: '', stderr: '' };
        },
    });

    const result = await integrity.scanIntegrity(withTestMaps({
        upgraderEnabled: true,
        qcIntegrityEnabled: true,
        qcIntegrityPathMaps: [
            { from: '/movies', to: '/movies' },
            { from: '/anime', to: '/anime' },
        ],
        arrInstances: [{
            id: 'r1', type: 'radarr', name: 'Radarr', url: 'http://radarr.local', apiKey: 'x', enabled: true,
        }],
    }), {
        dryRun: true,
        force: true,
        full: true,
        mode: 'imohash',
        libraryKey: 'radarr:r1:anime-movies',
    });

    assert.equal(result.ran, true);
    assert.deepEqual(probed, ['/anime/B.mkv']);
    assert.equal(cache.entries['radarr:r1:1:file:1']?.imohash, 'imo:keep');
    assert.equal(cache.entries['radarr:r1:2:file:2']?.imohash, 'imo:new');
    assert.equal(result.coverage.byLibrary.length, 2);
});

test('lookupIntegrityFiles matches title and episode tags', async () => {
    const integrity = createQcIntegrity({
        request: async () => ({}),
        loadIndex: async () => ({
            items: [
                {
                    ratingKey: 'radarr:r1:1',
                    title: 'Dune',
                    monitored: true,
                    hasFile: true,
                    mediaType: 'movie',
                    arrType: 'radarr',
                    arrInstanceId: 'r1',
                    entityId: 1,
                    movieFileId: 7,
                    filePath: '/movies/Dune.mkv',
                    libraryName: 'Movies',
                },
                {
                    ratingKey: 'sonarr:s1:2',
                    title: 'Severance',
                    monitored: true,
                    mediaType: 'show',
                    arrType: 'sonarr',
                    arrInstanceId: 's1',
                    entityId: 2,
                    episodes: [{
                        episodeId: 9,
                        episodeFileId: 90,
                        filePath: '/tv/Severance/S01E02.mkv',
                        seasonNumber: 1,
                        episodeNumber: 2,
                        title: 'Half Loop',
                    }],
                },
            ],
        }),
        loadPrefs: async () => ({}),
        savePrefs: async () => {},
        appendAudit: async () => {},
        loadCache: async () => ({
            entries: {
                'radarr:r1:1:file:7': { ok: true, imohash: 'imo:dune', playabilityAt: '2026-01-01T00:00:00.000Z' },
            },
        }),
        saveCache: async () => {},
    });

    const dune = await integrity.lookupIntegrityFiles({ qcIntegrityEnabled: true }, { query: 'dune' });
    assert.equal(dune.matches.length, 1);
    assert.equal(dune.matches[0].cache.imohash, 'imo:dune');

    const ep = await integrity.lookupIntegrityFiles({ qcIntegrityEnabled: true }, { query: 's01e02' });
    assert.equal(ep.matches.length, 1);
    assert.equal(ep.matches[0].title, 'Severance');
});

test('runFileCheck updates cache for one file', async () => {
    let cache = { entries: {} };
    const integrity = createQcIntegrity({
        request: async () => ({}),
        loadIndex: async () => ({
            items: [{
                ratingKey: 'radarr:r1:1',
                title: 'Dune',
                monitored: true,
                hasFile: true,
                mediaType: 'movie',
                arrType: 'radarr',
                arrInstanceId: 'r1',
                entityId: 1,
                movieFileId: 7,
                filePath: '/movies/Dune.mkv',
            }],
        }),
        loadPrefs: async () => ({}),
        savePrefs: async () => {},
        appendAudit: async () => {},
        loadCache: async () => cache,
        saveCache: async (next) => { cache = next; },
        statImpl: async () => ({ ok: true, size: 100, mtimeMs: 1 }),
        realpathImpl: async (target) => target,
        imohashImpl: async () => ({ ok: true, imohash: 'imo:manual' }),
        execImpl: async (bin, args = []) => {
            if (args.includes('-version')) {
                return { ok: true, code: 0, timedOut: false, stdout: `${bin} version`, stderr: '' };
            }
            return { ok: true, code: 0, timedOut: false, stdout: '', stderr: '' };
        },
    });

    const result = await integrity.runFileCheck({
        upgraderEnabled: true,
        qcIntegrityEnabled: true,
        qcIntegrityPathMaps: [{ from: '/movies', to: '/movies' }],
    }, { key: 'radarr:r1:1:file:7', mode: 'imohash' });

    assert.equal(result.ok, true);
    assert.equal(cache.entries['radarr:r1:1:file:7'].imohash, 'imo:manual');
});

test('escalateMismatch retrims after playback passes', async () => {
    const bins = [];
    const integrity = createQcIntegrity({
        request: async () => ({}),
        loadIndex: async () => ({ items: [] }),
        loadPrefs: async () => ({}),
        savePrefs: async () => {},
        appendAudit: async () => {},
        loadCache: async () => ({ entries: {} }),
        saveCache: async () => {},
        statImpl: async () => ({ ok: true, size: 100, mtimeMs: 1 }),
        realpathImpl: async (target) => target,
        imohashImpl: async () => ({ ok: true, imohash: 'imo:fresh' }),
        fetchImpl: async (url) => {
            if (String(url).includes('/movie/')) {
                return { ok: true, json: async () => ({ original_language: 'en' }) };
            }
            return { ok: false, json: async () => ({}) };
        },
        execImpl: async (bin, args = []) => {
            bins.push(bin);
            if (args.includes('-version')) {
                return { ok: true, code: 0, timedOut: false, stdout: `${bin} version`, stderr: '' };
            }
            if (bin === 'mkvmerge' && args.includes('-J')) {
                return {
                    ok: true,
                    code: 0,
                    timedOut: false,
                    stdout: JSON.stringify({
                        container: { properties: { title: '' } },
                        tracks: [
                            { id: 0, type: 'video', properties: {} },
                            { id: 1, type: 'audio', properties: { language: 'eng', audio_channels: 6 } },
                        ],
                    }),
                    stderr: '',
                };
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
            return { ok: true, code: 0, timedOut: false, stdout: '', stderr: '' };
        },
    });

    const result = await integrity.escalateMismatch({
        upgraderEnabled: true,
        qcIntegrityEnabled: true,
        qcTrimEnabled: true,
        tmdbApiKey: 'test-key',
        qcIntegrityPathMaps: [{ from: '/movies', to: '/movies' }],
    }, {
        key: 'radarr:r1:1:file:7',
        title: 'Dune',
        tmdbId: 438631,
        filePath: '/movies/Dune.mkv',
        mediaKind: 'video',
        mediaType: 'movie',
        arrType: 'radarr',
        arrInstanceId: 'r1',
        entityId: 1,
        movieFileId: 7,
    }, {
        imohash: 'imo:old',
        size: 100,
        mtimeMs: 1,
        playabilityAt: '2026-01-01T00:00:00.000Z',
    });

    assert.equal(result.ok, true);
    assert.ok(bins.includes('mkvmerge'));
    assert.equal(result.cacheEntry?.imohash, 'imo:fresh');
});

test('trim dry-run scan writes a keep/drop preview, not findings', async () => {
    let cache = { entries: {} };
    let prefs = {};
    const integrity = createQcIntegrity({
        request: async () => ({}),
        loadIndex: async () => ({
            generatedAt: '2026-08-09T00:00:00.000Z',
            items: [{
                ratingKey: 'radarr:r1:1',
                title: 'Eternal Sunshine',
                hasFile: true,
                mediaType: 'movie',
                arrType: 'radarr',
                arrInstanceId: 'r1',
                entityId: 1,
                movieFileId: 7,
                filePath: '/movies/Eternal.mkv',
                libraryKey: 'radarr:r1:movies',
                libraryName: 'Movies',
                tmdbId: 38,
            }],
        }),
        loadPrefs: async () => prefs,
        savePrefs: async (next) => { prefs = next; },
        appendAudit: async () => {},
        loadCache: async () => cache,
        saveCache: async (next) => { cache = next; },
        fetchImpl: async (url) => {
            if (String(url).includes('/movie/38')) {
                return { ok: true, json: async () => ({ original_language: 'en' }) };
            }
            return { ok: false, json: async () => ({}) };
        },
        statImpl: async () => ({ ok: true, size: 100, mtimeMs: 1 }),
        realpathImpl: async (target) => target,
        execImpl: async (bin, args = []) => {
            if (args.some((arg) => String(arg).includes('version'))) {
                return { ok: true, code: 0, timedOut: false, stdout: `${bin} version`, stderr: '' };
            }
            if (bin === 'mkvmerge' && args.includes('-J')) {
                return {
                    ok: true,
                    code: 0,
                    timedOut: false,
                    stdout: JSON.stringify({
                        container: { properties: { title: '' } },
                        tracks: [
                            { id: 0, type: 'video', properties: {} },
                            { id: 1, type: 'audio', properties: { language: 'eng', audio_channels: 6 } },
                            {
                                id: 2,
                                type: 'audio',
                                properties: {
                                    language: 'eng',
                                    audio_channels: 2,
                                    track_name: 'Director Commentary',
                                },
                            },
                            { id: 3, type: 'subtitles', properties: { language: 'eng' } },
                            { id: 4, type: 'subtitles', properties: { language: 'ger', track_name: 'German' } },
                        ],
                    }),
                    stderr: '',
                };
            }
            return { ok: true, code: 0, timedOut: false, stdout: '', stderr: '' };
        },
    });

    const result = await integrity.scanIntegrity(withTestMaps({
        upgraderEnabled: true,
        qcIntegrityEnabled: true,
        qcTrimEnabled: true,
        tmdbApiKey: 'test-key',
        qcIntegrityPathMaps: [{ from: '/movies', to: '/movies' }],
        arrInstances: [{
            id: 'r1', type: 'radarr', name: 'Radarr', url: 'http://radarr.local', apiKey: 'x', enabled: true,
        }],
    }), { dryRun: true, force: true, full: true, mode: 'trim' });

    assert.equal(result.ran, true);
    assert.equal(result.findingCount, 0);
    assert.equal(result.wouldRemux, 1);
    assert.equal(result.trimPreview.summary.wouldRemux, 1);
    assert.equal(result.trimPreview.items[0].title, 'Eternal Sunshine');
    assert.ok(result.trimPreview.items[0].audioDrop.some((label) => /Commentary/i.test(label)));
    assert.ok(result.trimPreview.items[0].subDrop.some((label) => /ger/i.test(label)));
    assert.equal((prefs.integrityFindings || []).length, 0);

    const status = await integrity.getStatus({
        upgraderEnabled: true,
        qcIntegrityEnabled: true,
    });
    assert.equal(status.trimPreview.summary.wouldRemux, 1);
});

test('trim scan alerts and skips remux when original language is unknown', async () => {
    let prefs = {};
    const integrity = createQcIntegrity({
        request: async () => ({}),
        loadIndex: async () => ({
            generatedAt: '2026-08-09T00:00:00.000Z',
            items: [{
                ratingKey: 'radarr:r1:1',
                title: 'Mystery Film',
                hasFile: true,
                mediaType: 'movie',
                arrType: 'radarr',
                arrInstanceId: 'r1',
                entityId: 1,
                movieFileId: 7,
                filePath: '/movies/Mystery.mkv',
                libraryKey: 'radarr:r1:movies',
                libraryName: 'Movies',
            }],
        }),
        loadPrefs: async () => prefs,
        savePrefs: async (next) => { prefs = next; },
        appendAudit: async () => {},
        loadCache: async () => ({ entries: {} }),
        saveCache: async () => {},
        fetchImpl: async () => ({ ok: false, json: async () => ({}) }),
        statImpl: async () => ({ ok: true, size: 100, mtimeMs: 1 }),
        realpathImpl: async (target) => target,
        execImpl: async (bin, args = []) => {
            if (args.some((arg) => String(arg).includes('version'))) {
                return { ok: true, code: 0, timedOut: false, stdout: `${bin} version`, stderr: '' };
            }
            return { ok: true, code: 0, timedOut: false, stdout: '', stderr: '' };
        },
    });

    const result = await integrity.scanIntegrity(withTestMaps({
        upgraderEnabled: true,
        qcIntegrityEnabled: true,
        qcTrimEnabled: true,
        tmdbApiKey: 'test-key',
        qcIntegrityPathMaps: [{ from: '/movies', to: '/movies' }],
        arrInstances: [{
            id: 'r1', type: 'radarr', name: 'Radarr', url: 'http://radarr.local', apiKey: 'x', enabled: true,
        }],
    }), { dryRun: true, force: true, full: true, mode: 'trim' });

    assert.equal(result.ran, true);
    assert.equal(result.wouldRemux, 0);
    assert.equal(result.findingCount, 1);
    assert.equal(result.findings[0].reason, 'trim_native_unknown');
    assert.equal((prefs.integrityFindings || [])[0]?.reason, 'trim_native_unknown');
});

test('trim skips music imports without native-language alerts', async () => {
    let prefs = {};
    let cache = { entries: {} };
    const posts = [];
    const tmdbCalls = [];
    const integrity = createQcIntegrity({
        request: async () => ({}),
        loadIndex: async () => ({ items: [] }),
        loadPrefs: async () => prefs,
        savePrefs: async (next) => { prefs = next; },
        appendAudit: async () => {},
        loadCache: async () => cache,
        saveCache: async (next) => { cache = next; },
        getDiscordNotifier: () => ({
            postAdminEvent: async (_config, payload) => { posts.push(payload); },
        }),
        fetchImpl: async (url) => {
            tmdbCalls.push(String(url));
            return { ok: false, json: async () => ({}) };
        },
        imohashImpl: async () => ({ ok: true, imohash: 'imo:track' }),
        statImpl: async () => ({ ok: true, size: 100, mtimeMs: 1 }),
        realpathImpl: async (target) => target,
        execImpl: async (bin, args = []) => {
            if (String(bin) === 'ffprobe' || args.includes('-show_streams')) {
                return {
                    ok: true,
                    code: 0,
                    timedOut: false,
                    stdout: JSON.stringify({
                        format: { duration: '210' },
                        streams: [{ codec_type: 'audio' }],
                    }),
                    stderr: '',
                };
            }
            return { ok: true, code: 0, timedOut: false, stdout: `${bin} ok`, stderr: '' };
        },
    });

    const result = await integrity.baselineImport({
        upgraderEnabled: true,
        qcIntegrityEnabled: true,
        qcTrimEnabled: true,
        qcIntegrityDiscordDigestEnabled: true,
        tmdbApiKey: 'test-key',
        qcIntegrityPathMaps: [{ from: '/media', to: '/media' }],
        arrInstances: [{
            id: 'l1', type: 'lidarr', name: 'Lidarr', url: 'http://lidarr.local', apiKey: 'x', enabled: true,
        }],
    }, {
        arrType: 'lidarr',
        arrInstanceId: 'l1',
        entityId: 9,
        trackFileId: 44,
        mediaType: 'album',
        mediaKind: 'audio',
        title: 'TANZNEID',
        filePath: '/media/current/music/artists/Electric Callboy/2026-TANZNEID/01-10-Electric Callboy-TANZNEID-Revery.mp3',
        ratingKey: 'lidarr:l1:9',
        key: 'lidarr:l1:9:file:44',
    });

    assert.equal(result.ran, true);
    assert.equal(result.ok, true);
    assert.equal((prefs.integrityFindings || []).some((row) => row.reason === 'trim_native_unknown'), false);
    assert.equal(posts.some((row) => /original language/i.test(row?.title || '')), false);
    assert.equal(tmdbCalls.length, 0);
    assert.ok(cache.entries['lidarr:l1:9:file:44']?.imohash);
});

test('trim scan ignores audio tracks', async () => {
    const integrity = createQcIntegrity({
        request: async () => ({}),
        loadIndex: async () => ({
            generatedAt: '2026-08-09T00:00:00.000Z',
            items: [{
                ratingKey: 'lidarr:l1:9',
                title: 'TANZNEID',
                hasFile: true,
                mediaType: 'album',
                arrType: 'lidarr',
                arrInstanceId: 'l1',
                entityId: 9,
                trackFiles: [{
                    trackFileId: 44,
                    filePath: '/music/Electric Callboy/TANZNEID.mp3',
                }],
            }],
        }),
        loadPrefs: async () => ({}),
        savePrefs: async () => {},
        appendAudit: async () => {},
        loadCache: async () => ({ entries: {} }),
        saveCache: async () => {},
        fetchImpl: async () => {
            throw new Error('native lookup should not run for music');
        },
        statImpl: async () => ({ ok: true, size: 100, mtimeMs: 1 }),
        realpathImpl: async (target) => target,
        execImpl: async (bin) => ({ ok: true, code: 0, timedOut: false, stdout: `${bin} ok`, stderr: '' }),
    });

    const result = await integrity.scanIntegrity(withTestMaps({
        upgraderEnabled: true,
        qcIntegrityEnabled: true,
        qcTrimEnabled: true,
        qcIntegrityIncludeMusic: true,
        tmdbApiKey: 'test-key',
        qcIntegrityPathMaps: [{ from: '/music', to: '/music' }],
        arrInstances: [{
            id: 'l1', type: 'lidarr', name: 'Lidarr', url: 'http://lidarr.local', apiKey: 'x', enabled: true,
        }],
    }), { dryRun: true, force: true, full: true, mode: 'trim' });

    assert.equal(result.ran, true);
    assert.equal(result.findingCount, 0);
    assert.equal(result.wouldRemux || 0, 0);
});

test('baselineImport refreshes Plex path after successful pipeline', async () => {
    let prefs = {};
    let cache = { entries: {} };
    const plexCalls = [];
    const integrity = createQcIntegrity({
        request: async () => ({}),
        loadIndex: async () => ({ items: [] }),
        loadPrefs: async () => prefs,
        savePrefs: async (next) => { prefs = next; },
        appendAudit: async () => {},
        loadCache: async () => cache,
        saveCache: async (next) => { cache = next; },
        resolvePlexUri: async () => 'http://plex.local:32400',
        fetchImpl: async (url) => {
            plexCalls.push(String(url));
            if (String(url).includes('/library/sections?')) {
                return {
                    ok: true,
                    json: async () => ({
                        MediaContainer: {
                            Directory: [{
                                key: '3',
                                type: 'movie',
                                title: 'Movies',
                                Location: [{ path: '/movies' }],
                            }],
                        },
                    }),
                };
            }
            return { ok: true, json: async () => ({}) };
        },
        imohashImpl: async () => ({ ok: true, imohash: 'imo:plex' }),
        statImpl: async () => ({ ok: true, size: 100, mtimeMs: 1 }),
        realpathImpl: async (target) => target,
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
            return { ok: true, code: 0, timedOut: false, stdout: '', stderr: '' };
        },
    });

    const result = await integrity.baselineImport({
        upgraderEnabled: true,
        qcIntegrityEnabled: true,
        plexToken: 'tok',
        qcIntegrityPathMaps: [{ from: '/movies', to: '/movies' }],
        arrInstances: [{
            id: 'r1', type: 'radarr', name: 'Radarr', url: 'http://radarr.local', apiKey: 'x', enabled: true,
        }],
    }, {
        ratingKey: 'radarr:r1:1',
        title: 'Plex Refresh',
        arrType: 'radarr',
        arrInstanceId: 'r1',
        entityId: 1,
        movieFileId: 9,
        mediaType: 'movie',
        filePath: '/movies/Plex Refresh (2024)/Plex.Refresh.mkv',
    });

    assert.equal(result.ok, true);
    assert.ok(plexCalls.some((url) => url.includes('/library/sections/3/refresh?path=')));
    assert.ok(plexCalls.some((url) => decodeURIComponent(url).includes('/movies/Plex Refresh (2024)')));
});

test('cancelScanIntegrity stops a running full scan', async () => {
    let prefs = {};
    let cache = { entries: {} };
    let started = 0;
    let finished = 0;
    const integrity = createQcIntegrity({
        request: async () => ({}),
        loadIndex: async () => ({
            generatedAt: '2026-08-11T00:00:00.000Z',
            items: Array.from({ length: 8 }, (_, i) => ({
                ratingKey: `radarr:r1:${i + 1}`,
                title: `Film ${i + 1}`,
                hasFile: true,
                mediaType: 'movie',
                arrType: 'radarr',
                arrInstanceId: 'r1',
                entityId: i + 1,
                movieFileId: i + 1,
                filePath: `/movies/Film${i + 1}.mkv`,
                libraryKey: 'radarr:r1:movies',
                libraryName: 'Movies',
            })),
        }),
        loadPrefs: async () => prefs,
        savePrefs: async (next) => { prefs = next; },
        appendAudit: async () => {},
        loadCache: async () => cache,
        saveCache: async (next) => { cache = next; },
        imohashImpl: async (filePath) => {
            started += 1;
            await new Promise((resolve) => setTimeout(resolve, 40));
            finished += 1;
            return { ok: true, imohash: `imo:${filePath}` };
        },
        statImpl: async () => ({ ok: true, size: 10, mtimeMs: 1 }),
        realpathImpl: async (target) => target,
        execImpl: async (bin, args = []) => {
            if (args.includes('-version')) {
                return { ok: true, code: 0, timedOut: false, stdout: `${bin} version`, stderr: '' };
            }
            return { ok: true, code: 0, timedOut: false, stdout: '', stderr: '' };
        },
    });

    const cfg = {
        upgraderEnabled: true,
        qcIntegrityEnabled: true,
        qcIntegrityConcurrency: 1,
        qcIntegrityPathMaps: [{ from: '/movies', to: '/movies' }],
        arrInstances: [{
            id: 'r1', type: 'radarr', name: 'Radarr', url: 'http://radarr.local', apiKey: 'x', enabled: true,
        }],
    };

    const startedScan = integrity.beginScanIntegrity(cfg, {
        dryRun: true,
        force: true,
        full: true,
        mode: 'imohash',
    });
    assert.equal(startedScan.started, true);

    await new Promise((resolve) => setTimeout(resolve, 30));
    const cancel = integrity.cancelScanIntegrity();
    assert.equal(cancel.cancelled, true);

    for (let i = 0; i < 50; i += 1) {
        if (!integrity.scanning) break;
        await new Promise((resolve) => setTimeout(resolve, 40));
    }
    assert.equal(integrity.scanning, false);
    assert.equal(prefs.integrityLastScan?.cancelled, true);
    assert.ok(finished < 8, `expected partial finish, got ${finished}`);
    assert.ok(started >= 1);
});
