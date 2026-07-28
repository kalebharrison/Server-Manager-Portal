import { createLruCache } from '../cache/cache.js';
import { mapWithConcurrency } from '../core/concurrency.js';

const TMDB_API_BASE = 'https://api.themoviedb.org/3';
const TMDB_POSTER_SIZE = 'w342';
const TMDB_FETCH_CONCURRENCY = 4;
/** `${type}:${tmdbId}` -> poster_path string, or '' when missing. */
const posterPathCache = createLruCache({ maxEntries: 4000 });

const buildTmdbPosterUrl = (posterPath) => {
    const path = String(posterPath || '').trim();
    if (!path) return '';
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    const normalized = path.startsWith('/') ? path : `/${path}`;
    return `https://image.tmdb.org/t/p/${TMDB_POSTER_SIZE}${normalized}`;
};

const cacheKey = (mediaType, tmdbId) => `${mediaType}:${tmdbId}`;

const fetchPosterPath = async (apiKey, mediaType, tmdbId, fetchImpl) => {
    const key = cacheKey(mediaType, tmdbId);
    const cached = posterPathCache.get(key);
    if (cached !== undefined) return cached || null;

    const path = mediaType === 'tv' ? `/tv/${tmdbId}` : `/movie/${tmdbId}`;
    const url = `${TMDB_API_BASE}${path}?api_key=${encodeURIComponent(apiKey)}&language=en`;
    const response = await fetchImpl(url, { headers: { Accept: 'application/json' } }).catch(() => null);
    if (!response?.ok) {
        posterPathCache.set(key, '');
        return null;
    }
    const data = await response.json().catch(() => null);
    const posterPath = data?.poster_path ? String(data.poster_path) : '';
    posterPathCache.set(key, posterPath);
    return posterPath || null;
};

/**
 * Attach TMDB poster URLs for recently-added movies/shows that already have tmdbId.
 * Leaves Plex thumb as fallback when TMDB is missing or fails.
 */
export const enrichRecentItemsWithTmdbPosters = async (config, items = [], {
    mediaType = 'movie',
    fetchImpl = fetch,
} = {}) => {
    const apiKey = String(config?.tmdbApiKey || '').trim();
    if (!apiKey || !items.length) return items;

    const needed = [];
    const seen = new Set();
    for (const item of items) {
        const tmdbId = Number(item?.tmdbId);
        if (!Number.isFinite(tmdbId) || tmdbId <= 0) continue;
        const key = cacheKey(mediaType, tmdbId);
        if (seen.has(key) || posterPathCache.get(key) !== undefined) continue;
        seen.add(key);
        needed.push(tmdbId);
    }

    await mapWithConcurrency(needed, TMDB_FETCH_CONCURRENCY, async (tmdbId) => {
        await fetchPosterPath(apiKey, mediaType, tmdbId, fetchImpl);
    });

    return items.map((item) => {
        const tmdbId = Number(item?.tmdbId);
        if (!Number.isFinite(tmdbId) || tmdbId <= 0) return item;
        const posterPath = posterPathCache.get(cacheKey(mediaType, tmdbId));
        const thumbUrl = buildTmdbPosterUrl(posterPath);
        if (!thumbUrl) return item;
        return { ...item, thumbUrl, posterPath };
    });
};
