import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildDiscordConfigFields,
    buildPublicDiscordConfig,
    sanitizeDiscordInviteUrl,
    sanitizeDiscordUserId,
} from '../../lib/discord/discord-config.js';

test('discord invite URLs must be discord hosts', () => {
    assert.equal(sanitizeDiscordInviteUrl('https://discord.gg/abc123'), 'https://discord.gg/abc123');
    assert.throws(() => sanitizeDiscordInviteUrl('https://example.com/invite'), /discord\.gg or discord\.com/);
});

test('discord user ids must be numeric snowflakes', () => {
    assert.equal(sanitizeDiscordUserId('123456789012345678'), '123456789012345678');
    assert.equal(sanitizeDiscordUserId(''), '');
    assert.equal(sanitizeDiscordUserId('not-a-id'), null);
});

test('buildDiscordConfigFields preserves masked secrets', () => {
    const mask = '••••••••';
    const fields = buildDiscordConfigFields({
        body: {
            discordEnabled: true,
            discordInviteUrl: 'https://discord.gg/portal',
            discordBotToken: mask,
            discordWebhookUrl: mask,
            discordBotEnabled: true,
            discordGuildId: '1234567890',
        },
        existingConfig: {
            discordBotToken: 'real-bot-token',
            discordWebhookUrl: 'https://discord.com/api/webhooks/1/abc',
        },
        resolveSecret: (value, existing) => (value === mask ? existing : value),
    });
    assert.equal(fields.discordEnabled, true);
    assert.equal(fields.discordBotToken, 'real-bot-token');
    assert.equal(fields.discordWebhookUrl, 'https://discord.com/api/webhooks/1/abc');
    assert.equal(fields.discordGuildId, '1234567890');
});

test('public discord config hides secrets', () => {
    assert.deepEqual(buildPublicDiscordConfig({
        discordEnabled: true,
        discordInviteUrl: 'https://discord.gg/x',
        discordChatChannelLabel: '#requests',
        discordBotToken: 'secret',
        discordWebhookUrl: 'https://discord.com/api/webhooks/1/x',
    }), {
        discordEnabled: true,
        discordInviteUrl: 'https://discord.gg/x',
        discordChatChannelLabel: '#requests',
        discordMediaChannelLabel: '',
    });
});
