/**
 * QC Settings presets — UI projection over existing timer/cap keys.
 * Keep in sync with lib/upgrader/qc-presets.js.
 */

export type QcPresetId = 'relaxed' | 'balanced' | 'aggressive' | 'custom';

export const CLEANUP_PRESETS = {
    relaxed: {
        qcMaxStrikes: 4,
        qcMetaDlMinutes: 30,
        qcStalledHours: 3,
        qcCompletedNotImportingMinutes: 120,
        qcOrphanGraceMinutes: 25,
        qcSlowDownloadFloorKbps: 50,
        qcSlowDownloadMinAgeHours: 8,
    },
    balanced: {
        qcMaxStrikes: 3,
        qcMetaDlMinutes: 20,
        qcStalledHours: 2,
        qcCompletedNotImportingMinutes: 90,
        qcOrphanGraceMinutes: 15,
        qcSlowDownloadFloorKbps: 100,
        qcSlowDownloadMinAgeHours: 6,
    },
    aggressive: {
        qcMaxStrikes: 2,
        qcMetaDlMinutes: 12,
        qcStalledHours: 1,
        qcCompletedNotImportingMinutes: 60,
        qcOrphanGraceMinutes: 10,
        qcSlowDownloadFloorKbps: 200,
        qcSlowDownloadMinAgeHours: 4,
    },
} as const;

export const HUNT_PRESETS = {
    relaxed: {
        upgraderMaxActionsPerHour: 15,
        upgraderMaxDownloadsPerLibrary: 3,
        upgraderMinScoreDelta: 15,
    },
    balanced: {
        upgraderMaxActionsPerHour: 25,
        upgraderMaxDownloadsPerLibrary: 5,
        upgraderMinScoreDelta: 10,
    },
    aggressive: {
        upgraderMaxActionsPerHour: 40,
        upgraderMaxDownloadsPerLibrary: 8,
        upgraderMinScoreDelta: 5,
    },
} as const;

export const CLEANUP_PRESET_LABELS: Record<QcPresetId, string> = {
    relaxed: 'Relaxed',
    balanced: 'Balanced',
    aggressive: 'Aggressive',
    custom: 'Custom',
};

export const HUNT_PRESET_LABELS: Record<QcPresetId, string> = {
    relaxed: 'Relaxed',
    balanced: 'Balanced',
    aggressive: 'Aggressive',
    custom: 'Custom',
};

export type CleanupPresetValues = {
    qcMaxStrikes: number;
    qcMetaDlMinutes: number;
    qcStalledHours: number;
    qcCompletedNotImportingMinutes: number;
    qcOrphanGraceMinutes: number;
    qcSlowDownloadFloorKbps: number;
    qcSlowDownloadMinAgeHours: number;
    qcCleanupAggression?: string;
};

export type HuntPresetValues = {
    upgraderMaxActionsPerHour: number;
    upgraderMaxDownloadsPerLibrary: number;
    upgraderMinScoreDelta: number;
    upgraderHuntIntensity?: string;
};

const num = (value: unknown, fallback: number) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
};

const matchesPreset = (values: Record<string, unknown>, preset: Record<string, number>) => (
    Object.keys(preset).every((key) => num(values[key], preset[key]) === preset[key])
);

export const detectCleanupPreset = (values: Record<string, unknown> = {}): QcPresetId => {
    const stored = String(values.qcCleanupAggression || '').toLowerCase();
    if (stored === 'custom') return 'custom';
    if (stored === 'relaxed' || stored === 'balanced' || stored === 'aggressive') {
        if (matchesPreset(values, CLEANUP_PRESETS[stored])) return stored;
    }
    for (const id of ['balanced', 'relaxed', 'aggressive'] as const) {
        if (matchesPreset(values, CLEANUP_PRESETS[id])) return id;
    }
    return 'custom';
};

export const detectHuntPreset = (values: Record<string, unknown> = {}): QcPresetId => {
    const stored = String(values.upgraderHuntIntensity || '').toLowerCase();
    if (stored === 'custom') return 'custom';
    if (stored === 'relaxed' || stored === 'balanced' || stored === 'aggressive') {
        if (matchesPreset(values, HUNT_PRESETS[stored])) return stored;
    }
    for (const id of ['balanced', 'relaxed', 'aggressive'] as const) {
        if (matchesPreset(values, HUNT_PRESETS[id])) return id;
    }
    return 'custom';
};

export const applyCleanupPreset = (id: Exclude<QcPresetId, 'custom'>): CleanupPresetValues => {
    const key = CLEANUP_PRESETS[id] ? id : 'balanced';
    return { ...CLEANUP_PRESETS[key], qcCleanupAggression: key };
};

export const applyHuntPreset = (id: Exclude<QcPresetId, 'custom'>): HuntPresetValues => {
    const key = HUNT_PRESETS[id] ? id : 'balanced';
    return { ...HUNT_PRESETS[key], upgraderHuntIntensity: key };
};
