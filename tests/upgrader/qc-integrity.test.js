import test from 'node:test';
import assert from 'node:assert/strict';
import {
    collectIntegrityCandidates,
    createQcIntegrity,
    mapArrPath,
    scheduleDecodeWindows,
} from '../../lib/upgrader/qc-integrity.js';

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

test('collectIntegrityCandidates flattens movie and episode files', () => {
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
            hasFile: true,
        },
    ]);
    assert.equal(candidates.length, 2);
    assert.equal(candidates[0].movieFileId, 44);
    assert.equal(candidates[1].episodeFileId, 11);
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
            // Fail first decode window
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
    }, { dryRun: true, replaceFindings: false, force: true });

    assert.equal(result.ran, true);
    assert.equal(result.findingCount, 1);
    assert.equal(result.findings[0].reason, 'decode_start');
    assert.equal(requests.length, 0);
});

test('replaceCorrupt deletes moviefile then searches', async () => {
    const requests = [];
    const integrity = createQcIntegrity({
        request: async (instance, path, options = {}) => {
            requests.push({ path, method: options.method || 'GET', body: options.body });
            return { id: 1 };
        },
        loadIndex: async () => ({ items: [] }),
        loadPrefs: async () => ({}),
        savePrefs: async () => {},
        appendAudit: async () => {},
        loadCache: async () => ({ entries: {} }),
        saveCache: async () => {},
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
});
