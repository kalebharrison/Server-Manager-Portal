/**
 * QC Settings presets — expand to existing timer/cap keys.
 * Engine still reads the raw keys; presets are a UI projection.
 */

export const QC_PRESET_IDS = Object.freeze(['relaxed', 'balanced', 'aggressive', 'custom']);

/** @typedef {'relaxed'|'balanced'|'aggressive'|'custom'} QcPresetId */

export const CLEANUP_PRESETS = Object.freeze({
    relaxed: Object.freeze({
        qcMaxStrikes: 4,
        qcMetaDlMinutes: 30,
        qcStalledHours: 3,
        qcCompletedNotImportingMinutes: 120,
        qcOrphanGraceMinutes: 25,
        qcSlowDownloadFloorKbps: 50,
        qcSlowDownloadMinAgeHours: 8,
    }),
    balanced: Object.freeze({
        qcMaxStrikes: 3,
        qcMetaDlMinutes: 20,
        qcStalledHours: 2,
        qcCompletedNotImportingMinutes: 90,
        qcOrphanGraceMinutes: 15,
        qcSlowDownloadFloorKbps: 100,
        qcSlowDownloadMinAgeHours: 6,
    }),
    aggressive: Object.freeze({
        qcMaxStrikes: 2,
        qcMetaDlMinutes: 12,
        qcStalledHours: 1,
        qcCompletedNotImportingMinutes: 60,
        qcOrphanGraceMinutes: 10,
        qcSlowDownloadFloorKbps: 200,
        qcSlowDownloadMinAgeHours: 4,
    }),
});

export const HUNT_PRESETS = Object.freeze({
    relaxed: Object.freeze({
        upgraderMaxActionsPerHour: 15,
        upgraderMaxDownloadsPerLibrary: 3,
        upgraderMinScoreDelta: 15,
    }),
    balanced: Object.freeze({
        upgraderMaxActionsPerHour: 25,
        upgraderMaxDownloadsPerLibrary: 5,
        upgraderMinScoreDelta: 10,
    }),
    aggressive: Object.freeze({
        upgraderMaxActionsPerHour: 40,
        upgraderMaxDownloadsPerLibrary: 8,
        upgraderMinScoreDelta: 5,
    }),
});

export const CLEANUP_PRESET_LABELS = Object.freeze({
    relaxed: 'Relaxed',
    balanced: 'Balanced',
    aggressive: 'Aggressive',
    custom: 'Custom',
});

export const HUNT_PRESET_LABELS = Object.freeze({
    relaxed: 'Relaxed',
    balanced: 'Balanced',
    aggressive: 'Aggressive',
    custom: 'Custom',
});

const num = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
};

const matchesPreset = (values, preset) => (
    Object.keys(preset).every((key) => num(values[key], preset[key]) === preset[key])
);

/**
 * @param {Record<string, unknown>} values
 * @returns {QcPresetId}
 */
export const detectCleanupPreset = (values = {}) => {
    const stored = String(values.qcCleanupAggression || '').toLowerCase();
    if (stored === 'custom') return 'custom';
    if (stored === 'relaxed' || stored === 'balanced' || stored === 'aggressive') {
        const preset = CLEANUP_PRESETS[stored];
        if (matchesPreset(values, preset)) return stored;
    }
    for (const id of ['balanced', 'relaxed', 'aggressive']) {
        if (matchesPreset(values, CLEANUP_PRESETS[id])) return id;
    }
    return 'custom';
};

/**
 * @param {Record<string, unknown>} values
 * @returns {QcPresetId}
 */
export const detectHuntPreset = (values = {}) => {
    const stored = String(values.upgraderHuntIntensity || '').toLowerCase();
    if (stored === 'custom') return 'custom';
    if (stored === 'relaxed' || stored === 'balanced' || stored === 'aggressive') {
        const preset = HUNT_PRESETS[stored];
        if (matchesPreset(values, preset)) return stored;
    }
    for (const id of ['balanced', 'relaxed', 'aggressive']) {
        if (matchesPreset(values, HUNT_PRESETS[id])) return id;
    }
    return 'custom';
};

/**
 * @param {'relaxed'|'balanced'|'aggressive'} id
 * @returns {typeof CLEANUP_PRESETS.balanced & { qcCleanupAggression: string }}
 */
export const applyCleanupPreset = (id) => {
    const key = CLEANUP_PRESETS[id] ? id : 'balanced';
    return { ...CLEANUP_PRESETS[key], qcCleanupAggression: key };
};

/**
 * @param {'relaxed'|'balanced'|'aggressive'} id
 * @returns {typeof HUNT_PRESETS.balanced & { upgraderHuntIntensity: string }}
 */
export const applyHuntPreset = (id) => {
    const key = HUNT_PRESETS[id] ? id : 'balanced';
    return { ...HUNT_PRESETS[key], upgraderHuntIntensity: key };
};

export default {
    CLEANUP_PRESETS,
    HUNT_PRESETS,
    CLEANUP_PRESET_LABELS,
    HUNT_PRESET_LABELS,
    detectCleanupPreset,
    detectHuntPreset,
    applyCleanupPreset,
    applyHuntPreset,
};
