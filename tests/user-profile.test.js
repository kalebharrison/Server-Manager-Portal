import assert from 'node:assert/strict';
import test from 'node:test';

import {
    applyAccountPreferencePatch,
    getDeliveryEmail,
    hiddenLeaderboardAccountIds,
    resolveHomeAnalyticsDays,
    resolveHomeLanding,
    wantsNewsletter,
    wantsNotifyAccessExpiry,
} from '../lib/user-profile.js';

test('newsletter and notification flags are opt-in', () => {
    assert.equal(wantsNewsletter({}), false);
    assert.equal(wantsNewsletter({ newsletterOptIn: true }), true);
    assert.equal(wantsNotifyAccessExpiry({}), false);
    assert.equal(wantsNotifyAccessExpiry({ notifyAccessExpiry: true }), true);
});

test('contact email override is preferred for delivery', () => {
    assert.equal(getDeliveryEmail({ email: 'a@example.com' }), 'a@example.com');
    assert.equal(getDeliveryEmail({ email: 'a@example.com', contactEmail: 'b@example.com' }), 'b@example.com');
    assert.equal(getDeliveryEmail({ contactEmail: 'not-an-email' }), '');
});

test('preference patch validates and persists account controls', () => {
    const user = { username: 'viewer', email: 'viewer@example.com' };
    const { changed, errors } = applyAccountPreferencePatch(user, {
        newsletterOptIn: true,
        displayName: '  Cinema Kid  ',
        contactEmail: 'alt@example.com',
        notifyAccessExpiry: true,
        hideFromLeaderboards: true,
        locale: 'en-GB',
        homeLanding: 'request',
        homeAnalyticsDays: '90',
        homeShowWrapUp: false,
        homeShowWeekCalendar: false,
    });
    assert.equal(errors.length, 0);
    assert.equal(changed, true);
    assert.equal(user.newsletterOptIn, true);
    assert.equal(user.displayName, 'Cinema Kid');
    assert.equal(user.contactEmail, 'alt@example.com');
    assert.equal(user.notifyAccessExpiry, true);
    assert.equal(user.hideFromLeaderboards, true);
    assert.equal(user.locale, 'en-GB');
    assert.equal(user.homeLanding, 'request');
    assert.equal(user.homeAnalyticsDays, 90);
    assert.equal(user.homeShowWrapUp, false);
    assert.equal(user.homeShowWeekCalendar, false);
    assert.equal(resolveHomeLanding(user), 'request');
    assert.equal(resolveHomeAnalyticsDays(user), 90);
});

test('hidden leaderboard ids include plex and local ids', () => {
    const ids = hiddenLeaderboardAccountIds([
        { id: '1', plexId: '10', hideFromLeaderboards: true },
        { id: '2', hideFromLeaderboards: false },
    ]);
    assert.ok(ids.has('1'));
    assert.ok(ids.has('10'));
    assert.equal(ids.has('2'), false);
});
