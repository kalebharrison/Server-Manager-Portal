import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Search, Sparkles } from 'lucide-react';
import { apiFetch } from '../shared/api';
import { pushToast, ToastContainer, type ToastMessage } from '../shared/toast';
import { AdminRequestQueue } from './AdminRequestQueue';
import { RequestMediaCard } from './RequestMediaCard';
import { RequestMediaModal } from './RequestMediaModal';
import type { RequestAppStatus, RequestListResponse, RequestMediaItem } from './types';

type RequestTab = 'trending' | 'movies' | 'tv' | 'search' | 'queue';

const tabs = [
    { id: 'trending' as const, label: 'Trending' },
    { id: 'movies' as const, label: 'Movies' },
    { id: 'tv' as const, label: 'TV' },
    { id: 'search' as const, label: 'Search' },
];

const cardSkeletons = Array.from({ length: 12 }, (_, index) => index);

export const RequestDashboard: React.FC<{ isAdmin: boolean }> = ({ isAdmin }) => {
    const [toasts, setToasts] = useState<ToastMessage[]>([]);
    const [status, setStatus] = useState<RequestAppStatus | null>(null);
    const [activeTab, setActiveTab] = useState<RequestTab>('trending');
    const [query, setQuery] = useState('');
    const [debouncedQuery, setDebouncedQuery] = useState('');
    const [items, setItems] = useState<RequestMediaItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedItem, setSelectedItem] = useState<RequestMediaItem | null>(null);
    const [requestingId, setRequestingId] = useState<number | null>(null);

    const addToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
        setToasts((prev) => pushToast(prev, message, type));
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

    const endpoint = useMemo(() => {
        if (activeTab === 'queue') return '';
        if (activeTab === 'search') {
            if (debouncedQuery.length < 2) return '';
            return `/api/request-app/search?query=${encodeURIComponent(debouncedQuery)}`;
        }
        return `/api/request-app/discover?category=${encodeURIComponent(activeTab)}`;
    }, [activeTab, debouncedQuery]);

    const loadItems = useCallback(async (silent = false) => {
        if (!endpoint || status?.ready === false) {
            setItems([]);
            setLoading(false);
            return;
        }
        if (silent) setRefreshing(true);
        else setLoading(true);
        setError(null);
        try {
            const ttl = activeTab === 'search' ? 15_000 : 60_000;
            const data: RequestListResponse = await apiFetch(endpoint, { cacheTtlMs: ttl });
            setItems(Array.isArray(data?.results) ? data.results : []);
        } catch (err: any) {
            setError(err?.message || 'Failed to load request content');
            if (!silent) setItems([]);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [activeTab, endpoint, status?.ready]);

    useEffect(() => {
        if (!status) return;
        if (activeTab === 'queue') {
            setLoading(false);
            return;
        }
        loadItems(false);
    }, [activeTab, loadItems, status]);

    const markRequested = (target: RequestMediaItem) => {
        setItems((prev) => prev.map((item) => (
            item.tmdbId === target.tmdbId && item.mediaType === target.mediaType
                ? { ...item, pending: true, canRequest: false, requestStatusLabel: 'pending' }
                : item
        )));
    };

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
    const showSearchHint = activeTab === 'search' && debouncedQuery.length < 2;
    const showSkeleton = loading && items.length === 0 && !showSearchHint && activeTab !== 'queue';

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
                            Browse and request movies or shows through {status?.type === 'jellyseerr' ? 'Jellyseerr' : 'Seerr'} without leaving the portal.
                        </p>
                    </div>
                    <div className="relative w-full lg:w-[28rem]">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
                        <input
                            value={query}
                            onChange={(event) => { setQuery(event.target.value); setActiveTab('search'); }}
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
                    <div className="flex flex-wrap gap-2">
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => setActiveTab(tab.id)}
                                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === tab.id ? 'bg-plex text-background shadow-lg shadow-plex/20' : 'bg-card border border-border text-muted hover:text-text hover:bg-white/5'}`}
                            >
                                {tab.label}
                            </button>
                        ))}
                        {isAdmin && (
                            <button
                                type="button"
                                onClick={() => setActiveTab('queue')}
                                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'queue' ? 'bg-plex text-background shadow-lg shadow-plex/20' : 'bg-card border border-border text-muted hover:text-text hover:bg-white/5'}`}
                            >
                                Queue
                            </button>
                        )}
                    </div>

                    {activeTab === 'queue' ? (
                        <AdminRequestQueue />
                    ) : (
                        <section className="glass-card p-4 md:p-5 shadow-xl">
                            <div className="flex items-center justify-between gap-3 mb-4">
                                <div>
                                    <h2 className="text-xl font-black text-plex">
                                        {activeTab === 'search' ? 'Search Results' : tabs.find((tab) => tab.id === activeTab)?.label}
                                    </h2>
                                    <p className="text-xs text-muted mt-1">
                                        {refreshing ? 'Refreshing...' : `${items.length} title${items.length === 1 ? '' : 's'}`}
                                    </p>
                                </div>
                                {endpoint && (
                                    <button
                                        type="button"
                                        onClick={() => loadItems(true)}
                                        className="text-xs font-semibold text-muted hover:text-text"
                                    >
                                        Refresh
                                    </button>
                                )}
                            </div>

                            {error ? (
                                <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>
                            ) : showSearchHint ? (
                                <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted">Type at least two characters to search.</div>
                            ) : showSkeleton ? (
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 md:gap-4">
                                    {cardSkeletons.map((index) => (
                                        <div key={index} className="aspect-[2/3] rounded-xl bg-white/5 animate-pulse" />
                                    ))}
                                </div>
                            ) : items.length ? (
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 md:gap-4">
                                    {items.map((item) => (
                                        <RequestMediaCard
                                            key={`${item.mediaType}-${item.tmdbId}`}
                                            item={item}
                                            busy={requestingId === item.tmdbId}
                                            onOpen={setSelectedItem}
                                            onRequest={(nextItem) => {
                                                if (nextItem.canRequest === false) return;
                                                setSelectedItem(nextItem);
                                            }}
                                        />
                                    ))}
                                </div>
                            ) : (
                                <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted">No titles found.</div>
                            )}
                        </section>
                    )}
                </>
            )}

            {selectedItem && (
                <RequestMediaModal
                    item={selectedItem}
                    saving={requestingId === selectedItem.tmdbId}
                    onClose={() => setSelectedItem(null)}
                    onSubmit={submitRequest}
                />
            )}
        </div>
    );
};
