import test from 'node:test';
import assert from 'node:assert/strict';

import { buildRecentHistory } from '../../lib/analytics/personal-analytics-helpers.js';

test('buildRecentHistory collapses binge episodes after scanning past the raw limit', () => {
    const items = [];
    for (let i = 0; i < 80; i += 1) {
        items.push({
            type: 'episode',
            grandparentTitle: 'Show A',
            grandparentKey: '/library/metadata/aaa',
            grandparentRatingKey: 'aaa',
            title: `Ep ${i}`,
            viewedAt: 2_000_000 - i,
        });
    }
    items.push({
        type: 'episode',
        grandparentTitle: 'Show B',
        grandparentKey: '/library/metadata/bbb',
        grandparentRatingKey: 'bbb',
        title: 'Pilot',
        viewedAt: 1_000_000,
    });
    items.push({
        type: 'movie',
        title: 'Some Movie',
        ratingKey: '999',
        key: '/library/metadata/999',
        viewedAt: 900_000,
    });

    const recent = buildRecentHistory(items, 'server-1', 50);
    assert.equal(recent.length, 3);
    assert.equal(recent[0].title, 'Show A');
    assert.equal(recent[0].watchedCount, 80);
    assert.equal(recent[1].title, 'Show B');
    assert.equal(recent[2].title, 'Some Movie');
});

test('buildRecentHistory stops at distinct-title limit', () => {
    const items = Array.from({ length: 60 }, (_, i) => ({
        type: 'movie',
        title: `Movie ${i}`,
        ratingKey: String(i),
        viewedAt: 1_000_000 - i,
    }));
    const recent = buildRecentHistory(items, 'server-1', 50);
    assert.equal(recent.length, 50);
    assert.equal(recent[0].title, 'Movie 0');
    assert.equal(recent[49].title, 'Movie 49');
});
