import { cacheRefreshMs } from '../cache/cache-refresh.js';
import {
    filterMediaItems,
    normalizeDiscoverMediaType,
    normalizeGenreId,
    normalizeMediaItem,
    normalizeMediaType,
    safePage,
} from './request-app-media.js';

const DISCOVER_PAGE_SIZE = 20;
const ANIME_SOURCE_PAGE_BATCH = 5;

export const createAcquisitionApplier = (getActiveAcquisitionKeys) => {
    const applyAcquisitionState = async (config, items) => {
        const keys = await getActiveAcquisitionKeys(config).catch(() => new Set());
        if (!keys?.size) return items;
        return items.map((item) => {
            const titleKey = String(item.title || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
            const processing = (item.mediaType === 'movie' && item.tmdbId && keys.has(`tmdb:${item.tmdbId}`))
                || (item.mediaType === 'tv' && item.tvdbId && keys.has(`tvdb:${item.tvdbId}`))
                || (titleKey && keys.has(`title:${titleKey}`));
            return processing ? { ...item, processing: true, requested: false, canRequest: false } : item;
        });
    };
    return { applyAcquisitionState };
};

export const pageInfoWithNext = (payload, requestedPage, sourceResultCount) => {
    const reported = payload?.pageInfo || {};
    const currentPage = Math.max(1, Number(reported.page) || safePage(requestedPage));
    const pages = Number(reported.pages);
    return {
        ...reported,
        page: currentPage,
        ...(Number.isFinite(pages) && pages > 0 ? { pages } : {}),
        hasNextPage: Number.isFinite(pages) && pages > 0
            ? currentPage < pages
            : sourceResultCount >= DISCOVER_PAGE_SIZE && currentPage < 50,
    };
};

export const createCatalogDiscover = ({
    getCredentials,
    cachedSeerrJson,
    proxyPoster,
    applyAcquisitionState,
}) => {
    const normalizeDiscoverPayload = (payload, page, publicBaseUrl, mediaType = 'all', anime = false, foreign = false, genreId = null) => {
        const results = Array.isArray(payload?.results) ? payload.results : Array.isArray(payload) ? payload : [];
        return {
            results: filterMediaItems(results
                .filter((item) => ['movie', 'tv'].includes(String(item.mediaType || item.type || '').toLowerCase()))
                .map((item) => normalizeMediaItem(item, publicBaseUrl, proxyPoster)), mediaType, anime, foreign, genreId),
            sourceResultCount: results.length,
            pageInfo: pageInfoWithNext(payload, page, results.length),
        };
    };

    const search = async (config, { query, mediaType = 'all', anime = false, foreign = false, genreId = null, page = 1 } = {}) => {
        const q = String(query || '').trim();
        if (q.length < 2) return { results: [], pageInfo: { page: 1, results: 0 } };
        const params = new URLSearchParams({ query: q, page: String(safePage(page)) });
        const { publicBaseUrl } = await getCredentials(config);
        const payload = await cachedSeerrJson(config, `/api/v1/search?${params.toString()}`, 15_000, 120_000);
        const results = Array.isArray(payload?.results) ? payload.results : [];
        const normalized = filterMediaItems(results
            .filter((item) => ['movie', 'tv'].includes(String(item.mediaType || item.type || '').toLowerCase()))
            .map((item) => normalizeMediaItem(item, publicBaseUrl, proxyPoster)), normalizeDiscoverMediaType(mediaType), anime, foreign, normalizeGenreId(genreId));
        return {
            results: await applyAcquisitionState(config, normalized),
            pageInfo: pageInfoWithNext(payload, page, results.length),
        };
    };

    const discover = async (config, { category = 'trending', mediaType = 'all', anime = false, foreign = false, genreId = null, page = 1 } = {}) => {
        const safeCategory = ['trending', 'popular', 'upcoming', 'movies', 'tv'].includes(category) ? category : 'trending';
        const requestedType = normalizeDiscoverMediaType(mediaType);
        const requestedGenreId = normalizeGenreId(genreId);
        const effectiveType = safeCategory === 'movies' ? 'movie' : safeCategory === 'tv' ? 'tv' : requestedType;
        const endpointMap = {
            trending: {
                all: ['/api/v1/discover/trending'],
                movie: ['/api/v1/discover/trending'],
                tv: ['/api/v1/discover/trending'],
            },
            popular: {
                all: ['/api/v1/discover/movies', '/api/v1/discover/tv'],
                movie: ['/api/v1/discover/movies'],
                tv: ['/api/v1/discover/tv'],
            },
            upcoming: {
                all: ['/api/v1/discover/movies/upcoming', '/api/v1/discover/tv/upcoming'],
                movie: ['/api/v1/discover/movies/upcoming'],
                tv: ['/api/v1/discover/tv/upcoming'],
            },
            movies: {
                all: ['/api/v1/discover/movies'],
                movie: ['/api/v1/discover/movies'],
                tv: ['/api/v1/discover/movies'],
            },
            tv: {
                all: ['/api/v1/discover/tv'],
                movie: ['/api/v1/discover/tv'],
                tv: ['/api/v1/discover/tv'],
            },
        };
        const { publicBaseUrl } = await getCredentials(config);
        const canUseMovieGenreQuery = !!requestedGenreId && effectiveType === 'movie' && ['popular', 'movies'].includes(safeCategory);
        const sourcePageBatch = anime || foreign || (requestedGenreId && !canUseMovieGenreQuery) ? ANIME_SOURCE_PAGE_BATCH : 1;
        const firstSourcePage = ((safePage(page) - 1) * sourcePageBatch) + 1;
        const sourcePages = Array.from({ length: sourcePageBatch }, (_, index) => firstSourcePage + index);
        const payloadGroups = await Promise.all(sourcePages.map((sourcePage) => {
            const params = new URLSearchParams({ page: String(sourcePage) });
            if (canUseMovieGenreQuery) params.set('genre', String(requestedGenreId));
            return Promise.all(endpointMap[safeCategory][effectiveType].map((endpoint) => (
                cachedSeerrJson(config, `${endpoint}?${params.toString()}`, cacheRefreshMs(config), 10 * 60_000)
            )));
        }));
        const normalizedPayloads = payloadGroups.flatMap((payloads, index) => payloads.map((payload) => (
            normalizeDiscoverPayload(payload, sourcePages[index], publicBaseUrl, effectiveType, anime, foreign, requestedGenreId)
        )));
        if (!normalizedPayloads.length) return { results: [], pageInfo: { page: safePage(page), hasNextPage: false } };
        const normalized = normalizedPayloads.flatMap((payload) => payload.results);
        const reportedSourcePages = Math.max(...normalizedPayloads.map((payload) => Number(payload.pageInfo?.pages) || 0));
        const lastSourcePage = sourcePages[sourcePages.length - 1];
        const hasNextPage = reportedSourcePages > 0
            ? reportedSourcePages > lastSourcePage
            : normalizedPayloads.some((payload) => payload.pageInfo?.hasNextPage);
        return {
            results: await applyAcquisitionState(config, normalized),
            pageInfo: {
                page: safePage(page),
                ...(reportedSourcePages > 0 ? { pages: Math.ceil(reportedSourcePages / sourcePageBatch) } : {}),
                results: normalized.length,
                hasNextPage,
            },
        };
    };

    return { search, discover };
};
