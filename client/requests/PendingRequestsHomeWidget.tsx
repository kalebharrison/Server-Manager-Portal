import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, Film, Loader2, Pencil, RefreshCw, Tv } from 'lucide-react';
import { apiFetch } from '../shared/api';
import { RequestApprovalModal } from './RequestApprovalModal';
import type { AdminRequestItem } from './types';

export const PendingRequestsHomeWidget: React.FC<{
    onViewAll?: () => void;
    onReviewRequest?: (requestId: number) => void;
    onActionComplete?: () => void;
    onToast?: (message: string, type: 'success' | 'error') => void;
    layout?: 'compact' | 'wide';
    showEmpty?: boolean;
}> = ({ onViewAll, onReviewRequest, onActionComplete, onToast, layout = 'compact', showEmpty = false }) => {
    const [requests, setRequests] = useState<AdminRequestItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [reviewTarget, setReviewTarget] = useState<AdminRequestItem | null>(null);

    const load = useCallback(async (silent = false) => {
        silent ? setRefreshing(true) : setLoading(true);
        setError(null);
        try {
            const data = await apiFetch(`/api/requests?filter=pending&take=${layout === 'wide' ? 6 : 5}`, { forceRefresh: true, cacheTtlMs: 0 });
            setRequests(Array.isArray(data?.results) ? data.results : []);
        } catch (err: any) {
            setError(err?.message || 'Could not load pending requests');
            setRequests([]);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [layout]);

    useEffect(() => {
        void load();
        const timer = window.setInterval(() => { void load(true); }, 90_000);
        return () => window.clearInterval(timer);
    }, [load]);

    if (loading) {
        return <div className="glass-card p-4 flex items-center gap-2 text-sm text-muted"><Loader2 className="w-4 h-4 animate-spin" /> Checking pending requests...</div>;
    }
    if (error) {
        return <div className="glass-card p-4 text-sm text-red-200">{error}</div>;
    }
    if (requests.length === 0 && !showEmpty) return null;

    return (
        <section className="glass-card p-4 md:p-5 shadow-xl">
            <div className="flex items-center justify-between gap-3 mb-3">
                <div><p className="text-muted text-sm uppercase tracking-widest font-semibold">Pending Requests</p><p className="text-xs text-muted mt-1">{requests.length ? `${requests.length} awaiting approval` : 'No pending requests right now.'}</p></div>
                <div className="flex gap-2">
                    <button type="button" onClick={() => void load(true)} disabled={refreshing} className="p-2 rounded-lg border border-white/10 text-muted hover:text-text"><RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /></button>
                    {onViewAll && <button type="button" onClick={onViewAll} className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-white/10 text-xs font-semibold text-text hover:bg-white/5">Open Requests <ChevronRight className="w-4 h-4" /></button>}
                </div>
            </div>
            <div className={layout === 'wide' ? 'grid grid-cols-1 xl:grid-cols-2 gap-2' : 'space-y-2'}>
                {requests.map((item) => {
                    const TypeIcon = item.mediaType === 'tv' ? Tv : Film;
                    return <div key={item.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-background/40 p-2.5">
                        <div className="w-10 aspect-[2/3] overflow-hidden rounded bg-card shrink-0">{item.posterUrl ? <img src={item.posterUrl} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-muted"><TypeIcon className="w-4 h-4" /></div>}</div>
                        <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-text truncate">{item.title}{item.year ? ` (${item.year})` : ''}</p><p className="text-[11px] text-muted truncate">Requested by {item.requestedBy?.displayName || 'Unknown'}{item.is4k ? ' · 4K' : ''}</p></div>
                        <button type="button" onClick={() => onReviewRequest ? onReviewRequest(item.id) : setReviewTarget(item)} className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-lg border border-plex/50 text-plex hover:bg-plex/15" title="Review"><Pencil className="w-3.5 h-3.5" /></button>
                    </div>;
                })}
            </div>
            {reviewTarget && typeof document !== 'undefined' && createPortal(<RequestApprovalModal request={reviewTarget} onClose={() => setReviewTarget(null)} onComplete={(message) => { onToast?.(message, 'success'); setReviewTarget(null); void load(true); onActionComplete?.(); }} onError={(message) => onToast?.(message, 'error')} />, document.body)}
        </section>
    );
};
