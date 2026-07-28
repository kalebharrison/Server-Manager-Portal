import assert from 'node:assert/strict';
import test from 'node:test';

import { tmdbIdFromPlexMedia } from '../../lib/plex/plex-guid-utils.js';
import { enrichRecentItemsWithTmdbPosters } from '../../lib/plex/plex-recent-tmdb.js';

test('tmdbIdFromPlexMedia reads Guid and guid fields', () => {
    assert.equal(tmdbIdFromPlexMedia({ Guid: [{ id: 'imdb://tt1' }, { id: 'tmdb://550' }] }), 550);
    assert.equal(tmdbIdFromPlexMedia({ guid: 'tmdb://123' }), 123);
    assert.equal(tmdbIdFromPlexMedia({ Guid: [{ id: 'tvdb://99' }] }), null);
});

test('enrichRecentItemsWithTmdbPosters attaches thumbUrl from TMDB', async () => {
    const calls = [];
    const fetchImpl = async (url) => {
        calls.push(String(url));
        return {
            ok: true,
            json: async () => ({ poster_path: '/abc.jpg' }),
        };
    };
    const [item] = await enrichRecentItemsWithTmdbPosters(
        { tmdbApiKey: 'key' },
        [{ title: 'Fight Club', tmdbId: 550, thumb: '/plex' }],
        { mediaType: 'movie', fetchImpl },
    );
    assert.match(calls[0], /\/movie\/550\?/);
    assert.equal(item.thumbUrl, 'https://image.tmdb.org/t/p/w342/abc.jpg');
    assert.equal(item.posterPath, '/abc.jpg');
});
