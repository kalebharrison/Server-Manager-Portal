import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildJellyfinWatchUrl,
    buildPlexWatchUrl,
    createLibraryDeepLinkResolver,
} from '../../lib/media/library-deep-link.js';

test('watch URLs encode plex rating keys and jellyfin ids', () => {
    assert.equal(
        buildPlexWatchUrl('abc123', '987'),
        'https://app.plex.tv/desktop/#!/server/abc123/details?key=%2Flibrary%2Fmetadata%2F987',
    );
    assert.equal(
        buildJellyfinWatchUrl('https://jf.example', 'item-1'),
        'https://jf.example/web/#/details?id=item-1',
    );
});

test('resolver finds plex by tmdb guid then jellyfin by provider id', async () => {
    const calls = [];
    const resolver = createLibraryDeepLinkResolver({
        getPlexConnectionUri: async () => 'http://plex.local:32400',
        resolveIntegrationUrlForFetch: async (url) => url,
        fetchImpl: async (url) => {
            calls.push(url);
            if (String(url).includes('/library/all')) {
                return {
                    ok: true,
                    json: async () => ({ MediaContainer: { Metadata: [{ ratingKey: '55' }] } }),
                };
            }
            if (String(url).includes('/Items?')) {
                return {
                    ok: true,
                    json: async () => ({ Items: [{ Id: 'jf9', ProviderIds: { Tmdb: '42' } }] }),
                };
            }
            return { ok: false, json: async () => ({}) };
        },
    });

    const links = await resolver.resolve({
        mediaServerType: 'plex',
        plexToken: 't',
        serverIdentifier: 'srv',
        jellyfinUrl: 'https://jf.example',
        jellyfinApiKey: 'k',
    }, { mediaType: 'movie', tmdbId: 42, title: 'Dune', year: 2021 });

    assert.deepEqual(links.map((link) => link.label), ['Plex', 'Jellyfin']);
    assert.match(links[0].url, /metadata%2F55/);
    assert.match(links[1].url, /id=jf9/);
    assert.ok(calls.some((url) => String(url).includes('tmdb%3A%2F%2F42') || String(url).includes('tmdb://42')));
});

test('resolver falls back to tvdb provider ids', async () => {
    const resolver = createLibraryDeepLinkResolver({
        getPlexConnectionUri: async () => 'http://plex.local:32400',
        fetchImpl: async (url) => {
            if (String(url).includes('tvdb%3A%2F%2F99') || String(url).includes('tvdb://99')) {
                return {
                    ok: true,
                    json: async () => ({ MediaContainer: { Metadata: [{ ratingKey: '77' }] } }),
                };
            }
            if (String(url).includes('Tvdb.99')) {
                return {
                    ok: true,
                    json: async () => ({ Items: [{ Id: 'jf-tv' }] }),
                };
            }
            return { ok: true, json: async () => ({ MediaContainer: {}, Items: [] }) };
        },
    });
    const links = await resolver.resolve({
        mediaServerType: 'plex',
        plexToken: 't',
        serverIdentifier: 'srv',
        jellyfinUrl: 'https://jf.example',
        jellyfinApiKey: 'k',
    }, { mediaType: 'tv', title: 'Show', tvdbId: 99 });
    assert.deepEqual(links.map((link) => link.label), ['Plex', 'Jellyfin']);
    assert.match(links[0].url, /metadata%2F77/);
    assert.match(links[1].url, /id=jf-tv/);
});
