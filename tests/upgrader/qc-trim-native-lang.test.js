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

test('lookupTrimNativeLanguage uses TMDb original_language for movies', async () => {
    const calls = [];
    const result = await lookupTrimNativeLanguage({
        tmdbApiKey: 'test-key',
        qcTrimKeepNativeAudio: true,
    }, {
        title: 'Your Name.',
        mediaType: 'movie',
        tmdbId: 372058,
    }, {
        fetchImpl: async (url) => {
            calls.push(String(url));
            return {
                ok: true,
                json: async () => ({ original_language: 'ja' }),
            };
        },
    });
    assert.equal(result.code, 'jpn');
    assert.equal(result.source, 'tmdb');
    assert.ok(calls.some((url) => url.includes('/movie/372058')));
});

test('lookupTrimNativeLanguage prefers TVDB for shows then TMDb', async () => {
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

test('lookupTrimNativeLanguage reads tmdb id from NFO when Arr id missing', async () => {
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

test('lookupTrimNativeLanguage anime folder is last resort only', async () => {
    const result = await lookupTrimNativeLanguage({
        qcTrimKeepNativeAudio: true,
    }, {
        title: 'Unknown Anime',
        mediaType: 'movie',
        libraryBucket: 'anime',
    }, {
        fetchImpl: async () => ({ ok: false }),
    });
    assert.equal(result.code, 'jpn');
    assert.equal(result.source, 'anime-library');
});
