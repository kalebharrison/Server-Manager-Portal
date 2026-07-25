import assert from 'node:assert/strict';
import test from 'node:test';

import { createDiscordNlParser, matchPhraseIntent, normalizeDiscordSearchQuery } from '../../lib/discord/discord-nl.js';

test('phrase matcher maps request phrases', () => {
    assert.deepEqual(matchPhraseIntent('request dune'), {
        intent: 'request.search',
        params: { query: 'dune', mediaType: 'all' },
    });
    assert.equal(matchPhraseIntent('request the tv show foundation').params.mediaType, 'tv');
});

test('phrase matcher maps ops intents', () => {
    assert.equal(matchPhraseIntent('my stats').intent, 'stats.me');
    assert.equal(matchPhraseIntent("who's watching").intent, 'live.sessions');
    assert.equal(matchPhraseIntent("what's downloading").intent, 'queue.list');
    assert.equal(matchPhraseIntent('open issues').intent, 'issue.list');
    assert.equal(matchPhraseIntent('trending').params.category, 'trending');
});

test('phrase matcher returns null when unclear', () => {
    assert.equal(matchPhraseIntent('hello there'), null);
});

test('normalizeDiscordSearchQuery strips trailing media filler', () => {
    assert.equal(normalizeDiscordSearchQuery('Brad Pitt movie'), 'Brad Pitt');
    assert.equal(normalizeDiscordSearchQuery('the dune'), 'dune');
    assert.equal(normalizeDiscordSearchQuery('foundation tv show'), 'foundation');
    assert.equal(normalizeDiscordSearchQuery('Inception'), 'Inception');
});

test('parseIntent falls back to help when no phrase and LLM off', async () => {
    const nl = createDiscordNlParser();
    const result = await nl.parseIntent({ discordLlmEnabled: false }, 'asdfqwer');
    assert.deepEqual(result, { intent: 'help', params: {} });
});

test('parseIntent uses mocked LLM when phrases miss', async () => {
    const nl = createDiscordNlParser({
        fetchImpl: async () => ({
            ok: true,
            json: async () => ({
                choices: [{ message: { content: JSON.stringify({ intent: 'stats.me', params: {} }) } }],
            }),
        }),
    });
    const result = await nl.parseIntent({
        discordLlmEnabled: true,
        discordLlmUrl: 'http://llm.local/v1',
        discordLlmApiKey: 'key',
        discordLlmModel: 'test',
    }, 'how am I doing lately');
    assert.deepEqual(result, { intent: 'stats.me', params: {} });
});
