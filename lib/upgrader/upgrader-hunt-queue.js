/** Prefer stamped root-folder library; fall back to Arr instance. */
export const libraryKeyForItem = (item = {}) => {
    if (item.libraryKey) return String(item.libraryKey);
    const id = item.arrInstanceId != null ? String(item.arrInstanceId) : '';
    const type = item.arrType || item.mediaType || 'arr';
    return id ? `${type}:${id}` : `unknown:${item.ratingKey || 'x'}`;
};

export const libraryLabelForItem = (item = {}) => {
    const label = item.libraryName
        || item.arrInstanceName
        || item.libraryTitle
        || (item.arrType === 'radarr' ? 'Radarr'
            : item.arrType === 'sonarr' ? 'Sonarr'
                : item.arrType === 'lidarr' ? 'Music'
                    : 'Library');
    // Stale index stamps / instance names often say "Lidarr".
    if (/^lidarr$/i.test(String(label))) return 'Music';
    return label;
};

const scoreOf = (item) => Number(item?.avgCustomFormatScore ?? item?.customFormatScore ?? 0) || 0;

const isCoolingDown = (ratingKey, cooldowns = {}, now = Date.now()) => {
    const until = cooldowns?.[ratingKey]?.until || cooldowns?.[ratingKey];
    if (!until) return false;
    const ts = typeof until === 'string' || typeof until === 'number' ? Date.parse(until) : NaN;
    return Number.isFinite(ts) && ts > now;
};

const availableAtMs = (item) => {
    const ts = Date.parse(item?.availableAt || '');
    return Number.isFinite(ts) ? ts : Number.POSITIVE_INFINITY;
};

/** Prefer filling missing gaps; otherwise classic upgrade-with-files path. */
export const classifyHuntPath = (item = {}, {
    huntMissingEpisodes = true,
    huntAvailableMovies = true,
} = {}) => {
    const missingEpisodesOk = huntMissingEpisodes !== false
        && item.mediaType === 'show'
        && item.huntMissingEligible === true;
    const missingMoviesOk = huntAvailableMovies !== false
        && item.mediaType === 'movie'
        && item.huntMissingEligible === true;
    if (missingEpisodesOk || missingMoviesOk) return 'missing';

    const episodeCount = Number(item.episodeCount || item.totalEpisodeCount || 0);
    const upgradeOk = !item.scoreUnknown && (
        (item.mediaType === 'movie' && item.hasFile)
        || (item.mediaType === 'album' && item.hasFile)
        || (item.mediaType === 'show' && (item.hasFile || episodeCount > 0))
    );
    if (upgradeOk) return 'upgrade';
    return null;
};

const sortMissing = (a, b) => {
    const byDate = availableAtMs(a) - availableAtMs(b);
    if (byDate !== 0) return byDate;
    return Number(b.missingAiredCount || 0) - Number(a.missingAiredCount || 0);
};

const sortUpgrade = (a, b) => scoreOf(a) - scoreOf(b);

/** Alternate missing vs upgrade within a library so missing does not starve upgrades. */
export const interleaveHuntPaths = (items = [], maxPerLibrary = null) => {
    const cap = maxPerLibrary == null
        ? Number.POSITIVE_INFINITY
        : Math.max(1, Number(maxPerLibrary) || 5);
    const missing = items.filter((item) => item.huntPath === 'missing').slice().sort(sortMissing);
    const upgrade = items.filter((item) => item.huntPath === 'upgrade').slice().sort(sortUpgrade);
    const out = [];
    let mi = 0;
    let ui = 0;
    while (out.length < cap && (mi < missing.length || ui < upgrade.length)) {
        if (mi < missing.length) {
            out.push(missing[mi]);
            mi += 1;
            if (out.length >= cap) break;
        }
        if (ui < upgrade.length) {
            out.push(upgrade[ui]);
            ui += 1;
        }
    }
    return out;
};

/**
 * Round-robin hunt queue: fair across libraries.
 * Within each library: missing (oldest / most gaps) alternated with upgrades (lowest CF score).
 */
export const buildHuntQueue = (items = [], {
    cooldowns = {},
    excludedRatingKeys = [],
    snoozed = {},
    libraryCursor = 0,
    maxPerLibrary = 5,
    now = Date.now(),
    huntMissingEpisodes = true,
    huntAvailableMovies = true,
    /** Optional (libraryKey) => remaining slots; 0 skips that library this cycle. */
    libraryCapacity = null,
} = {}) => {
    const excluded = new Set((excludedRatingKeys || []).map(String));
    const flags = { huntMissingEpisodes, huntAvailableMovies };
    const defaultCap = Math.max(1, Number(maxPerLibrary) || 5);
    const capacityFor = (libraryKey) => {
        if (typeof libraryCapacity !== 'function') return defaultCap;
        const remaining = Number(libraryCapacity(libraryKey));
        if (!Number.isFinite(remaining)) return defaultCap;
        return Math.max(0, Math.min(defaultCap, Math.floor(remaining)));
    };
    const eligible = [];
    for (const item of (Array.isArray(items) ? items : [])) {
        if (!item?.ratingKey) continue;
        if (excluded.has(String(item.ratingKey))) continue;
        const snoozeUntil = snoozed?.[item.ratingKey];
        if (snoozeUntil && Date.parse(snoozeUntil) > now) continue;
        if (isCoolingDown(item.ratingKey, cooldowns, now)) continue;
        const huntPath = classifyHuntPath(item, flags);
        if (!huntPath) continue;
        eligible.push({ ...item, huntPath });
    }

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
        .map((entry) => {
            const cap = capacityFor(entry.key);
            return {
                ...entry,
                cap,
                items: cap > 0 ? interleaveHuntPaths(entry.items, cap) : [],
            };
        })
        .sort((a, b) => a.key.localeCompare(b.key));

    if (!libraries.length) {
        return { queue: [], libraries: [], nextLibraryCursor: 0, maxPerLibrary: defaultCap };
    }

    const start = ((Number(libraryCursor) || 0) % libraries.length + libraries.length) % libraries.length;
    const taken = libraries.map(() => 0);
    const queue = [];
    let guard = 0;
    const maxTotal = libraries.reduce((sum, lib) => sum + Math.max(0, lib.cap), 0);

    while (queue.length < maxTotal && guard < maxTotal + libraries.length + 1) {
        guard += 1;
        let progressed = false;
        for (let offset = 0; offset < libraries.length; offset += 1) {
            const idx = (start + offset) % libraries.length;
            const lib = libraries[idx];
            const libCap = Math.max(0, Number(lib.cap) || 0);
            if (libCap <= 0 || taken[idx] >= libCap) continue;
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
            downloadSlots: lib.cap,
        })),
        nextLibraryCursor,
        maxPerLibrary: defaultCap,
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
