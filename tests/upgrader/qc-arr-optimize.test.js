import assert from 'node:assert/strict';
import test from 'node:test';

import {
    getArrAlignment,
    integrityHookAuthFingerprint,
    summarizeIntegrityHook,
} from '../../lib/upgrader/qc-arr-optimize.js';

test('summarizeIntegrityHook flags missing import hook and stale password', () => {
    const missing = summarizeIntegrityHook(null, { kind: 'sonarr', username: 'portal-integrity' });
    assert.equal(missing.aligned, false);
    assert.equal(missing.rows.find((row) => row.key === 'sonarr-hook').ok, false);

    const fp = integrityHookAuthFingerprint('portal-integrity', 'secret');
    const ready = summarizeIntegrityHook({
        name: 'Portal Integrity',
        onDownload: true,
        onUpgrade: true,
        fields: [
            { name: 'url', value: 'http://portal:2121/triggers/sonarr' },
            { name: 'username', value: 'portal-integrity' },
        ],
    }, {
        kind: 'sonarr',
        username: 'portal-integrity',
        fingerprint: fp,
        syncedFingerprint: fp,
    });
    assert.equal(ready.aligned, true);
    const urlRow = ready.rows.find((row) => row.key === 'sonarr-url');
    assert.equal(urlRow.current, urlRow.recommended);
});

test('getArrAlignment reports drift until a matching sync fingerprint exists', async () => {
    const fetchArr = async (_instance, endpoint) => {
        if (endpoint === '/api/v3/notification') {
            return {
                ok: true,
                data: [{
                    name: 'Portal Integrity',
                    onDownload: true,
                    onUpgrade: true,
                    fields: [
                        { name: 'url', value: 'http://portal:2121/triggers/sonarr' },
                        { name: 'username', value: 'portal-integrity' },
                    ],
                }],
            };
        }
        return { ok: true, data: [] };
    };
    const config = {
        upgraderEnabled: true,
        qcIntegrityEnabled: true,
        qcIntegrityWebhookUsername: 'portal-integrity',
        qcIntegrityWebhookPassword: 'secret',
        arrInstances: [
            { id: 's1', type: 'sonarr', name: 'Sonarr', url: 'http://sonarr.local', apiKey: 'a', enabled: true },
        ],
    };
    const before = await getArrAlignment(config, { fetchArr, loadPrefs: async () => ({}) });
    assert.equal(before.aligned, false);
    assert.equal(before.instances[0].rows.find((row) => row.key === 'sonarr-auth').current, 'never synced');

    const after = await getArrAlignment(config, {
        fetchArr,
        loadPrefs: async () => ({
            integrityHookSync: { fingerprint: integrityHookAuthFingerprint('portal-integrity', 'secret') },
        }),
    });
    assert.equal(after.aligned, true);
});
