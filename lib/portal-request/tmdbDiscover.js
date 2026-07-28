/**
 * Route Seerr-shaped Discover proxy paths through the direct TMDB client.
 */

import { createTmdbClient } from './tmdbClient.js';
import { isAdultMediaItem } from '../request-app/request-app-media-status.js';

/**
 * High-signal non-English catalogs rolled into default Movies/Series.
 * Keep this list short — each language is a TMDB round-trip on cache miss.
 * Japanese animation stays behind the Anime toggle.
 */
const ROLLED_IN_ORIGINAL_LANGUAGES = ['ko', 'zh', 'fr', 'es', 'hi'];

const ROLLED_IN_VOTE_COUNT_GTE = '150';
const ANIME_VOTE_COUNT_GTE = '150';
const PAGE_SIZE = 20;
/** English pages fetched once to seed the merged Popular pool. */
const POPULAR_ENGLISH_SEED_PAGES = 3;
/** Max titles kept in the in-memory Popular pool. */
const POPULAR_POOL_MAX = 160;
const POPULAR_CACHE_TTL_MS = 5 * 60 * 1000;

/** @type {Map<string, { expires: number, sorted: any[], totalResults: number }>} */
const popularBrowseCache = new Map();
/** @type {Map<string, Promise<{ expires: number, sorted: any[], totalResults: number }>>} */
const popularBrowseInflight = new Map();

const emptyPage = () => ({
    page: 1,
    totalPages: 1,
    totalResults: 0,
    results: [],
});

const asFlag = (value) => value === '1' || value === 'true' || value === true;

const stripAdultPayload = (payload) => {
    if (!payload || typeof payload !== 'object') return payload;
    if (!Array.isArray(payload.results)) return payload;
    return {
        ...payload,
        results: payload.results.filter((item) => !isAdultMediaItem(item)),
    };
};

/** Anime = Japanese + Animation (or ja with no genres yet). */
const isAnimeResult = (item = {}) => {
    const lang = String(item.originalLanguage || '').toLowerCase();
    if (lang !== 'ja') return false;
    const ids = Array.isArray(item.genreIds)
        ? item.genreIds.map((id) => Number(id)).filter((id) => Number.isFinite(id))
        : [];
    if (!ids.length) return true;
    return ids.includes(16);
};

const itemKey = (item) => `${item?.mediaType || 'movie'}:${item?.id}`;

const mergeDiscoverResults = (pages, { excludeAnime = false } = {}) => {
    const byKey = new Map();
    let totalResults = 0;
    for (const payload of pages) {
        if (!payload) continue;
        totalResults += Number(payload.totalResults) || 0;
        for (const item of payload.results || []) {
            if (!item?.id || isAdultMediaItem(item)) continue;
            if (excludeAnime && isAnimeResult(item)) continue;
            const key = itemKey(item);
            const prev = byKey.get(key);
            if (!prev || Number(item.popularity || 0) > Number(prev.popularity || 0)) {
                byKey.set(key, item);
            }
        }
    }
    const sorted = [...byKey.values()].sort(
        (a, b) => Number(b.popularity || 0) - Number(a.popularity || 0),
    );
    return { sorted, totalResults: Math.max(totalResults, sorted.length) };
};

const sliceMergedPage = (sorted, totalResults, page, pageSize = PAGE_SIZE) => {
    const pageNum = Math.max(1, Number(page) || 1);
    const start = (pageNum - 1) * pageSize;
    return {
        page: pageNum,
        totalPages: Math.max(1, Math.ceil(sorted.length / pageSize) || 1),
        totalResults: Math.max(totalResults, sorted.length),
        results: sorted.slice(start, start + pageSize),
    };
};

const popularCacheKey = (mediaType, baseOpts = {}) => [
    mediaType,
    baseOpts.sortBy || baseOpts.sort_by || 'popularity.desc',
    baseOpts.genre || baseOpts.with_genres || '',
    baseOpts.keywords || '',
    baseOpts.studio || '',
    baseOpts.network || '',
    baseOpts.voteCountGte || baseOpts.vote_count_gte || '',
    baseOpts.watchProviders || '',
].join('|');

/**
 * @param {object} config Portal config
 * @param {object} [options]
 * @param {string} [options.language] Metadata language (TMDB locale)
 * @param {string} [options.region] Discover region
 * @param {string} [options.originalLanguage] Prefs original-language filter (discover lists)
 */
export const createTmdbDiscoverRouter = (config = {}, options = {}) => {
    const client = createTmdbClient({
        tmdbApiKey: config.tmdbApiKey,
        language: options.language || 'en',
        region: options.region || '',
        discoverRegion: options.region || '',
        tmdbLanguage: options.language || 'en',
        fetchImpl: options.fetchImpl,
    });

    const metadataLanguage = options.language || 'en';
    const originalLanguagePref = options.originalLanguage || '';

    /**
     * Default Popular: English + high-signal international catalogs, anime excluded.
     * Builds a pooled ranking once (cached) so page 2+ does not re-hit every language.
     */
    const fetchPopularBrowse = async (mediaType, baseOpts, page) => {
        const discover = mediaType === 'tv' ? client.discoverTv : client.discoverMovies;
        const cacheKey = popularCacheKey(mediaType, baseOpts);
        const pageNum = Math.max(1, Number(page) || 1);
        const needed = pageNum * PAGE_SIZE;

        const fromCache = popularBrowseCache.get(cacheKey);
        if (fromCache && fromCache.expires > Date.now() && fromCache.sorted.length >= needed) {
            return sliceMergedPage(fromCache.sorted, fromCache.totalResults, pageNum);
        }

        let inflight = popularBrowseInflight.get(cacheKey);
        if (!inflight) {
            inflight = (async () => {
                const englishPages = Array.from({ length: POPULAR_ENGLISH_SEED_PAGES }, (_, i) => i + 1);
                const pages = await Promise.all([
                    ...englishPages.map((enPage) => discover({
                        ...baseOpts,
                        metadataLanguage,
                        originalLanguageFromLanguageQuery: false,
                        originalLanguage: 'en',
                        page: enPage,
                    }).catch(() => emptyPage())),
                    ...ROLLED_IN_ORIGINAL_LANGUAGES.map((lang) => discover({
                        ...baseOpts,
                        metadataLanguage,
                        originalLanguageFromLanguageQuery: false,
                        originalLanguage: lang,
                        voteCountGte: baseOpts.voteCountGte || ROLLED_IN_VOTE_COUNT_GTE,
                        page: 1,
                    }).catch(() => emptyPage())),
                ]);
                const { sorted, totalResults } = mergeDiscoverResults(pages, { excludeAnime: true });
                const entry = {
                    expires: Date.now() + POPULAR_CACHE_TTL_MS,
                    sorted: sorted.slice(0, POPULAR_POOL_MAX),
                    totalResults,
                };
                popularBrowseCache.set(cacheKey, entry);
                return entry;
            })().finally(() => {
                popularBrowseInflight.delete(cacheKey);
            });
            popularBrowseInflight.set(cacheKey, inflight);
        }

        const entry = await inflight;
        return sliceMergedPage(entry.sorted, entry.totalResults, pageNum);
    };

    /**
     * @param {string} path Normalized path (e.g. /discover/movies)
     * @param {URLSearchParams|object|string} query
     */
    const fetchPath = async (path, query = {}) => {
        const params = query instanceof URLSearchParams
            ? Object.fromEntries(query.entries())
            : { ...(query || {}) };

        const anime = asFlag(params.anime);
        const page = params.page || 1;
        // Explicit original-language from Filters drawer (or legacy international=1 ignored).
        const explicitLanguage = String(params.language || '').trim();
        const useMixedPopular = !anime && !explicitLanguage;

        if (anime) {
            // Filter Japanese originals only — leave metadata language as portal/en
            // so title/overview stay English (or configured UI locale).
            delete params.language;
            const genres = new Set(
                String(params.genre || params.with_genres || '')
                    .split(',')
                    .map((part) => part.trim())
                    .filter(Boolean),
            );
            genres.add('16');
            params.genre = [...genres].join(',');
            if (!params.voteCountGte && !params.vote_count_gte) {
                params.voteCountGte = ANIME_VOTE_COUNT_GTE;
            }
        }

        const listOpts = {
            ...params,
            metadataLanguage,
            region: options.region || '',
            // Anime always uses originalLanguage:'ja'; never treat query.language as filter.
            originalLanguageFromLanguageQuery: anime ? false : !useMixedPopular,
            originalLanguage: anime
                ? 'ja'
                : (explicitLanguage || originalLanguagePref || undefined),
        };

        const respond = async (promise) => stripAdultPayload(await promise);

        if (path === '/discover/trending') {
            const trending = await respond(client.trending({
                page: params.page || 1,
                language: metadataLanguage,
            }));
            // Home rails: strip adult + anime (anime has its own toggle on Movies/Series).
            return {
                ...trending,
                results: (trending.results || []).filter((item) => (
                    !isAdultMediaItem(item) && !isAnimeResult(item)
                )),
            };
        }

        if (path === '/discover/movies/upcoming') {
            return respond(client.upcomingMovies({
                page: params.page || 1,
                language: metadataLanguage,
                region: options.region || '',
                sortBy: params.sortBy,
                originalLanguage: explicitLanguage || originalLanguagePref || undefined,
            }));
        }

        if (path === '/discover/tv/upcoming') {
            return respond(client.upcomingTv({
                page: params.page || 1,
                language: metadataLanguage,
                sortBy: params.sortBy,
                originalLanguage: explicitLanguage || originalLanguagePref || undefined,
            }));
        }

        const movieStudioMatch = path.match(/^\/discover\/movies\/studio\/(\d+)$/i);
        if (movieStudioMatch) {
            return respond(client.discoverMovies({
                ...listOpts,
                studio: movieStudioMatch[1],
                originalLanguageFromLanguageQuery: Boolean(explicitLanguage || originalLanguagePref),
            }));
        }

        const tvNetworkMatch = path.match(/^\/discover\/tv\/network\/(\d+)$/i);
        if (tvNetworkMatch) {
            return respond(client.discoverTv({
                ...listOpts,
                network: tvNetworkMatch[1],
                originalLanguageFromLanguageQuery: Boolean(explicitLanguage || originalLanguagePref),
            }));
        }

        if (path === '/discover/movies' || /^\/discover\/movies\//i.test(path)) {
            if (/^\/discover\/movies\/language\//i.test(path)) {
                const lang = path.split('/').pop();
                return respond(client.discoverMovies({
                    ...listOpts,
                    language: lang,
                    originalLanguageFromLanguageQuery: true,
                    metadataLanguage,
                }));
            }
            if (useMixedPopular) {
                return respond(fetchPopularBrowse('movie', listOpts, page));
            }
            return respond(client.discoverMovies({
                ...listOpts,
                originalLanguageFromLanguageQuery: true,
                originalLanguage: anime ? 'ja' : (explicitLanguage || originalLanguagePref || undefined),
            }));
        }

        if (path === '/discover/tv' || /^\/discover\/tv\//i.test(path)) {
            if (/^\/discover\/tv\/language\//i.test(path)) {
                const lang = path.split('/').pop();
                return respond(client.discoverTv({
                    ...listOpts,
                    language: lang,
                    originalLanguageFromLanguageQuery: true,
                    metadataLanguage,
                }));
            }
            if (useMixedPopular) {
                return respond(fetchPopularBrowse('tv', listOpts, page));
            }
            return respond(client.discoverTv({
                ...listOpts,
                originalLanguageFromLanguageQuery: true,
                originalLanguage: anime ? 'ja' : (explicitLanguage || originalLanguagePref || undefined),
            }));
        }

        if (path === '/discover/genreslider/movie') {
            return client.genreSlider('movie', { language: metadataLanguage });
        }
        if (path === '/discover/genreslider/tv') {
            return client.genreSlider('tv', { language: metadataLanguage });
        }

        const movieMatch = path.match(/^\/movie\/(\d+)$/i);
        if (movieMatch) {
            return client.movie(movieMatch[1], { language: metadataLanguage });
        }
        const movieRecMatch = path.match(/^\/movie\/(\d+)\/recommendations$/i);
        if (movieRecMatch) {
            return respond(client.movieRecommendations(movieRecMatch[1], {
                language: metadataLanguage,
                page: params.page || 1,
            }));
        }

        const tvMatch = path.match(/^\/tv\/(\d+)$/i);
        if (tvMatch) {
            return client.tv(tvMatch[1], { language: metadataLanguage });
        }
        const tvRecMatch = path.match(/^\/tv\/(\d+)\/recommendations$/i);
        if (tvRecMatch) {
            return respond(client.tvRecommendations(tvRecMatch[1], {
                language: metadataLanguage,
                page: params.page || 1,
            }));
        }
        const tvSeasonMatch = path.match(/^\/tv\/(\d+)\/season\/(\d+)$/i);
        if (tvSeasonMatch) {
            return client.tvSeason(tvSeasonMatch[1], tvSeasonMatch[2], {
                language: metadataLanguage,
            });
        }

        const personMatch = path.match(/^\/person\/(\d+)$/i);
        if (personMatch) {
            return client.person(personMatch[1], { language: metadataLanguage });
        }
        const personCreditsMatch = path.match(/^\/person\/(\d+)\/combined_credits$/i);
        if (personCreditsMatch) {
            return client.personCombinedCredits(personCreditsMatch[1], {
                language: metadataLanguage,
            });
        }

        if (path === '/search') {
            return respond(client.search(params.query || '', {
                page: params.page || 1,
                language: metadataLanguage,
            }));
        }
        if (path === '/search/keyword') {
            return client.searchKeyword(params.query || '', { page: params.page || 1 });
        }
        if (path === '/search/company') {
            return client.searchCompany(params.query || '', { page: params.page || 1 });
        }

        if (path === '/watchproviders/movies') {
            return client.watchProviders('movie', {
                language: metadataLanguage,
                watchRegion: params.watchRegion || options.region || '',
            });
        }
        if (path === '/watchproviders/tv') {
            return client.watchProviders('tv', {
                language: metadataLanguage,
                watchRegion: params.watchRegion || options.region || '',
            });
        }

        if (path === '/media' || /^\/media\//i.test(path)) {
            return emptyPage();
        }

        const err = new Error(`TMDB discover router does not support path: ${path}`);
        err.code = 'TMDB_PATH_UNSUPPORTED';
        err.status = 404;
        throw err;
    };

    return { client, fetchPath };
};

export default createTmdbDiscoverRouter;
