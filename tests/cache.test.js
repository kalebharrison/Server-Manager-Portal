import assert from 'node:assert/strict';
import test from 'node:test';

import { createTtlCache } from '../lib/cache.js';

test('TTL cache returns stale data while refreshing in the background', async () => {
    const originalNow = Date.now;
    let now = 1000;
    let releaseRefresh;
    Date.now = () => now;
    try {
        const cache = createTtlCache();
        assert.equal(await cache.getOrSet('key', 100, async () => 'first'), 'first');
        now += 101;
        const stale = await cache.getOrSet('key', 100, () => new Promise((resolve) => { releaseRefresh = resolve; }));
        assert.equal(stale, 'first');
        releaseRefresh('second');
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(await cache.getOrSet('key', 100, async () => 'unused'), 'second');
    } finally {
        Date.now = originalNow;
    }
});
