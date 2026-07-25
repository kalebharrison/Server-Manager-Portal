import assert from 'node:assert/strict';
import test from 'node:test';

import { createDiscordWebSearch, parseDuckDuckGoHtml } from '../../lib/discord/discord-web-search.js';

const sampleHtml = `
<html><body>
<a class="result__a" href="https://example.com/army">Army of the Dead</a>
<a class="result__snippet" href="#">Zack Snyder zombie heist set in a Las Vegas casino</a>
<a class="result__a" href="https://example.com/other">Other Film</a>
<a class="result__snippet" href="#">Something else</a>
</body></html>
`;

test('parseDuckDuckGoHtml extracts title url and snippet', () => {
    const results = parseDuckDuckGoHtml(sampleHtml, { limit: 2 });
    assert.equal(results.length, 2);
    assert.equal(results[0].title, 'Army of the Dead');
    assert.equal(results[0].url, 'https://example.com/army');
    assert.match(results[0].content, /casino/i);
    assert.equal(results[0].engine, 'duckduckgo');
});

test('searchWeb uses Brave when key set and returns hits', async () => {
    const search = createDiscordWebSearch({
        fetchImpl: async (url) => {
            assert.match(String(url), /api\.search\.brave\.com/);
            return {
                ok: true,
                json: async () => ({
                    web: {
                        results: [{ title: 'Brave Hit', url: 'https://brave.example', description: 'from brave' }],
                    },
                }),
            };
        },
    });
    const outcome = await search.searchWeb({
        discordBraveSearchApiKey: 'brave-key',
    }, 'zombie casino');
    assert.equal(outcome.provider, 'brave');
    assert.equal(outcome.results[0].title, 'Brave Hit');
});

test('searchWeb falls back to DuckDuckGo when configured providers empty', async () => {
    const search = createDiscordWebSearch({
        fetchImpl: async (url, options = {}) => {
            if (String(url).includes('duckduckgo')) {
                assert.equal(options.method, 'POST');
                return { ok: true, text: async () => sampleHtml };
            }
            throw new Error(`unexpected ${url}`);
        },
    });
    const outcome = await search.searchWeb({}, 'zombie casino movie');
    assert.equal(outcome.provider, 'duckduckgo');
    assert.equal(outcome.results[0].title, 'Army of the Dead');
});

test('searchWeb prefers SearXNG when URL configured', async () => {
    const search = createDiscordWebSearch({
        fetchImpl: async (url) => {
            assert.match(String(url), /searxng/);
            return {
                ok: true,
                json: async () => ({
                    results: [{ title: 'Searx Hit', url: 'https://s.example', content: 'via searx' }],
                }),
            };
        },
    });
    const outcome = await search.searchWeb({
        discordSearxngUrl: 'http://searxng:8080',
        discordBraveSearchApiKey: 'unused',
    }, 'query');
    assert.equal(outcome.provider, 'searxng');
    assert.equal(outcome.results[0].title, 'Searx Hit');
});
