import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDeletedUserIndex, isDeletedUser } from '../../lib/users/deleted-users.js';

test('isDeletedUser matches plex/jellyfin/email/username via index', () => {
    const deleted = [
        { id: 'plex-1', plexId: 'plex-1', email: 'Gone@Example.com', username: 'OldUser' },
        { id: 'jellyfin:abc', jellyfinId: 'abc', email: 'jf@example.com', username: 'jfuser' },
    ];

    assert.equal(isDeletedUser(deleted, { plexId: 'plex-1' }), true);
    assert.equal(isDeletedUser(deleted, { email: 'gone@example.com' }), true);
    assert.equal(isDeletedUser(deleted, { username: 'olduser' }), true);
    assert.equal(isDeletedUser(deleted, { jellyfinId: 'abc' }), true);
    assert.equal(isDeletedUser(deleted, { plexId: 'still-here', email: 'ok@example.com' }), false);
});

test('buildDeletedUserIndex supports reuse without rebuilding from array each call', () => {
    const index = buildDeletedUserIndex([
        { id: 'u1', plexId: 'p1', email: 'a@b.c', username: 'Name' },
    ]);
    assert.equal(isDeletedUser(index, { plexId: 'p1' }), true);
    assert.equal(isDeletedUser(index, { email: 'A@B.C' }), true);
    assert.equal(isDeletedUser(index, { username: 'name' }), true);
    assert.equal(isDeletedUser(index, { plexId: 'nope' }), false);
});
