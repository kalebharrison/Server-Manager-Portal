/**
 * Integrity finding severity + auto-replace category helpers (Node-side).
 * Keep in sync with client/upgrader/qcIntegrityFindings.ts category mapping.
 */

export const INTEGRITY_AUTO_REPLACE_CATEGORIES = [
    'broken',
    'hash',
    'path',
    'runtime_short',
    'runtime_long',
    'trim',
];

export const DEFAULT_INTEGRITY_AUTO_REPLACE_BY_CATEGORY = Object.freeze({
    broken: true,
    hash: true,
    path: false,
    runtime_short: false,
    runtime_long: false,
    trim: false,
});

export const normalizeIntegrityAutoReplaceByCategory = (raw = null) => {
    const out = { ...DEFAULT_INTEGRITY_AUTO_REPLACE_BY_CATEGORY };
    if (!raw || typeof raw !== 'object') return out;
    for (const key of INTEGRITY_AUTO_REPLACE_CATEGORIES) {
        if (Object.prototype.hasOwnProperty.call(raw, key)) {
            out[key] = !!raw[key];
        }
    }
    return out;
};

const runtimeDirection = (finding = {}) => {
    if (String(finding.reason || '').toLowerCase() !== 'duration_mismatch') return null;
    const measured = Number(finding.durationSec);
    const expected = Number(finding.expectedRuntimeSec);
    if (!Number.isFinite(measured) || measured <= 0 || !Number.isFinite(expected) || expected <= 0) {
        return null;
    }
    if (measured < expected) return 'short';
    if (measured > expected) return 'long';
    return null;
};

/** UI / auto-replace category for a finding. */
export const integrityFindingCategory = (finding = {}) => {
    const reason = String(finding?.reason || '').toLowerCase();
    if (
        reason.startsWith('decode_')
        || reason === 'probe_failed'
        || reason === 'probe_timeout'
        || reason === 'missing_video'
        || reason === 'missing_audio'
    ) {
        return 'broken';
    }
    if (reason === 'duration_mismatch') {
        return runtimeDirection(finding) === 'short' ? 'runtime_short' : 'runtime_long';
    }
    if (reason.startsWith('trim_')) return 'trim';
    if (reason.includes('imohash') || reason.includes('xxhash')) return 'hash';
    if (reason === 'missing_file' || reason === 'missing_path' || reason === 'unsafe_path') return 'path';
    return 'other';
};

/** critical | high | medium | low */
export const integrityFindingSeverity = (finding = {}) => {
    const category = integrityFindingCategory(finding);
    if (category === 'broken') return 'critical';
    if (category === 'hash' || category === 'path') return 'high';
    if (category === 'runtime_short') return 'medium';
    return 'low';
};

/**
 * Whether automation may Arr-replace this finding.
 * Master switch must be on; category toggle must allow.
 */
export const shouldAutoReplaceFinding = (config = {}, finding = {}) => {
    if (!config.qcIntegrityAutomationEnabled) return false;
    const category = integrityFindingCategory(finding);
    if (category === 'other') return false;
    const policy = normalizeIntegrityAutoReplaceByCategory(config.qcIntegrityAutoReplaceByCategory);
    return !!policy[category];
};
