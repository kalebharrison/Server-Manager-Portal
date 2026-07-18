import React from 'react';
import { Film, Tv } from 'lucide-react';

import { DetailPill, requestStateLabel } from './RequestMediaDetails';
import type { RequestMediaItem } from './types';

export const RequestMediaHero: React.FC<{
    detail: RequestMediaItem;
    loading: boolean;
}> = ({ detail, loading }) => {
    const TypeIcon = detail.mediaType === 'tv' ? Tv : Film;
    const requestLabel = requestStateLabel(detail);
    const statusTone = detail.available ? 'good' : detail.requested || detail.pending || detail.processing || detail.approved ? 'warn' : 'default';

    return (
        <div className="relative overflow-hidden p-5 pt-12 md:p-7 md:pt-7">
            {detail.backdropUrl || detail.posterUrl ? (
                <div
                    className="absolute inset-0 bg-cover bg-center opacity-45"
                    style={{ backgroundImage: `url(${detail.backdropUrl || detail.posterUrl})` }}
                    aria-hidden
                />
            ) : null}
            <div className="absolute inset-0 bg-gradient-to-t from-card via-card/90 to-card/25" aria-hidden />

            <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-start">
                {detail.posterUrl ? (
                    <img src={detail.posterUrl} alt={detail.title} className="hidden w-28 shrink-0 rounded-xl border border-white/10 object-cover shadow-2xl sm:block md:w-36" />
                ) : null}
                <div className="min-w-0 max-w-4xl">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                        <DetailPill>
                            <TypeIcon className="h-3.5 w-3.5" />
                            {detail.mediaType === 'tv' ? 'TV' : 'Movie'}
                        </DetailPill>
                        {detail.year ? <DetailPill>{detail.year}</DetailPill> : null}
                        <DetailPill tone={statusTone}>{requestLabel}</DetailPill>
                        {loading ? <DetailPill>Loading details</DetailPill> : null}
                    </div>
                    <h2 className="text-3xl font-black leading-tight tracking-tight text-white md:text-4xl">{detail.title}</h2>
                    {detail.tagline ? <p className="mt-2 text-base font-semibold italic text-white/80">{detail.tagline}</p> : null}
                    {detail.overview ? <p className="mt-3 max-w-3xl text-sm leading-relaxed text-white/78 md:text-base">{detail.overview}</p> : null}
                    {detail.genres?.length ? (
                        <div className="mt-4 flex flex-wrap gap-2">
                            {detail.genres.map((genre) => (
                                <DetailPill key={`${genre.id || genre.name}`}>{genre.name}</DetailPill>
                            ))}
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
};
