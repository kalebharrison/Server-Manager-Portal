import assert from 'node:assert/strict';
import test from 'node:test';

import { createRequestAppDiscoverChat } from '../../lib/request-app/request-app-discover-chat.js';
import { registerRequestAppRoutes } from '../../lib/request-app/request-app-routes.js';
import { normalizeAgentHistory } from '../../lib/discord/discord-media-agent.js';

const agentConfig = {
    discordAgentEnabled: true,
    discordLlmEnabled: true,
    discordLlmUrl: 'http://llm:4000/v1',
    discordLlmApiKey: 'ollama',
    discordLlmModel: 'qwen2.5:7b',
};

test('normalizeAgentHistory keeps capped user/assistant turns', () => {
    const history = normalizeAgentHistory([
        { role: 'user', content: 'zombie casino movie' },
        { role: 'assistant', content: 'Try Army of the Dead.' },
        { role: 'tool', content: 'ignored' },
        { role: 'user', content: 'what about Remains 2011?' },
    ]);
    assert.deepEqual(history, [
        { role: 'user', content: 'zombie casino movie' },
        { role: 'assistant', content: 'Try Army of the Dead.' },
        { role: 'user', content: 'what about Remains 2011?' },
    ]);
});

test('discover chat uses history on follow-up turns', async () => {
    const bodies = [];
    const chat = createRequestAppDiscoverChat({
        fetchImpl: async (_url, options = {}) => {
            const body = JSON.parse(options.body || '{}');
            bodies.push(body);
            const lastUser = [...body.messages].reverse().find((entry) => entry.role === 'user');
            if (String(lastUser?.content || '').includes('Remains')) {
                return {
                    ok: true,
                    json: async () => ({
                        choices: [{
                            message: {
                                role: 'assistant',
                                tool_calls: [{
                                    id: 'finish1',
                                    type: 'function',
                                    function: {
                                        name: 'finish',
                                        arguments: JSON.stringify({
                                            answer: 'Remains (2011) is a zombie casino film.',
                                            candidates: [],
                                        }),
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
                                id: 'search1',
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
        },
        requestAppService: {
            search: async (_config, { query }) => {
                if (/Remains/i.test(query)) {
                    return {
                        results: [{ mediaType: 'movie', tmdbId: 71676, title: 'Remains', year: '2011' }],
                    };
                }
                return {
                    results: [{ mediaType: 'movie', tmdbId: 503736, title: 'Army of the Dead', year: '2021' }],
                };
            },
            getMediaDetails: async (_config, { mediaType, tmdbId }) => ({
                mediaType,
                tmdbId,
                title: tmdbId === 71676 ? 'Remains' : 'Army of the Dead',
                year: tmdbId === 71676 ? '2011' : '2021',
            }),
        },
    });

    // First turn triggers search then needs another LLM round — simplify: follow-up only
    const outcome = await chat.runDiscoverChat(agentConfig, {
        query: 'what about Remains 2011?',
        history: [
            { role: 'user', content: 'zombie movie set in a casino' },
            { role: 'assistant', content: 'Army of the Dead fits that description.' },
        ],
    });
    assert.equal(outcome.ok, true);
    assert.match(outcome.answer, /Remains/i);
    assert.equal(outcome.results[0]?.tmdbId, 71676);
    assert.ok(bodies[0].messages.some((entry) => entry.role === 'assistant' && /Army of the Dead/.test(entry.content)));
    assert.ok(bodies[0].messages.some((entry) => entry.role === 'user' && /Remains/.test(entry.content)));
});

test('discover chat routes stats questions to ops (not media search)', async () => {
    let llmCalled = false;
    const chat = createRequestAppDiscoverChat({
        fetchImpl: async () => {
            llmCalled = true;
            throw new Error('LLM should not run for stats');
        },
        requestAppService: {
            getRequestCounts: async () => ({ pending: 2, processing: 1, available: 40 }),
            listRequests: async () => ({ results: [] }),
            search: async () => ({ results: [] }),
            getMediaDetails: async () => null,
        },
    });
    const outcome = await chat.runDiscoverChat(agentConfig, {
        query: 'what are my current stats?',
        sessionUser: { username: 'kaleb', expiryDate: null },
    });
    assert.equal(outcome.ok, true);
    assert.equal(outcome.intent, 'stats.me');
    assert.equal(llmCalled, false);
    assert.match(outcome.answer, /Portal user: \*\*kaleb\*\*/i);
    assert.match(outcome.answer, /pending: 2/i);
    assert.equal(outcome.results.length, 0);
});

test('POST /api/request-app/discover-chat returns agent answer', async () => {
    let handler;
    const app = {
        get() {},
        post(path, ...handlers) {
            if (path === '/api/request-app/discover-chat') handler = handlers.at(-1);
        },
        delete() {},
    };
    registerRequestAppRoutes({
        app,
        requireAuth: (_req, _res, next) => next?.(),
        requireMember: (_req, _res, next) => next?.(),
        requireAdmin: (_req, _res, next) => next?.(),
        configPath: 'config.json',
        loadFile: async () => agentConfig,
        requestAppService: {
            getRequestAppGate: () => ({ ready: true, configured: true, supported: true }),
            search: async () => ({ results: [] }),
            getMediaDetails: async () => null,
        },
        appendAuditLog: async () => {},
        fetchImpl: async () => ({
            ok: true,
            json: async () => ({
                choices: [{
                    message: {
                        role: 'assistant',
                        tool_calls: [{
                            id: 'finish',
                            type: 'function',
                            function: {
                                name: 'finish',
                                arguments: JSON.stringify({ answer: 'Try Dune.', candidates: [] }),
                            },
                        }],
                    },
                }],
            }),
        }),
        log() {},
    });

    assert.equal(typeof handler, 'function');
    let payload;
    let statusCode = 200;
    await handler(
        { body: { query: 'recommend a sci-fi movie' }, user: { id: 'u1', username: 'tester' } },
        {
            status(code) { statusCode = code; return this; },
            json(body) { payload = body; },
        },
    );
    assert.equal(statusCode, 200);
    assert.equal(payload.ok, true);
    assert.match(payload.answer, /Dune/i);
});
