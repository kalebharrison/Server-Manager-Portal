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
    assert.equal(humanQcReason('qualityDowngrade'), 'not an upgrade');
    assert.equal(humanQcReason('fakeRemux'), 'fake remux (mp4/lossy)');
});

test('qc cleanup digest lumps season-pack queue rows into one download', () => {
    const mindhunter = (killed, success, i) => ({
        killed,
        success,
        title: 'MINDHUNTER',
        downloadId: 'abc123',
        reason: 'qualityDowngrade',
        client: 'qbit',
        arrType: 'sonarr',
        wastedBytes: 56 * 1024 ** 3,
        key: `arr:sonarr:1:${i}`,
    });
    const payload = buildQcCleanupDigest({
        killed: 2,
        failed: 8,
        results: [
            mindhunter(true, true, 1),
            {
                killed: true,
                success: true,
                title: 'Ted Lasso',
                downloadId: 'ted1',
                reason: 'qualityDowngrade',
                client: 'sab',
                arrType: 'sonarr',
                wastedBytes: 7.5 * 1024 ** 3,
            },
            ...[2, 3, 4, 5, 6, 7, 8, 9].map((i) => mindhunter(false, false, i)),
        ],
    });
    assert.match(payload.description, /Removed \*\*2\*\* stalled\/failed downloads/);
    assert.doesNotMatch(payload.description, /remove failed/i);
    assert.equal(payload.fields.length, 1);
    assert.match(payload.fields[0].value, /\*\*MINDHUNTER\*\*/);
    assert.match(payload.fields[0].value, /9 items/);
    assert.match(payload.fields[0].value, /Ted Lasso/);
    assert.match(payload.fields[0].value, /56 GB/);
    assert.equal((payload.fields[0].value.match(/MINDHUNTER/g) || []).length, 1);
});
