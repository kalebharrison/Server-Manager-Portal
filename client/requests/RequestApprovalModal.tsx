import React, { useEffect, useMemo, useState } from 'react';
import { Check, Film, Loader2, Tv, X } from 'lucide-react';
import { apiFetch } from '../shared/api';
import { formatDateTime } from '../shared/format';
import type { AdminRequestItem, RequestSeason } from './types';

type Props = {
    request: AdminRequestItem;
    onClose: () => void;
    onComplete: (message: string) => void;
    onError: (message: string) => void;
    portalEngine?: boolean;
};

const seasonStatusLabel = (status?: number | null) => {
    if (status === 1) return 'Pending';
    if (status === 2) return 'Approved';
    if (status === 3) return 'Declined';
    if (status === 4) return 'Failed';
    return 'Not requested';
};

export const RequestApprovalModal: React.FC<Props> = ({ request, onClose, onComplete, onError, portalEngine = false }) => {
    const [detail, setDetail] = useState<AdminRequestItem>(request);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setDetail(request);
        setLoading(true);
        const base = portalEngine ? '/api/portal-request/admin/requests' : '/api/requests';
        apiFetch(`${base}/${request.id}`, { forceRefresh: true, cacheTtlMs: 0 })
            .then((data) => {
                if (!cancelled && data?.request) setDetail(data.request);
            })
            .catch((error: any) => {
                if (!cancelled) onError(error?.message || 'Could not load request details');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => { cancelled = true; };
    }, [request, onError, portalEngine]);

    const seasons = useMemo(() => (detail.seasons || []) as RequestSeason[], [detail.seasons]);
    const TypeIcon = detail.mediaType === 'tv' ? Tv : Film;

    const approve = async () => {
        setSaving(true);
        try {
            const base = portalEngine ? '/api/portal-request/admin/requests' : '/api/requests';
            await apiFetch(`${base}/${detail.id}/approve`, {
                method: 'POST',
                body: JSON.stringify({ title: detail.title, requestedBy: detail.requestedBy || null }),
            });
            onComplete(`Approved "${detail.title}"`);
            onClose();
        } catch (error: any) {
            onError(error?.message || 'Failed to approve request');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
            <div role="dialog" aria-modal="true" aria-label={`Review ${detail.title}`} className="w-full max-w-3xl max-h-[90vh] overflow-y-auto glass-card p-5 md:p-6 shadow-2xl border border-border custom-scrollbar" onClick={(event) => event.stopPropagation()}>
                <div className="flex items-start justify-between gap-4 mb-5">
                    <div className="min-w-0">
                        <p className="text-muted text-xs uppercase tracking-widest font-semibold">Review & Approve</p>
                        <h3 className="text-xl font-bold text-text truncate">{detail.title}{detail.year ? ` (${detail.year})` : ''}</h3>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                            <span>Status: <span className="text-text font-medium capitalize">{detail.statusLabel}</span></span>
                            <span>Requested by <span className="text-text font-medium">{detail.requestedBy?.displayName || 'Unknown'}</span></span>
                            {detail.createdAt && <span>Created {formatDateTime(detail.createdAt)}</span>}
                            {detail.is4k && <span className="text-amber-100">4K</span>}
                        </div>
                        {(detail.genres?.length || detail.originalLanguage) ? <p className="mt-2 text-xs text-muted">{[...(detail.genres || []).map((genre) => genre.name), detail.originalLanguage].filter(Boolean).join(' · ')}</p> : null}
                    </div>
                    <button type="button" onClick={onClose} disabled={saving} className="p-2 rounded-lg text-muted hover:text-text hover:bg-white/5">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {loading ? (
                    <div className="flex items-center gap-3 py-16 justify-center text-muted">
                        <Loader2 className="w-5 h-5 animate-spin text-plex" /> Loading request details...
                    </div>
                ) : (
                    <>
                        <div className="flex gap-4 mb-5">
                            <div className="w-24 aspect-[2/3] rounded-lg overflow-hidden bg-card border border-border/50 shrink-0">
                                {detail.posterUrl ? <img src={detail.posterUrl} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-muted"><TypeIcon className="w-8 h-8 opacity-40" /></div>}
                            </div>
                            {detail.overview ? <p className="text-sm text-muted leading-relaxed">{detail.overview}</p> : <p className="text-sm text-muted">No overview is available for this request.</p>}
                        </div>

                        {detail.mediaType === 'tv' && seasons.length > 0 && (
                            <div className="mb-5">
                                <p className="text-sm font-semibold text-text mb-2">Requested seasons</p>
                                <div className="rounded-xl border border-border/60 overflow-hidden">
                                    <table className="w-full text-sm">
                                        <thead className="bg-background/60 text-muted text-xs uppercase tracking-wider"><tr><th className="px-3 py-2 text-left w-12">On</th><th className="px-3 py-2 text-left">Season</th><th className="px-3 py-2 text-right">Episodes</th><th className="px-3 py-2 text-right">Status</th></tr></thead>
                                        <tbody>{seasons.map((season) => <tr key={season.seasonNumber} className="border-t border-border/40"><td className="px-3 py-2"><input type="checkbox" checked readOnly aria-label={`${season.name || `Season ${season.seasonNumber}`} requested`} className="accent-plex" /></td><td className="px-3 py-2 text-text font-medium">{season.name || (season.seasonNumber === 0 ? 'Specials' : `Season ${season.seasonNumber}`)}</td><td className="px-3 py-2 text-right text-muted">{season.episodeCount || '—'}</td><td className="px-3 py-2 text-right text-muted">{seasonStatusLabel(season.status)}</td></tr>)}</tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        <p className="mb-5 rounded-xl border border-white/10 bg-background/40 p-3 text-xs text-muted">
                            {portalEngine
                                ? 'Approval sends this request directly to the configured Radarr or Sonarr service.'
                                : 'Approval is performed by Seerr. Server, quality profile, and folder routing remain managed by its configured services.'}
                        </p>
                        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2 border-t border-border/40">
                            <button type="button" onClick={onClose} disabled={saving} className="px-4 py-2.5 rounded-lg border border-border text-muted hover:text-text transition-colors disabled:opacity-50">Cancel</button>
                            <button type="button" onClick={approve} disabled={saving} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-plex text-background font-bold hover:bg-plex-hover transition-colors disabled:opacity-50">
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} {portalEngine ? 'Approve and send to *arr' : 'Approve in Seerr'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};
