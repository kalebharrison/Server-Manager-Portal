import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createPersonalAnalyticsCache } from '../../lib/analytics/personal-analytics-cache.js';

const loadFile = async (file, fallback) => JSON.parse(await fs.readFile(file, 'utf8').catch(() => JSON.stringify(fallback)));
const saveFile = async (file, value) => fs.writeFile(file, JSON.stringify(value));

test('personal analytics snapshots persist by server, account, and period', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'portal-personal-analytics-'));
    const cachePath = path.join(dir, 'cache.json');
    const identity = { serverIdentifier: 'server-1', accountId: '42', period: 30 };
    let builds = 0;

    const firstCache = createPersonalAnalyticsCache({ cachePath, loadFile, saveFile });
    const first = await firstCache.get(identity, async () => ({ totalPlays: ++builds }));
    assert.equal(first.totalPlays, 1);

    const restartedCache = createPersonalAnalyticsCache({ cachePath, loadFile, saveFile });
    const persisted = await restartedCache.get(identity, async () => ({ totalPlays: ++builds }));
    assert.equal(persisted.totalPlays, 1);
    assert.equal(builds, 1);
});
