import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CalendarDays, Check, Clock3, ExternalLink, Film, Globe2, Star, Tv, UserRound, X } from 'lucide-react';
import { apiFetch } from '../shared/api';
import type { RequestCredit, RequestMediaItem, RequestNamedValue } from './types';

const formatDate = (value?: string | null) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

const formatRuntime = (minutes?: number | null) => {
    if (!minutes) return null;
    const hours = Math.floor(minutes / 60);
    const remaining = minutes % 60;
    return hours ? `${hours}h ${remaining}m` : `${remaining}m`;
};

const formatMoney = (value?: number | null) => {
    if (!value) return null;
    return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: 'USD',
        notation: 'compact',
        maximumFractionDigits: 1,
    }).format(value);
};

const formatLanguage = (value?: string | null) => {
    if (!value) return null;
    try {
        const DisplayNames = (Intl as any).DisplayNames;
        const formatter = DisplayNames ? new DisplayNames(undefined, { type: 'language' }) : null;
        return formatter?.of(value) || value.toUpperCase();
    } catch {
        return value.toUpperCase();
    }
};

const requestStateLabel = (item: RequestMediaItem) => {
    if (item.available) return 'Available';
    if (item.processing) return 'Processing';
    if (item.pending) return 'Pending';
    if (item.approved) return 'Approved';
    return 'Request';
};

const initials = (name: string) => name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

const DetailPill: React.FC<{ children: React.ReactNode; tone?: 'default' | 'good' | 'warn' }> = ({ children, tone = 'default' }) => {
    const toneClass = tone === 'good'
        ? 'border-green-500/30 bg-green-500/15 text-green-100'
        : tone === 'warn'
            ? 'border-amber-500/30 bg-amber-500/15 text-amber-100'
            : 'border-white/10 bg-white/10 text-white/80';

    return (
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${toneClass}`}>
            {children}
        </span>
    );
};

const DetailSection: React.FC<{ title: string; children: React.ReactNode; className?: string }> = ({ title, children, className = '' }) => (
    <section className={className}>
        <h3 className="mb-3 text-sm font-black uppercase tracking-[0.18em] text-muted">{title}</h3>
        {children}
    </section>
);

const issueOptions = [
    { id: 'video', label: 'Video' },
    { id: 'audio', label: 'Audio' },
    { id: 'subtitles', label: 'Subtitles' },
    { id: 'other', label: 'Other' },
] as const;

const CreditStrip: React.FC<{ title: string; credits?: RequestCredit[] }> = ({ title, credits = [] }) => {
    if (!credits.length) return null;

    return (
        <DetailSection title={title}>
            <div className="flex gap-3 overflow-x-auto custom-scrollbar pb-2">
                {credits.map((credit) => (
                    <div key={`${credit.id || credit.name}-${credit.role || ''}`} className="w-28 shrink-0">
                        <div className="aspect-[2/3] overflow-hidden rounded-xl border border-white/10 bg-background/70">
                            {credit.profileUrl ? (
                                <img src={credit.profileUrl} alt={credit.name} className="h-full w-full object-cover" loading="lazy" />
                            ) : (
                                <div className="flex h-full w-full items-center justify-center text-lg font-black text-muted">
                                    {initials(credit.name) || <UserRound className="h-7 w-7" />}
                                </div>
                            )}
                        </div>
                        <p className="mt-2 text-xs font-bold text-text line-clamp-2">{credit.name}</p>
                        {credit.role ? <p className="text-[11px] text-muted line-clamp-2">{credit.role}</p> : null}
                    </div>
                ))}
            </div>
        </DetailSection>
    );
};

const NamedValueGrid: React.FC<{ title: string; items?: RequestNamedValue[] }> = ({ title, items = [] }) => {
    if (!items.length) return null;

    return (
        <DetailSection title={title}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {items.map((item) => (
                    <div key={`${item.id || item.name}`} className="flex items-center gap-3 rounded-xl border border-white/10 bg-background/35 p-3">
                        {item.logoUrl ? (
                            <img src={item.logoUrl} alt="" className="h-8 w-12 rounded bg-white/90 object-contain p-1" loading="lazy" />
                        ) : (
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-xs font-black text-muted">
                                {initials(item.name)}
                            </div>
                        )}
                        <span className="min-w-0 text-sm font-semibold text-text line-clamp-2">{item.name}</span>
                    </div>
                ))}
            </div>
        </DetailSection>
    );
};

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
    const [issueType, setIssueType] = useState<(typeof issueOptions)[number]['id']>('video');
    const [issueMessage, setIssueMessage] = useState('');
    const [issueStatus, setIssueStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
    const [issueError, setIssueError] = useState('');
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const isTv = detail.mediaType === 'tv';

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
        setIssueType('video');
        setIssueMessage('');
        setIssueStatus('idle');
        setIssueError('');
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

    const submitIssue = async () => {
        const message = issueMessage.trim();
        if (!message) return;
        setIssueStatus('submitting');
        setIssueError('');
        try {
            await apiFetch(`/api/request-app/media/${detail.mediaType}/${detail.tmdbId}/issue`, {
                method: 'POST',
                body: JSON.stringify({
                    title: detail.title,
                    issueType,
                    message,
                }),
            });
            setIssueStatus('success');
            setIssueMessage('');
        } catch (err: any) {
            setIssueStatus('error');
            setIssueError(err?.message || 'Failed to report issue');
        }
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

    const TypeIcon = detail.mediaType === 'tv' ? Tv : Film;
    const canRequest = detail.canRequest !== false;
    const canSubmit = !saving && canRequest && (!isTv || selectedSeasons.length > 0);
    const canReportIssue = !!detail.mediaId;
    const releaseLabel = formatDate(detail.releaseDate || detail.firstAirDate);
    const runtimeLabel = formatRuntime(detail.runtime);
    const requestLabel = requestStateLabel(detail);
    const statusTone = detail.available ? 'good' : detail.pending || detail.processing || detail.approved ? 'warn' : 'default';
    const imdbUrl = detail.imdbId ? `https://www.imdb.com/title/${detail.imdbId}` : '';

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

                    <div className="p-5 md:p-7">
                    {loadError ? (
                        <div className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
                            Showing cached browse data. {loadError}
                        </div>
                    ) : null}

                    {facts.length ? (
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
                    ) : null}

                    {isTv && detail.seasons?.length ? (
                        <DetailSection title="Seasons" className="mb-7">
                            {canRequest && requestableSeasons.length > 0 ? (
                                <div className="mb-3 flex items-center justify-between gap-3">
                                    <p className="text-sm text-muted">Choose which seasons to request.</p>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedSeasons(requestableSeasons.map((season) => season.seasonNumber))}
                                        className="text-xs font-semibold text-plex hover:text-plex-hover"
                                    >
                                        Select all
                                    </button>
                                </div>
                            ) : null}
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                {detail.seasons
                                    .filter((season) => season.seasonNumber > 0)
                                    .map((season) => {
                                        const requestable = requestableSeasons.some((entry) => entry.seasonNumber === season.seasonNumber);
                                        const checked = selectedSeasons.includes(season.seasonNumber);
                                        return (
                                            <button
                                                key={season.seasonNumber}
                                                type="button"
                                                disabled={!canRequest || !requestable}
                                                onClick={() => toggleSeason(season.seasonNumber)}
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
                    ) : null}

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
                    {showIssueForm ? (
                        <DetailSection title="Report Issue" className="mt-7">
                            <div className="rounded-xl border border-white/10 bg-background/35 p-4">
                                <div className="mb-3 flex flex-wrap gap-2">
                                    {issueOptions.map((option) => (
                                        <button
                                            key={option.id}
                                            type="button"
                                            onClick={() => setIssueType(option.id)}
                                            className={`rounded-lg border px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors ${issueType === option.id ? 'border-plex bg-plex text-background' : 'border-border text-muted hover:text-text hover:bg-white/5'}`}
                                        >
                                            {option.label}
                                        </button>
                                    ))}
                                </div>
                                <textarea
                                    value={issueMessage}
                                    onChange={(event) => {
                                        setIssueMessage(event.target.value);
                                        setIssueStatus('idle');
                                        setIssueError('');
                                    }}
                                    placeholder="Describe what is wrong."
                                    className="h-28 w-full resize-none rounded-xl border border-border bg-card p-3 text-sm text-text outline-none transition-colors focus:border-plex"
                                />
                                {issueStatus === 'success' ? (
                                    <p className="mt-2 text-sm font-semibold text-green-300">Issue submitted.</p>
                                ) : issueStatus === 'error' ? (
                                    <p className="mt-2 text-sm font-semibold text-red-300">{issueError}</p>
                                ) : null}
                                <div className="mt-3 flex justify-end gap-2">
                                    <button
                                        type="button"
                                        onClick={() => { setShowIssueForm(false); setIssueMessage(''); setIssueStatus('idle'); setIssueError(''); }}
                                        className="rounded-lg border border-border px-3 py-2 text-sm text-muted transition-colors hover:bg-white/5 hover:text-text"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        disabled={issueStatus === 'submitting' || !issueMessage.trim()}
                                        onClick={submitIssue}
                                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-plex px-3 py-2 text-sm font-bold text-background transition-colors hover:bg-plex-hover disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        {issueStatus === 'submitting' ? <Clock3 className="h-4 w-4 animate-pulse" /> : <AlertTriangle className="h-4 w-4" />}
                                        Submit Issue
                                    </button>
                                </div>
                            </div>
                        </DetailSection>
                    ) : null}
                    </div>
                </div>

                <div className="flex flex-col gap-3 border-t border-white/10 p-4 md:flex-row md:items-center md:justify-between md:p-5">
                    <div className="text-xs text-muted">
                        {canRequest ? 'Requests are submitted to your configured request app.' : `${detail.title} is marked ${requestLabel.toLowerCase()}.`}
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                        {canReportIssue ? (
                            <button
                                type="button"
                                onClick={toggleIssueForm}
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
                            onClick={() => onSubmit(detail, selectedSeasons)}
                            className="inline-flex items-center justify-center gap-2 rounded-lg bg-plex px-4 py-2 font-bold text-background transition-colors hover:bg-plex-hover disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {saving ? <Clock3 className="h-4 w-4 animate-pulse" /> : <Check className="h-4 w-4" />}
                            {canRequest ? 'Request' : requestLabel}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
