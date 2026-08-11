/**
 * Per-library Integrity schedule policy.
 * qcIntegritySchedulePolicy[libraryKey][schedule][check] => boolean
 * Missing keys default to allowed (backward compatible).
 */

export const INTEGRITY_SCHEDULES = ['import', 'nightly'];
export const INTEGRITY_CHECKS = ['playability', 'trim', 'imohash', 'xxhash'];

const truthy = (value) => value !== false;

export const normalizeIntegritySchedulePolicy = (raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out = {};
    for (const [libraryKey, schedules] of Object.entries(raw)) {
        const key = String(libraryKey || '').trim();
        if (!key || !schedules || typeof schedules !== 'object' || Array.isArray(schedules)) continue;
        const lib = {};
        for (const schedule of INTEGRITY_SCHEDULES) {
            const checks = schedules[schedule];
            if (!checks || typeof checks !== 'object' || Array.isArray(checks)) continue;
            const row = {};
            for (const check of INTEGRITY_CHECKS) {
                if (Object.prototype.hasOwnProperty.call(checks, check)) {
                    row[check] = !!checks[check];
                }
            }
            if (Object.keys(row).length) lib[schedule] = row;
        }
        if (Object.keys(lib).length) out[key] = lib;
    }
    return out;
};

/**
 * @param {object} config
 * @param {{ libraryKey?: string|null, schedule: 'import'|'nightly', check: string }} opts
 * @returns {boolean}
 */
export const isIntegrityCheckAllowed = (config, {
    libraryKey = null,
    schedule,
    check,
} = {}) => {
    if (!INTEGRITY_SCHEDULES.includes(schedule)) return true;
    if (!INTEGRITY_CHECKS.includes(check)) return true;
    if (check === 'xxhash' && !config?.qcIntegrityXxhashEnabled) return false;

    const policy = normalizeIntegritySchedulePolicy(config?.qcIntegritySchedulePolicy);
    const key = libraryKey != null ? String(libraryKey).trim() : '';
    if (!key) return true;
    const scheduleRow = policy[key]?.[schedule];
    if (!scheduleRow || !Object.prototype.hasOwnProperty.call(scheduleRow, check)) return true;
    return truthy(scheduleRow[check]);
};

/**
 * Drop import-pipeline checks that the library policy disallows.
 * @param {string[]} missing
 * @param {object} config
 * @param {string|null} libraryKey
 * @returns {string[]}
 */
export const filterMissingImportChecks = (missing, config, libraryKey = null) => {
    const list = Array.isArray(missing) ? missing : [];
    return list.filter((check) => isIntegrityCheckAllowed(config, {
        libraryKey,
        schedule: 'import',
        check,
    }));
};

/**
 * Libraries that allow a given nightly check.
 * @param {Array<{ key?: string, label?: string, mediaType?: string }>} libraries
 * @param {object} config
 * @param {string} check
 * @returns {Array<{ key: string, label?: string, mediaType?: string }>}
 */
export const librariesAllowingNightlyCheck = (libraries, config, check) => {
    const list = Array.isArray(libraries) ? libraries : [];
    return list
        .map((lib) => ({
            key: String(lib?.key || '').trim(),
            label: lib?.label,
            mediaType: lib?.mediaType,
        }))
        .filter((lib) => lib.key && isIntegrityCheckAllowed(config, {
            libraryKey: lib.key,
            schedule: 'nightly',
            check,
        }));
};
