import assert from 'node:assert/strict';
import test from 'node:test';

import { createDiscordMediaAgent, isDiscordAgentReady } from '../../lib/discord/discord-media-agent.js';

const agentConfig = {
    discordAgentEnabled: true,
    discordLlmEnabled: true,
    discordLlmUrl: 'http://llm:4000/v1',
    discordLlmApiKey: 'ollama',
    discordLlmModel: 'qwen2.5:7b',
    discordSearxngUrl: 'http://searxng:8080',
};

test('isDiscordAgentReady requires LLM only (search has free fallback)', () => {
    assert.equal(isDiscordAgentReady(agentConfig), true);
    assert.equal(isDiscordAgentReady({ ...agentConfig, discordSearxngUrl: '' }), true);
    assert.equal(isDiscordAgentReady({ ...agentConfig, discordLlmApiKey: '' }), false);
    assert.equal(isDiscordAgentReady({ ...agentConfig, discordAgentEnabled: false }), false);
});

test('agent uses web_search then finish with hydrated candidates', async () => {
    let chatRound = 0;
    const fetchImpl = async (url, options = {}) => {
        const href = String(url);
        if (href.includes('/search') && href.includes('format=json')) {
            return {
                ok: true,
                json: async () => ({
                    results: [{
                        title: 'Army of the Dead',
                        url: 'https://example.com',
                        content: 'Zack Snyder zombie casino heist movie',
                    }],
                }),
            };
        }
        if (href.includes('/chat/completions')) {
            chatRound += 1;
            if (chatRound === 1) {
                return {
                    ok: true,
                    json: async () => ({
                        choices: [{
                            message: {
                                role: 'assistant',
                                content: null,
                                tool_calls: [{
                                    id: 'call_web',
                                    type: 'function',
                                    function: {
                                        name: 'web_search',
                                        arguments: JSON.stringify({ query: 'zombie movie set in a casino' }),
                                    },
                                }],
                            },
                        }],
                    }),
                };
            }
            return {
                ok: true,
                json: async () => ({
                    choices: [{
                        message: {
                            role: 'assistant',
                            content: null,
                            tool_calls: [{
                                id: 'call_finish',
                                type: 'function',
                                function: {
                                    name: 'finish',
                                    arguments: JSON.stringify({
                                        answer: 'Army of the Dead is a zombie heist set in a Las Vegas casino.',
                                        candidates: [{ mediaType: 'movie', tmdbId: 503736, title: 'Army of the Dead' }],
                                    }),
                                },
                            }],
                        },
                    }],
                }),
            };
        }
        throw new Error(`Unexpected fetch ${href} ${options.method || 'GET'}`);
    };

    const agent = createDiscordMediaAgent({
        fetchImpl,
        getRequestAppService: () => ({
            search: async () => ({ results: [] }),
            searchPeople: async () => ({ results: [] }),
            getPersonFilmography: async () => ({ results: [] }),
            getMediaDetails: async (_config, { mediaType, tmdbId }) => ({
                mediaType,
                tmdbId,
                title: 'Army of the Dead',
                year: '2021',
                available: false,
                canRequest: true,
            }),
        }),
    });

    const outcome = await agent.run(agentConfig, "I'm looking for a zombie movie that's set in a casino");
    assert.equal(outcome.ok, true);
    assert.match(outcome.answer, /Army of the Dead/i);
    assert.equal(outcome.results.length, 1);
    assert.equal(outcome.results[0].tmdbId, 503736);
});

test('agent fails clearly when model skips tools', async () => {
    const agent = createDiscordMediaAgent({
        fetchImpl: async () => ({
            ok: true,
            json: async () => ({
                choices: [{ message: { role: 'assistant', content: 'Just watch something fun.' } }],
            }),
        }),
        getRequestAppService: () => ({}),
    });
    const outcome = await agent.run(agentConfig, 'recommend a movie');
    assert.equal(outcome.ok, false);
    assert.match(outcome.answer, /did not use discovery tools/i);
});
