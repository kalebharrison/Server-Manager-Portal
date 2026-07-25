import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../shared/api';
import { cacheRefreshMs } from '../shared/cacheRefresh';
import { pushToast, type ToastMessage } from '../shared/toast';
import { loadLocalPortalPreferences, saveLocalPortalPreferences } from '../shared/userPreferences';
import {
    browseCategories,
    genreFilters,
    mediaFilters,
    type BrowseCategory,
    type MediaFilter,
    type RequestView,
} from './requestDashboardConstants';
import type { RequestAppStatus, RequestMediaItem } from './types';
import { useRequestDashboardCatalog } from './useRequestDashboardCatalog';

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
    const [selectedItem, setSelectedItem] = useState<RequestMediaItem | null>(null);
    const [openIssueOnSelect, setOpenIssueOnSelect] = useState(false);
    const [requestingId, setRequestingId] = useState<number | null>(null);

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
        if (activeView === 'queue' || activeView === 'ask') return '';
        if (activeView === 'search') {
            if (debouncedQuery.length < 2) return '';
            return `/api/request-app/search?query=${encodeURIComponent(debouncedQuery)}&type=${encodeURIComponent(mediaFilter)}&anime=${animeOnly}&foreign=${foreignOnly}&genreId=${genreId || ''}`;
        }
        return `/api/request-app/discover?category=${encodeURIComponent(browseCategory)}&type=${encodeURIComponent(mediaFilter)}&anime=${animeOnly}&foreign=${foreignOnly}&genreId=${genreId || ''}`;
    }, [activeView, animeOnly, browseCategory, debouncedQuery, foreignOnly, genreId, mediaFilter]);

    const {
        items,
        loading,
        refreshing,
        loadingMore,
        error,
        loadMoreRef,
        loadItems,
        hasMore,
        markRequested,
    } = useRequestDashboardCatalog({
        refreshMs,
        status,
        activeView,
        endpointBase,
        debouncedQuery,
        mediaFilter,
        includeExisting,
    });

    const openDetails = useCallback((item: RequestMediaItem) => {
        setOpenIssueOnSelect(false);
        if (!item.tmdbId && item.plexUrl) window.open(item.plexUrl, '_blank', 'noopener,noreferrer');
        else setSelectedItem(item);
    }, []);

    const openIssue = useCallback((item: RequestMediaItem) => {
        setOpenIssueOnSelect(true);
        setSelectedItem(item);
    }, []);

    const submitRequest = useCallback(async (item: RequestMediaItem, seasons: number[] | 'all' = []) => {
        if (item.canRequest === false) return;
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
            addToast(
                item.mediaType === 'tv' && seasons === 'all'
                    ? `Requested "${item.title}" (all seasons)`
                    : `Requested "${item.title}"`,
            );
        } catch (err: any) {
            addToast(err?.message || 'Failed to submit request', 'error');
        } finally {
            setRequestingId(null);
        }
    }, [addToast, markRequested]);

    /** Card Request button: submit immediately. Poster/title still opens details for season picking. */
    const requestFromCard = useCallback((item: RequestMediaItem) => {
        if (item.canRequest === false) return;
        void submitRequest(item, item.mediaType === 'tv' ? 'all' : []);
    }, [submitRequest]);

    const statusLoading = status === null;
    const ready = status?.ready === true;
    const showSearchHint = activeView === 'search' && debouncedQuery.length < 2;
    const showSkeleton = loading && items.length === 0 && !showSearchHint && activeView !== 'queue' && activeView !== 'ask';
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
        requestFromCard,
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
