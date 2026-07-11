import React, { useEffect, useMemo, useState } from 'react';
import { Check, Film, Loader2, Tv, X } from 'lucide-react';
import { apiFetch } from '../shared/api';
import type { RequestMediaItem } from './types';

export const RequestMediaModal: React.FC<{
    item: RequestMediaItem;
    saving: boolean;
    onClose: () => void;
    onSubmit: (item: RequestMediaItem, seasons: number[]) => void;
}> = ({ item, saving, onClose, onSubmit }) => {
    const [detail, setDetail] = useState<RequestMediaItem>(item);
    const [loading, setLoading] = useState(item.mediaType === 'tv' && (!item.seasons || item.seasons.length === 0));
    const [selectedSeasons, setSelectedSeasons] = useState<number[]>([]);
    const isTv = detail.mediaType === 'tv';

    useEffect(() => {
        let cancelled = false;
        if (!isTv || (item.seasons && item.seasons.length > 0)) {
            setDetail(item);
            return () => { cancelled = true; };
        }
        setLoading(true);
        apiFetch(`/api/request-app/media/${item.mediaType}/${item.tmdbId}`, { cacheTtlMs: 30_000 })
            .then((data) => {
                if (!cancelled && data?.item) setDetail(data.item);
            })
            .catch(() => {
                if (!cancelled) setDetail(item);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => { cancelled = true; };
    }, [item, isTv]);

    const requestableSeasons = useMemo(() => (
        (detail.seasons || [])
            .filter((season) => season.seasonNumber > 0)
            .filter((season) => !['pending', 'approved'].includes(String(season.statusLabel || '').toLowerCase()))
    ), [detail.seasons]);

    useEffect(() => {
        if (!isTv) return;
        if (requestableSeasons.length > 0 && selectedSeasons.length === 0) {
            setSelectedSeasons(requestableSeasons.map((season) => season.seasonNumber));
        }
    }, [isTv, requestableSeasons, selectedSeasons.length]);

    const toggleSeason = (seasonNumber: number) => {
        setSelectedSeasons((prev) => (
            prev.includes(seasonNumber)
                ? prev.filter((entry) => entry !== seasonNumber)
                : [...prev, seasonNumber].sort((a, b) => a - b)
        ));
    };

    const TypeIcon = detail.mediaType === 'tv' ? Tv : Film;
    const canSubmit = !saving && (!isTv || selectedSeasons.length > 0);

    return (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm" onClick={onClose}>
            <div className="w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-2xl border border-white/10 bg-card shadow-2xl" onClick={(event) => event.stopPropagation()}>
                <div className="relative min-h-[220px] p-5 md:p-6 flex items-end overflow-hidden">
                    {detail.backdropUrl || detail.posterUrl ? (
                        <div
                            className="absolute inset-0 bg-cover bg-center opacity-45"
                            style={{ backgroundImage: `url(${detail.backdropUrl || detail.posterUrl})` }}
                            aria-hidden
                        />
                    ) : null}
                    <div className="absolute inset-0 bg-gradient-to-t from-card via-card/80 to-card/20" aria-hidden />
                    <button type="button" onClick={onClose} className="absolute top-4 right-4 p-2 rounded-full bg-black/40 text-white hover:bg-white/10 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                    <div className="relative z-10 flex items-end gap-4 min-w-0">
                        {detail.posterUrl ? (
                            <img src={detail.posterUrl} alt={detail.title} className="hidden sm:block w-24 aspect-[2/3] object-cover rounded-xl border border-white/10 shadow-xl" />
                        ) : null}
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/10 text-xs font-bold uppercase tracking-wider text-white border border-white/10">
                                    <TypeIcon className="w-3.5 h-3.5" />
                                    {detail.mediaType === 'tv' ? 'TV' : 'Movie'}
                                </span>
                                {detail.year ? <span className="text-sm text-white/70">{detail.year}</span> : null}
                            </div>
                            <h2 className="text-2xl md:text-3xl font-black text-white leading-tight">{detail.title}</h2>
                            {detail.overview ? <p className="text-sm text-white/75 mt-2 line-clamp-3 max-w-2xl">{detail.overview}</p> : null}
                        </div>
                    </div>
                </div>

                <div className="p-5 md:p-6 overflow-y-auto max-h-[55vh] custom-scrollbar">
                    {isTv ? (
                        <div>
                            <div className="flex items-center justify-between gap-3 mb-3">
                                <h3 className="font-bold text-text">Select Seasons</h3>
                                {requestableSeasons.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => setSelectedSeasons(requestableSeasons.map((season) => season.seasonNumber))}
                                        className="text-xs font-semibold text-plex hover:text-plex-hover"
                                    >
                                        Select all
                                    </button>
                                )}
                            </div>
                            {loading ? (
                                <div className="flex items-center gap-2 text-sm text-muted py-6">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Loading seasons...
                                </div>
                            ) : requestableSeasons.length ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {requestableSeasons.map((season) => {
                                        const checked = selectedSeasons.includes(season.seasonNumber);
                                        return (
                                            <button
                                                key={season.seasonNumber}
                                                type="button"
                                                onClick={() => toggleSeason(season.seasonNumber)}
                                                className={`flex items-center justify-between gap-3 rounded-xl border p-3 text-left transition-colors ${checked ? 'border-plex bg-plex/10 text-text' : 'border-border bg-background/40 text-muted hover:text-text hover:bg-white/5'}`}
                                            >
                                                <span>
                                                    <span className="block font-bold text-sm">{season.name}</span>
                                                    <span className="block text-xs opacity-70">{season.episodeCount || 0} episodes</span>
                                                </span>
                                                <span className={`w-5 h-5 rounded-full border flex items-center justify-center ${checked ? 'border-plex bg-plex text-background' : 'border-border'}`}>
                                                    {checked && <Check className="w-3 h-3" />}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            ) : (
                                <p className="text-sm text-muted py-4">No requestable seasons were returned by the request app.</p>
                            )}
                        </div>
                    ) : (
                        <p className="text-sm text-muted">Submit this movie request through your configured request app.</p>
                    )}
                </div>

                <div className="p-5 md:p-6 border-t border-white/10 flex flex-col sm:flex-row sm:items-center sm:justify-end gap-3">
                    <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-muted hover:text-text hover:bg-white/5 transition-colors">
                        Cancel
                    </button>
                    <button
                        type="button"
                        disabled={!canSubmit}
                        onClick={() => onSubmit(detail, selectedSeasons)}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-plex text-background font-bold hover:bg-plex-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        Request
                    </button>
                </div>
            </div>
        </div>
    );
};
