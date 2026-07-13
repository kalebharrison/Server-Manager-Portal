import assert from 'node:assert/strict';
import test from 'node:test';

import { createRequestImageCache } from '../lib/request-image-cache.js';

test('request poster cache accepts only bounded TMDB images and reuses bytes', async () => {
    let calls = 0;
    const cache = createRequestImageCache({
        fetchWithTimeout: async () => {
            calls++;
            return {
                ok: true,
                headers: { get: (name) => name === 'content-type' ? 'image/webp' : '3' },
                arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer,
            };
        },
    });

    assert.equal(cache.peek('https://image.tmdb.org/t/p/w342/poster.jpg').image, null);
    const first = await cache.load('https://image.tmdb.org/t/p/w342/poster.jpg');
    const second = await cache.load('https://image.tmdb.org/t/p/w342/poster.jpg');
    assert.equal(cache.peek('https://image.tmdb.org/t/p/w342/poster.jpg').image?.contentType, 'image/webp');
    assert.equal(first.contentType, 'image/webp');
    assert.deepEqual(first.body, second.body);
    assert.equal(calls, 1);
    await assert.rejects(() => cache.load('http://127.0.0.1/private'), /Unsupported poster source/);
});
