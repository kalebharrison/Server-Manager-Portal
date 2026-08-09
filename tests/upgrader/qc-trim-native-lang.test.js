import test from 'node:test';
import assert from 'node:assert/strict';

import {
    parseNfoMetadataIds,
    lookupTrimNativeLanguage,
} from '../../lib/upgrader/qc-trim-native-lang.js';

test('parseNfoMetadataIds reads Radarr uniqueid tags', () => {
    const ids = parseNfoMetadataIds(`
      <movie>
        <title>Your Name.</title>
        <uniqueid type="tmdb" default="true">372058</uniqueid>
        <uniqueid type="imdb">tt5311514</uniqueid>
      </movie>
    `);
    assert.equal(ids.tmdbId, '372058');
    assert.equal(ids.imdbId, 'tt5311514');
});

test('movies use TMDb original_language then IMDb find, never spoken list', async () => {
    const calls = [];
    const result = await lookupTrimNativeLanguage({
        tmdbApiKey: 'test-key',
        qcTrimKeepNativeAudio: true,
    }, {
        title: 'Your Name.',
        mediaType: 'movie',
        tmdbId: 372058,
        imdbId: 'tt5311514',
    }, {
        fetchImpl: async (url) => {
            calls.push(String(url));
            if (String(url).includes('/movie/372058')) {
                return { ok: true, json: async () => ({ original_language: 'ja' }) };
            }
            throw new Error(`unexpected ${url}`);
        },
    });
    assert.equal(result.code, 'jpn');
    assert.equal(result.source, 'tmdb');
    assert.equal(calls.length, 1);
});

test('movies fall back to IMDb id via TMDb find original_language', async () => {
    const result = await lookupTrimNativeLanguage({
        tmdbApiKey: 'test-key',
        qcTrimKeepNativeAudio: true,
    }, {
        title: 'Your Name.',
        mediaType: 'movie',
        imdbId: 'tt5311514',
    }, {
        fetchImpl: async (url) => {
            assert.match(String(url), /\/find\/tt5311514/);
            assert.match(String(url), /external_source=imdb_id/);
            return {
                ok: true,
                json: async () => ({
                    movie_results: [{ id: 372058, original_language: 'ja' }],
                    tv_results: [],
                }),
            };
        },
    });
    assert.equal(result.code, 'jpn');
    assert.equal(result.source, 'imdb');
});

test('shows use TVDB originalLanguage before TMDb and IMDb', async () => {
    const result = await lookupTrimNativeLanguage({
        tmdbApiKey: 'tmdb',
        tvdbApiKey: 'tvdb',
        qcTrimKeepNativeAudio: true,
    }, {
        title: 'Cowboy Bebop',
        mediaType: 'show',
        arrType: 'sonarr',
        tmdbId: 1,
        tvdbId: 76885,
        imdbId: 'tt0213338',
    }, {
        fetchImpl: async (url, opts = {}) => {
            if (String(url).includes('/login')) {
                assert.equal(opts.method, 'POST');
                return { ok: true, json: async () => ({ data: { token: 'tok' } }) };
            }
            if (String(url).includes('/series/76885/extended')) {
                return { ok: true, json: async () => ({ data: { originalLanguage: 'jpn' } }) };
            }
            throw new Error(`unexpected ${url}`);
        },
    });
    assert.equal(result.code, 'jpn');
    assert.equal(result.source, 'tvdb');
});

test('lookup reads tmdb id from NFO when Arr id missing', async () => {
    const result = await lookupTrimNativeLanguage({
        tmdbApiKey: 'test-key',
        qcTrimKeepNativeAudio: true,
    }, {
        title: 'Your Name.',
        mediaType: 'movie',
    }, {
        localPath: '/media/anime/Your.Name.mkv',
        statImpl: async (target) => ({ ok: String(target).endsWith('.nfo') }),
        readFileImpl: async () => '<movie><uniqueid type="tmdb">372058</uniqueid></movie>',
        fetchImpl: async () => ({
            ok: true,
            json: async () => ({ original_language: 'ja' }),
        }),
    });
    assert.equal(result.code, 'jpn');
    assert.equal(result.source, 'tmdb');
});

test('unresolved native language does not guess anime folder', async () => {
    const result = await lookupTrimNativeLanguage({
        qcTrimKeepNativeAudio: true,
    }, {
        title: 'Unknown Anime',
        mediaType: 'movie',
        libraryBucket: 'anime',
    }, {
        fetchImpl: async () => ({ ok: false }),
    });
    assert.equal(result.code, null);
    assert.equal(result.source, 'unresolved');
});
