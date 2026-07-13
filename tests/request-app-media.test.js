import assert from 'node:assert/strict';
import test from 'node:test';

import {
    filterMediaItems,
    findRequestState,
    mediaStatusLabel,
    normalizeIssueType,
    normalizeMediaItem,
    normalizeRequestItem,
    requestStatusLabel,
    seerrImageUrl,
    tmdbImageUrl,
} from '../lib/request-app-media.js';

test('request app media helpers preserve image URL and status behavior', () => {
    assert.equal(tmdbImageUrl('/poster.jpg', 'w342'), 'https://image.tmdb.org/t/p/w342/poster.jpg');
    assert.equal(tmdbImageUrl('https://cdn.example/poster.jpg', 'w342'), 'https://cdn.example/poster.jpg');
    assert.equal(seerrImageUrl('http://seerr/', 'poster.jpg', 'w342'), 'http://seerr/imageproxy/tmdb/t/p/w342/poster.jpg');
    assert.equal(requestStatusLabel(2), 'approved');
    assert.equal(mediaStatusLabel(4), 'partially_available');
    assert.equal(normalizeIssueType('subtitles'), 3);
    assert.equal(normalizeIssueType('unexpected'), 4);

    assert.deepEqual(findRequestState({ mediaInfo: { status: 3, requests: [{ id: 9, status: 2 }] } }), {
        requestId: 9,
        requestStatus: 2,
        requestStatusLabel: 'approved',
        mediaStatus: 3,
        mediaStatusLabel: 'processing',
        available: false,
        processing: false,
        requested: true,
        pending: false,
        approved: true,
        canRequest: false,
    });
});

test('request app media normalization maps Seerr detail fields without losing metadata', () => {
    const item = normalizeMediaItem({
        id: 42,
        mediaType: 'show',
        name: 'Series title',
        first_air_date: '2024-01-02',
        poster_path: '/poster.jpg',
        backdrop_path: '/backdrop.jpg',
        vote_average: 8.25,
        original_language: 'ja',
        episode_run_time: [48],
        external_ids: { imdb_id: 'tt42', tvdb_id: 84 },
        genre_ids: [16, 18],
        production_companies: [{ id: 1, name: 'Studio', logo_path: '/studio.png' }],
        networks: [{ id: 2, name: 'Network' }],
        credits: {
            cast: [
                { id: 3, name: 'Actor', character: 'Lead', profile_path: '/actor.jpg' },
                { id: 4, name: 'Actor', character: 'Lead' },
            ],
        },
        created_by: [{ id: 5, name: 'Creator' }],
        seasons: [{ season_number: 0, episode_count: 2, status: 1 }],
        mediaInfo: { id: 6, status: 5 },
    }, 'http://seerr/', (url) => `/poster?url=${encodeURIComponent(url)}`);

    assert.equal(item.mediaType, 'tv');
    assert.equal(item.title, 'Series title');
    assert.equal(item.year, '2024');
    assert.equal(item.posterUrl, '/poster?url=https%3A%2F%2Fimage.tmdb.org%2Ft%2Fp%2Fw342%2Fposter.jpg');
    assert.equal(item.backdropUrl, 'https://image.tmdb.org/t/p/w1280/backdrop.jpg');
    assert.equal(item.runtime, 48);
    assert.equal(item.imdbId, 'tt42');
    assert.equal(item.tvdbId, 84);
    assert.equal(item.network, 'Network');
    assert.equal(item.studio, 'Studio');
    assert.deepEqual(item.genres, [{ id: 16, name: 'Animation' }, { id: 18, name: 'Drama' }]);
    assert.deepEqual(item.seasons, [{ seasonNumber: 0, name: 'Specials', episodeCount: 2, status: 1, statusLabel: 'pending' }]);
    assert.equal(item.cast.length, 1);
    assert.equal(item.available, true);
    assert.equal(item.canRequest, false);
});

test('request normalization and discovery filters retain request-app semantics', () => {
    const request = normalizeRequestItem({
        id: 7,
        status: 1,
        type: 'tv',
        is4k: true,
        requestedBy: { username: 'viewer', avatar: 'avatar.png' },
        media: { tmdbId: 77, name: 'Requested show', firstAirDate: '2023-04-05', posterPath: '/show.jpg' },
    }, 'http://seerr/');

    assert.equal(request.statusLabel, 'pending');
    assert.equal(request.requestedBy.avatar, 'http://seerr/avatar.png');
    assert.equal(request.seerrUrl, 'http://seerr/requests');
    assert.equal(request.is4k, true);

    const items = [
        { title: 'English', mediaType: 'movie', originalLanguage: 'en', genres: [] },
        { title: 'Anime', mediaType: 'tv', originalLanguage: 'ja', genres: [{ id: 16 }] },
        { title: 'Foreign', mediaType: 'movie', originalLanguage: 'fr', genres: [{ id: 18 }] },
    ];
    assert.deepEqual(filterMediaItems(items, 'all', false, false).map((item) => item.title), ['English']);
    assert.deepEqual(filterMediaItems(items, 'all', true, true).map((item) => item.title), ['Anime', 'Foreign']);
    assert.deepEqual(filterMediaItems(items, 'movie', false, true, 18).map((item) => item.title), ['Foreign']);
});
