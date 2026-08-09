import assert from 'node:assert/strict';
import test from 'node:test';

import { buildQcCleanupDigest, humanQcReason } from '../../lib/upgrader/qc-cleanup-digest.js';

test('qc cleanup digest lists removed titles and reasons', () => {
    const payload = buildQcCleanupDigest({
        killed: 1,
        failed: 0,
        results: [{
            killed: true,
            success: true,
            title: 'Severance S01E03',
            reason: 'stalled',
            client: 'qbit',
            arrType: 'sonarr',
            wastedBytes: 3.2 * 1024 ** 3,
        }],
    });
    assert.equal(payload.title, 'Quality Control cleanup');
    assert.match(payload.description, /Removed \*\*1\*\* stalled\/failed download/);
    assert.equal(payload.fields.length, 1);
    assert.match(payload.fields[0].value, /Severance S01E03/);
    assert.match(payload.fields[0].value, /stalled/);
    assert.match(payload.fields[0].value, /qBit/);
    assert.match(payload.fields[0].value, /Sonarr/);
    assert.match(payload.fields[0].value, /3\.2 GB/);
});

test('qc cleanup digest skips empty runs and labels known reasons', () => {
    assert.equal(buildQcCleanupDigest({ killed: 0, failed: 0, results: [] }), null);
    assert.equal(humanQcReason('metaDL'), 'stuck fetching metadata');
});
