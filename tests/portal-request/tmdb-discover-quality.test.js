import assert from 'node:assert/strict';
import test from 'node:test';
import {
    DISCOVER_DEFAULT_VOTE_COUNT_GTE,
    DISCOVER_TRENDING_MIN_POPULARITY,
    DISCOVER_TRENDING_MIN_VOTE_COUNT,
    DISCOVER_UPCOMING_MIN_POPULARITY,
    DISCOVER_UPCOMING_WINDOW_DAYS,
    addDaysIsoDate,
    passesTrendingQuality,
    passesUpcomingQuality,
} from '../../lib/portal-request/tmdbDiscover.js';
import { buildTmdbDiscoverQuery } from '../../lib/portal-request/tmdbClient.js';

test('discover quality constants stay in expected ranges', () => {
    assert.equal(DISCOVER_DEFAULT_VOTE_COUNT_GTE, '150');
    assert.equal(DISCOVER_UPCOMING_WINDOW_DAYS, 180);
    assert.ok(DISCOVER_UPCOMING_MIN_POPULARITY >= 1);
    assert.ok(DISCOVER_UPCOMING_MIN_POPULARITY <= 15);
    assert.ok(DISCOVER_TRENDING_MIN_VOTE_COUNT >= 20);
    assert.ok(DISCOVER_TRENDING_MIN_POPULARITY >= 10);
});

test('addDaysIsoDate advances calendar days in UTC ISO form', () => {
    assert.equal(addDaysIsoDate(0, new Date('2026-07-30T12:00:00Z')), '2026-07-30');
    assert.equal(addDaysIsoDate(180, new Date('2026-07-30T12:00:00Z')), '2027-01-26');
});

test('passesUpcomingQuality uses popularity floor (votes ignored)', () => {
    assert.equal(passesUpcomingQuality({ popularity: DISCOVER_UPCOMING_MIN_POPULARITY, voteCount: 0 }), true);
    assert.equal(passesUpcomingQuality({ popularity: DISCOVER_UPCOMING_MIN_POPULARITY - 1, voteCount: 9999 }), false);
});

test('passesTrendingQuality accepts votes or popularity', () => {
    assert.equal(passesTrendingQuality({
        voteCount: DISCOVER_TRENDING_MIN_VOTE_COUNT,
        popularity: 0,
    }), true);
    assert.equal(passesTrendingQuality({
        voteCount: 0,
        popularity: DISCOVER_TRENDING_MIN_POPULARITY,
    }), true);
    assert.equal(passesTrendingQuality({
        voteCount: DISCOVER_TRENDING_MIN_VOTE_COUNT - 1,
        popularity: DISCOVER_TRENDING_MIN_POPULARITY - 1,
    }), false);
});

test('buildTmdbDiscoverQuery passes upcoming window bounds', () => {
    const params = buildTmdbDiscoverQuery('movie', {
        primaryReleaseDateGte: '2026-07-30',
        primaryReleaseDateLte: '2027-01-26',
        sortBy: 'popularity.desc',
    }, { language: 'en' });
    assert.equal(params.get('primary_release_date.gte'), '2026-07-30');
    assert.equal(params.get('primary_release_date.lte'), '2027-01-26');
    assert.equal(params.get('vote_count.gte'), null);
});
