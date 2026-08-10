import test from 'node:test';
import assert from 'node:assert/strict';
import {
    pickPlexRefreshTarget,
    refreshPlexPathAfterImport,
    resolvePlexScanPath,
} from '../../lib/upgrader/qc-plex-refresh.js';

test('resolvePlexScanPath remounts via shared path suffix', () => {
    const plex = resolvePlexScanPath(
        '/media/current/movies/Foo/Foo.mkv',
        ['/mnt/user/media/current/movies'],
    );
    assert.equal(plex, '/mnt/user/media/current/movies/Foo/Foo.mkv');
});

test('resolvePlexScanPath uses direct prefix when mounts match', () => {
    const plex = resolvePlexScanPath(
        '/mnt/user/movies/Bar/Bar.mkv',
        ['/mnt/user/movies'],
    );
    assert.equal(plex, '/mnt/user/movies/Bar/Bar.mkv');
});

test('pickPlexRefreshTarget picks movie section folder', () => {
    const target = pickPlexRefreshTarget({
        mediaType: 'movie',
        filePaths: ['/media/movies/Title (2020)/Title.mkv'],
        sections: [
            {
                key: '1',
                type: 'movie',
                title: 'Movies',
                Location: [{ path: '/mnt/user/media/movies' }],
            },
            {
                key: '2',
                type: 'show',
                title: 'TV',
                Location: [{ path: '/mnt/user/media/tv' }],
            },
        ],
    });
    assert.deepEqual(target, {
        sectionKey: '1',
        sectionTitle: 'Movies',
        path: '/mnt/user/media/movies/Title (2020)',
        filePath: '/mnt/user/media/movies/Title (2020)/Title.mkv',
    });
});

test('refreshPlexPathAfterImport queues partial scan', async () => {
    const calls = [];
    const result = await refreshPlexPathAfterImport({
        config: { plexToken: 'tok', qcIntegrityPlexRefreshAfterImport: true },
        resolvePlexUri: async () => 'http://plex.local:32400',
        arrPath: '/movies/X/X.mkv',
        mappedPath: '/media/movies/X/X.mkv',
        mediaType: 'movie',
        fetchImpl: async (url) => {
            calls.push(String(url));
            if (String(url).includes('/library/sections?')) {
                return {
                    ok: true,
                    json: async () => ({
                        MediaContainer: {
                            Directory: [{
                                key: '9',
                                type: 'movie',
                                title: 'Movies',
                                Location: [{ path: '/mnt/user/movies' }],
                            }],
                        },
                    }),
                };
            }
            return { ok: true, json: async () => ({}) };
        },
    });
    assert.equal(result.ok, true);
    assert.equal(result.sectionKey, '9');
    assert.equal(result.path, '/mnt/user/movies/X');
    assert.ok(calls.some((url) => url.includes('/library/sections/9/refresh?path=')));
});

test('refreshPlexPathAfterImport respects disabled toggle', async () => {
    const result = await refreshPlexPathAfterImport({
        config: { plexToken: 'tok', qcIntegrityPlexRefreshAfterImport: false },
        resolvePlexUri: async () => 'http://plex.local:32400',
        arrPath: '/movies/X/X.mkv',
    });
    assert.equal(result.skipped, true);
    assert.equal(result.reason, 'disabled');
});
