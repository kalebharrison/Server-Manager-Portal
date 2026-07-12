import assert from 'node:assert/strict';
import test from 'node:test';

import { obfuscateAnalyticsTopUser, shouldObfuscateAnalyticsViewers } from '../lib/analytics-shared.js';
import { buildPrivateLeaderboardNeighbourhood } from '../lib/analytics-plex-personal-routes.js';
import { presentStreamUser } from '../lib/stream-privacy.js';

test('analytics identities are always hidden from non-admin users', () => {
    assert.equal(shouldObfuscateAnalyticsViewers({ isAdmin: false }, { showUsernamesInAnalytics: true }), true);
    assert.equal(shouldObfuscateAnalyticsViewers({ isAdmin: true }), false);

    const result = obfuscateAnalyticsTopUser({
        id: 'plex-account-id',
        username: 'private-name',
        email: 'private@example.com',
        thumb: '/private/avatar',
        plays: 12,
    }, 1, true);
    assert.deepEqual(result, {
        id: 'viewer-2',
        username: 'Viewer 2',
        thumb: null,
        plays: 12,
    });
});

test('active stream identities are visible only to admins', () => {
    assert.deepEqual(presentStreamUser({ isAdmin: false, mode: 'false', username: 'Private User', thumb: '/avatar' }), { user: 'Anonymous', userThumb: null });
    assert.deepEqual(presentStreamUser({ isAdmin: false, mode: 'hidden', username: 'Private User', thumb: '/avatar' }), { user: null, userThumb: null });
    assert.deepEqual(presentStreamUser({ isAdmin: true, mode: 'hidden', username: 'Private User', thumb: '/avatar' }), { user: 'Private User', userThumb: '/avatar' });
});

test('personal leaderboard exposes only the signed-in viewer identity', () => {
    const result = buildPrivateLeaderboardNeighbourhood([
        { accountId: 'peer-account', rank: 1, plays: 20 },
        { accountId: 'my-account', rank: 2, plays: 10 },
    ], 'my-account');
    assert.deepEqual(result, [
        { rank: 1, plays: 20, isMe: false, username: 'Viewer 1' },
        { rank: 2, plays: 10, isMe: true, username: 'You' },
    ]);
    assert.equal(JSON.stringify(result).includes('peer-account'), false);
});
