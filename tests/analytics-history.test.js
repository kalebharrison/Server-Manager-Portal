import test from 'node:test';
import assert from 'node:assert/strict';

import {
    ANALYTICS_HISTORY_CACHE_VERSION,
    compactAnalyticsHistoryItem,
    mergeAnalyticsHistoryItems,
    matchesAnalyticsHistoryCache,
} from '../lib/analytics-history.js';

test('mergeAnalyticsHistoryItems prepends new plays and dedupes identities', () => {
    const older = [
        { historyKey: 'a', viewedAt: 100, accountID: 1, ratingKey: '1', type: 'movie' },
        { historyKey: 'b', viewedAt: 90, accountID: 1, ratingKey: '2', type: 'movie' },
    ];
    const newer = [
        { historyKey: 'c', viewedAt: 110, accountID: 1, ratingKey: '3', type: 'movie' },
        { historyKey: 'a', viewedAt: 100, accountID: 1, ratingKey: '1', type: 'movie' },
    ];

    const merged = mergeAnalyticsHistoryItems(newer, older, 250000);
    assert.deepEqual(merged.map((item) => item.historyKey), ['c', 'a', 'b']);
});

test('mergeAnalyticsHistoryItems respects safety cap without dropping newest first', () => {
    const newer = [
        { historyKey: 'n1', viewedAt: 3 },
        { historyKey: 'n2', viewedAt: 2 },
    ];
    const older = [
        { historyKey: 'o1', viewedAt: 1 },
        { historyKey: 'o2', viewedAt: 0 },
    ];
    const merged = mergeAnalyticsHistoryItems(newer, older, 3);
    assert.deepEqual(merged.map((item) => item.historyKey), ['n1', 'n2', 'o1']);
});

test('compactAnalyticsHistoryItem keeps aggregation fields only', () => {
    const compact = compactAnalyticsHistoryItem({
        viewedAt: 123,
        accountID: 9,
        librarySectionID: 2,
        deviceID: 4,
        type: 'episode',
        ratingKey: '10',
        grandparentKey: '5',
        grandparentTitle: 'Show',
        title: 'Episode',
        Player: { product: 'Plex for TV', address: '1.2.3.4' },
        junk: 'drop-me',
        historyKey: 'h1',
    });
    assert.equal(compact.viewedAt, 123);
    assert.equal(compact.Player.product, 'Plex for TV');
    assert.equal(compact.junk, undefined);
    assert.equal(compact.historyKey, 'h1');
});

test('matchesAnalyticsHistoryCache requires version and server identity', () => {
    const config = { serverIdentifier: 'abc' };
    assert.equal(matchesAnalyticsHistoryCache({
        version: ANALYTICS_HISTORY_CACHE_VERSION,
        serverIdentifier: 'abc',
        items: [{ historyKey: '1' }],
    }, config), true);
    assert.equal(matchesAnalyticsHistoryCache({
        version: ANALYTICS_HISTORY_CACHE_VERSION,
        serverIdentifier: 'other',
        items: [{ historyKey: '1' }],
    }, config), false);
});
