import assert from 'node:assert/strict';
import test from 'node:test';

import { buildRecentHistory } from '../../lib/analytics/analytics-plex-personal-routes.js';

test('recent history collapses episodes into one series entry', () => {
    const result = buildRecentHistory([
        { type: 'episode', key: '/library/metadata/3', grandparentKey: '/library/metadata/1', grandparentRatingKey: '1', grandparentTitle: 'Series', title: 'Episode 3', viewedAt: 30 },
        { type: 'episode', key: '/library/metadata/2', grandparentKey: '/library/metadata/1', grandparentRatingKey: '1', grandparentTitle: 'Series', title: 'Episode 2', viewedAt: 20 },
        { type: 'movie', key: '/library/metadata/4', ratingKey: '4', title: 'Movie', viewedAt: 10 },
    ], 'server-id');

    assert.equal(result.length, 2);
    assert.equal(result[0].title, 'Series');
    assert.equal(result[0].episodeTitle, '2 episodes watched');
    assert.match(result[0].plexUrl, /library%2Fmetadata%2F1/);
});
