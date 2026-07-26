import assert from 'node:assert/strict';
import test from 'node:test';

import {
    cleanAgentAnswer,
    createDiscordMediaAgent,
    extractFinishFromContent,
    isDiscordAgentReady,
    isMediaScopedQuery,
    OUT_OF_SCOPE_ANSWER,
    simplifyDiscoverSearchQuery,
    titleHintsFromWebResults,
} from '../../lib/discord/discord-media-agent.js';

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

test('cleanAgentAnswer strips Finish: leakage', () => {
    assert.equal(
        cleanAgentAnswer("Finish: The movie 'Remains' (2011) can be requested."),
        "The movie 'Remains' (2011) can be requested.",
    );
});

test('cleanAgentAnswer strips finish.answer / finish.candidates dumps', () => {
    const leaked = [
        'Based on the search, "Army of the Dead" (2021) is a zombie movie set in a casino. It\'s available on Netflix.',
        '',
        'finish.candidates: ["Army of the Dead (2021)"]',
        'finish.answer: Let\'s watch "Army of the Dead"!',
    ].join('\n');
    assert.equal(
        cleanAgentAnswer(leaked),
        'Based on the search, "Army of the Dead" (2021) is a zombie movie set in a casino. It\'s available on Netflix.',
    );
});

test('cleanAgentAnswer strips trailing finish JSON blobs', () => {
    const leaked = [
        'Army of the Dead (2021) might be what you\'re looking for.',
        '',
        'Would you like to check if we have it available?',
        '',
        '{',
        '  "answer": "Have you tried \'Army of the Dead\' (2021)?",',
        '  "candidates": [{ "mediaType": "movie", "tmdbId": 489736 }]',
        '}',
    ].join('\n');
    const cleaned = cleanAgentAnswer(leaked);
    assert.match(cleaned, /Army of the Dead/);
    assert.doesNotMatch(cleaned, /candidates|tmdbId|489736/);
});

test('extractFinishFromContent parses Finish dumps', () => {
    const parsed = extractFinishFromContent("Some notes\nFinish: Remains (2011) is requestable.");
    assert.equal(parsed.answer, 'Remains (2011) is requestable.');
});

test('extractFinishFromContent parses finish.* field dumps', () => {
    const parsed = extractFinishFromContent([
        'Army of the Dead (2021) fits a zombie casino heist.',
        'finish.candidates: ["Army of the Dead (2021)"]',
        'finish.answer: Let\'s watch it!',
    ].join('\n'));
    assert.match(parsed.answer, /Army of the Dead/);
    assert.doesNotMatch(parsed.answer, /finish\./i);
});

test('isMediaScopedQuery allows media and rejects shopping', () => {
    assert.equal(isMediaScopedQuery('zombie movie set in a casino'), true);
    assert.equal(isMediaScopedQuery('Dune'), true);
    assert.equal(isMediaScopedQuery('what should I watch tonight'), true);
    assert.equal(
        isMediaScopedQuery("I'm looking for the best trashcan on the internet. what does reddit say?"),
        false,
    );
});

test('agent refuses off-topic without calling the LLM', async () => {
    let called = false;
    const agent = createDiscordMediaAgent({
        fetchImpl: async () => {
            called = true;
            throw new Error('LLM should not be called');
        },
        getRequestAppService: () => ({}),
    });
    const outcome = await agent.run(agentConfig, 'best trashcan on the internet');
    assert.equal(outcome.ok, true);
    assert.equal(outcome.answer, OUT_OF_SCOPE_ANSWER);
    assert.equal(called, false);
});

test('agent finalizes from Seerr hits when model dumps finish.* text', async () => {
    let chatRound = 0;
    const agent = createDiscordMediaAgent({
        fetchImpl: async (url) => {
            const href = String(url);
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
                                        id: 'call_search',
                                        type: 'function',
                                        function: {
                                            name: 'search_titles',
                                            arguments: JSON.stringify({ query: 'Army of the Dead' }),
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
                                content: [
                                    'Army of the Dead (2021) is a zombie casino heist.',
                                    'finish.candidates: ["Army of the Dead (2021)"]',
                                    'finish.answer: Let\'s watch it!',
                                ].join('\n'),
                            },
                        }],
                    }),
                };
            }
            throw new Error(`Unexpected fetch ${href}`);
        },
        getRequestAppService: () => ({
            search: async () => ({
                results: [{ mediaType: 'movie', tmdbId: 503736, title: 'Army of the Dead', year: '2021' }],
            }),
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
    const outcome = await agent.run(agentConfig, 'zombie casino movie');
    assert.equal(outcome.ok, true);
    assert.equal(chatRound, 2);
    assert.match(outcome.answer, /Army of the Dead/);
    assert.doesNotMatch(outcome.answer, /finish\./i);
    assert.equal(outcome.results[0]?.tmdbId, 503736);
});

test('agent prefers Seerr hits over invented finish tmdbIds', async () => {
    let chatRound = 0;
    const agent = createDiscordMediaAgent({
        fetchImpl: async (url) => {
            if (!String(url).includes('/chat/completions')) throw new Error('unexpected');
            chatRound += 1;
            if (chatRound === 1) {
                return {
                    ok: true,
                    json: async () => ({
                        choices: [{
                            message: {
                                role: 'assistant',
                                tool_calls: [{
                                    id: 'call_search',
                                    type: 'function',
                                    function: {
                                        name: 'search_titles',
                                        arguments: JSON.stringify({ query: 'Army of the Dead' }),
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
                            tool_calls: [{
                                id: 'call_finish',
                                type: 'function',
                                function: {
                                    name: 'finish',
                                    arguments: JSON.stringify({
                                        answer: 'Try Army of the Dead.',
                                        candidates: [{ mediaType: 'movie', tmdbId: 489736 }],
                                    }),
                                },
                            }],
                        },
                    }],
                }),
            };
        },
        getRequestAppService: () => ({
            search: async () => ({
                results: [{ mediaType: 'movie', tmdbId: 503736, title: 'Army of the Dead', year: '2021' }],
            }),
            getMediaDetails: async (_config, { tmdbId }) => {
                if (tmdbId === 489736) throw new Error('Unable to retrieve movie.');
                return {
                    mediaType: 'movie',
                    tmdbId,
                    title: 'Army of the Dead',
                    year: '2021',
                    available: false,
                    canRequest: true,
                };
            },
        }),
    });
    const outcome = await agent.run(agentConfig, 'zombie casino movie');
    assert.equal(outcome.ok, true);
    assert.equal(outcome.results[0]?.tmdbId, 503736);
    assert.doesNotMatch(outcome.answer, /\{|candidates/);
});

test('lookup_title failure does not crash the agent', async () => {
    let chatRound = 0;
    const agent = createDiscordMediaAgent({
        fetchImpl: async (url) => {
            if (!String(url).includes('/chat/completions')) throw new Error('unexpected');
            chatRound += 1;
            if (chatRound === 1) {
                return {
                    ok: true,
                    json: async () => ({
                        choices: [{
                            message: {
                                role: 'assistant',
                                tool_calls: [{
                                    id: 'call_lookup',
                                    type: 'function',
                                    function: {
                                        name: 'lookup_title',
                                        arguments: JSON.stringify({ mediaType: 'movie', tmdbId: 489736 }),
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
                            tool_calls: [{
                                id: 'call_finish',
                                type: 'function',
                                function: {
                                    name: 'finish',
                                    arguments: JSON.stringify({ answer: 'Could not find that title.', candidates: [] }),
                                },
                            }],
                        },
                    }],
                }),
            };
        },
        getRequestAppService: () => ({
            getMediaDetails: async () => {
                throw new Error('Unable to retrieve movie.');
            },
        }),
    });
    const outcome = await agent.run(agentConfig, 'Army of the Dead');
    assert.equal(outcome.ok, true);
    assert.match(outcome.answer, /Could not find/i);
});

test('titleHintsFromWebResults strips site suffixes', () => {
    assert.deepEqual(
        titleHintsFromWebResults([
            { title: 'Army of the Dead (2021) - Wikipedia' },
            { title: 'Army of the Dead | Netflix' },
            { title: 'Remains (2011) – movie review' },
        ]),
        ['Army of the Dead', 'Remains'],
    );
});

test('simplifyDiscoverSearchQuery strips filler for Seerr', () => {
    assert.equal(
        simplifyDiscoverSearchQuery("I'm looking for a zombie movie that's set in a casino"),
        'zombie casino',
    );
    assert.equal(simplifyDiscoverSearchQuery('what about "Remains" 2011?'), 'Remains');
});

test('agent auto-resolves Seerr from simplified NL query when web is empty', async () => {
    let searchQueries = [];
    const agent = createDiscordMediaAgent({
        fetchImpl: async (url) => {
            const href = String(url);
            if (href.includes('/chat/completions')) {
                return {
                    ok: true,
                    json: async () => ({
                        choices: [{
                            message: {
                                role: 'assistant',
                                tool_calls: [{
                                    id: 'web_1',
                                    type: 'function',
                                    function: {
                                        name: 'web_search',
                                        arguments: JSON.stringify({ query: 'zombie casino movie' }),
                                    },
                                }],
                            },
                        }],
                    }),
                };
            }
            // Empty web results from every search backend.
            return { ok: true, json: async () => ({ results: [] }), text: async () => '' };
        },
        getRequestAppService: () => ({
            search: async (_config, { query }) => {
                searchQueries.push(query);
                if (query === 'zombie casino') {
                    return {
                        results: [{ mediaType: 'movie', tmdbId: 503736, title: 'Army of the Dead', year: '2021' }],
                    };
                }
                return { results: [] };
            },
            getMediaDetails: async (_config, { mediaType, tmdbId }) => ({
                mediaType,
                tmdbId,
                title: 'Army of the Dead',
                year: '2021',
                canRequest: true,
            }),
        }),
    });
    const outcome = await agent.run(agentConfig, "I'm looking for a zombie movie that's set in a casino");
    assert.equal(outcome.ok, true);
    assert.ok(searchQueries.includes('zombie casino'));
    assert.equal(outcome.results[0]?.tmdbId, 503736);
});

test('agent auto-resolves Seerr after web_search-only loops', async () => {
    let chatRound = 0;
    let searchQueries = [];
    const agent = createDiscordMediaAgent({
        fetchImpl: async (url) => {
            const href = String(url);
            if (href.includes('/search') || href.includes('duckduckgo') || href.includes('api.search')) {
                return {
                    ok: true,
                    json: async () => ({
                        results: [{
                            title: 'Army of the Dead (2021) - Wikipedia',
                            url: 'https://example.com',
                            content: 'Zombie heist in Las Vegas',
                        }],
                    }),
                    text: async () => '',
                };
            }
            if (!href.includes('/chat/completions')) throw new Error(`Unexpected fetch ${href}`);
            chatRound += 1;
            // Keep calling web_search only — never finish / search_titles.
            return {
                ok: true,
                json: async () => ({
                    choices: [{
                        message: {
                            role: 'assistant',
                            tool_calls: [{
                                id: `web_${chatRound}`,
                                type: 'function',
                                function: {
                                    name: 'web_search',
                                    arguments: JSON.stringify({ query: 'zombie movie casino' }),
                                },
                            }],
                        },
                    }],
                }),
            };
        },
        getRequestAppService: () => ({
            search: async (_config, { query }) => {
                searchQueries.push(query);
                return {
                    results: [{ mediaType: 'movie', tmdbId: 503736, title: 'Army of the Dead', year: '2021' }],
                };
            },
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
    assert.equal(outcome.results[0]?.tmdbId, 503736);
    assert.ok(searchQueries.some((query) => /Army of the Dead|zombie/i.test(query)));
});

test('agent synthesizes finish from Seerr hits when rounds exhaust', async () => {
    let chatRound = 0;
    const agent = createDiscordMediaAgent({
        fetchImpl: async (url) => {
            const href = String(url);
            if (!href.includes('/chat/completions')) throw new Error(`Unexpected fetch ${href}`);
            chatRound += 1;
            return {
                ok: true,
                json: async () => ({
                    choices: [{
                        message: {
                            role: 'assistant',
                            content: null,
                            tool_calls: [{
                                id: `call_search_${chatRound}`,
                                type: 'function',
                                function: {
                                    name: 'search_titles',
                                    arguments: JSON.stringify({ query: 'Remains' }),
                                },
                            }],
                        },
                    }],
                }),
            };
        },
        getRequestAppService: () => ({
            search: async () => ({
                results: [{ mediaType: 'movie', tmdbId: 71676, title: 'Remains', year: '2011' }],
            }),
            getMediaDetails: async (_config, { mediaType, tmdbId }) => ({
                mediaType,
                tmdbId,
                title: 'Remains',
                year: '2011',
                available: false,
                canRequest: true,
            }),
        }),
    });
    const outcome = await agent.run(agentConfig, 'what about Remains 2011');
    assert.equal(outcome.ok, true);
    assert.equal(outcome.results[0]?.tmdbId, 71676);
    assert.match(outcome.answer, /titles that may match|Remains/i);
});
