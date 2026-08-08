import test from 'node:test';
import assert from 'node:assert/strict';
import {
    summarizeQbitQueue,
    summarizeSabQueue,
    summarizeClientQueues,
} from '../../lib/upgrader/qc-client-status.js';

test('summarizeQbitQueue buckets download, seed, and error torrents', () => {
    const summary = summarizeQbitQueue([
        { client: 'qbit', state: 'downloading', dlspeed: 1024, upspeed: 0 },
        { client: 'qbit', state: 'stalledUP', dlspeed: 0, upspeed: 512 },
        { client: 'qbit', state: 'error', dlspeed: 0, upspeed: 0 },
        { client: 'qbit', state: 'pausedDL', dlspeed: 0, upspeed: 0 },
    ]);
    assert.equal(summary.total, 4);
    assert.equal(summary.downloading, 1);
    assert.equal(summary.seeding, 1);
    assert.equal(summary.error, 1);
    assert.equal(summary.paused, 1);
    assert.equal(summary.dlSpeed, 1024);
    assert.equal(summary.upSpeed, 512);
});

test('summarizeSabQueue splits active queue from recent history fails', () => {
    const summary = summarizeSabQueue(
        [
            { client: 'sab', source: 'queue', state: 'Downloading' },
            { client: 'sab', source: 'queue', state: 'Paused' },
            { client: 'sab', source: 'queue', state: 'Extracting' },
        ],
        [
            { client: 'sab', source: 'history', state: 'Completed' },
            { client: 'sab', source: 'history', state: 'Failed', failMessage: 'crc' },
        ],
    );
    assert.equal(summary.total, 3);
    assert.equal(summary.downloading, 1);
    assert.equal(summary.paused, 1);
    assert.equal(summary.extracting, 1);
    assert.equal(summary.history, 2);
    assert.equal(summary.completed, 1);
    assert.equal(summary.failed, 1);
});

test('summarizeClientQueues counts QC issues per client', () => {
    const summary = summarizeClientQueues({
        torrents: [{ client: 'qbit', state: 'downloading' }],
        sabQueue: [{ client: 'sab', source: 'queue', state: 'downloading' }],
        sabHistory: [],
        items: [
            { client: { client: 'qbit' }, strikeEligible: true },
            { client: { client: 'sab' }, actionable: true },
            { client: { client: 'qbit' }, strikeEligible: false },
        ],
        orphans: [{ client: 'qbit', killReady: true }],
        networkHealth: { qbit: { ok: true }, sab: { ok: false, reason: 'dns_failed' } },
    });
    assert.equal(summary.qbit.total, 1);
    assert.equal(summary.qbit.qcIssues, 2);
    assert.equal(summary.qbit.health.ok, true);
    assert.equal(summary.sab.total, 1);
    assert.equal(summary.sab.qcIssues, 1);
    assert.equal(summary.sab.health.reason, 'dns_failed');
});
