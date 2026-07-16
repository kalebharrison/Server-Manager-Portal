import React from 'react';
import { AlertTriangle, CalendarDays, Check, Clock3, ExternalLink, Film, Globe2, Star, Tv } from 'lucide-react';

import {
    CreditStrip,
    DetailPill,
    DetailSection,
    formatDate,
    formatLanguage,
    formatMoney,
    formatRuntime,
    NamedValueGrid,
    requestStateLabel,
} from './RequestMediaDetails';
import type { RequestMediaItem, RequestSeason } from './types';

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

export const RequestMediaFacts: React.FC<{ detail: RequestMediaItem }> = ({ detail }) => {
    const isTv = detail.mediaType === 'tv';
    const releaseLabel = formatDate(detail.releaseDate || detail.firstAirDate);
    const runtimeLabel = formatRuntime(detail.runtime);
    const facts = [
        detail.rating ? { label: 'Rating', value: `${detail.rating.toFixed(1)} / 10`, icon: Star } : null,
        releaseLabel ? { label: 'Release', value: releaseLabel, icon: CalendarDays } : null,
        runtimeLabel ? { label: isTv ? 'Episode Runtime' : 'Runtime', value: runtimeLabel, icon: Clock3 } : null,
        detail.status ? { label: 'Status', value: detail.status, icon: Check } : null,
        detail.originalLanguage ? { label: 'Language', value: formatLanguage(detail.originalLanguage), icon: Globe2 } : null,
        detail.network ? { label: 'Network', value: detail.network, icon: Tv } : null,
        detail.studio ? { label: 'Studio', value: detail.studio, icon: Film } : null,
        detail.numberOfSeasons ? { label: 'Seasons', value: String(detail.numberOfSeasons), icon: Tv } : null,
        detail.numberOfEpisodes ? { label: 'Episodes', value: String(detail.numberOfEpisodes), icon: Film } : null,
        detail.lastAirDate ? { label: 'Last Aired', value: formatDate(detail.lastAirDate), icon: CalendarDays } : null,
        detail.nextAirDate ? { label: 'Next Airs', value: formatDate(detail.nextAirDate), icon: CalendarDays } : null,
        detail.budget ? { label: 'Budget', value: formatMoney(detail.budget), icon: Film } : null,
        detail.revenue ? { label: 'Revenue', value: formatMoney(detail.revenue), icon: Film } : null,
    ].filter(Boolean) as Array<{ label: string; value: string | null; icon: React.ElementType }>;

    if (!facts.length) return null;
    return (
        <DetailSection title="Details" className="mb-7">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                {facts.map((fact) => {
                    const Icon = fact.icon;
                    return (
                        <div key={`${fact.label}-${fact.value}`} className="rounded-xl border border-white/10 bg-background/35 p-3">
                            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted">
                                <Icon className="h-3.5 w-3.5 text-plex" />
                                {fact.label}
                            </div>
                            <div className="text-sm font-bold text-text">{fact.value}</div>
                        </div>
                    );
                })}
            </div>
        </DetailSection>
    );
};

export const RequestMediaSeasons: React.FC<{
    seasons: RequestSeason[];
    requestableSeasons: RequestSeason[];
    selectedSeasons: number[];
    canRequest: boolean;
    onSelectAll: () => void;
    onToggle: (seasonNumber: number) => void;
}> = ({ seasons, requestableSeasons, selectedSeasons, canRequest, onSelectAll, onToggle }) => (
    <DetailSection title="Seasons" className="mb-7">
        {canRequest && requestableSeasons.length > 0 ? (
            <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-sm text-muted">Choose which seasons to request.</p>
                <button type="button" onClick={onSelectAll} className="text-xs font-semibold text-plex hover:text-plex-hover">
                    Select all
                </button>
            </div>
        ) : null}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {seasons
                .filter((season) => season.seasonNumber > 0)
                .map((season) => {
                    const requestable = requestableSeasons.some((entry) => entry.seasonNumber === season.seasonNumber);
                    const checked = selectedSeasons.includes(season.seasonNumber);
                    return (
                        <button
                            key={season.seasonNumber}
                            type="button"
                            disabled={!canRequest || !requestable}
                            onClick={() => onToggle(season.seasonNumber)}
                            className={`flex items-center justify-between gap-3 rounded-xl border p-3 text-left transition-colors disabled:cursor-default disabled:opacity-70 ${checked ? 'border-plex bg-plex/10 text-text' : 'border-border bg-background/35 text-muted hover:text-text hover:bg-white/5'}`}
                        >
                            <span className="min-w-0">
                                <span className="block text-sm font-bold line-clamp-1">{season.name}</span>
                                <span className="block text-xs opacity-75">{season.episodeCount || 0} episodes{season.statusLabel ? ` - ${season.statusLabel}` : ''}</span>
                            </span>
                            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${checked ? 'border-plex bg-plex text-background' : 'border-border'}`}>
                                {checked && <Check className="h-3 w-3" />}
                            </span>
                        </button>
                    );
                })}
        </div>
    </DetailSection>
);

export const RequestMediaCredits: React.FC<{ detail: RequestMediaItem }> = ({ detail }) => {
    const imdbUrl = detail.imdbId ? `https://www.imdb.com/title/${detail.imdbId}` : '';
    return (
        <div className="grid grid-cols-1 gap-7 xl:grid-cols-2">
            <div className="space-y-7">
                <CreditStrip title="Created By" credits={detail.creators} />
                <CreditStrip title="Crew" credits={detail.crew} />
                <NamedValueGrid title="Production" items={detail.productionCompanies} />
            </div>
            <div className="space-y-7">
                <CreditStrip title="Cast" credits={detail.cast} />
                {(detail.homepage || imdbUrl) ? (
                    <DetailSection title="Links">
                        <div className="flex flex-wrap gap-2">
                            {detail.homepage ? (
                                <a href={detail.homepage} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-border bg-background/35 px-3 py-2 text-sm font-bold text-text hover:border-plex hover:text-plex">
                                    Homepage
                                    <ExternalLink className="h-4 w-4" />
                                </a>
                            ) : null}
                            {imdbUrl ? (
                                <a href={imdbUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-border bg-background/35 px-3 py-2 text-sm font-bold text-text hover:border-plex hover:text-plex">
                                    IMDb
                                    <ExternalLink className="h-4 w-4" />
                                </a>
                            ) : null}
                        </div>
                    </DetailSection>
                ) : null}
            </div>
        </div>
    );
};

export const RequestMediaModalFooter: React.FC<{
    detail: RequestMediaItem;
    saving: boolean;
    selectedSeasonCount: number;
    onClose: () => void;
    onSubmit: () => void;
    onToggleIssueForm: () => void;
}> = ({ detail, saving, selectedSeasonCount, onClose, onSubmit, onToggleIssueForm }) => {
    const canRequest = detail.canRequest !== false;
    const canSubmit = !saving && canRequest && (detail.mediaType !== 'tv' || selectedSeasonCount > 0);
    const canReportIssue = !!(detail.mediaId || detail.ratingKey);
    const requestLabel = requestStateLabel(detail);

    return (
        <div className="flex flex-col gap-3 border-t border-white/10 p-4 md:flex-row md:items-center md:justify-between md:p-5">
            <div className="text-xs text-muted">
                {canRequest ? 'Requests are submitted to your configured request app.' : `${detail.title} is marked ${requestLabel.toLowerCase()}.`}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                {detail.plexUrl ? (
                    <a href={detail.plexUrl} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-lg border border-green-500/30 bg-green-500/15 px-4 py-2 font-bold text-green-100 transition-colors hover:bg-green-500/25">
                        <ExternalLink className="h-4 w-4" /> Open in Plex
                    </a>
                ) : null}
                {canReportIssue ? (
                    <button
                        type="button"
                        onClick={onToggleIssueForm}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-500/30 px-4 py-2 font-bold text-amber-100 transition-colors hover:bg-amber-500/10"
                    >
                        <AlertTriangle className="h-4 w-4" />
                        Report Issue
                    </button>
                ) : null}
                <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-muted transition-colors hover:bg-white/5 hover:text-text">
                    Close
                </button>
                <button
                    type="button"
                    disabled={!canSubmit}
                    onClick={onSubmit}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-plex px-4 py-2 font-bold text-background transition-colors hover:bg-plex-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {saving ? <Clock3 className="h-4 w-4 animate-pulse" /> : <Check className="h-4 w-4" />}
                    {canRequest ? 'Request' : requestLabel}
                </button>
            </div>
        </div>
    );
};
