import test from 'node:test';
import assert from 'node:assert/strict';
import {
    RECENT_IMPORT_WINDOW_MS,
    collectRecentImportPayloads,
    historyRecordToIntegrityStub,
    importBaselineSatisfied,
    missingImportChecks,
    isSuccessfulImportHistoryEvent,
} from '../../lib/upgrader/qc-integrity-recent-imports.js';
import { createQcIntegrity } from '../../lib/upgrader/qc-integrity.js';

const radarr = { id: 'r1', type: 'radarr', name: 'Radarr', url: 'http://radarr.local', apiKey: 'x', enabled: true };
const sonarr = { id: 's1', type: 'sonarr', name: 'Sonarr', url: 'http://sonarr.local', apiKey: 'x', enabled: true };

test('import history event filter keeps downloadFolderImported only', () => {
    assert.equal(isSuccessfulImportHistoryEvent('downloadFolderImported'), true);
    assert.equal(isSuccessfulImportHistoryEvent('DownloadImported'), true);
    assert.equal(isSuccessfulImportHistoryEvent('grabbed'), false);
    assert.equal(isSuccessfulImportHistoryEvent('downloadFailed'), false);
    assert.equal(isSuccessfulImportHistoryEvent('downloadIgnored'), false);
});

test('historyRecordToIntegrityStub maps Radarr importedPath + movieFileId', () => {
    const stub = historyRecordToIntegrityStub('radarr', radarr, {
        eventType: 'downloadFolderImported',
        date: '2026-08-09T12:00:00Z',
        downloadId: 'abc',
        movieId: 9,
        movie: { id: 9, title: 'Dune', year: 2021, tmdbId: 438631 },
        data: { importedPath: '/movies/Dune.mkv', isUpgrade: 'False', movieFileId: '44' },
    });
    assert.equal(stub.arrType, 'radarr');
    assert.equal(stub.entityId, 9);
    assert.equal(stub.movieFileId, 44);
    assert.equal(stub.filePath, '/movies/Dune.mkv');
    assert.equal(stub.isUpgrade, false);
});

test('historyRecordToIntegrityStub maps Sonarr episode import', () => {
    const stub = historyRecordToIntegrityStub('sonarr', sonarr, {
        eventType: 'downloadFolderImported',
        date: '2026-08-09T12:00:00Z',
        seriesId: 3,
        episodeId: 88,
        series: { id: 3, title: 'Severance' },
        episode: {
            id: 88,
            seasonNumber: 1,
            episodeNumber: 2,
            title: 'Half Loop',
            episodeFileId: 501,
        },
        data: { importedPath: '/tv/Severance/S01E02.mkv' },
    });
    assert.equal(stub.episodeFileId, 501);
    assert.equal(stub.seasonNumber, 1);
    assert.equal(stub.episodeNumber, 2);
    assert.equal(stub.filePath, '/tv/Severance/S01E02.mkv');
});

test('missingImportChecks lists every incomplete import step', () => {
    assert.deepEqual(missingImportChecks(null), ['playability', 'imohash']);
    assert.deepEqual(missingImportChecks({ ok: true, imohash: 'x' }), ['playability']);
    assert.deepEqual(missingImportChecks({
        ok: true,
        playabilityAt: '2026-01-01T00:00:00.000Z',
    }), ['imohash']);
    assert.deepEqual(missingImportChecks({
        ok: true,
        playabilityAt: '2026-01-01T00:00:00.000Z',
        imohash: 'imo:1',
    }), []);
    assert.deepEqual(missingImportChecks({
        ok: true,
        playabilityAt: '2026-01-01T00:00:00.000Z',
        imohash: 'imo:1',
    }, { qcIntegrityXxhashEnabled: true }), ['xxhash']);
    assert.deepEqual(missingImportChecks({
        ok: true,
        playabilityAt: '2026-01-01T00:00:00.000Z',
        imohash: 'imo:1',
    }, {
        qcTrimEnabled: true,
        qcIntegrityAutomationEnabled: true,
        qcTrimDryRun: false,
    }, { filePath: '/movies/A.mkv', mediaKind: 'video' }), ['trim']);
    assert.deepEqual(missingImportChecks({
        ok: true,
        playabilityAt: '2026-01-01T00:00:00.000Z',
        imohash: 'imo:1',
    }, {
        qcTrimEnabled: true,
        qcTrimDryRun: true,
    }, { filePath: '/tv/Show.S01E01.mp4', mediaKind: 'video' }), ['trim']);
    assert.deepEqual(missingImportChecks({
        ok: true,
        playabilityAt: '2026-01-01T00:00:00.000Z',
        imohash: 'imo:1',
        trimAt: '2026-01-01T00:00:00.000Z',
        trimProfile: 'not-mkv',
    }, {
        qcTrimEnabled: true,
        qcTrimDryRun: true,
    }, { filePath: '/tv/Show.S01E01.mp4', mediaKind: 'video' }), []);
    assert.equal(importBaselineSatisfied({
        ok: false,
        playabilityAt: '2026-01-01T00:00:00.000Z',
        imohash: 'imo:1',
    }), false);
});

test('collectRecentImportPayloads pages history and drops records older than 24h', async () => {
    const now = Date.parse('2026-08-09T18:00:00.000Z');
    const requests = [];
    const payloads = await collectRecentImportPayloads({
        arrInstances: [radarr],
    }, {
        now,
        sinceMs: RECENT_IMPORT_WINDOW_MS,
        request: async (_instance, reqPath) => {
            requests.push(reqPath);
            return {
                records: [
                    {
                        eventType: 'downloadFolderImported',
                        date: '2026-08-09T12:00:00Z',
                        movieId: 1,
                        movie: { id: 1, title: 'New' },
                        movieFile: { id: 10, path: '/movies/New.mkv' },
                    },
                    {
                        eventType: 'grabbed',
                        date: '2026-08-09T11:00:00Z',
                        movieId: 2,
                        movie: { id: 2, title: 'Grab only' },
                        movieFile: { id: 11, path: '/movies/Grab.mkv' },
                    },
                    {
                        eventType: 'downloadFolderImported',
                        date: '2026-08-08T10:00:00Z',
                        movieId: 3,
                        movie: { id: 3, title: 'Old' },
                        movieFile: { id: 12, path: '/movies/Old.mkv' },
                    },
                ],
            };
        },
    });
    assert.equal(payloads.length, 1);
    assert.equal(payloads[0].key, 'radarr:r1:1:file:10');
    assert.equal(payloads[0].filePath, '/movies/New.mkv');
    assert.ok(String(requests[0]).includes('/api/v3/history'));
});

test('catchUpRecentImports runs import baseline only for incomplete cache rows', async () => {
    let cache = {
        entries: {
            'radarr:r1:1:file:10': {
                ok: true,
                playabilityAt: '2026-08-09T12:05:00.000Z',
                imohash: 'imo:done',
            },
        },
    };
    let prefs = {};
    const now = Date.parse('2026-08-09T18:00:00.000Z');
    const integrity = createQcIntegrity({
        request: async (_instance, reqPath) => {
            if (String(reqPath).includes('/history')) {
                return {
                    records: [
                        {
                            eventType: 'downloadFolderImported',
                            date: '2026-08-09T12:00:00Z',
                            movieId: 1,
                            movie: { id: 1, title: 'Already checked' },
                            movieFile: { id: 10, path: '/movies/Done.mkv' },
                        },
                        {
                            eventType: 'downloadFolderImported',
                            date: '2026-08-09T13:00:00Z',
                            movieId: 2,
                            movie: { id: 2, title: 'Missed hook' },
                            movieFile: { id: 20, path: '/movies/Missed.mkv' },
                        },
                    ],
                };
            }
            return {};
        },
        loadIndex: async () => ({ items: [] }),
        loadPrefs: async () => prefs,
        savePrefs: async (next) => { prefs = next; },
        appendAudit: async () => {},
        loadCache: async () => cache,
        saveCache: async (next) => { cache = next; },
        statImpl: async () => ({ ok: true, size: 100, mtimeMs: 1 }),
        realpathImpl: async (target) => target,
        imohashImpl: async () => ({ ok: true, imohash: 'imo:new' }),
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

    const result = await integrity.catchUpRecentImports({
        upgraderEnabled: true,
        qcIntegrityEnabled: true,
        qcIntegrityPathMaps: [{ from: '/movies', to: '/movies' }],
        arrInstances: [radarr],
    }, { now });

    assert.equal(result.ran, true);
    assert.equal(result.checked, 2);
    assert.equal(result.skipped, 1);
    assert.equal(result.ranImport, 1);
    assert.equal(cache.entries['radarr:r1:1:file:10'].imohash, 'imo:done');
    assert.ok(cache.entries['radarr:r1:2:file:20']?.playabilityAt);
    assert.equal(cache.entries['radarr:r1:2:file:20']?.imohash, 'imo:new');
});

test('catchUpRecentImports fills only missing checks on a recent import', async () => {
    let cache = {
        entries: {
            'radarr:r1:2:file:20': {
                ok: true,
                playabilityAt: '2026-08-09T13:05:00.000Z',
                playabilityOk: true,
                imohash: 'imo:keep',
                size: 100,
                mtimeMs: 1,
            },
        },
    };
    let prefs = {};
    const now = Date.parse('2026-08-09T18:00:00.000Z');
    let hashed = 0;
    const integrity = createQcIntegrity({
        request: async (_instance, reqPath) => {
            if (String(reqPath).includes('/history')) {
                return {
                    records: [{
                        eventType: 'downloadFolderImported',
                        date: '2026-08-09T13:00:00Z',
                        movieId: 2,
                        movie: { id: 2, title: 'Needs hash' },
                        movieFile: { id: 20, path: '/movies/NeedsHash.mkv' },
                    }],
                };
            }
            return {};
        },
        loadIndex: async () => ({ items: [] }),
        loadPrefs: async () => prefs,
        savePrefs: async (next) => { prefs = next; },
        appendAudit: async () => {},
        loadCache: async () => cache,
        saveCache: async (next) => { cache = next; },
        statImpl: async () => ({ ok: true, size: 100, mtimeMs: 1 }),
        realpathImpl: async (target) => target,
        xxhashImpl: async () => {
            hashed += 1;
            return { ok: true, xxhash: 'xx:1' };
        },
        execImpl: async (bin, args = []) => {
            if (args.includes('-version')) {
                return { ok: true, code: 0, timedOut: false, stdout: `${bin} version`, stderr: '' };
            }
            throw new Error(`unexpected exec ${bin}`);
        },
    });

    const result = await integrity.catchUpRecentImports({
        upgraderEnabled: true,
        qcIntegrityEnabled: true,
        qcIntegrityXxhashEnabled: true,
        qcIntegrityPathMaps: [{ from: '/movies', to: '/movies' }],
        arrInstances: [radarr],
    }, { now });

    assert.equal(result.ran, true);
    assert.equal(result.ranImport, 1);
    assert.equal(hashed, 1);
    assert.equal(cache.entries['radarr:r1:2:file:20'].imohash, 'imo:keep');
    assert.equal(cache.entries['radarr:r1:2:file:20'].xxhash, 'xx:1');
    assert.equal(cache.entries['radarr:r1:2:file:20'].playabilityAt, '2026-08-09T13:05:00.000Z');
});
