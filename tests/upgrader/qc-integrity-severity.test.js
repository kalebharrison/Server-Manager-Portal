import test from 'node:test';
import assert from 'node:assert/strict';

import {
    DEFAULT_INTEGRITY_AUTO_REPLACE_BY_CATEGORY,
    integrityFindingCategory,
    integrityFindingSeverity,
    normalizeIntegrityAutoReplaceByCategory,
    shouldAutoReplaceFinding,
} from '../../lib/upgrader/qc-integrity-severity.js';

test('severity map: broken critical, hash/path high, short medium, long/trim low', () => {
    assert.equal(integrityFindingSeverity({ reason: 'decode_mid' }), 'critical');
    assert.equal(integrityFindingCategory({ reason: 'imohash_mismatch' }), 'hash');
    assert.equal(integrityFindingSeverity({ reason: 'imohash_mismatch' }), 'high');
    assert.equal(integrityFindingSeverity({ reason: 'missing_file' }), 'high');
    assert.equal(integrityFindingSeverity({
        reason: 'duration_mismatch',
        durationSec: 50 * 60,
        expectedRuntimeSec: 90 * 60,
    }), 'medium');
    assert.equal(integrityFindingSeverity({
        reason: 'duration_mismatch',
        durationSec: 120 * 60,
        expectedRuntimeSec: 90 * 60,
    }), 'low');
    assert.equal(integrityFindingSeverity({ reason: 'trim_native_unknown' }), 'low');
});

test('auto-replace defaults keep medium and trim off', () => {
    const defaults = normalizeIntegrityAutoReplaceByCategory();
    assert.deepEqual(defaults, { ...DEFAULT_INTEGRITY_AUTO_REPLACE_BY_CATEGORY });
    assert.equal(defaults.broken, true);
    assert.equal(defaults.hash, true);
    assert.equal(defaults.runtime_short, false);
    assert.equal(defaults.trim, false);
});

test('shouldAutoReplaceFinding requires master switch and category toggle', () => {
    const broken = { reason: 'missing_video' };
    const short = {
        reason: 'duration_mismatch',
        durationSec: 40 * 60,
        expectedRuntimeSec: 90 * 60,
    };
    assert.equal(shouldAutoReplaceFinding({
        qcIntegrityAutomationEnabled: false,
        qcIntegrityAutoReplaceByCategory: { broken: true },
    }, broken), false);
    assert.equal(shouldAutoReplaceFinding({
        qcIntegrityAutomationEnabled: true,
    }, broken), true);
    assert.equal(shouldAutoReplaceFinding({
        qcIntegrityAutomationEnabled: true,
    }, short), false);
    assert.equal(shouldAutoReplaceFinding({
        qcIntegrityAutomationEnabled: true,
        qcIntegrityAutoReplaceByCategory: { runtime_short: true },
    }, short), true);
});
