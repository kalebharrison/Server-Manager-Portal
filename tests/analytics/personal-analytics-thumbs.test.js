import assert from 'node:assert/strict';
import test from 'node:test';

import { aggregatePersonalHistory } from '../../lib/analytics/personal-analytics-aggregates.js';
import { enrichTopMediaMetadata } from '../../lib/analytics/personal-analytics-metadata.js';

test('aggregatePersonalHistory backfills thumb from later plays', () => {
    const aggregates = aggregatePersonalHistory([
        {
            type: 'episode',
            viewedAt: 100,
            ratingKey: 'ep1',
            grandparentKey: '/library/metadata/99',
            grandparentTitle: 'Harley Quinn',
            title: 'S1E1',
        },
        {
            type: 'episode',
            viewedAt: 200,
            ratingKey: 'ep2',
            grandparentKey: '/library/metadata/99',
            grandparentTitle: 'Harley Quinn',
            grandparentThumb: '/library/metadata/99/thumb/1',
            title: 'S1E2',
        },
    ], {}, {
        getHourInTimezone: () => 12,
        getWeekdayInTimezone: () => 1,
        statsTimezone: 'UTC',
        cutoffDate: 0,
        serverIdentifier: 'server',
    });

    assert.equal(aggregates.contentCounts['/library/metadata/99'].plays, 2);
    assert.equal(aggregates.contentCounts['/library/metadata/99'].thumb, '/library/metadata/99/thumb/1');
});

test('enrichTopMediaMetadata fills missing thumb from plex metadata', async () => {
    const cache = new Map([
        ['/library/metadata/42', {
            thumb: '/library/metadata/42/thumb/9',
            art: '/library/metadata/42/art/9',
            summary: 'A Chicago kitchen.',
            year: 2022,
        }],
    ]);
    const item = { key: '/library/metadata/42', title: 'The Bear' };
    await enrichTopMediaMetadata({
        uri: 'http://plex.test',
        config: { plexToken: 'token' },
        items: [item],
        getCachedPlexMetadata: (key) => cache.get(key),
        setCachedPlexMetadata: (key, value) => cache.set(key, value),
        mediaType: 'show',
    });

    assert.equal(item.thumb, '/library/metadata/42/thumb/9');
    assert.equal(item.art, '/library/metadata/42/art/9');
    assert.equal(item.summary, 'A Chicago kitchen.');
});
