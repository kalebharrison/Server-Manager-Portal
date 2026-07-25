import {
    filterMediaItems,
    normalizeDiscoverMediaType,
    normalizeMediaItem,
    safePage,
} from './request-app-media.js';
import { sortFilmographyByDate } from './request-app-catalog-person.js';

const RECENT_YEARS = 5;
const THEME_FILLER = /^(?:about|with|on|featuring|involving|including)\s+/i;
const LEADING_ARTICLE = /^(?:the|a|an)\s+/i;

/** TMDB movie genre ids for common theme words (TV uses the same ids in Seerr discover). */
const GENRE_ALIASES = {
    action: 28,
    adventure: 12,
    animation: 16,
    anime: 16,
    comedy: 35,
    crime: 80,
    documentary: 99,
    drama: 18,
    family: 10751,
    fantasy: 14,
    history: 36,
    horror: 27,
    musical: 10402,
    music: 10402,
    mystery: 9648,
    romance: 10749,
    'sci-fi': 878,
    scifi: 878,
    'science fiction': 878,
    thriller: 53,
    war: 10752,
    western: 37,
};

export const normalizeThemeQuery = (theme = '') => {
    let q = String(theme || '').trim();
    if (!q) return q;
    q = q.replace(LEADING_ARTICLE, '');
    q = q.replace(THEME_FILLER, '');
    q = q.replace(/\s+(?:movie|movies|film|films|show|shows|tv\s+show|tv\s+series|series)\s*$/i, '');
    return q.trim();
};

export const resolveThemeGenreId = (theme = '') => {
    const key = String(theme || '').trim().toLowerCase().replace(/[^a-z0-9\s-]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!key) return null;
    if (GENRE_ALIASES[key]) return GENRE_ALIASES[key];
    const match = Object.entries(GENRE_ALIASES).find(([name]) => key === name || key.startsWith(`${name} `) || key.endsWith(` ${name}`));
    return match ? match[1] : null;
};

export const minRecentReleaseYear = (recent = true, now = new Date()) => {
    if (!recent) return null;
    return now.getFullYear() - RECENT_YEARS;
};

export const filterRecentItems = (items = [], minYear = null) => {
    if (!Number.isFinite(minYear)) return items;
    return items.filter((item) => {
        const date = item.releaseDate || item.firstAirDate || '';
        const year = Number(String(date).slice(0, 4));
        return Number.isFinite(year) && year >= minYear;
    });
};

export const pickBestKeywordMatch = (keywords = [], theme = '') => {
    const needle = String(theme || '').trim().toLowerCase();
    if (!needle || !keywords.length) return null;
    const exact = keywords.find((entry) => String(entry?.name || '').toLowerCase() === needle);
    if (exact?.id) return exact;
    const starts = keywords.find((entry) => String(entry?.name || '').toLowerCase().startsWith(needle));
    if (starts?.id) return starts;
    const includes = keywords.find((entry) => String(entry?.name || '').toLowerCase().includes(needle));
    return includes?.id ? includes : (keywords[0]?.id ? keywords[0] : null);
};

export const createCatalogTheme = ({
    getCredentials,
    cachedSeerrJson,
    proxyPoster,
    applyAcquisitionState,
    search,
}) => {
    const searchKeywords = async (config, query) => {
        const q = String(query || '').trim();
        if (q.length < 2) return [];
        const params = new URLSearchParams({ query: q, page: '1' });
        const payload = await cachedSeerrJson(config, `/api/v1/search/keyword?${params.toString()}`, 15_000, 120_000);
        return Array.isArray(payload?.results) ? payload.results : [];
    };

    const fetchDiscover = async (config, endpoint, params) => {
        const { publicBaseUrl } = await getCredentials(config);
        const payload = await cachedSeerrJson(config, `${endpoint}?${params.toString()}`, 15_000, 120_000);
        const results = Array.isArray(payload?.results) ? payload.results : [];
        return results
            .filter((item) => ['movie', 'tv'].includes(String(item.mediaType || item.type || '').toLowerCase()))
            .map((item) => normalizeMediaItem(item, publicBaseUrl, proxyPoster));
    };

    const discoverEndpointResults = async (config, {
        mediaType, keywordId, genreId, recent, page,
    }) => {
        const type = normalizeDiscoverMediaType(mediaType);
        const endpoints = type === 'all' ? ['movie', 'tv'] : [type];
        const minYear = minRecentReleaseYear(recent);
        const dateGte = Number.isFinite(minYear) ? `${minYear}-01-01` : null;
        const pages = await Promise.all(endpoints.map(async (entry) => {
            const params = new URLSearchParams({ page: String(safePage(page)) });
            if (keywordId) params.set('keywords', String(keywordId));
            if (genreId) params.set('genre', String(genreId));
            params.set('sortBy', entry === 'tv' ? 'first_air_date.desc' : 'release_date.desc');
            if (dateGte) {
                if (entry === 'tv') params.set('firstAirDateGte', dateGte);
                else params.set('primaryReleaseDateGte', dateGte);
            }
            return fetchDiscover(config, `/api/v1/discover/${entry === 'tv' ? 'tv' : 'movies'}`, params);
        }));
        return pages.flat();
    };

    const fallbackSearchResults = async (config, {
        theme, mediaType, recent, limit,
    }) => {
        const type = normalizeDiscoverMediaType(mediaType);
        const page = await search(config, { query: theme, mediaType: type, page: 1 });
        const minYear = minRecentReleaseYear(recent);
        const sorted = sortFilmographyByDate(page.results || [], { descending: true });
        const filtered = filterRecentItems(sorted, minYear);
        return (filtered.length ? filtered : sorted).slice(0, Math.max(1, Number(limit) || 10));
    };

    const discoverByTheme = async (config, {
        theme,
        mediaType = 'movie',
        recent = true,
        limit = 10,
        page = 1,
    } = {}) => {
        const normalizedTheme = normalizeThemeQuery(theme);
        if (normalizedTheme.length < 2) {
            return { theme: normalizedTheme, results: [], source: 'none' };
        }

        const genreId = resolveThemeGenreId(normalizedTheme);
        let keywordId = null;
        let source = 'genre';

        if (!genreId) {
            const keywords = await searchKeywords(config, normalizedTheme);
            const match = pickBestKeywordMatch(keywords, normalizedTheme);
            keywordId = match?.id || null;
            source = keywordId ? 'keyword' : 'search';
        }

        let results = [];
        if (genreId || keywordId) {
            results = await discoverEndpointResults(config, {
                mediaType,
                keywordId,
                genreId,
                recent,
                page,
            });
            results = filterMediaItems(results, normalizeDiscoverMediaType(mediaType), false, false);
            results = sortFilmographyByDate(results, { descending: true });
            const minYear = minRecentReleaseYear(recent);
            const recentOnly = filterRecentItems(results, minYear);
            if (recentOnly.length) results = recentOnly;
        }

        if (!results.length) {
            results = await fallbackSearchResults(config, {
                theme: normalizedTheme,
                mediaType,
                recent,
                limit,
            });
            source = 'search';
        }

        return {
            theme: normalizedTheme,
            source,
            results: (await applyAcquisitionState(config, results)).slice(0, Math.max(1, Number(limit) || 10)),
        };
    };

    return {
        discoverByTheme,
        searchKeywords,
        normalizeThemeQuery,
        resolveThemeGenreId,
        minRecentReleaseYear,
        filterRecentItems,
        pickBestKeywordMatch,
    };
};
