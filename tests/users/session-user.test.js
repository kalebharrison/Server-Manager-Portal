import test from 'node:test';
import assert from 'node:assert/strict';
import { findLocalUserById, findLocalUserForSession } from '../../lib/users/session-user.js';

const users = [{
    id: '32808',
    plexId: '32808',
    username: 'KalebHarrison',
    email: 'kaleb@example.com',
    thumb: 'https://plex.tv/users/699e8ca86ae68d2f/avatar?c=1',
    requestOverrides: { autoApproveMovies: true, autoApproveTv: true },
}];

test('findLocalUserById matches numeric plex id', () => {
    assert.equal(findLocalUserById(users, '32808')?.username, 'KalebHarrison');
});

test('findLocalUserById matches plex account uuid from thumb', () => {
    assert.equal(findLocalUserById(users, '699e8ca86ae68d2f')?.id, '32808');
});

test('findLocalUserForSession matches email when session id is plex uuid', () => {
    const hit = findLocalUserForSession(users, {
        id: '699e8ca86ae68d2f',
        email: 'kaleb@example.com',
    });
    assert.equal(hit?.id, '32808');
});
