import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    buildPaginatedRailUrlBuilders,
    buildRailBrowsePath,
    parseRailMediaFilter,
} from '../../lib/discovery/railBrowse.js';

describe('railBrowse', () => {
    it('parseRailMediaFilter normalizes values', () => {
        assert.equal(parseRailMediaFilter('movie'), 'movie');
        assert.equal(parseRailMediaFilter('tv'), 'tv');
        assert.equal(parseRailMediaFilter('all'), 'all');
        assert.equal(parseRailMediaFilter(null), 'all');
    });

    it('buildRailBrowsePath omits query for all media', () => {
        assert.equal(buildRailBrowsePath('/request', 'trending', 'all'), '/request/browse/trending');
        assert.equal(buildRailBrowsePath('/discovery/', 'popular', 'all'), '/discovery/browse/popular');
    });

    it('buildRailBrowsePath adds media query when filtered', () => {
        assert.equal(
            buildRailBrowsePath('/request', 'upcoming', 'movie'),
            '/request/browse/upcoming?media=movie',
        );
    });

    it('buildPaginatedRailUrlBuilders scopes upcoming by media', () => {
        const movie = buildPaginatedRailUrlBuilders('upcoming', 'movie');
        assert.equal(movie.length, 1);
        assert.match(movie[0](2), /movies\/upcoming\?page=2/);

        const both = buildPaginatedRailUrlBuilders('upcoming', 'all');
        assert.equal(both.length, 2);
    });

    it('buildPaginatedRailUrlBuilders adds anime flag for anime rails', () => {
        const urls = buildPaginatedRailUrlBuilders('anime-popular-series', 'tv');
        assert.match(urls[0](1), /anime=1/);
    });
});
