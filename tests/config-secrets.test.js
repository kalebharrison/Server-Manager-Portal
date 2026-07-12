import assert from 'node:assert/strict';
import test from 'node:test';

import { createConfigSecretProtector, SECRET_FIELDS } from '../lib/config-secrets.js';

const KEY = 'test-config-encryption-key-0123456789abcdef';

test('configuration credentials are authenticated and encrypted at rest', () => {
    const protector = createConfigSecretProtector(KEY);
    const config = Object.fromEntries(SECRET_FIELDS.map((field) => [field, `${field}-secret-value`]));
    config.serverIdentifier = 'server-id';

    const protectedConfig = protector.protectConfig(config);
    for (const field of SECRET_FIELDS) {
        assert.match(protectedConfig[field], /^smp:enc:v1:/);
        assert.equal(protectedConfig[field].includes(config[field]), false);
    }
    assert.equal(protectedConfig.serverIdentifier, 'server-id');
    assert.deepEqual(protector.unprotectConfig(protectedConfig), config);
});

test('configuration encryption fails closed for a wrong key or modified ciphertext', () => {
    const protector = createConfigSecretProtector(KEY);
    const protectedConfig = protector.protectConfig({ plexToken: 'owner-token' });
    const wrongKeyProtector = createConfigSecretProtector('different-test-encryption-key-0123456789abcdef');

    assert.throws(() => wrongKeyProtector.unprotectConfig(protectedConfig), /could not be authenticated/);
    const tampered = { ...protectedConfig, plexToken: `${protectedConfig.plexToken.slice(0, -1)}A` };
    assert.throws(() => protector.unprotectConfig(tampered), /could not be authenticated/);
});

test('backup payloads are fully encrypted and legacy backups remain readable', () => {
    const protector = createConfigSecretProtector(KEY);
    const backup = {
        schemaVersion: 2,
        createdAt: '2026-07-12T00:00:00.000Z',
        createdBy: 'admin',
        reason: 'test',
        data: { config: { plexToken: 'owner-token' }, users: [{ username: 'private-user' }] },
    };
    const sealed = protector.sealBackup(backup);

    assert.equal(sealed.encrypted, true);
    assert.equal(JSON.stringify(sealed).includes('owner-token'), false);
    assert.equal(JSON.stringify(sealed).includes('private-user'), false);
    assert.deepEqual(protector.openBackup(sealed), backup);
    assert.equal(protector.openBackup(backup), backup);
});
