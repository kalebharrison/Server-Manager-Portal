import assert from 'node:assert/strict';
import test from 'node:test';

import {
    createDiscordRequestApp,
    toDiscordMediaItem,
    toDiscordRequestItem,
} from '../../lib/discord/discord-request-app.js';

test('toDiscordMediaItem normalizes TMDB search rows', () => {
    const item = toDiscordMediaItem({
        id: 42,
        mediaType: 'movie',
        title: 'Dune',
        releaseDate: '2021-10-22',
        posterPath: '/dune.jpg',
        voteAverage: 8.1,
        overview: 'Sand.',
    });
    assert.equal(item.tmdbId, 42);
    assert.equal(item.mediaType, 'movie');
    assert.equal(item.year, 2021);
    assert.equal(item.canRequest, true);
});

test('toDiscordRequestItem maps portal admin DTOs', () => {
    const item = toDiscordRequestItem({
        id: 9,
        type: 'tv',
        tmdbId: 1396,
        title: 'Breaking Bad',
        status: 1,
        statusLabel: 'Pending',
        requestedBy: { displayName: 'Kaleb', username: 'kaleb' },
        posterPath: '/bb.jpg',
    });
    assert.equal(item.mediaType, 'tv');
    assert.equal(item.pending, true);
    assert.equal(item.canRequest, false);
    assert.equal(item.requestedBy, 'Kaleb');
});

test('createDiscordRequestApp searches and requests through portal seams', async () => {
    const created = [];
    const app = createDiscordRequestApp({
        loadFile: async () => ({ tmdbApiKey: 'test' }),
        configPath: '/tmp/config.json',
        usersPath: '/tmp/users.json',
        configDir: '/tmp',
        createRouter: () => ({
            fetchPath: async (path, query = {}) => {
                if (path === '/search') {
                    assert.equal(query.query, 'dune');
                    return {
                        page: 1,
                        totalPages: 1,
                        results: [
                            { id: 42, mediaType: 'movie', title: 'Dune', releaseDate: '2021-10-22' },
                            { id: 7, mediaType: 'person', name: 'Denis' },
                        ],
                    };
                }
                if (path === '/movie/42') {
                    return { id: 42, title: 'Dune', overview: 'Sand.', posterPath: '/dune.jpg', releaseDate: '2021-10-22' };
                }
                if (path === '/discover/trending') {
                    return {
                        page: 1,
                        totalPages: 2,
                        results: [{ id: 99, mediaType: 'tv', name: 'Severance', firstAirDate: '2022-02-18' }],
                    };
                }
                throw new Error(`unexpected path ${path}`);
            },
        }),
        createService: () => ({
            createMemberRequest: async (user, body) => {
                created.push({ user, body });
                return { id: 1, ...body };
            },
            listAdminRequests: async ({ filter }) => ({
                results: filter === 'pending'
                    ? [{ type: 'movie', tmdbId: 42, title: 'Dune', status: 1, statusLabel: 'Pending', requestedBy: { username: 'kaleb' } }]
                    : [],
            }),
            getAdminRequestCounts: async () => ({ pending: 1, processing: 0, available: 2 }),
        }),
    });

    const search = await app.search({ tmdbApiKey: 'test' }, { query: 'dune', mediaType: 'all', page: 1 });
    assert.equal(search.results.length, 1);
    assert.equal(search.results[0].tmdbId, 42);

    const detail = await app.getMediaDetails({ tmdbApiKey: 'test' }, { mediaType: 'movie', tmdbId: 42 });
    assert.equal(detail.title, 'Dune');
    assert.equal(detail.canRequest, true);

    await app.requestMedia({ tmdbApiKey: 'test' }, {
        mediaType: 'movie',
        tmdbId: 42,
        sessionUser: { id: 'u1', username: 'kaleb' },
    });
    assert.equal(created[0].body.tmdbId, 42);

    const listed = await app.listRequests({}, { filter: 'pending', take: 10, skip: 0 });
    assert.equal(listed.results[0].pending, true);

    const counts = await app.getRequestCounts({});
    assert.equal(counts.pending, 1);

    const discover = await app.discover({}, { category: 'trending', page: 1 });
    assert.equal(discover.results[0].mediaType, 'tv');
    assert.equal(discover.pageInfo.hasNextPage, true);
});

test('searchPeople and filmography ignore non-person search hits', async () => {
    const app = createDiscordRequestApp({
        loadFile: async () => ({}),
        configPath: '/tmp/config.json',
        usersPath: '/tmp/users.json',
        configDir: '/tmp',
        createRouter: () => ({
            fetchPath: async (path) => {
                if (path === '/search') {
                    return {
                        results: [
                            { id: 1, mediaType: 'movie', title: 'Dune' },
                            { id: 88, mediaType: 'person', name: 'Timothee', knownFor: [{ title: 'Dune' }] },
                        ],
                    };
                }
                if (path === '/person/88') return { id: 88, name: 'Timothee' };
                if (path === '/person/88/combined_credits') {
                    return {
                        cast: [
                            { id: 42, mediaType: 'movie', title: 'Dune', releaseDate: '2021-10-22' },
                            { id: 11, mediaType: 'tv', name: 'Older Show', firstAirDate: '2014-01-01' },
                        ],
                    };
                }
                throw new Error(`unexpected path ${path}`);
            },
        }),
        createService: () => ({}),
    });

    const people = await app.searchPeople({}, { query: 'tim' });
    assert.equal(people.results.length, 1);
    assert.equal(people.results[0].personId, 88);

    const film = await app.getPersonFilmography({}, { personId: 88, mediaType: 'movie', limit: 5 });
    assert.equal(film.person.name, 'Timothee');
    assert.equal(film.results.length, 1);
    assert.equal(film.results[0].tmdbId, 42);
});
