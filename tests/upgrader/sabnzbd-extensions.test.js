import test from 'node:test';
import assert from 'node:assert/strict';
import { createSabClient } from '../../lib/upgrader/download-clients/sabnzbd.js';

const config = {
    qcSabUrl: 'http://sabnzbd:8080',
    qcSabApiKey: 'test-key',
};

test('SABnzbd blocked extensions read unwanted_extensions', async () => {
    const calls = [];
    const sab = createSabClient({
        fetchWithTimeout: async (url) => {
            calls.push(String(url));
            return {
                ok: true,
                json: async () => ({ config: { misc: { unwanted_extensions: ['exe', '.BAT', 'lnk'] } } }),
            };
        },
    });
    const list = await sab.getBlockedExtensions(config);
    assert.deepEqual(list, ['exe', 'bat', 'lnk']);
    assert.match(calls[0], /mode=get_config/);
    assert.match(calls[0], /keyword=unwanted_extensions/);
});

test('SABnzbd blocked extensions write unwanted_extensions and reject missing keys', async () => {
    const sabOk = createSabClient({
        fetchWithTimeout: async (url) => {
            const parsed = new URL(url);
            assert.equal(parsed.searchParams.get('keyword'), 'unwanted_extensions');
            assert.equal(parsed.searchParams.get('value'), 'exe,bat');
            return {
                ok: true,
                json: async () => ({ config: { misc: { unwanted_extensions: ['exe', 'bat'] } } }),
            };
        },
    });
    assert.deepEqual(await sabOk.setBlockedExtensions(config, ['exe', 'bat']), ['exe', 'bat']);

    const sabBad = createSabClient({
        fetchWithTimeout: async () => ({
            ok: true,
            json: async () => ({ status: false, error: 'Config item does not exist' }),
        }),
    });
    await assert.rejects(
        () => sabBad.setBlockedExtensions(config, ['exe']),
        /Config item does not exist/,
    );
});
