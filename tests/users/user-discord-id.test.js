import assert from 'node:assert/strict';
import test from 'node:test';

import { applyDiscordIdToUser, hasLinkedDiscordId } from '../../lib/users/user-discord-id.js';
import { applyAccountPreferencePatch } from '../../lib/users/user-profile-preferences.js';

test('applyDiscordIdToUser links, clears, and rejects duplicates', () => {
    const alice = { id: '1', username: 'alice' };
    const bob = { id: '2', username: 'bob', discordId: '123456789012345678' };
    const users = [alice, bob];

    assert.equal(hasLinkedDiscordId(alice), false);
    assert.deepEqual(applyDiscordIdToUser(users, alice, 'not-an-id'), {
        error: 'Discord user ID must be a numeric snowflake (Developer Mode → Copy User ID).',
    });
    assert.equal(applyDiscordIdToUser(users, alice, '123456789012345678').error.includes('bob'), true);
    assert.deepEqual(applyDiscordIdToUser(users, alice, '223456789012345678'), { changed: true });
    assert.equal(alice.discordId, '223456789012345678');
    assert.equal(hasLinkedDiscordId(alice), true);
    assert.deepEqual(applyDiscordIdToUser(users, alice, ''), { changed: true });
    assert.equal(alice.discordId, undefined);
});

test('preference patch uses the full user list for Discord uniqueness', () => {
    const alice = { id: '1', username: 'alice' };
    const bob = { id: '2', username: 'bob', discordId: '123456789012345678' };
    const { errors, changed } = applyAccountPreferencePatch(alice, { discordId: '123456789012345678' }, {
        users: [alice, bob],
    });
    assert.equal(changed, false);
    assert.match(errors[0], /bob/);
});
