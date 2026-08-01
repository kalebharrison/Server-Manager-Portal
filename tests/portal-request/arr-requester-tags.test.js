import test from 'node:test';
import assert from 'node:assert/strict';

import {
    sanitizeArrTagSegment,
    buildPortalRequesterTagLabel,
    parseArrRequesterTagLabel,
    resolvePortalUserFromArrTag,
    resolvePortalOwnerFromArrTagLabels,
    buildPortalRequesterTagForUser,
    isPortalRequesterTagForUser,
    collectPortalUsersFromArrTagLabels,
} from '../../lib/portal-request/arrRequesterTags.js';

test('sanitizeArrTagSegment lowercases and strips invalid chars', () => {
    assert.equal(sanitizeArrTagSegment('Kaleb Harrison'), 'kalebharrison');
    assert.equal(sanitizeArrTagSegment('16 - i2ach'), '16-i2ach');
    assert.equal(sanitizeArrTagSegment('Foo_Bar!'), 'foobar');
});

test('buildPortalRequesterTagLabel uses portal id + username', () => {
    assert.equal(buildPortalRequesterTagLabel(42, 'KalebHarrison'), '42-kalebharrison');
    assert.equal(buildPortalRequesterTagLabel('99', 'i2ach'), '99-i2ach');
});

test('parseArrRequesterTagLabel handles seerr/portal and bare forms', () => {
    assert.deepEqual(parseArrRequesterTagLabel('16-i2ach'), {
        idPrefix: '16',
        username: 'i2ach',
        bare: false,
        raw: '16-i2ach',
    });
    assert.deepEqual(parseArrRequesterTagLabel('kalebharrison'), {
        idPrefix: null,
        username: 'kalebharrison',
        bare: true,
        raw: 'kalebharrison',
    });
});

test('resolvePortalUserFromArrTag matches portal id, seerr id, and username', () => {
    const users = [
        { id: '100', plexId: '100', username: 'kalebharrison', email: 'k@example.com' },
        { id: '200', plexId: '200', username: 'i2ach', seerrUserId: 16, displayName: 'i2ach' },
        { id: '300', plexId: '300', username: 'alex', displayName: 'Alex' },
    ];

    assert.equal(resolvePortalUserFromArrTag('100-kalebharrison', users)?.id, '100');
    assert.equal(resolvePortalUserFromArrTag('16-i2ach', users)?.id, '200');
    assert.equal(resolvePortalUserFromArrTag('kalebharrison', users)?.id, '100');
    assert.equal(resolvePortalUserFromArrTag('anime', users), null);
});

test('buildPortalRequesterTagForUser and isPortalRequesterTagForUser', () => {
    const user = { id: '100', username: 'kalebharrison' };
    assert.equal(buildPortalRequesterTagForUser(user), '100-kalebharrison');
    assert.equal(isPortalRequesterTagForUser('100-kalebharrison', user), true);
    assert.equal(isPortalRequesterTagForUser('1-kalebharrison', user), false);
    assert.equal(isPortalRequesterTagForUser('kalebharrison', user), false);
});

test('collectPortalUsersFromArrTagLabels maps Seerr tags without requiring portal tags', () => {
    const users = [
        { id: '100', username: 'kalebharrison' },
        { id: '200', username: 'i2ach', seerrUserId: 16 },
    ];
    const map = collectPortalUsersFromArrTagLabels(['16-i2ach', 'cinema', 'kalebharrison'], users);
    assert.equal(map.size, 2);
    assert.equal(map.get('200')?.user.username, 'i2ach');
    assert.equal(map.get('100')?.user.username, 'kalebharrison');
});
