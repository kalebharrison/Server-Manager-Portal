import test from 'node:test';
import assert from 'node:assert/strict';

import {
    sanitizeArrTagSegment,
    mediaUserIdForTag,
    buildPortalRequesterTagLabel,
    parseArrRequesterTagLabel,
    resolvePortalUserFromArrTag,
    resolvePortalOwnerFromArrTagLabels,
    resolveNotifyUsersFromArrTagLabels,
    buildPortalRequesterTagForUser,
    buildNotifyTagForUser,
    isPortalRequesterTagForUser,
    isNotifyTagForUser,
    collectPortalUsersFromArrTagLabels,
} from '../../lib/portal-request/arrRequesterTags.js';

test('sanitizeArrTagSegment lowercases and strips invalid chars', () => {
    assert.equal(sanitizeArrTagSegment('Alice Example'), 'aliceexample');
    assert.equal(sanitizeArrTagSegment('16 - alice'), '16-alice');
    assert.equal(sanitizeArrTagSegment('Foo_Bar!'), 'foobar');
});

test('mediaUserIdForTag uses portal id only (one tag set per user)', () => {
    const both = { id: 'portal-1', plexId: '100', jellyfinId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' };
    assert.equal(mediaUserIdForTag(both, 'plex'), 'portal-1');
    assert.equal(mediaUserIdForTag(both, 'jellyfin'), 'portal-1');
});

test('buildPortalRequesterTagLabel prefers id-only; username optional for legacy', () => {
    assert.equal(buildPortalRequesterTagLabel(42), '42');
    assert.equal(buildPortalRequesterTagLabel(42, 'AliceExample'), '42-aliceexample');
});

test('buildPortalRequesterTagForUser omits username (rename-safe)', () => {
    const user = {
        id: 'portal-9',
        plexId: '10000001',
        jellyfinId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        username: 'bob',
    };
    assert.equal(buildPortalRequesterTagForUser(user, 'plex'), 'portal-9');
    assert.equal(buildNotifyTagForUser(user, 'jellyfin'), 'n-portal-9');
});

test('parseArrRequesterTagLabel handles legacy, guid, notify, and bare forms', () => {
    assert.deepEqual(parseArrRequesterTagLabel('16-alice'), {
        idPrefix: '16',
        username: 'alice',
        bare: false,
        kind: 'requester',
        raw: '16-alice',
    });
    assert.deepEqual(parseArrRequesterTagLabel('n-10000001-bob'), {
        idPrefix: '10000001',
        username: 'bob',
        bare: false,
        kind: 'notify',
        raw: 'n-10000001-bob',
    });
    assert.deepEqual(parseArrRequesterTagLabel('a1b2c3d4-e5f6-7890-abcd-ef1234567890-alex'), {
        idPrefix: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        username: 'alex',
        bare: false,
        kind: 'requester',
        raw: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890-alex',
    });
    assert.deepEqual(parseArrRequesterTagLabel('aliceexample'), {
        idPrefix: null,
        username: 'aliceexample',
        bare: true,
        kind: 'requester',
        raw: 'aliceexample',
    });
});

test('resolvePortalUserFromArrTag matches id-only, legacy id-username, and username', () => {
    const users = [
        { id: '100', plexId: '100', username: 'aliceexample', email: 'alice@example.com' },
        { id: '200', plexId: '200', username: 'alice', seerrUserId: 16, displayName: 'alice' },
        {
            id: 'jellyfin:a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            jellyfinId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            username: 'alex',
        },
    ];

    assert.equal(resolvePortalUserFromArrTag('100', users)?.id, '100');
    assert.equal(resolvePortalUserFromArrTag('100-oldname', users)?.id, '100');
    assert.equal(resolvePortalUserFromArrTag('16-alice', users)?.id, '200');
    assert.equal(resolvePortalUserFromArrTag('aliceexample', users)?.id, '100');
    assert.equal(
        resolvePortalUserFromArrTag('a1b2c3d4-e5f6-7890-abcd-ef1234567890-alex', users)?.jellyfinId,
        'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    );
    assert.equal(resolvePortalUserFromArrTag('anime', users), null);
});

test('resolvePortalOwnerFromArrTagLabels skips notify tags', () => {
    const users = [{ id: '100', plexId: '100', username: 'alice' }];
    assert.equal(
        resolvePortalOwnerFromArrTagLabels(['n-100', '100'], users)?.tagLabel,
        '100',
    );
});

test('resolveNotifyUsersFromArrTagLabels only returns notify subscribers', () => {
    const users = [
        { id: '100', plexId: '100', username: 'alice' },
        { id: '200', plexId: '200', username: 'bob' },
    ];
    const notify = resolveNotifyUsersFromArrTagLabels(
        ['100', 'n-200', 'n-200-oldname', 'cinema'],
        users,
    );
    assert.equal(notify.length, 1);
    assert.equal(notify[0].user.id, '200');
});

test('isPortalRequesterTagForUser ignores username changes', () => {
    const user = {
        id: 'portal-9',
        plexId: '100',
        username: 'aliceexample',
    };
    assert.equal(isPortalRequesterTagForUser('portal-9', user), true);
    assert.equal(isPortalRequesterTagForUser('portal-9-oldname', user), true);
    assert.equal(isPortalRequesterTagForUser('100-aliceexample', user), false);
    assert.equal(isNotifyTagForUser('n-portal-9', user), true);
    assert.equal(isNotifyTagForUser('n-portal-9-oldname', user), true);
    assert.equal(isNotifyTagForUser('portal-9', user), false);
});

test('collectPortalUsersFromArrTagLabels maps legacy tags without requiring portal tags', () => {
    const users = [
        { id: '100', username: 'aliceexample' },
        { id: '200', username: 'alice', seerrUserId: 16 },
    ];
    const map = collectPortalUsersFromArrTagLabels(['16-alice', 'cinema', 'aliceexample'], users);
    assert.equal(map.size, 2);
    assert.equal(map.get('200')?.user.username, 'alice');
    assert.equal(map.get('100')?.user.username, 'aliceexample');
});
