import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateDiscordMembership, isMemberAllowed } from '../../lib/discord/discord-member.js';

test('membership gate allows active linked user', () => {
    const user = { id: '1', username: 'alice', discordId: '99', plexAccessStatus: 'active' };
    assert.equal(isMemberAllowed(user), true);
    assert.deepEqual(evaluateDiscordMembership(user), { ok: true, reason: null });
});

test('membership gate denies missing user', () => {
    assert.deepEqual(evaluateDiscordMembership(null), { ok: false, reason: 'not_linked' });
});

test('membership gate denies revoked user', () => {
    assert.deepEqual(
        evaluateDiscordMembership({ plexAccessStatus: 'revoked' }),
        { ok: false, reason: 'revoked' },
    );
});

test('membership gate denies expired user', () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    assert.deepEqual(
        evaluateDiscordMembership({ plexAccessStatus: 'active', expiryDate: yesterday }),
        { ok: false, reason: 'expired' },
    );
});
