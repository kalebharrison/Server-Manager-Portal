import { useCallback, useEffect, useRef, useState } from 'react';

import { apiFetch } from '../shared/api';
import { useVisibleInterval } from '../shared/useVisibleInterval';
import { isExistingOrInProgress } from './requestDashboardConstants';
import type { RequestAppStatus, RequestListResponse, RequestMediaItem } from './types';

type UseRequestDashboardCatalogOptions = {
    refreshMs: number;
    status: RequestAppStatus | null;
    activeView: string;
    endpointBase: string;
    debouncedQuery: string;
    mediaFilter: string;
    includeExisting: boolean;
};

export const useRequestDashboardCatalog = ({
    refreshMs,
    status,
    activeView,
    endpointBase,
    debouncedQuery,
    mediaFilter,
    includeExisting,
}: UseRequestDashboardCatalogOptions) => {
    const [items, setItems] = useState<RequestMediaItem[]>([]);
    const [pageInfo, setPageInfo] = useState<RequestListResponse['pageInfo']>();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);
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
            const requestUrl = `${endpointBase}${separator}page=${page}`;
            let data: RequestListResponse;
            if (activeView === 'search' && page === 1) {
                const [requestPage, plex] = await Promise.all([
                    fetchRequestPage(requestUrl, ttl),
                    apiFetch(`/api/plex/search?query=${encodeURIComponent(debouncedQuery)}&limit=20`, {
                        cacheTtlMs: 30_000,
                        staleIfErrorMs: 120_000,
                    }).catch(() => ({ results: [] })),
                ]);
                data = requestPage;
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
            } else {
                data = await fetchRequestPage(requestUrl, ttl);
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

    const markRequested = useCallback((target: RequestMediaItem) => {
        setItems((prev) => prev.map((item) => (
            item.tmdbId === target.tmdbId && item.mediaType === target.mediaType
                ? { ...item, requested: true, pending: false, canRequest: false, requestStatusLabel: 'requested' }
                : item
        )));
    }, []);

    const markNotifyState = useCallback((target: RequestMediaItem, notifying: boolean) => {
        setItems((prev) => prev.map((item) => (
            item.tmdbId === target.tmdbId && item.mediaType === target.mediaType
                ? { ...item, notifying, canNotify: !notifying }
                : item
        )));
    }, []);

    return {
        items,
        loading,
        refreshing,
        loadingMore,
        error,
        loadMoreRef,
        loadItems,
        hasMore,
        markRequested,
        markNotifyState,
    };
};
