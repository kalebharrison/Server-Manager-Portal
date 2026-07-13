import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';

import { apiFetch } from '../shared/api';
import { RequestMediaIssueForm } from './RequestMediaIssueForm';
import {
    RequestMediaCredits,
    RequestMediaFacts,
    RequestMediaHero,
    RequestMediaModalFooter,
    RequestMediaSeasons,
} from './RequestMediaModalSections';
import type { RequestMediaItem } from './types';

export const RequestMediaModal: React.FC<{
    item: RequestMediaItem;
    saving: boolean;
    onClose: () => void;
    onSubmit: (item: RequestMediaItem, seasons: number[]) => void;
}> = ({ item, saving, onClose, onSubmit }) => {
    const [detail, setDetail] = useState<RequestMediaItem>(item);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [selectedSeasons, setSelectedSeasons] = useState<number[]>([]);
    const [showIssueForm, setShowIssueForm] = useState(false);
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const isTv = detail.mediaType === 'tv';
    const canRequest = detail.canRequest !== false;

    useEffect(() => {
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, []);

    useEffect(() => {
        let cancelled = false;
        setDetail(item);
        setSelectedSeasons([]);
        setShowIssueForm(false);
        scrollRef.current?.scrollTo({ top: 0 });
        setLoading(true);
        setLoadError(null);

        apiFetch(`/api/request-app/media/${item.mediaType}/${item.tmdbId}`, { cacheTtlMs: 60_000 })
            .then((data) => {
                if (!cancelled && data?.item) setDetail({ ...item, ...data.item });
            })
            .catch((err: any) => {
                if (!cancelled) {
                    setLoadError(err?.message || 'Could not load full details');
                    setDetail(item);
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => { cancelled = true; };
    }, [item]);

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

    const toggleIssueForm = () => {
        setShowIssueForm((current) => {
            const next = !current;
            if (next) {
                window.setTimeout(() => {
                    const node = scrollRef.current;
                    if (node) node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' });
                }, 0);
            }
            return next;
        });
    };

    return (
        <div
            className="fixed inset-0 z-[1200] flex items-center justify-center p-2 md:p-5 bg-black/75 backdrop-blur-sm overscroll-contain"
            onClick={onClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label={`${detail.title} details`}
                className="relative flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-card shadow-2xl"
                onClick={(event) => event.stopPropagation()}
            >
                <button type="button" onClick={onClose} className="absolute right-4 top-4 z-[1201] rounded-full bg-black/55 p-2 text-white transition-colors hover:bg-white/10">
                    <X className="h-5 w-5" />
                </button>

                <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain custom-scrollbar">
                    <RequestMediaHero detail={detail} loading={loading} />
                    <div className="p-5 md:p-7">
                        {loadError ? (
                            <div className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
                                Showing cached browse data. {loadError}
                            </div>
                        ) : null}
                        <RequestMediaFacts detail={detail} />
                        {isTv && detail.seasons?.length ? (
                            <RequestMediaSeasons
                                seasons={detail.seasons}
                                requestableSeasons={requestableSeasons}
                                selectedSeasons={selectedSeasons}
                                canRequest={canRequest}
                                onSelectAll={() => setSelectedSeasons(requestableSeasons.map((season) => season.seasonNumber))}
                                onToggle={toggleSeason}
                            />
                        ) : null}
                        <RequestMediaCredits detail={detail} />
                        {showIssueForm ? <RequestMediaIssueForm item={detail} onCancel={() => setShowIssueForm(false)} /> : null}
                    </div>
                </div>

                <RequestMediaModalFooter
                    detail={detail}
                    saving={saving}
                    selectedSeasonCount={selectedSeasons.length}
                    onClose={onClose}
                    onSubmit={() => onSubmit(detail, selectedSeasons)}
                    onToggleIssueForm={toggleIssueForm}
                />
            </div>
        </div>
    );
};
