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

test('config store migrates retired Scanner auth into Integrity webhook fields on load', async () => {
    const stored = {
        scanner: { authUsername: 'legacy-user', authPassword: 'legacy-pass' },
    };
    const saved = [];
    const protector = {
        unprotectConfig: (value) => ({ ...value }),
        protectConfig: (value) => ({ ...value }),
        hasPlaintextSecrets: () => false,
    };

    const { loadFile } = createConfigFileAccess({
        configPath: '/tmp/config.json',
        loadJsonFile: async () => ({ ...stored }),
        saveJsonFile: async (_path, value) => {
            saved.push(value);
        },
        configSecretProtector: protector,
        normalizeArrConfig: (value) => value,
    });

    const config = await loadFile('/tmp/config.json', {});
    assert.equal(config.qcIntegrityWebhookUsername, 'legacy-user');
    assert.equal(config.qcIntegrityWebhookPassword, 'legacy-pass');
    assert.equal(config.scanner, undefined);

    // Migration persist is fire-and-forget; flush microtasks before asserting.
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(saved.length, 1);
    assert.equal(saved[0].scanner, undefined);
    assert.equal(saved[0].qcIntegrityWebhookUsername, 'legacy-user');
});

test('config store does not overwrite already-configured Integrity webhook auth from legacy Scanner fields', async () => {
    const stored = {
        qcIntegrityWebhookUsername: 'current-user',
        qcIntegrityWebhookPassword: 'current-pass',
        scanner: { authUsername: 'legacy-user', authPassword: 'legacy-pass' },
    };
    const protector = {
        unprotectConfig: (value) => ({ ...value }),
        protectConfig: (value) => ({ ...value }),
        hasPlaintextSecrets: () => false,
    };

    const { loadFile } = createConfigFileAccess({
        configPath: '/tmp/config.json',
        loadJsonFile: async () => ({ ...stored }),
        saveJsonFile: async () => {},
        configSecretProtector: protector,
        normalizeArrConfig: (value) => value,
    });

    const config = await loadFile('/tmp/config.json', {});
    assert.equal(config.qcIntegrityWebhookUsername, 'current-user');
    assert.equal(config.qcIntegrityWebhookPassword, 'current-pass');
    assert.equal(config.scanner, undefined);
});
