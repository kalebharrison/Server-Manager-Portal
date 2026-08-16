/**
 * Map Plex/Jellyfin dashboard "recent" rows into Discover poster items.
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

export const mergeDiscoveryRails = (...pages: any[]) => {
    const seen = new Set();
    const out: any[] = [];
    for (const page of pages) {
        const results = Array.isArray(page?.results) ? page.results : (Array.isArray(page) ? page : []);
        for (const item of results) {
            if (!item) continue;
            const mediaType = item.mediaType === 'tv' || item.type === 'tv' ? 'tv' : 'movie';
            const tmdbId = Number(item.tmdbId ?? item.id);
            const key = Number.isFinite(tmdbId) && tmdbId > 0
                ? `${mediaType}:${tmdbId}`
                : `${mediaType}:${item.title || item.name || Math.random()}`;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(item);
        }
    }
    return out;
};
