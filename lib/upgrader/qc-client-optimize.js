/**
 * Recommended SAB / qBit prefs so downloaders cooperate with QC hunt → import → research.
 */

export const QC_CLIENT_RECOMMENDED = Object.freeze({
    sab: Object.freeze({
        // 0 = Off (Arr owns upgrade decisions; QC research must re-add same NZB).
        no_dupes: 0,
        no_smart_dupes: 0,
        no_series_dupes: 0,
    }),
    qbit: Object.freeze({
        // Minutes. Gives Arr time to import remuxes before ShareLimitAction stops seeding.
        max_seeding_time: 180,
        max_active_torrents: 40,
    }),
});

const asInt = (value, fallback = null) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.trunc(n) : fallback;
};

export const summarizeSabAlignment = (current = {}) => {
    const recommended = QC_CLIENT_RECOMMENDED.sab;
    const noDupes = asInt(current.no_dupes, null);
    const noSmart = asInt(current.no_smart_dupes, null);
    const noSeries = asInt(current.no_series_dupes, null);
    const rows = [
        {
            key: 'no_dupes',
            label: 'Identical NZB detection',
            current: noDupes,
            recommended: recommended.no_dupes,
            ok: noDupes === recommended.no_dupes,
            meaning: { 0: 'Off', 1: 'Discard', 2: 'Pause' }[noDupes] || String(noDupes),
        },
        {
            key: 'no_smart_dupes',
            label: 'Smart title duplicates',
            current: noSmart,
            recommended: recommended.no_smart_dupes,
            ok: noSmart === recommended.no_smart_dupes,
        },
        {
            key: 'no_series_dupes',
            label: 'Series episode duplicates',
            current: noSeries,
            recommended: recommended.no_series_dupes,
            ok: noSeries === recommended.no_series_dupes,
        },
    ];
    return {
        configured: true,
        aligned: rows.every((row) => row.ok),
        rows,
        recommended,
        current: {
            no_dupes: noDupes,
            no_smart_dupes: noSmart,
            no_series_dupes: noSeries,
        },
    };
};

export const summarizeQbitAlignment = (prefs = {}) => {
    const recommended = QC_CLIENT_RECOMMENDED.qbit;
    const maxSeedingTime = asInt(prefs.max_seeding_time, null);
    const maxActiveTorrents = asInt(prefs.max_active_torrents, null);
    const maxRatio = prefs.max_ratio == null ? null : Number(prefs.max_ratio);
    const rows = [
        {
            key: 'max_seeding_time',
            label: 'Global max seeding (min)',
            current: maxSeedingTime,
            recommended: recommended.max_seeding_time,
            ok: maxSeedingTime === recommended.max_seeding_time,
        },
        {
            key: 'max_active_torrents',
            label: 'Max active torrents',
            current: maxActiveTorrents,
            recommended: recommended.max_active_torrents,
            ok: maxActiveTorrents != null && maxActiveTorrents >= recommended.max_active_torrents,
        },
        {
            key: 'max_ratio',
            label: 'Max ratio (unchanged)',
            current: maxRatio,
            recommended: null,
            ok: true,
        },
    ];
    return {
        configured: true,
        aligned: rows.filter((row) => row.recommended != null).every((row) => row.ok),
        rows,
        recommended,
        current: {
            max_seeding_time: maxSeedingTime,
            max_active_torrents: maxActiveTorrents,
            max_ratio: maxRatio,
        },
    };
};
