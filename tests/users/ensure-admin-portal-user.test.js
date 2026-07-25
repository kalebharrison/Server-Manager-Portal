import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ensureAdminPortalUser,
    isAdminPortalUser,
} from '../../lib/users/ensure-admin-portal-user.js';

test('ensureAdminPortalUser creates an active unlimited admin member row', () => {
    const { users, user, created, changed } = ensureAdminPortalUser([], {
        id: 'uuid-1',
        plexId: '99',
        username: 'Lostwaldo',
        email: 'admin@example.com',
        thumb: 'https://example.com/a.png',
    });
    assert.equal(created, true);
    assert.equal(changed, true);
    assert.equal(users.length, 1);
    assert.equal(user.plexId, '99');
    assert.equal(user.username, 'Lostwaldo');
    assert.equal(user.plexAccessStatus, 'active');
    assert.equal(user.expiryDate, null);
    assert.equal(user.isPortalAdmin, true);
});

test('ensureAdminPortalUser reactivates a revoked admin row', () => {
    const existing = {
        id: '99',
        plexId: '99',
        username: 'Lostwaldo',
        plexAccessStatus: 'revoked',
        expiryDate: '2020-01-01',
    };
    const { user, created, changed } = ensureAdminPortalUser([existing], {
        plexId: '99',
        username: 'Lostwaldo',
    });
    assert.equal(created, false);
    assert.equal(changed, true);
    assert.equal(user.plexAccessStatus, 'active');
    assert.equal(user.expiryDate, null);
    assert.equal(user.isPortalAdmin, true);
});

test('ensureAdminPortalUser is idempotent when already active', () => {
    const existing = {
        id: '99',
        plexId: '99',
        username: 'Lostwaldo',
        email: 'admin@example.com',
        plexAccessStatus: 'active',
        expiryDate: null,
        isPortalAdmin: true,
    };
    const { created, changed } = ensureAdminPortalUser([existing], {
        plexId: '99',
        username: 'Lostwaldo',
        email: 'admin@example.com',
    });
    assert.equal(created, false);
    assert.equal(changed, false);
});

test('isAdminPortalUser matches plex id and flag', () => {
    assert.equal(isAdminPortalUser({ isPortalAdmin: true }, '1'), true);
    assert.equal(isAdminPortalUser({ plexId: '42' }, '42'), true);
    assert.equal(isAdminPortalUser({ plexId: '1' }, '42'), false);
});
