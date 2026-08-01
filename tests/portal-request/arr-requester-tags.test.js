import test from 'node:test';
import assert from 'node:assert/strict';

import {
    sanitizeArrTagSegment,
    buildPortalRequesterTagLabel,
    parseArrRequesterTagLabel,
    resolvePortalUserFromArrTag,
    resolvePortalOwnerFromArrTagLabels,
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

test('resolvePortalOwnerFromArrTagLabels returns first mapped owner', () => {
    const users = [
        { id: '1', username: 'kalebharrison' },
        { id: '2', username: 'i2ach', seerrUserId: 16 },
    ];
    const owner = resolvePortalOwnerFromArrTagLabels(['cinema', '16-i2ach', '1-kalebharrison'], users);
    assert.equal(owner?.user?.id, '2');
    assert.equal(owner?.tagLabel, '16-i2ach');
});
