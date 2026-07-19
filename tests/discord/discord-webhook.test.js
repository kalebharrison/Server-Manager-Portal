import assert from 'node:assert/strict';
import test from 'node:test';

import { createDiscordNotifier } from '../../lib/discord/discord-notify.js';
import { postDiscordWebhook } from '../../lib/discord/discord-webhook.js';

test('postDiscordWebhook posts JSON payloads', async () => {
    const calls = [];
    const ok = await postDiscordWebhook('https://discord.com/api/webhooks/1/token', {
        content: 'hello',
    }, {
        fetchImpl: async (url, options) => {
            calls.push({ url, options });
            return { ok: true };
        },
    });
    assert.equal(ok, true);
    assert.equal(calls.length, 1);
    assert.equal(JSON.parse(calls[0].options.body).content, 'hello');
});

test('discord notifier respects enable + event toggles', async () => {
    const calls = [];
    const fetchImpl = async () => {
        calls.push(1);
        return { ok: true };
    };
    const notifier = createDiscordNotifier({ fetchImpl });
    await notifier.notifyRequestUpdate({
        discordEnabled: true,
        discordWebhookUrl: 'https://discord.com/api/webhooks/1/token',
        discordNotifyRequestUpdates: false,
    }, { title: 'Movie', statusLabel: 'approved' });
    assert.equal(calls.length, 0);

    await notifier.notifyRequestUpdate({
        discordEnabled: true,
        discordWebhookUrl: 'https://discord.com/api/webhooks/1/token',
        discordNotifyRequestUpdates: true,
    }, { title: 'Movie', statusLabel: 'approved', requestedBy: { username: 'sam' } });
    assert.equal(calls.length, 1);
});
