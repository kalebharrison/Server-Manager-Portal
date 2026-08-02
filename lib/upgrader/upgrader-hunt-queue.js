/** Library = one Sonarr/Radarr collection (by instance id), not a global Arr blend. */
export const libraryKeyForItem = (item = {}) => {
    const id = item.arrInstanceId != null ? String(item.arrInstanceId) : '';
    const type = item.arrType || item.mediaType || 'arr';
    return id ? `${type}:${id}` : `unknown:${item.ratingKey || 'x'}`;
};

export const libraryLabelForItem = (item = {}) => (
    item.arrInstanceName
    || item.libraryTitle
    || (item.arrType === 'radarr' ? 'Radarr' : item.arrType === 'sonarr' ? 'Sonarr' : 'Library')
);

const scoreOf = (item) => Number(item?.avgCustomFormatScore ?? item?.customFormatScore ?? 0) || 0;

const isCoolingDown = (ratingKey, cooldowns = {}, now = Date.now()) => {
    const until = cooldowns?.[ratingKey]?.until || cooldowns?.[ratingKey];
    if (!until) return false;
    const ts = typeof until === 'string' || typeof until === 'number' ? Date.parse(until) : NaN;
    return Number.isFinite(ts) && ts > now;
};

/**
 * Round-robin hunt queue: fair across libraries, lowest score first within each library.
 * Caps how many titles are considered per library so one library cannot monopolize a cycle.
 */
export const buildHuntQueue = (items = [], {
    cooldowns = {},
    excludedRatingKeys = [],
    snoozed = {},
    libraryCursor = 0,
    maxPerLibrary = 5,
    now = Date.now(),
} = {}) => {
    const excluded = new Set((excludedRatingKeys || []).map(String));
    const eligible = (Array.isArray(items) ? items : []).filter((item) => {
        if (!item?.ratingKey) return false;
        const episodeCount = Number(item.episodeCount || item.totalEpisodeCount || 0);
        if (!(item.hasFile || (item.mediaType === 'show' && episodeCount > 0))) return false;
        // Statistics-only Sonarr rows used to look like score 0 and monopolize "worst first."
        if (item.scoreUnknown) return false;
        if (excluded.has(String(item.ratingKey))) return false;
        const snoozeUntil = snoozed?.[item.ratingKey];
        if (snoozeUntil && Date.parse(snoozeUntil) > now) return false;
        if (isCoolingDown(item.ratingKey, cooldowns, now)) return false;
        return true;
    });

    const byLibrary = new Map();
    for (const item of eligible) {
        const key = libraryKeyForItem(item);
        if (!byLibrary.has(key)) {
            byLibrary.set(key, {
                key,
                label: libraryLabelForItem(item),
                items: [],
            });
        }
        byLibrary.get(key).items.push(item);
    }

    const libraries = [...byLibrary.values()]
        .map((entry) => ({
            ...entry,
            items: entry.items.slice().sort((a, b) => scoreOf(a) - scoreOf(b)),
        }))
        .sort((a, b) => a.key.localeCompare(b.key));

    if (!libraries.length) {
        return { queue: [], libraries: [], nextLibraryCursor: 0, maxPerLibrary };
    }

    const start = ((Number(libraryCursor) || 0) % libraries.length + libraries.length) % libraries.length;
    const taken = libraries.map(() => 0);
    const queue = [];
    let guard = 0;
    const maxTotal = libraries.length * Math.max(1, Number(maxPerLibrary) || 5);

    while (queue.length < maxTotal && guard < maxTotal + libraries.length) {
        guard += 1;
        let progressed = false;
        for (let offset = 0; offset < libraries.length; offset += 1) {
            const idx = (start + offset) % libraries.length;
            const lib = libraries[idx];
            if (taken[idx] >= Math.max(1, Number(maxPerLibrary) || 5)) continue;
            const next = lib.items[taken[idx]];
            if (!next) continue;
            queue.push(next);
            taken[idx] += 1;
            progressed = true;
            if (queue.length >= maxTotal) break;
        }
        if (!progressed) break;
    }

    const nextLibraryCursor = (start + 1) % libraries.length;
    return {
        queue,
        libraries: libraries.map((lib, idx) => ({
            key: lib.key,
            label: lib.label,
            considered: taken[idx],
            available: lib.items.length,
        })),
        nextLibraryCursor,
        maxPerLibrary: Math.max(1, Number(maxPerLibrary) || 5),
    };
};

export const COOLDOWN_MS = {
    grabbed: 7 * 24 * 60 * 60 * 1000,
    noUpgrade: 7 * 24 * 60 * 60 * 1000,
    error: 6 * 60 * 60 * 1000,
};

export const nextCooldownUntil = (kind, now = Date.now()) => {
    const ms = COOLDOWN_MS[kind] || COOLDOWN_MS.noUpgrade;
    return new Date(now + ms).toISOString();
};

export const pruneCooldowns = (cooldowns = {}, now = Date.now()) => {
    const next = {};
    for (const [key, value] of Object.entries(cooldowns || {})) {
        const until = value?.until || value;
        const ts = Date.parse(until);
        if (Number.isFinite(ts) && ts > now) {
            next[key] = typeof value === 'object' && value ? value : { until: value };
        }
    }
    return next;
};
