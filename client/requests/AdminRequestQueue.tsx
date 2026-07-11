import React, { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, RefreshCw, RotateCcw, Trash2, X } from 'lucide-react';
import { apiFetch } from '../shared/api';
import { formatDateTime } from '../shared/format';
import type { AdminRequestItem } from './types';

const filters = [
    { id: 'pending', label: 'Pending' },
    { id: 'failed', label: 'Failed' },
    { id: 'approved', label: 'Approved' },
] as const;

export const AdminRequestQueue: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
    const [filter, setFilter] = useState<(typeof filters)[number]['id']>('pending');
    const [items, setItems] = useState<AdminRequestItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [actionId, setActionId] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async (silent = false) => {
        if (silent) setRefreshing(true);
        else setLoading(true);
        setError(null);
        try {
            const data = await apiFetch(`/api/requests?filter=${encodeURIComponent(filter)}&take=${compact ? 8 : 30}`, { forceRefresh: true, cacheTtlMs: 0 });
            setItems(Array.isArray(data?.results) ? data.results : []);
        } catch (err: any) {
            setError(err?.message || 'Failed to load requests');
            setItems([]);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [compact, filter]);

    useEffect(() => {
        load(false);
    }, [load]);

    const runAction = async (item: AdminRequestItem, action: 'approve' | 'decline' | 'retry' | 'delete') => {
        setActionId(item.id);
        try {
            const endpoint = action === 'delete'
                ? `/api/requests/${item.id}`
                : `/api/requests/${item.id}/${action}`;
            await apiFetch(endpoint, {
                method: action === 'delete' ? 'DELETE' : 'POST',
                body: JSON.stringify({ title: item.title }),
            });
            await load(true);
        } finally {
            setActionId(null);
        }
    };

    return (
        <section className="glass-card p-4 md:p-5 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <div>
                    <h2 className="text-xl font-black text-plex">Request Queue</h2>
                    <p className="text-xs text-muted mt-1">Approve, decline, retry, or remove Seerr requests without leaving the portal.</p>
                </div>
                <button
                    type="button"
                    onClick={() => load(true)}
                    disabled={refreshing}
                    className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-border text-sm font-semibold text-muted hover:text-text hover:bg-white/5 transition-colors disabled:opacity-50"
                >
                    <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                    Refresh
                </button>
            </div>

            <div className="flex flex-wrap gap-2 mb-4">
                {filters.map((entry) => (
                    <button
                        key={entry.id}
                        type="button"
                        onClick={() => setFilter(entry.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors ${filter === entry.id ? 'bg-plex text-background' : 'bg-background/50 text-muted hover:text-text hover:bg-white/5'}`}
                    >
                        {entry.label}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="flex items-center gap-2 text-sm text-muted py-8">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading requests...
                </div>
            ) : error ? (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>
            ) : items.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted text-center">No {filter} requests.</div>
            ) : (
                <div className="space-y-3">
                    {items.map((item) => {
                        const busy = actionId === item.id;
                        return (
                            <article key={item.id} className="relative overflow-hidden rounded-xl border border-white/10 bg-background/50 p-3">
                                {item.backdropUrl ? (
                                    <div className="absolute inset-0 opacity-20 bg-cover bg-center" style={{ backgroundImage: `url(${item.backdropUrl})` }} aria-hidden />
                                ) : null}
                                <div className="absolute inset-0 bg-gradient-to-r from-background via-background/90 to-background/40" aria-hidden />
                                <div className="relative z-10 flex gap-3">
                                    {item.posterUrl ? (
                                        <img src={item.posterUrl} alt={item.title} className="w-14 aspect-[2/3] object-cover rounded-lg border border-white/10 shrink-0" loading="lazy" />
                                    ) : null}
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2 mb-1">
                                            <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-white/5 text-muted border border-white/10">
                                                {item.mediaType === 'tv' ? 'TV' : 'Movie'}
                                            </span>
                                            {item.is4k && <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-100 border border-amber-500/30">4K</span>}
                                            <span className="text-[10px] uppercase tracking-wider font-bold text-muted">{item.statusLabel}</span>
                                        </div>
                                        <h3 className="font-bold text-text line-clamp-1">{item.title}{item.year ? ` (${item.year})` : ''}</h3>
                                        <p className="text-xs text-muted mt-1 line-clamp-1">
                                            Requested by {item.requestedBy?.displayName || 'Unknown'} · {formatDateTime(item.createdAt || undefined)}
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap sm:flex-nowrap items-center justify-end gap-1.5 shrink-0">
                                        {filter === 'pending' && (
                                            <>
                                                <button type="button" title="Approve" disabled={busy} onClick={() => runAction(item, 'approve')} className="p-2 rounded-lg text-green-300 hover:bg-green-500/10 disabled:opacity-50">
                                                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                                </button>
                                                <button type="button" title="Decline" disabled={busy} onClick={() => runAction(item, 'decline')} className="p-2 rounded-lg text-red-300 hover:bg-red-500/10 disabled:opacity-50">
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </>
                                        )}
                                        {filter === 'failed' && (
                                            <button type="button" title="Retry" disabled={busy} onClick={() => runAction(item, 'retry')} className="p-2 rounded-lg text-amber-200 hover:bg-amber-500/10 disabled:opacity-50">
                                                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                                            </button>
                                        )}
                                        <button type="button" title="Remove" disabled={busy} onClick={() => runAction(item, 'delete')} className="p-2 rounded-lg text-muted hover:text-red-300 hover:bg-red-500/10 disabled:opacity-50">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </article>
                        );
                    })}
                </div>
            )}
        </section>
    );
};
