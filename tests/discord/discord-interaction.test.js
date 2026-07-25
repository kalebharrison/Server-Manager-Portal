import assert from 'node:assert/strict';
import test from 'node:test';

import { ensureDeferredReply, replyOrEdit } from '../../lib/discord/discord-interaction.js';

test('ensureDeferredReply defers only once', async () => {
    const calls = [];
    const interaction = {
        deferred: false,
        replied: false,
        deferReply: async (options) => {
            calls.push(options);
            interaction.deferred = true;
        },
    };
    await ensureDeferredReply(interaction);
    await ensureDeferredReply(interaction);
    assert.equal(calls.length, 1);
});

test('replyOrEdit uses editReply when deferred', async () => {
    let edited = null;
    const interaction = {
        deferred: true,
        replied: false,
        editReply: async (payload) => { edited = payload; },
        reply: async () => { throw new Error('should not reply'); },
    };
    await replyOrEdit(interaction, { embeds: [{ title: 'help' }], ephemeral: true });
    assert.deepEqual(edited, { embeds: [{ title: 'help' }] });
});
