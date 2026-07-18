import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../shared/api';
import { cacheRefreshMs } from '../shared/cacheRefresh';
import { useVisibleInterval } from '../shared/useVisibleInterval';
import { pushToast, type ToastMessage } from '../shared/toast';
import { loadLocalPortalPreferences, saveLocalPortalPreferences } from '../shared/userPreferences';
import {
    browseCategories,
    genreFilters,
    isExistingOrInProgress,
    mediaFilters,
    type BrowseCategory,
    type MediaFilter,
    type RequestView,
} from './requestDashboardConstants';
import type { RequestAppStatus, RequestListResponse, RequestMediaItem } from './types';

export const useRequestDashboard = (cacheMinutes?: number) => {
    const refreshMs = cacheRefreshMs({ cacheRefreshMinutes: cacheMinutes });
    const initialPreferences = useMemo(loadLocalPortalPreferences, []);
    const [toasts, setToasts] = useState<ToastMessage[]>([]);
    const [status, setStatus] = useState<RequestAppStatus | null>(null);
    const [activeView, setActiveView] = useState<RequestView>('browse');
    const [browseCategory, setBrowseCategory] = useState<BrowseCategory>('trending');
    const [mediaFilter, setMediaFilter] = useState<MediaFilter>(initialPreferences.requestMediaType);
    const [animeOnly, setAnimeOnly] = useState(false);
    const [foreignOnly, setForeignOnly] = useState(false);
    const [genreId, setGenreId] = useState<number | null>(null);
    const [includeExisting, setIncludeExisting] = useState(initialPreferences.requestIncludeExisting);
    const [query, setQuery] = useState('');
    const [debouncedQuery, setDebouncedQuery] = useState('');
    const [items, setItems] = useState<RequestMediaItem[]>([]);
    const [pageInfo, setPageInfo] = useState<RequestListResponse['pageInfo']>();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedItem, setSelectedItem] = useState<RequestMediaItem | null>(null);
    const [openIssueOnSelect, setOpenIssueOnSelect] = useState(false);
    const [requestingId, setRequestingId] = useState<number | null>(null);
    const loadSequence = useRef(0);
    const loadMoreRef = useRef<HTMLDivElement | null>(null);

    const fetchRequestPage = useCallback(async (url: string, cacheTtlMs: number) => {
        let lastError: unknown;
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                return await apiFetch(url, {
                    cacheTtlMs,
                    staleIfErrorMs: activeView === 'search' ? 120_000 : 10 * 60_000,
                    forceRefresh: attempt > 0,
                }) as RequestListResponse;
            } catch (requestError) {
                lastError = requestError;
                if (attempt === 0) await new Promise((resolve) => window.setTimeout(resolve, 350));
            }
        }
        throw lastError;
    }, [activeView]);

    const addToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
        setToasts((prev) => pushToast(prev, message, type));
    }, []);
    const saveRequestDefault = useCallback((values: Partial<ReturnType<typeof loadLocalPortalPreferences>>) => {
        saveLocalPortalPreferences({ ...loadLocalPortalPreferences(), ...values });
    }, []);

    useEffect(() => {
        const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
        return () => window.clearTimeout(timer);
    }, [query]);

    useEffect(() => {
        let cancelled = false;
        apiFetch('/api/request-app/status', { cacheTtlMs: 10_000 })
            .then((data) => {
                if (!cancelled) setStatus(data);
            })
            .catch((err: any) => {
                if (!cancelled) setStatus({ configured: false, supported: false, ready: false, error: err?.message || 'Request app unavailable' });
            });
        return () => { cancelled = true; };
    }, []);

    const endpointBase = useMemo(() => {
        if (activeView === 'queue') return '';
        if (activeView === 'search') {
            if (debouncedQuery.length < 2) return '';
            return `/api/request-app/search?query=${encodeURIComponent(debouncedQuery)}&type=${encodeURIComponent(mediaFilter)}&anime=${animeOnly}&foreign=${foreignOnly}&genreId=${genreId || ''}`;
        }
        return `/api/request-app/discover?category=${encodeURIComponent(browseCategory)}&type=${encodeURIComponent(mediaFilter)}&anime=${animeOnly}&foreign=${foreignOnly}&genreId=${genreId || ''}`;
    }, [activeView, animeOnly, browseCategory, debouncedQuery, foreignOnly, genreId, mediaFilter]);

    const loadItems = useCallback(async ({ page = 1, append = false, silent = false } = {}) => {
        if (!endpointBase || status?.ready === false) {
            setItems([]);
            setPageInfo(undefined);
            setLoading(false);
            return;
        }
        const sequence = ++loadSequence.current;
        if (append) setLoadingMore(true);
        else if (silent) setRefreshing(true);
        else setLoading(true);
        setError(null);
        try {
            const ttl = activeView === 'search' ? 15_000 : refreshMs;
            const separator = endpointBase.includes('?') ? '&' : '?';
            let data = await fetchRequestPage(`${endpointBase}${separator}page=${page}`, ttl);
            if (activeView === 'search' && page === 1) {
                const plex = await apiFetch(`/api/plex/search?query=${encodeURIComponent(debouncedQuery)}`, { cacheTtlMs: 30_000, staleIfErrorMs: 120_000 }).catch(() => ({ results: [] }));
                const plexResults = Array.isArray(plex?.results) ? plex.results as RequestMediaItem[] : [];
                const requestResults = Array.isArray(data?.results) ? data.results : [];
                const remainingPlex = [...plexResults];
                const merged = requestResults.map((item) => {
                    const index = remainingPlex.findIndex((plexItem) => (
                        (item.tmdbId && plexItem.tmdbId === item.tmdbId)
                        || (plexItem.title.toLowerCase() === item.title.toLowerCase() && (!plexItem.year || !item.year || plexItem.year === item.year))
                    ));
                    if (index < 0) return item;
                    const [plexItem] = remainingPlex.splice(index, 1);
                    return { ...item, ratingKey: plexItem.ratingKey, plexUrl: plexItem.plexUrl, available: true, canRequest: false };
                });
                data = { ...data, results: [...merged, ...remainingPlex] };
            }
            if (sequence !== loadSequence.current) return;
            const includeBlocked = includeExisting;
            const nextItems = Array.isArray(data?.results)
                ? data.results
                    .filter((item) => mediaFilter === 'all' || item.mediaType === mediaFilter)
                    .filter((item) => includeBlocked || !isExistingOrInProgress(item))
                : [];
            setItems((previous) => append ? [...previous, ...nextItems.filter((item) => !previous.some((existing) => existing.tmdbId === item.tmdbId && existing.mediaType === item.mediaType))] : nextItems);
            setPageInfo(data?.pageInfo);
        } catch (err: any) {
            if (sequence !== loadSequence.current) return;
            setError(err?.message || 'Failed to load request content');
        } finally {
            if (sequence === loadSequence.current) {
                setLoading(false);
                setRefreshing(false);
                setLoadingMore(false);
            }
        }
    }, [activeView, debouncedQuery, endpointBase, fetchRequestPage, includeExisting, mediaFilter, refreshMs, status?.ready]);

    useEffect(() => {
        if (!status) return;
        if (activeView === 'queue') {
            setLoading(false);
            return;
        }
        setItems([]);
        setPageInfo(undefined);
        loadItems();
    }, [activeView, loadItems, status]);
    useVisibleInterval(
        () => loadItems({ silent: true }),
        activeView === 'browse' && status?.ready ? refreshMs : null,
    );

    const hasMore = !!pageInfo && (pageInfo.hasNextPage === true || Number(pageInfo.pages) > Number(pageInfo.page || 1));
    const loadMore = useCallback(() => {
        if (!hasMore || loadingMore || loading) return;
        loadItems({ page: Number(pageInfo?.page || 1) + 1, append: true });
    }, [hasMore, loadItems, loading, loadingMore, pageInfo?.page]);

    useEffect(() => {
        const target = loadMoreRef.current;
        if (!target || !hasMore) return;
        const observer = new IntersectionObserver((entries) => {
            if (entries[0]?.isIntersecting) loadMore();
        }, { rootMargin: '600px 0px' });
        observer.observe(target);
        return () => observer.disconnect();
    }, [hasMore, loadMore]);

    const markRequested = (target: RequestMediaItem) => {
        setItems((prev) => prev.map((item) => (
            item.tmdbId === target.tmdbId && item.mediaType === target.mediaType
                ? { ...item, requested: true, pending: false, canRequest: false, requestStatusLabel: 'requested' }
                : item
        )));
    };

    const openRequest = useCallback((item: RequestMediaItem) => {
        if (item.canRequest !== false) setSelectedItem(item);
    }, []);

    const openDetails = useCallback((item: RequestMediaItem) => {
        setOpenIssueOnSelect(false);
        if (!item.tmdbId && item.plexUrl) window.open(item.plexUrl, '_blank', 'noopener,noreferrer');
        else setSelectedItem(item);
    }, []);

    const openIssue = useCallback((item: RequestMediaItem) => {
        setOpenIssueOnSelect(true);
        setSelectedItem(item);
    }, []);

    const submitRequest = async (item: RequestMediaItem, seasons: number[]) => {
        setRequestingId(item.tmdbId);
        try {
            await apiFetch(`/api/request-app/media/${item.mediaType}/${item.tmdbId}/request`, {
                method: 'POST',
                body: JSON.stringify({
                    title: item.title,
                    seasons,
                }),
            });
            markRequested(item);
            setSelectedItem(null);
            addToast(`Requested "${item.title}"`);
        } catch (err: any) {
            addToast(err?.message || 'Failed to submit request', 'error');
        } finally {
            setRequestingId(null);
        }
    };

    const statusLoading = status === null;
    const ready = status?.ready === true;
    const showSearchHint = activeView === 'search' && debouncedQuery.length < 2;
    const showSkeleton = loading && items.length === 0 && !showSearchHint && activeView !== 'queue';
    const activeCategoryLabel = browseCategories.find((entry) => entry.id === browseCategory)?.label || 'Trending';
    const activeMediaLabel = animeOnly ? 'Anime' : mediaFilters.find((entry) => entry.id === mediaFilter)?.label || 'All';
    const activeGenreLabel = genreFilters.find((entry) => entry.id === genreId)?.label || '';
    const contentTitle = activeView === 'search'
        ? 'Search Results'
        : animeOnly
            ? `${activeCategoryLabel} ${activeMediaLabel}`
        : foreignOnly
            ? `${activeCategoryLabel} Foreign`
        : mediaFilter === 'all'
            ? activeCategoryLabel
            : `${activeCategoryLabel} ${activeMediaLabel}`;
    const detailedContentTitle = activeGenreLabel ? `${contentTitle} - ${activeGenreLabel}` : contentTitle;

    return {
        toasts,
        setToasts,
        status,
        statusLoading,
        ready,
        activeView,
        setActiveView,
        browseCategory,
        setBrowseCategory,
        mediaFilter,
        setMediaFilter,
        animeOnly,
        setAnimeOnly,
        foreignOnly,
        setForeignOnly,
        genreId,
        setGenreId,
        includeExisting,
        setIncludeExisting,
        query,
        setQuery,
        items,
        loading,
        refreshing,
        loadingMore,
        error,
        selectedItem,
        setSelectedItem,
        openIssueOnSelect,
        setOpenIssueOnSelect,
        requestingId,
        loadMoreRef,
        loadItems,
        hasMore,
        openRequest,
        openDetails,
        openIssue,
        submitRequest,
        saveRequestDefault,
        endpointBase,
        showSearchHint,
        showSkeleton,
        detailedContentTitle,
    };
};
