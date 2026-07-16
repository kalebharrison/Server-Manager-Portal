import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Search, Sparkles } from 'lucide-react';
import { apiFetch } from '../shared/api';
import { cacheRefreshMs } from '../shared/cacheRefresh';
import { useVisibleInterval } from '../shared/useVisibleInterval';
import { pushToast, ToastContainer, type ToastMessage } from '../shared/toast';
import { loadLocalPortalPreferences, saveLocalPortalPreferences } from '../shared/userPreferences';
import { AdminRequestQueue } from './AdminRequestQueue';
import { RequestMediaCard } from './RequestMediaCard';
import { RequestMediaModal } from './RequestMediaModal';
import type { RequestAppStatus, RequestListResponse, RequestMediaItem } from './types';

type RequestView = 'browse' | 'search' | 'queue';
type BrowseCategory = 'trending' | 'popular' | 'upcoming';
type MediaFilter = 'all' | 'movie' | 'tv';

const browseCategories = [
    { id: 'trending' as const, label: 'Trending' },
    { id: 'popular' as const, label: 'Popular' },
    { id: 'upcoming' as const, label: 'Upcoming' },
];

const mediaFilters = [
    { id: 'all' as const, label: 'All' },
    { id: 'movie' as const, label: 'Movies' },
    { id: 'tv' as const, label: 'TV' },
];

const genreFilters = [
    { id: 28, label: 'Action' }, { id: 12, label: 'Adventure' }, { id: 16, label: 'Animation' },
    { id: 35, label: 'Comedy' }, { id: 80, label: 'Crime' }, { id: 18, label: 'Drama' },
    { id: 10751, label: 'Family' }, { id: 14, label: 'Fantasy' }, { id: 27, label: 'Horror' },
    { id: 9648, label: 'Mystery' }, { id: 10749, label: 'Romance' }, { id: 878, label: 'Science Fiction' },
    { id: 53, label: 'Thriller' }, { id: 10759, label: 'Action & Adventure' }, { id: 10765, label: 'Sci-Fi & Fantasy' },
];

const cardSkeletons = Array.from({ length: 12 }, (_, index) => index);

const isExistingOrInProgress = (item: RequestMediaItem) => (
    !!(item.available || item.processing || item.requested || item.pending || item.approved)
);

export const RequestDashboard: React.FC<{ isAdmin: boolean; cacheMinutes?: number }> = ({ isAdmin, cacheMinutes }) => {
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

    return (
        <div className="w-full animate-fade-in space-y-6">
            <ToastContainer toasts={toasts} setToasts={setToasts} />

            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-card shadow-2xl p-5 md:p-7">
                <div className="absolute inset-0 bg-gradient-to-br from-plex/15 via-transparent to-transparent opacity-70" aria-hidden />
                <div className="relative z-10 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5">
                    <div>
                        <div className="flex items-center gap-2 text-plex mb-2">
                            <Sparkles className="w-5 h-5" />
                            <span className="text-xs font-black uppercase tracking-[0.25em]">Requests</span>
                        </div>
                        <h1 className="text-3xl md:text-5xl font-black text-text tracking-tight">Request Content</h1>
                        <p className="text-sm text-muted mt-2 max-w-2xl">
                            Browse and request movies or shows without leaving the portal.
                        </p>
                    </div>
                    <div className="relative w-full lg:w-[28rem]">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
                        <input
                            value={query}
                            onChange={(event) => { setQuery(event.target.value); setActiveView('search'); }}
                            placeholder="Search movies and shows"
                            className="w-full h-12 pl-12 pr-4 rounded-xl border border-border bg-background/80 text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all"
                        />
                    </div>
                </div>
            </div>

            {statusLoading ? (
                <div className="glass-card p-5 shadow-xl">
                    <div className="h-5 w-48 bg-white/10 rounded animate-pulse mb-3" />
                    <div className="h-4 w-full max-w-xl bg-white/5 rounded animate-pulse" />
                </div>
            ) : !ready ? (
                <div className="glass-card p-5 border-yellow-500/30">
                    <div className="flex gap-3">
                        <AlertTriangle className="w-5 h-5 text-yellow-300 shrink-0 mt-0.5" />
                        <div>
                            <h2 className="font-bold text-text">Request app is not ready</h2>
                            <p className="text-sm text-muted mt-1">{status?.error || 'Configure Seerr or Jellyseerr in Settings > Integrations.'}</p>
                        </div>
                    </div>
                </div>
            ) : (
                <>
                    <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-card/60 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted mr-1">Category</span>
                            {browseCategories.map((category) => (
                                <button
                                    key={category.id}
                                    type="button"
                                    onClick={() => { setActiveView('browse'); setBrowseCategory(category.id); }}
                                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeView === 'browse' && browseCategory === category.id ? 'bg-plex text-background shadow-lg shadow-plex/20' : 'bg-background/60 border border-border text-muted hover:text-text hover:bg-white/5'}`}
                                >
                                    {category.label}
                                </button>
                            ))}
                            <label className="inline-flex items-center gap-2 ml-0 sm:ml-2">
                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted">Genre</span>
                                <select
                                    value={genreId || ''}
                                    onChange={(event) => setGenreId(event.target.value ? Number(event.target.value) : null)}
                                    className="h-9 rounded-lg border border-border bg-background/60 px-3 text-sm font-bold text-text outline-none focus:border-plex"
                                >
                                    <option value="">All genres</option>
                                    {genreFilters.map((genre) => <option key={genre.id} value={genre.id}>{genre.label}</option>)}
                                </select>
                            </label>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted mr-1">Type</span>
                            {mediaFilters.map((filter) => (
                                <button
                                    key={filter.id}
                                    type="button"
                                    onClick={() => { setActiveView(activeView === 'queue' ? 'browse' : activeView); setMediaFilter(filter.id); saveRequestDefault({ requestMediaType: filter.id }); }}
                                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${mediaFilter === filter.id ? 'bg-plex text-background shadow-lg shadow-plex/20' : 'bg-background/60 border border-border text-muted hover:text-text hover:bg-white/5'}`}
                                >
                                    {filter.label}
                                </button>
                            ))}
                            <button
                                type="button"
                                onClick={() => { setActiveView(activeView === 'queue' ? 'browse' : activeView); setAnimeOnly((value) => !value); }}
                                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${animeOnly ? 'bg-fuchsia-400 text-background shadow-lg shadow-fuchsia-400/20' : 'bg-background/60 border border-border text-muted hover:text-text hover:bg-white/5'}`}
                                title="Show only Japanese animation. Combine with Movies, TV, or a genre."
                            >
                                Anime
                            </button>
                            <button
                                type="button"
                                onClick={() => { setActiveView(activeView === 'queue' ? 'browse' : activeView); setForeignOnly((value) => !value); }}
                                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${foreignOnly ? 'bg-violet-400 text-background shadow-lg shadow-violet-400/20' : 'bg-background/60 border border-border text-muted hover:text-text hover:bg-white/5'}`}
                                title="Show only non-English, non-anime titles. Combine with Movies, TV, or a genre."
                            >
                                Foreign
                            </button>
                            <button
                                type="button"
                                onClick={() => setIncludeExisting((value) => { const next = !value; saveRequestDefault({ requestIncludeExisting: next }); return next; })}
                                className={`ml-0 sm:ml-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${includeExisting ? 'bg-amber-400 text-background shadow-lg shadow-amber-400/20' : 'bg-background/60 border border-border text-muted hover:text-text hover:bg-white/5'}`}
                                title="Existing and in-progress titles are shown by default."
                            >
                                {includeExisting ? 'Hide Existing' : 'Show Existing'}
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveView('search')}
                                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeView === 'search' ? 'bg-plex text-background shadow-lg shadow-plex/20' : 'bg-background/60 border border-border text-muted hover:text-text hover:bg-white/5'}`}
                            >
                                Search
                            </button>
                            {isAdmin && (
                                <button
                                    type="button"
                                    onClick={() => setActiveView('queue')}
                                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeView === 'queue' ? 'bg-plex text-background shadow-lg shadow-plex/20' : 'bg-background/60 border border-border text-muted hover:text-text hover:bg-white/5'}`}
                                >
                                    Queue
                                </button>
                            )}
                        </div>
                    </div>

                    {activeView === 'queue' ? (
                        <AdminRequestQueue />
                    ) : (
                        <section className="glass-card p-4 md:p-5 shadow-xl">
                            <div className="flex items-center justify-between gap-3 mb-4">
                                <div>
                                    <h2 className="text-xl font-black text-plex">
                                        {detailedContentTitle}
                                    </h2>
                                    <p className="text-xs text-muted mt-1">
                                        {refreshing
                                            ? 'Refreshing...'
                                            : `${items.length} title${items.length === 1 ? '' : 's'}${includeExisting ? ' · includes existing content' : ''}`}
                                    </p>
                                </div>
                                {endpointBase && (
                                    <button
                                        type="button"
                                        onClick={() => loadItems({ silent: true })}
                                        className="text-xs font-semibold text-muted hover:text-text"
                                    >
                                        Refresh
                                    </button>
                                )}
                            </div>

                            {error && (
                                <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
                                    <span>{items.length ? `${error}. Showing the most recent results.` : error}</span>
                                    <button type="button" onClick={() => loadItems()} className="shrink-0 rounded-md border border-red-300/30 px-3 py-1.5 font-bold hover:bg-red-500/10">Retry</button>
                                </div>
                            )}

                            {showSearchHint ? (
                                <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted">Type at least two characters to search.</div>
                            ) : showSkeleton ? (
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 md:gap-4">
                                    {cardSkeletons.map((index) => (
                                        <div key={index} className="aspect-[2/3] rounded-xl bg-white/5 animate-pulse" />
                                    ))}
                                </div>
                            ) : items.length ? (
                                <>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 md:gap-4">
                                        {items.map((item, index) => (
                                            <RequestMediaCard
                                                key={`${item.mediaType}-${item.tmdbId}`}
                                                item={item}
                                                busy={requestingId === item.tmdbId}
                                                priority={index < 4}
                                                onOpen={openDetails}
                                                onRequest={openRequest}
                                                onReportIssue={openIssue}
                                            />
                                        ))}
                                    </div>
                                    {(hasMore || loadingMore) && <div ref={loadMoreRef} className="py-6 text-center text-xs font-semibold text-muted">{loadingMore ? 'Loading more titles...' : 'More titles load as you scroll'}</div>}
                                </>
                            ) : !error ? (
                                <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted">No titles found.</div>
                            ) : null}
                        </section>
                    )}
                </>
            )}

            {selectedItem && (
                <RequestMediaModal
                    item={selectedItem}
                    saving={requestingId === selectedItem.tmdbId}
                    onClose={() => { setSelectedItem(null); setOpenIssueOnSelect(false); }}
                    onSubmit={submitRequest}
                    initialIssueForm={openIssueOnSelect}
                />
            )}
        </div>
    );
};
