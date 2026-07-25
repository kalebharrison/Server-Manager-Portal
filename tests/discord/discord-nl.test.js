import assert from 'node:assert/strict';
import test from 'node:test';

import { createDiscordNlParser, isPersonFilmographyQuery, isThemeDiscoverQuery, matchPhraseIntent, normalizeDiscordSearchQuery, normalizePersonQuery } from '../../lib/discord/discord-nl.js';

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

test('normalizePersonQuery strips filmography phrasing', () => {
    assert.equal(normalizePersonQuery('Brad Pitt movie'), 'Brad Pitt');
    assert.equal(normalizePersonQuery('Brad Pitt was in'), 'Brad Pitt');
    assert.equal(normalizePersonQuery('director Christopher Nolan'), 'Christopher Nolan');
});

test('phrase matcher maps person filmography queries', () => {
    assert.deepEqual(matchPhraseIntent("what's the latest movie Brad Pitt was in"), {
        intent: 'request.person',
        params: { query: 'Brad Pitt', mediaType: 'movie', creditType: 'cast' },
    });
    assert.deepEqual(matchPhraseIntent('movies starring Brad Pitt'), {
        intent: 'request.person',
        params: { query: 'Brad Pitt', mediaType: 'all', creditType: 'cast' },
    });
    assert.deepEqual(matchPhraseIntent('directed by Christopher Nolan'), {
        intent: 'request.person',
        params: { query: 'Christopher Nolan', mediaType: 'all', creditType: 'crew' },
    });
});

test('isPersonFilmographyQuery detects filmography phrasing', () => {
    assert.equal(isPersonFilmographyQuery('latest movie by Brad Pitt'), true);
    assert.equal(isPersonFilmographyQuery('request dune'), false);
});

test('phrase matcher maps theme discover queries', () => {
    assert.deepEqual(matchPhraseIntent("what's the latest zombie movie"), {
        intent: 'request.discover_theme',
        params: { theme: 'zombie', mediaType: 'movie', recent: true },
    });
    assert.deepEqual(matchPhraseIntent('newest comedy shows'), {
        intent: 'request.discover_theme',
        params: { theme: 'comedy', mediaType: 'tv', recent: true },
    });
});

test('isThemeDiscoverQuery detects themed latest queries', () => {
    assert.equal(isThemeDiscoverQuery("what's the latest zombie movie"), true);
    assert.equal(isThemeDiscoverQuery('latest movie by Brad Pitt'), false);
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

test('routeAskIntent keeps ops phrases on fixed handlers', async () => {
    const nl = createDiscordNlParser();
    const result = await nl.routeAskIntent({}, "what's downloading", { agentReady: true });
    assert.equal(result.intent, 'queue.list');
});

test('routeAskIntent sends discovery to agent when ready', async () => {
    const nl = createDiscordNlParser();
    const text = "I'm looking for a zombie movie that's set in a casino";
    const result = await nl.routeAskIntent({}, text, { agentReady: true });
    assert.deepEqual(result, { intent: 'agent.discover', params: { query: text } });
});

test('routeAskIntent rejects non-media asks when agent ready', async () => {
    const nl = createDiscordNlParser();
    const text = "I'm looking for the best trashcan on the internet. what does reddit say?";
    const result = await nl.routeAskIntent({}, text, { agentReady: true });
    assert.deepEqual(result, { intent: 'agent.out_of_scope', params: { query: text } });
});

test('routeAskIntent falls back to theme phrase when agent not ready', async () => {
    const nl = createDiscordNlParser();
    const result = await nl.routeAskIntent({ discordLlmEnabled: false }, "what's the latest zombie movie", {
        agentReady: false,
    });
    assert.equal(result.intent, 'request.discover_theme');
});
