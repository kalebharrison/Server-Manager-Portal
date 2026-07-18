import assert from 'node:assert/strict';
import test from 'node:test';

import { cacheRefreshMs, normalizeCacheRefreshMinutes } from '../../lib/cache/cache-refresh.js';

test('cache refresh interval defaults and stays within operational bounds', () => {
    assert.equal(normalizeCacheRefreshMinutes(undefined), 5);
    assert.equal(normalizeCacheRefreshMinutes(0), 1);
    assert.equal(normalizeCacheRefreshMinutes(90), 60);
    assert.equal(cacheRefreshMs({ cacheRefreshMinutes: 10 }), 600_000);
});
