import assert from 'node:assert/strict';

/** Mirror of discovery-routes resolveHomeCacheRailKey anime guard. */
const resolveHomeCacheRailKey = (restPath, query = {}) => {
    const page = Number(query.page || 1);
    if (page !== 1) return null;
    if (query.anime === '1' || query.anime === 'true' || query.anime === true) return null;
    const path = String(restPath || '').replace(/^\/+/, '');
    const sortBy = String(query.sortBy || '');
    if (path === 'discover/movies' && (!sortBy || sortBy === 'popularity.desc')) {
        if (query.genre || query.genres) return null;
        return 'popularMoviesPage1';
    }
    if (path === 'discover/movies/upcoming') return 'upcomingMovies';
    return null;
};

assert.equal(
    resolveHomeCacheRailKey('discover/movies', { page: 1, sortBy: 'popularity.desc' }),
    'popularMoviesPage1',
);
assert.equal(
    resolveHomeCacheRailKey('discover/movies', { page: 1, sortBy: 'popularity.desc', anime: '1' }),
    null,
);
assert.equal(
    resolveHomeCacheRailKey('discover/movies/upcoming', { page: 1, anime: '1' }),
    null,
);

console.log('anime home-cache bypass ok');
