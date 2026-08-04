/**
 * Catalog of Arr custom-format repairs the portal can detect + apply.
 * Add new entries here when we find TRaSH/CF holes that break upgrades.
 */

import {
    needsUnkn0wnRemuxRepair,
    repairUnkn0wnRemuxFormats,
} from './cf-unkn0wn-remux.js';

export const CF_REPAIR_CATALOG = Object.freeze([
    {
        id: 'unkn0wn-remux',
        title: 'UnKn0wn remux LQ exception',
        summary: 'TRaSH UnKn0wn (NoRemux) misses underscore titles like DV_REMUX, so good remuxes score as LQ.',
        appliesTo: ['radarr', 'sonarr'],
        detect: (formats) => (Array.isArray(formats) ? formats : []).filter((format) => needsUnkn0wnRemuxRepair(format)),
        repair: (formats) => repairUnkn0wnRemuxFormats(formats).repaired,
    },
]);

export const scanCfRepairsForFormats = (formats = [], { type = null } = {}) => {
    const list = Array.isArray(formats) ? formats : [];
    return CF_REPAIR_CATALOG
        .filter((entry) => !type || entry.appliesTo.includes(String(type).toLowerCase()))
        .map((entry) => {
            const needing = entry.detect(list);
            return {
                id: entry.id,
                title: entry.title,
                summary: entry.summary,
                needingCount: needing.length,
                needing: needing.map((format) => ({ id: format.id, name: format.name })),
                healthy: needing.length === 0,
            };
        });
};

export const applyCfRepairsForFormats = (formats = [], { repairIds = null } = {}) => {
    const wanted = repairIds == null
        ? null
        : new Set((Array.isArray(repairIds) ? repairIds : [repairIds]).map(String));
    const repaired = [];
    for (const entry of CF_REPAIR_CATALOG) {
        if (wanted && !wanted.has(entry.id)) continue;
        for (const format of entry.repair(formats)) {
            repaired.push({ repairId: entry.id, format });
        }
    }
    return repaired;
};
