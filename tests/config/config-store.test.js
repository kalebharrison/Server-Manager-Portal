import assert from 'node:assert/strict';
import test from 'node:test';

import { createConfigFileAccess } from '../../lib/config/config-store.js';

test('config store caches decrypted runtime config until save invalidates', async () => {
    let loadCalls = 0;
    const stored = { plexToken: 'enc:token', serverIdentifier: 'abc' };
    const protector = {
        unprotectConfig: (value) => {
            loadCalls += 1;
            return { ...value, plexToken: 'plain-token' };
        },
        protectConfig: (value) => ({ ...value, plexToken: `enc:${value.plexToken}` }),
        hasPlaintextSecrets: () => false,
    };

    const { loadFile, saveFile } = createConfigFileAccess({
        configPath: '/tmp/config.json',
        loadJsonFile: async () => ({ ...stored }),
        saveJsonFile: async (_path, value) => {
            Object.assign(stored, value);
        },
        configSecretProtector: protector,
        normalizeArrConfig: (value) => value,
    });

    const first = await loadFile('/tmp/config.json', {});
    const second = await loadFile('/tmp/config.json', {});
    assert.equal(first.plexToken, 'plain-token');
    assert.equal(second.plexToken, 'plain-token');
    assert.equal(loadCalls, 1);

    first.announcement = 'hello';
    await saveFile('/tmp/config.json', first);
    const third = await loadFile('/tmp/config.json', {});
    assert.equal(third.announcement, 'hello');
    assert.equal(third.plexToken, 'plain-token');
    // save updates in-memory cache; unprotect should not run again until invalidated
    assert.equal(loadCalls, 1);
});
