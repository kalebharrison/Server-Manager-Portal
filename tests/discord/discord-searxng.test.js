import assert from 'node:assert/strict';
import test from 'node:test';

import { createSearxngClient, sanitizeSearxngUrl } from '../../lib/discord/discord-searxng.js';

test('sanitizeSearxngUrl strips trailing slash', () => {
    assert.equal(sanitizeSearxngUrl('http://searxng:8080/'), 'http://searxng:8080');
    assert.equal(sanitizeSearxngUrl(''), '');
});

test('SearXNG client parses JSON results', async () => {
    const client = createSearxngClient({
        fetchImpl: async (url) => {
            assert.match(String(url), /format=json/);
            assert.match(String(url), /zombie/);
            return {
                ok: true,
                json: async () => ({
                    results: [
                        { title: 'Army of the Dead', url: 'https://example.com/a', content: 'Zombie heist in a casino' },
                        { title: 'Other', url: 'https://example.com/b', content: 'x' },
                    ],
                }),
            };
        },
    });
    const results = await client.search('http://searxng:8080', 'zombie casino movie', { limit: 1 });
    assert.equal(results.length, 1);
    assert.equal(results[0].title, 'Army of the Dead');
    assert.match(results[0].content, /casino/i);
});
