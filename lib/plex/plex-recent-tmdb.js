import { createLruCache } from '../cache/cache.js';
import { mapWithConcurrency } from '../core/concurrency.js';

const TMDB_API_BASE = 'https://api.themoviedb.org/3';
const TMDB_POSTER_SIZE = 'w342';
const TMDB_FETCH_CONCURRENCY = 4;
/** `${type}:${tmdbId}` -> { posterPath, voteAverage } or { posterPath: '' }. */
const posterMetaCache = createLruCache({ maxEntries: 4000 });

const buildTmdbPosterUrl = (posterPath) => {
    const path = String(posterPath || '').trim();
    if (!path) return '';
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    const normalized = path.startsWith('/') ? path : `/${path}`;
    return `https://image.tmdb.org/t/p/${TMDB_POSTER_SIZE}${normalized}`;
};

const cacheKey = (mediaType, tmdbId) => `${mediaType}:${tmdbId}`;

const emptyMeta = () => ({ posterPath: '', voteAverage: null });

const fetchPosterMeta = async (apiKey, mediaType, tmdbId, fetchImpl) => {
    const key = cacheKey(mediaType, tmdbId);
    const cached = posterMetaCache.get(key);
    if (cached !== undefined) return cached;

    const path = mediaType === 'tv' ? `/tv/${tmdbId}` : `/movie/${tmdbId}`;
    const url = `${TMDB_API_BASE}${path}?api_key=${encodeURIComponent(apiKey)}&language=en`;
    const response = await fetchImpl(url, { headers: { Accept: 'application/json' } }).catch(() => null);
    if (!response?.ok) {
        const miss = emptyMeta();
        posterMetaCache.set(key, miss);
        return miss;
    }
    const data = await response.json().catch(() => null);
    const posterPath = data?.poster_path ? String(data.poster_path) : '';
    const vote = Number(data?.vote_average);
    const meta = {
        posterPath,
        voteAverage: Number.isFinite(vote) && vote > 0 ? vote : null,
    };
    posterMetaCache.set(key, meta);
    return meta;
};

/**
 * Attach TMDB poster URLs (+ vote average) for recently-added movies/shows that already have tmdbId.
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
        if (seen.has(key) || posterMetaCache.get(key) !== undefined) continue;
        seen.add(key);
        needed.push(tmdbId);
    }

    await mapWithConcurrency(needed, TMDB_FETCH_CONCURRENCY, async (tmdbId) => {
        await fetchPosterMeta(apiKey, mediaType, tmdbId, fetchImpl);
    });

    return items.map((item) => {
        const tmdbId = Number(item?.tmdbId);
        if (!Number.isFinite(tmdbId) || tmdbId <= 0) return item;
        const meta = posterMetaCache.get(cacheKey(mediaType, tmdbId)) || emptyMeta();
        const thumbUrl = buildTmdbPosterUrl(meta.posterPath);
        const next = { ...item };
        if (thumbUrl) {
            next.thumbUrl = thumbUrl;
            next.posterPath = meta.posterPath;
        }
        if (meta.voteAverage != null && !(Number(item.voteAverage) > 0)) {
            next.voteAverage = meta.voteAverage;
        }
        return next;
    });
};
