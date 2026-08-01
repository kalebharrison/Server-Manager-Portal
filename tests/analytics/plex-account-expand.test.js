import test from 'node:test';
import assert from 'node:assert/strict';

import { expandLocalPlexAccountIds } from '../../lib/plex/plex-connection-accounts.js';
import { filterHistoryByAccounts } from '../../lib/analytics/analytics-history.js';

test('expandLocalPlexAccountIds merges name matches with admin owner account 1', () => {
    const accounts = [
        { id: 1, name: 'Owner' },
        { id: 7, name: 'kaleb' },
        { id: 9, name: 'someoneelse' },
    ];
    const ids = expandLocalPlexAccountIds('7', accounts, {
        username: 'kaleb',
        isAdmin: true,
    });
    assert.deepEqual(new Set(ids), new Set(['7', '1']));
});

test('expandLocalPlexAccountIds keeps non-admin to matched accounts only', () => {
    const accounts = [
        { id: 1, name: 'Owner' },
        { id: 7, name: 'member' },
    ];
    const ids = expandLocalPlexAccountIds('7', accounts, {
        username: 'member',
        isAdmin: false,
    });
    assert.deepEqual(ids, ['7']);
});

test('filterHistoryByAccounts keeps plays from any alias id', () => {
    const items = [
        { historyKey: 'a', viewedAt: 100, accountID: 1, type: 'episode' },
        { historyKey: 'b', viewedAt: 90, accountID: 7, type: 'movie' },
        { historyKey: 'c', viewedAt: 80, accountID: 9, type: 'movie' },
    ];
    const filtered = filterHistoryByAccounts(items, ['1', '7'], 0);
    assert.deepEqual(filtered.map((item) => item.historyKey), ['a', 'b']);
});
