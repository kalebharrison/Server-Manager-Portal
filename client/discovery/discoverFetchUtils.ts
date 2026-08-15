import { apiFetch } from '../shared/api';
import type { FilterState } from './FilterDrawer';
import { appendDiscoverQuery, hasAdvancedDiscoverFilters } from './discoverUrlUtils';
import { filterDiscoverBrowseItems, type DiscoverBrowseMode } from './discoverAvailability';
import { enrichDiscoverItemsWithAvailability } from './discoverAvailabilityEnrich';
import { dedupeDiscoverResults } from './discoverItemUtils';
import type { DiscoverPagePayload } from './useDiscoverInfiniteScroll';

type DiscoverBrowseFilterOptions = {
    hideAvailable?: boolean;
    hideRequested?: boolean;
    /** When on, keep Japanese animation (anime). */
    animeOnly?: boolean;
    mode?: DiscoverBrowseMode | null;
    /**
     * Trust mediaInfo already attached by the discovery proxy (disk cache + warm catalog).
     * Client must not round-trip /availability-batch — that caused badge pop-in after paint.
     */
    trustAttachedAvailability?: boolean;
};

export type DiscoverBrowseModeOptions = {
    anime?: boolean;
};

/** Extra same-endpoint pages to scan when hide-available empties a single page. */
const MAX_SEQUENTIAL_EXTRA_PAGES = 5;

export const buildDiscoverStudioApiUrl = (page: number, studioId: number | string, sort = 'popularity.desc') =>
    `/api/discovery/proxy/discover/movies/studio/${studioId}?page=${page}&sortBy=${encodeURIComponent(sort)}`;

export const buildDiscoverNetworkApiUrl = (page: number, networkId: number | string, sort = 'popularity.desc') =>
    `/api/discovery/proxy/discover/tv/network/${networkId}?page=${page}&sortBy=${encodeURIComponent(sort)}`;

const ANIME_VOTE_COUNT_GTE = '150';
const ANIMATION_GENRE_ID = '16';

const withBrowseModeParams = (
    url: string,
    options: DiscoverBrowseModeOptions,
    filters: FilterState,
): string => {
    const [base, qs = ''] = url.split('?');
    const params = new URLSearchParams(qs);

    if (!options.anime) {
        // Default Popular: no original-language lock — server mixes English + rolled-in intl.
        // Keep drawer language when the user explicitly filtered by language.
        if (!filters.language) params.delete('language');
        params.delete('international');
        params.delete('anime');
        return `${base}?${params.toString()}`;
    }

    params.set('anime', '1');
    // Keep Japanese originals via server `with_original_language=ja`, but do not
    // force metadata `language=ja` — that made titles/overviews Japanese.
    params.delete('language');
    params.delete('international');
    const genres = new Set(
        String(params.get('genre') || filters.genre || '')
            .split(',')
            .map((part) => part.trim())
            .filter(Boolean),
    );
    genres.add(ANIMATION_GENRE_ID);
    params.set('genre', [...genres].join(','));
    if (!filters.voteCountGte) {
        params.set('voteCountGte', ANIME_VOTE_COUNT_GTE);
    }
    return `${base}?${params.toString()}`;
};

export const buildDiscoverMoviesApiUrl = (
    page: number,
    filters: FilterState,
    options: DiscoverBrowseModeOptions = {},
): string => {
    const sort = filters.sort || 'popularity.desc';
    const studioOnly = Boolean(filters.studio)
        && !hasAdvancedDiscoverFilters({ ...filters, studio: '', sort: 'popularity.desc' }, 'movie');

    if (studioOnly) {
        return buildDiscoverStudioApiUrl(page, filters.studio, sort);
    }

    // Anime clears drawer language so it can't override English metadata titles.
    const browseFilters = options.anime
        ? { ...filters, language: '' }
        : filters;
    let url = `/api/discovery/proxy/discover/movies?page=${page}&sortBy=${encodeURIComponent(sort)}`;
    url = appendDiscoverQuery(url, browseFilters, 'movie');
    return withBrowseModeParams(url, options, browseFilters);
};

export const buildDiscoverSeriesApiUrl = (
    page: number,
    filters: FilterState,
    options: DiscoverBrowseModeOptions = {},
): string => {
    const sort = filters.sort || 'popularity.desc';
    const networkOnly = Boolean(filters.network)
        && !hasAdvancedDiscoverFilters({ ...filters, network: '', sort: 'popularity.desc' }, 'tv');
    const keywordsOnly = Boolean(filters.keywords)
        && !hasAdvancedDiscoverFilters({ ...filters, keywords: '', keywordName: '', sort: 'popularity.desc' }, 'tv');

    if (keywordsOnly) {
        return `/api/discovery/proxy/discover/tv?keywords=${encodeURIComponent(filters.keywords)}&page=${page}&sortBy=${encodeURIComponent(sort)}`;
    }

    if (networkOnly) {
        return buildDiscoverNetworkApiUrl(page, filters.network, sort);
    }

    const browseFilters = options.anime
        ? { ...filters, language: '' }
        : filters;
    let url = `/api/discovery/proxy/discover/tv?page=${page}&sortBy=${encodeURIComponent(sort)}`;
    url = appendDiscoverQuery(url, browseFilters, 'tv');
    return withBrowseModeParams(url, options, browseFilters);
};

export async function fetchDiscoverPage(
    url: string,
    options: DiscoverBrowseFilterOptions = {},
): Promise<DiscoverPagePayload> {
    const res = await apiFetch(url);
    let results = Array.isArray(res?.results) ? res.results : [];
    // Mode inventory filters need live Arr stamps — cold catalog peeks leave library
    // titles looking requestable (`kind: none`). Enrich before filtering.
    if (options.mode === 'request' || options.mode === 'discover') {
        results = await enrichDiscoverItemsWithAvailability(results);
    }
    const filtered = filterDiscoverBrowseItems(results, options);
    return {
        results: dedupeDiscoverResults(filtered),
        totalPages: Math.max(1, Number(res?.totalPages) || 1),
    };
}

type HomeRowFetchOptions = {
    minItems?: number;
    maxPages?: number;
    maxItems?: number;
    needsBackfill?: boolean;
    hideRequested?: boolean;
    trustAttachedAvailability?: boolean;
    pageConcurrency?: number;
    requirePoster?: boolean;
    signal?: AbortSignal;
};

const itemHasPoster = (item: any) => !!(
    item?.posterPath
    || item?.posterUrl
    || item?.poster
);

const applyHomeRowQualityFilters = (items: any[], options: HomeRowFetchOptions) => {
    let next = Array.isArray(items) ? items : [];
    if (options.requirePoster) next = next.filter(itemHasPoster);
    return next;
};

/**
 * Home rail: one endpoint, sequential same-URL pages.
 * When hide-available is on, advance page 1→2… until minItems or maxPages — never alternate sorts.
 */
export async function fetchDiscoverHomeRowResults(
    buildUrl: (page: number) => string,
    hideAvailable: boolean,
    options: HomeRowFetchOptions = {},
): Promise<any[]> {
    const maxItems = options.maxItems ?? 30;
    const maxPages = options.maxPages ?? (hideAvailable ? 4 : 2);
    const minItems = Math.min(options.minItems ?? Math.min(30, maxItems), maxItems);
    const hideRequested = options.hideRequested === true;
    const signal = options.signal;
    const filterOptions: DiscoverBrowseFilterOptions = {
        hideAvailable,
        hideRequested,
        trustAttachedAvailability: options.trustAttachedAvailability !== false,
    };

    const fetchPage = (page: number) => (
        apiFetch(buildUrl(page), signal ? { signal } : {}).catch((err: any) => {
            if (signal?.aborted || err?.name === 'AbortError') return null;
            return null;
        })
    );

    let merged: any[] = [];
    let totalPages = Number.POSITIVE_INFINITY;

    for (let page = 1; page <= maxPages; page += 1) {
        if (signal?.aborted) break;
        const res = await fetchPage(page);
        if (!res) break;
        totalPages = Math.max(1, Number(res?.totalPages) || 1);
        const rawBatch = Array.isArray(res?.results) ? res.results : [];
        const batch = filterDiscoverBrowseItems(rawBatch, filterOptions);
        merged = dedupeDiscoverResults([
            ...merged,
            ...applyHomeRowQualityFilters(batch, options),
        ]);
        if (merged.length >= minItems || merged.length >= maxItems) break;
        if (page >= totalPages) break;
    }

    return merged.slice(0, maxItems);
}

/**
 * Browse step: fetch page N, filter hide-available, and if the filtered
 * page is empty advance sequentially up to MAX_SEQUENTIAL_EXTRA_PAGES (same endpoint).
 */
export async function fetchDiscoverPageWithAdvance(
    buildUrl: (page: number) => string,
    page: number,
    options: DiscoverBrowseFilterOptions = {},
): Promise<DiscoverPagePayload & { lastFetchedPage: number }> {
    const needsAdvance = !!options.hideAvailable || !!options.hideRequested || !!options.animeOnly
        || options.mode === 'discover' || options.mode === 'request';
    if (!needsAdvance) {
        const payload = await fetchDiscoverPage(buildUrl(page), options);
        return { ...payload, lastFetchedPage: page };
    }

    let merged: any[] = [];
    let totalPages = 1;
    let lastFetchedPage = page;
    const endPage = page + MAX_SEQUENTIAL_EXTRA_PAGES;

    for (let current = page; current <= endPage; current += 1) {
        const payload = await fetchDiscoverPage(buildUrl(current), options).catch(() => null);
        if (!payload) {
            lastFetchedPage = current;
            break;
        }
        totalPages = Math.max(1, Number(payload.totalPages) || 1);
        lastFetchedPage = current;
        merged = dedupeDiscoverResults([...merged, ...(payload.results || [])]);
        if (merged.length > 0 || current >= totalPages) {
            return { results: merged, totalPages, lastFetchedPage };
        }
    }

    return { results: merged, totalPages, lastFetchedPage };
}

/** @deprecated Use fetchDiscoverPageWithAdvance — kept as alias for any stray imports. */
export const fetchDiscoverPageWithBackfill = fetchDiscoverPageWithAdvance;
