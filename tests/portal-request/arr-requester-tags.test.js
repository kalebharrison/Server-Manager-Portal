import test from 'node:test';
import assert from 'node:assert/strict';

import {
    sanitizeArrTagSegment,
    mediaUserIdsForTag,
    mediaUserIdForTag,
    buildPortalRequesterTagLabel,
    parseArrRequesterTagLabel,
    resolvePortalUserFromArrTag,
    resolvePortalOwnerFromArrTagLabels,
    resolveNotifyUsersFromArrTagLabels,
    buildPortalRequesterTagsForUser,
    buildNotifyTagsForUser,
    buildPortalRequesterTagForUser,
    buildNotifyTagForUser,
    isPortalRequesterTagForUser,
    isNotifyTagForUser,
    collectPortalUsersFromArrTagLabels,
} from '../../lib/portal-request/arrRequesterTags.js';

test('sanitizeArrTagSegment lowercases and strips invalid chars', () => {
    assert.equal(sanitizeArrTagSegment('Kaleb Harrison'), 'kalebharrison');
    assert.equal(sanitizeArrTagSegment('16 - i2ach'), '16-i2ach');
    assert.equal(sanitizeArrTagSegment('Foo_Bar!'), 'foobar');
});

test('mediaUserIdsForTag includes both plex and jellyfin when linked', () => {
    const both = { id: 'portal-1', plexId: '100', jellyfinId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' };
    assert.deepEqual(mediaUserIdsForTag(both), ['100', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890']);
    assert.deepEqual(mediaUserIdsForTag({ id: 'portal-1', plexId: '100' }), ['100']);
    assert.deepEqual(mediaUserIdsForTag({ id: 'portal-1' }), ['portal-1']);
});

test('mediaUserIdForTag prefers active media-server id with fallbacks', () => {
    const both = { id: 'portal-1', plexId: '100', jellyfinId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' };
    assert.equal(mediaUserIdForTag(both, 'plex'), '100');
    assert.equal(mediaUserIdForTag(both, 'jellyfin'), 'a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    assert.equal(mediaUserIdForTag({ id: 'portal-1', jellyfinId: 'jf-1' }, 'plex'), 'jf-1');
    assert.equal(mediaUserIdForTag({ id: 'portal-1', plexId: '100' }, 'jellyfin'), '100');
});

test('buildPortalRequesterTagLabel uses id + username', () => {
    assert.equal(buildPortalRequesterTagLabel(42, 'KalebHarrison'), '42-kalebharrison');
    assert.equal(buildPortalRequesterTagLabel('99', 'i2ach'), '99-i2ach');
});

test('buildPortalRequesterTagsForUser writes both ids for dual-linked users', () => {
    const user = {
        id: 'portal-9',
        plexId: '16297230',
        jellyfinId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        username: 'carrowayjm',
    };
    assert.deepEqual(buildPortalRequesterTagsForUser(user), [
        '16297230-carrowayjm',
        'a1b2c3d4-e5f6-7890-abcd-ef1234567890-carrowayjm',
    ]);
    assert.deepEqual(buildNotifyTagsForUser(user), [
        'n-16297230-carrowayjm',
        'n-a1b2c3d4-e5f6-7890-abcd-ef1234567890-carrowayjm',
    ]);
    assert.equal(buildPortalRequesterTagForUser(user, 'plex'), '16297230-carrowayjm');
    assert.equal(buildNotifyTagForUser(user, 'jellyfin'), 'n-a1b2c3d4-e5f6-7890-abcd-ef1234567890-carrowayjm');
});

test('parseArrRequesterTagLabel handles legacy, guid, notify, and bare forms', () => {
    assert.deepEqual(parseArrRequesterTagLabel('16-i2ach'), {
        idPrefix: '16',
        username: 'i2ach',
        bare: false,
        kind: 'requester',
        raw: '16-i2ach',
    });
    assert.deepEqual(parseArrRequesterTagLabel('n-16297230-carrowayjm'), {
        idPrefix: '16297230',
        username: 'carrowayjm',
        bare: false,
        kind: 'notify',
        raw: 'n-16297230-carrowayjm',
    });
    assert.deepEqual(parseArrRequesterTagLabel('a1b2c3d4-e5f6-7890-abcd-ef1234567890-alex'), {
        idPrefix: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        username: 'alex',
        bare: false,
        kind: 'requester',
        raw: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890-alex',
    });
    assert.deepEqual(parseArrRequesterTagLabel('kalebharrison'), {
        idPrefix: null,
        username: 'kalebharrison',
        bare: true,
        kind: 'requester',
        raw: 'kalebharrison',
    });
});

test('resolvePortalUserFromArrTag matches plex, jellyfin, legacy, and username', () => {
    const users = [
        { id: '100', plexId: '100', username: 'kalebharrison', email: 'k@example.com' },
        { id: '200', plexId: '200', username: 'i2ach', seerrUserId: 16, displayName: 'i2ach' },
        {
            id: 'jellyfin:a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            jellyfinId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            username: 'alex',
        },
    ];

    assert.equal(resolvePortalUserFromArrTag('100-kalebharrison', users)?.id, '100');
    assert.equal(resolvePortalUserFromArrTag('16-i2ach', users)?.id, '200');
    assert.equal(resolvePortalUserFromArrTag('kalebharrison', users)?.id, '100');
    assert.equal(
        resolvePortalUserFromArrTag('a1b2c3d4-e5f6-7890-abcd-ef1234567890-alex', users)?.jellyfinId,
        'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    );
    assert.equal(resolvePortalUserFromArrTag('anime', users), null);
});

test('resolvePortalOwnerFromArrTagLabels skips notify tags', () => {
    const users = [{ id: '100', plexId: '100', username: 'kaleb' }];
    assert.equal(
        resolvePortalOwnerFromArrTagLabels(['n-100-kaleb', '100-kaleb'], users)?.tagLabel,
        '100-kaleb',
    );
});

test('resolveNotifyUsersFromArrTagLabels only returns notify subscribers', () => {
    const users = [
        { id: '100', plexId: '100', username: 'kaleb' },
        { id: '200', plexId: '200', username: 'i2ach' },
    ];
    const notify = resolveNotifyUsersFromArrTagLabels(
        ['100-kaleb', 'n-200-i2ach', 'cinema'],
        users,
    );
    assert.equal(notify.length, 1);
    assert.equal(notify[0].user.id, '200');
});

test('isPortalRequesterTagForUser and isNotifyTagForUser', () => {
    const user = {
        id: 'portal-9',
        plexId: '100',
        jellyfinId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        username: 'kalebharrison',
    };
    assert.equal(isPortalRequesterTagForUser('100-kalebharrison', user, 'plex'), true);
    assert.equal(
        isPortalRequesterTagForUser('a1b2c3d4-e5f6-7890-abcd-ef1234567890-kalebharrison', user, 'plex'),
        true,
    );
    assert.equal(isPortalRequesterTagForUser('portal-9-kalebharrison', user, 'plex'), false);
    assert.equal(isNotifyTagForUser('n-100-kalebharrison', user, 'plex'), true);
    assert.equal(
        isNotifyTagForUser('n-a1b2c3d4-e5f6-7890-abcd-ef1234567890-kalebharrison', user, 'jellyfin'),
        true,
    );
    assert.equal(isNotifyTagForUser('100-kalebharrison', user, 'plex'), false);
});

test('collectPortalUsersFromArrTagLabels maps legacy tags without requiring portal tags', () => {
    const users = [
        { id: '100', username: 'kalebharrison' },
        { id: '200', username: 'i2ach', seerrUserId: 16 },
    ];
    const map = collectPortalUsersFromArrTagLabels(['16-i2ach', 'cinema', 'kalebharrison'], users);
    assert.equal(map.size, 2);
    assert.equal(map.get('200')?.user.username, 'i2ach');
    assert.equal(map.get('100')?.user.username, 'kalebharrison');
});
