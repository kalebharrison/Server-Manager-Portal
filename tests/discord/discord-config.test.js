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
            discordLlmEnabled: true,
            discordLlmUrl: 'http://litellm:4000/v1',
            discordLlmApiKey: mask,
            discordLlmModel: 'gpt-4o-mini',
            discordMentionNl: true,
            discordAgentEnabled: true,
            discordSearxngUrl: 'http://searxng:8080/',
            discordBraveSearchApiKey: mask,
            discordTavilyApiKey: mask,
        },
        existingConfig: {
            discordBotToken: 'real-bot-token',
            discordWebhookUrl: 'https://discord.com/api/webhooks/1/abc',
            discordLlmApiKey: 'real-llm-key',
            discordBraveSearchApiKey: 'real-brave-key',
            discordTavilyApiKey: 'real-tavily-key',
        },
        resolveSecret: (value, existing) => (value === mask ? existing : value),
    });
    assert.equal(fields.discordEnabled, true);
    assert.equal(fields.discordBotToken, 'real-bot-token');
    assert.equal(fields.discordWebhookUrl, 'https://discord.com/api/webhooks/1/abc');
    assert.equal(fields.discordGuildId, '1234567890');
    assert.equal(fields.discordLlmEnabled, true);
    assert.equal(fields.discordLlmUrl, 'http://litellm:4000/v1');
    assert.equal(fields.discordLlmApiKey, 'real-llm-key');
    assert.equal(fields.discordMentionNl, true);
    assert.equal(fields.discordAgentEnabled, true);
    assert.equal(fields.discordSearxngUrl, 'http://searxng:8080');
    assert.equal(fields.discordBraveSearchApiKey, 'real-brave-key');
    assert.equal(fields.discordTavilyApiKey, 'real-tavily-key');
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
