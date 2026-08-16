/**
 * Route Discover proxy paths through the direct TMDB client.
 */

import { createTmdbClient } from './tmdbClient.js';
import { isAdultMediaItem } from '../media/mediaFilters.js';

/**
 * High-signal non-English catalogs rolled into default Movies/Series.
 * Keep this list short — each language is a TMDB round-trip on cache miss.
 * Japanese animation is seeded separately into Popular (and kept in Trending).
 */
const ROLLED_IN_ORIGINAL_LANGUAGES = ['ko', 'zh', 'fr', 'es', 'hi'];

/** Default quality floor for released / popular / genre / studio / network browse. */
export const DISCOVER_DEFAULT_VOTE_COUNT_GTE = '150';
const ROLLED_IN_VOTE_COUNT_GTE = DISCOVER_DEFAULT_VOTE_COUNT_GTE;
const ANIME_VOTE_COUNT_GTE = DISCOVER_DEFAULT_VOTE_COUNT_GTE;

/**
 * Upcoming titles rarely have votes yet — use a near-term window + light popularity floor.
 * 180 days keeps the rail to “coming soon,” not multi-year announcements.
 * Popularity floor stays low so the rail can still fill ~20 posters.
 */
export const DISCOVER_UPCOMING_WINDOW_DAYS = 180;
export const DISCOVER_UPCOMING_MIN_POPULARITY = 5;
/** Max TMDB pages to scan while backfilling a filtered upcoming page. */
const UPCOMING_FETCH_PAGES_MAX = 8;

/** Trending mixes new + established; allow either votes or popularity. */
export const DISCOVER_TRENDING_MIN_VOTE_COUNT = 50;
export const DISCOVER_TRENDING_MIN_POPULARITY = 25;

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

export const addDaysIsoDate = (days, from = new Date()) => {
    const date = new Date(from.getTime());
    date.setUTCDate(date.getUTCDate() + Number(days) || 0);
    return date.toISOString().slice(0, 10);
};

export const passesTrendingQuality = (item = {}) => {
    const votes = Number(item.voteCount ?? item.vote_count ?? 0);
    const popularity = Number(item.popularity ?? 0);
    return votes >= DISCOVER_TRENDING_MIN_VOTE_COUNT
        || popularity >= DISCOVER_TRENDING_MIN_POPULARITY;
};

export const passesUpcomingQuality = (item = {}) => (
    Number(item.popularity ?? 0) >= DISCOVER_UPCOMING_MIN_POPULARITY
);

/**
 * TMDB /trending is global (no region param). Prefer titles in the Discover
 * region's primary language so US/EN rails aren't dominated by foreign hits.
 * Non-matching titles stay in the list — just later.
 */
export const preferredLanguagesForRegion = (region = '') => {
    const code = String(region || '').trim().toUpperCase();
    if (!code || code === 'US' || code === 'GB' || code === 'AU' || code === 'CA' || code === 'NZ' || code === 'IE') {
        return ['en'];
    }
    if (code === 'BR' || code === 'PT') return ['pt', 'en'];
    if (code === 'MX' || code === 'ES' || code === 'AR' || code === 'CL' || code === 'CO') return ['es', 'en'];
    if (code === 'FR' || code === 'BE' || code === 'CH') return ['fr', 'en'];
    if (code === 'DE' || code === 'AT') return ['de', 'en'];
    if (code === 'JP') return ['ja', 'en'];
    if (code === 'KR') return ['ko', 'en'];
    return ['en'];
};

export const preferRegionalResults = (results = [], { region = '' } = {}) => {
    const preferred = new Set(preferredLanguagesForRegion(region));
    const regionCode = String(region || '').trim().toUpperCase();
    const primary = [];
    const secondary = [];
    for (const item of Array.isArray(results) ? results : []) {
        if (!item) continue;
        const lang = String(item.originalLanguage || '').toLowerCase();
        const countries = Array.isArray(item.originCountry)
            ? item.originCountry.map((c) => String(c || '').toUpperCase())
            : [];
        const langMatch = !lang || preferred.has(lang);
        const countryMatch = regionCode && countries.includes(regionCode);
        if (langMatch || countryMatch) primary.push(item);
        else secondary.push(item);
    }
    return [...primary, ...secondary];
};

const ensureDefaultVoteFloor = (params = {}) => {
    if (params.voteCountGte || params.vote_count_gte) return params;
    return { ...params, voteCountGte: DISCOVER_DEFAULT_VOTE_COUNT_GTE };
};

const stripAdultPayload = (payload) => {
    if (!payload || typeof payload !== 'object') return payload;
    if (!Array.isArray(payload.results)) return payload;
    return {
        ...payload,
        results: payload.results.filter((item) => !isAdultMediaItem(item)),
    };
};

const filterPageResults = (payload, predicate) => {
    if (!payload || typeof payload !== 'object') return payload;
    if (!Array.isArray(payload.results)) return payload;
    return {
        ...payload,
        results: payload.results.filter((item) => predicate(item)),
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

const popularCacheKey = (mediaType, baseOpts = {}, region = '') => [
    mediaType,
    String(region || '').toUpperCase(),
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
        const cacheKey = popularCacheKey(mediaType, baseOpts, options.region || '');
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
                        voteCountGte: baseOpts.voteCountGte || DISCOVER_DEFAULT_VOTE_COUNT_GTE,
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
                    // Anime is first-class — seed Japanese animation into Popular.
                    discover({
                        ...baseOpts,
                        metadataLanguage,
                        originalLanguageFromLanguageQuery: false,
                        originalLanguage: 'ja',
                        genre: '16',
                        voteCountGte: baseOpts.voteCountGte || ANIME_VOTE_COUNT_GTE,
                        page: 1,
                    }).catch(() => emptyPage()),
                ]);
                const { sorted, totalResults } = mergeDiscoverResults(pages, { excludeAnime: false });
                const ranked = preferRegionalResults(sorted, { region: options.region || '' });
                const entry = {
                    expires: Date.now() + POPULAR_CACHE_TTL_MS,
                    sorted: ranked.slice(0, POPULAR_POOL_MAX),
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

        // Released browse defaults to the shared vote floor (Filters drawer can override).
        const listOpts = ensureDefaultVoteFloor({
            ...params,
            metadataLanguage,
            region: options.region || '',
            // Anime always uses originalLanguage:'ja'; never treat query.language as filter.
            originalLanguageFromLanguageQuery: anime ? false : !useMixedPopular,
            originalLanguage: anime
                ? 'ja'
                : (explicitLanguage || originalLanguagePref || undefined),
        });

        const respond = async (promise) => stripAdultPayload(await promise);

        const fetchUpcomingPage = async (kind, requestedPage) => {
            const pageNum = Math.max(1, Number(requestedPage) || 1);
            // Walk TMDB pages until we can fill a full rail (filters shrink each page).
            const startTmdbPage = ((pageNum - 1) * UPCOMING_FETCH_PAGES_MAX) + 1;
            const fetchOne = kind === 'movie'
                ? (page) => client.upcomingMovies({
                    page,
                    language: metadataLanguage,
                    region: options.region || '',
                    sortBy: params.sortBy,
                    originalLanguage: anime ? 'ja' : (explicitLanguage || originalLanguagePref || undefined),
                    ...(anime ? { genre: '16' } : {}),
                    primaryReleaseDateLte: addDaysIsoDate(DISCOVER_UPCOMING_WINDOW_DAYS),
                })
                : (page) => client.upcomingTv({
                    page,
                    language: metadataLanguage,
                    sortBy: params.sortBy,
                    originalLanguage: anime ? 'ja' : (explicitLanguage || originalLanguagePref || undefined),
                    ...(anime ? { genre: '16' } : {}),
                    firstAirDateLte: addDaysIsoDate(DISCOVER_UPCOMING_WINDOW_DAYS),
                });

            const merged = [];
            const seen = new Set();
            let totalPages = 1;
            for (let offset = 0; offset < UPCOMING_FETCH_PAGES_MAX && merged.length < PAGE_SIZE; offset += 1) {
                const payload = await fetchOne(startTmdbPage + offset).catch(() => emptyPage());
                totalPages = Math.max(totalPages, Number(payload?.totalPages) || 1);
                for (const item of payload?.results || []) {
                    if (!passesUpcomingQuality(item) || isAdultMediaItem(item)) continue;
                    if (anime && !isAnimeResult(item)) continue;
                    const key = itemKey(item);
                    if (seen.has(key)) continue;
                    seen.add(key);
                    merged.push(item);
                    if (merged.length >= PAGE_SIZE) break;
                }
                if (startTmdbPage + offset >= totalPages) break;
            }
            merged.sort((a, b) => Number(b.popularity || 0) - Number(a.popularity || 0));
            return {
                page: pageNum,
                totalPages: Math.max(1, Math.ceil(totalPages / UPCOMING_FETCH_PAGES_MAX)),
                totalResults: merged.length,
                results: merged.slice(0, PAGE_SIZE),
            };
        };

        if (path === '/discover/trending') {
            const trending = await respond(client.trending({
                page: params.page || 1,
                language: metadataLanguage,
            }));
            // Anime mode: keep Japanese animation only. Default: include anime
            // (first-class) — regional prefer still floats local-language titles first.
            const filtered = (trending.results || []).filter((item) => {
                if (isAdultMediaItem(item) || !passesTrendingQuality(item)) return false;
                if (anime) return isAnimeResult(item);
                return true;
            });
            return {
                ...trending,
                results: preferRegionalResults(filtered, { region: options.region || '' }),
            };
        }

        if (path === '/discover/movies/upcoming') {
            return respond(fetchUpcomingPage('movie', params.page || 1));
        }

        if (path === '/discover/tv/upcoming') {
            return respond(fetchUpcomingPage('tv', params.page || 1));
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
            const payload = await respond(client.movieRecommendations(movieRecMatch[1], {
                language: metadataLanguage,
                page: params.page || 1,
            }));
            return filterPageResults(payload, passesTrendingQuality);
        }

        const tvMatch = path.match(/^\/tv\/(\d+)$/i);
        if (tvMatch) {
            return client.tv(tvMatch[1], { language: metadataLanguage });
        }
        const tvRecMatch = path.match(/^\/tv\/(\d+)\/recommendations$/i);
        if (tvRecMatch) {
            const payload = await respond(client.tvRecommendations(tvRecMatch[1], {
                language: metadataLanguage,
                page: params.page || 1,
            }));
            return filterPageResults(payload, passesTrendingQuality);
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
