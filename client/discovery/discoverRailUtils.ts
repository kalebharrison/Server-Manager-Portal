/**
 * Map Plex/Jellyfin dashboard "recent" rows into Discover poster items,
 * plus helpers for mixed rails, exclusive claim, and movie/TV interleave.
 */

export const libraryRecentToDiscoveryItem = (item: any = {}, mediaType = 'movie') => {
    const type = mediaType === 'tv' ? 'tv' : 'movie';
    const tmdbId = Number(item?.tmdbId);
    const posterPath = item?.posterPath || item?.tmdbPosterPath || null;
    const thumbUrl = item?.thumbUrl
        || item?.posterUrl
        || (posterPath && String(posterPath).startsWith('http') ? posterPath : null)
        || null;
    return {
        id: Number.isFinite(tmdbId) && tmdbId > 0 ? tmdbId : (item?.ratingKey || item?.id || null),
        tmdbId: Number.isFinite(tmdbId) && tmdbId > 0 ? tmdbId : null,
        mediaType: type,
        type,
        title: item?.title || item?.name || 'Untitled',
        name: item?.title || item?.name || 'Untitled',
        year: item?.year != null ? String(item.year).slice(0, 4) : null,
        posterPath: posterPath && !String(posterPath).startsWith('http') ? posterPath : null,
        thumbUrl,
        overview: item?.overview || '',
        displayTags: Array.isArray(item?.tags) ? item.tags : (Array.isArray(item?.displayTags) ? item.displayTags : []),
        mediaInfo: {
            status: 5,
            ...(Array.isArray(item?.tags) && item.tags.length ? { displayTags: item.tags } : {}),
        },
        ...(item?.isUpgrade ? { acquisitionKind: 'upgrade' } : { acquisitionKind: 'new' }),
    };
};

export const discoveryItemKey = (item: any) => {
    if (!item) return '';
    const mediaType = item.mediaType === 'tv' || item.type === 'tv' || item.type === 'show'
        || item.media?.mediaType === 'tv' || item.media?.type === 'tv'
        ? 'tv'
        : 'movie';
    const tmdbId = Number(
        item.tmdbId
        ?? item.media?.tmdbId
        ?? item.mediaId
        ?? item.id,
    );
    if (Number.isFinite(tmdbId) && tmdbId > 0) return `${mediaType}:${tmdbId}`;
    const title = String(item.title || item.name || item.media?.title || item.media?.name || '')
        .trim()
        .toLowerCase();
    return title ? `${mediaType}:${title}` : '';
};

export const mergeDiscoveryRails = (...pages: any[]) => {
    const seen = new Set<string>();
    const out: any[] = [];
    for (const page of pages) {
        const results = Array.isArray(page?.results) ? page.results : (Array.isArray(page) ? page : []);
        for (const item of results) {
            if (!item) continue;
            const key = discoveryItemKey(item);
            if (!key || seen.has(key)) continue;
            seen.add(key);
            out.push(item);
        }
    }
    return out;
};

/** Zip movies and TV so one media type cannot dominate a mixed rail. */
export const interleaveByMediaType = (items: any[] = []) => {
    const movies: any[] = [];
    const shows: any[] = [];
    for (const item of items) {
        const mediaType = item?.mediaType === 'tv' || item?.type === 'tv' || item?.type === 'show' ? 'tv' : 'movie';
        if (mediaType === 'tv') shows.push(item);
        else movies.push(item);
    }
    const out: any[] = [];
    const max = Math.max(movies.length, shows.length);
    for (let i = 0; i < max; i += 1) {
        if (i < movies.length) out.push(movies[i]);
        if (i < shows.length) out.push(shows[i]);
    }
    return out;
};

/**
 * Claim items for rails in priority order. Later rails never repeat a title
 * already shown higher up (trending > upcoming > popular, etc.).
 */
export const claimExclusiveRailItems = (
    rails: Array<{ items: any[] }>,
    options: { interleave?: boolean; maxPerRail?: number } = {},
) => {
    const claimed = new Set<string>();
    const maxPerRail = Math.max(1, Number(options.maxPerRail) || 30);
    return rails.map((rail) => {
        const source = options.interleave ? interleaveByMediaType(rail.items || []) : (rail.items || []);
        const next: any[] = [];
        for (const item of source) {
            const key = discoveryItemKey(item);
            if (!key || claimed.has(key)) continue;
            claimed.add(key);
            next.push(item);
            if (next.length >= maxPerRail) break;
        }
        return next;
    });
};

/**
 * Split library recent vs Arr upgrades into exclusive rails.
 * Plex "recentlyAdded" includes remux/upgrades; those belong only on the upgrade rail.
 */
export const partitionNetNewAndUpgrades = (
    recentItems: any[] = [],
    upgradeItems: any[] = [],
    options: { maxPerRail?: number } = {},
) => {
    const maxPerRail = Math.max(1, Number(options.maxPerRail) || 24);
    const upgradeKeys = new Set<string>();
    const recentlyUpgraded: any[] = [];
    for (const item of upgradeItems || []) {
        if (!item) continue;
        const key = discoveryItemKey(item);
        if (!key || upgradeKeys.has(key)) continue;
        upgradeKeys.add(key);
        recentlyUpgraded.push({ ...item, acquisitionKind: 'upgrade' });
        if (recentlyUpgraded.length >= maxPerRail) break;
    }

    const recentlyAdded: any[] = [];
    const seenNew = new Set<string>();
    for (const item of recentItems || []) {
        if (!item) continue;
        const key = discoveryItemKey(item);
        if (!key || upgradeKeys.has(key) || seenNew.has(key)) continue;
        seenNew.add(key);
        recentlyAdded.push({ ...item, acquisitionKind: 'new' });
        if (recentlyAdded.length >= maxPerRail) break;
    }

    return { recentlyAdded, recentlyUpgraded };
};
