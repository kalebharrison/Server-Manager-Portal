import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Film, RefreshCw, Search, Tv } from 'lucide-react';

import { apiFetch } from '../shared/api';
import { resolvePortalAssetUrl } from '../shared/basePath';
import { useVisibleInterval } from '../shared/useVisibleInterval';
import { IssueConversation } from '../issues/IssueConversation';

const ISSUE_TYPES = [
    { value: 1, label: 'Video' },
    { value: 2, label: 'Audio' },
    { value: 3, label: 'Subtitles' },
    { value: 4, label: 'Other' },
];

const RECENT_PLAYED_LIMIT = 12;

const toSelectable = (item: any) => {
    const ratingKey = item.ratingKey != null && String(item.ratingKey).trim() !== ''
        ? String(item.ratingKey).replace(/^\/library\/metadata\//, '')
        : null;
    const type = item.type === 'tv' || item.mediaType === 'tv' || item.mediaType === 'show'
        ? 'show'
        : (item.type || (item.mediaType === 'movie' ? 'movie' : item.mediaType) || 'movie');
    return {
        historyKey: item.historyKey || `search:${ratingKey || item.title}`,
        title: item.title,
        type,
        ratingKey,
        key: item.key || (ratingKey ? `/library/metadata/${ratingKey}` : null),
        thumbUrl: item.thumbUrl || item.posterUrl || null,
        episodeTitle: item.episodeTitle || null,
    };
};

export const IssuesDashboard: React.FC<{ isAdmin: boolean }> = ({ isAdmin }) => {
    const [issues, setIssues] = useState<any[]>([]);
    const [sources, setSources] = useState<any>({});
    const [recent, setRecent] = useState<any[]>([]);
    const [selected, setSelected] = useState<any>(null);
    const [message, setMessage] = useState('');
    const [issueType, setIssueType] = useState(4);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [statusFilter, setStatusFilter] = useState<'open' | 'resolved'>('open');
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [searching, setSearching] = useState(false);

    const load = useCallback(async (forceRefresh = false) => {
        setError('');
        try {
            const [issueData, analytics] = await Promise.all([
                apiFetch(forceRefresh ? '/api/media-issues?filter=all&sync=1' : '/api/media-issues?filter=all', forceRefresh
                    ? { forceRefresh: true }
                    : { cacheTtlMs: 30_000 }),
                apiFetch('/api/plex/analytics/me?days=30').catch(() => ({ recentHistory: [] })),
            ]);
            setIssues(issueData.issues || []);
            setSources(issueData.sources || {});
            setRecent(
                (analytics.recentHistory || [])
                    .filter((item: any) => item.type !== 'track')
                    .slice(0, RECENT_PLAYED_LIMIT)
                    .map(toSelectable),
            );
        } catch (loadError: any) {
            setError(loadError?.message || 'Issues are temporarily unavailable.');
        }
    }, []);

    useEffect(() => { void load(true); }, [load]);
    useVisibleInterval(() => { void load(false); }, 60_000);

    useEffect(() => {
        const query = searchQuery.trim();
        if (query.length < 2) {
            setSearchResults([]);
            setSearching(false);
            return undefined;
        }
        let cancelled = false;
        setSearching(true);
        const timer = window.setTimeout(async () => {
            try {
                const data = await apiFetch(`/api/plex/search?query=${encodeURIComponent(query)}&limit=12`, {
                    cacheTtlMs: 15_000,
                });
                if (cancelled) return;
                setSearchResults((data?.results || []).map(toSelectable));
            } catch {
                if (!cancelled) setSearchResults([]);
            } finally {
                if (!cancelled) setSearching(false);
            }
        }, 250);
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [searchQuery]);

    const sourceSummary = useMemo(() => [sources.plex && 'Plex'].filter(Boolean).join(' · '), [sources]);
    const sourceLabel = (source: string) => (source === 'plex' ? 'Reported in Plex' : 'Reported here');
    const formatReportDate = (value: string | null) => {
        if (!value) return 'Date unavailable';
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? 'Date unavailable' : new Intl.DateTimeFormat(undefined, {
            month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
        }).format(date);
    };
    const visibleIssues = useMemo(() => issues.filter((issue) => issue.status === statusFilter), [issues, statusFilter]);
    const openCount = useMemo(() => issues.filter((issue) => issue.status === 'open').length, [issues]);
    const resolvedCount = issues.length - openCount;

    const pickMedia = (item: any) => {
        setSelected(toSelectable(item));
        setMessage('');
    };

    const submit = async () => {
        if (!selected || message.trim().length < 3) return;
        setBusy(true);
        try {
            await apiFetch('/api/media-issues', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: selected.title,
                    mediaType: selected.type === 'episode' || selected.type === 'show' ? 'show' : 'movie',
                    ratingKey: selected.ratingKey || selected.key,
                    thumbUrl: selected.thumbUrl,
                    issueType,
                    message,
                }),
            });
            setSelected(null);
            setMessage('');
            setSearchQuery('');
            setSearchResults([]);
            await load(true);
        } finally {
            setBusy(false);
        }
    };

    const runAction = async (issue: any, action: 'approve-search' | 'resolve') => {
        setBusy(true);
        try {
            await apiFetch(`/api/media-issues/${encodeURIComponent(issue.id)}/${action}`, { method: 'POST' });
            await load(true);
        } finally {
            setBusy(false);
        }
    };
    const remediationLabel = (value: string) => ({
        'pending-review': 'Awaiting approval',
        replacing: 'Replacement downloading',
        searching: 'Search started',
        'approved-unmatched': 'Needs attention',
    }[value] || null);

    const mediaButton = (item: any) => (
        <button
            key={item.historyKey || item.ratingKey || item.title}
            type="button"
            onClick={() => pickMedia(item)}
            className={`flex min-w-0 items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                selected?.historyKey === item.historyKey
                    ? 'border-plex/60 bg-plex/10'
                    : 'border-border bg-card hover:border-plex/50'
            }`}
        >
            {item.thumbUrl
                ? <img src={resolvePortalAssetUrl(item.thumbUrl)} alt="" className="h-16 w-12 rounded object-cover" />
                : <div className="flex h-16 w-12 items-center justify-center rounded bg-background"><Film className="h-5 w-5 text-muted" /></div>}
            <div className="min-w-0">
                <p className="truncate font-bold text-text">{item.title}</p>
                <p className="mt-1 text-xs text-muted">{item.episodeTitle || 'Report a problem'}</p>
            </div>
        </button>
    );

    return (
        <div className="space-y-8 pb-12">
            <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-5">
                <div><h1 className="text-2xl font-bold text-text">Media Issues</h1><p className="mt-1 text-sm text-muted">Report playback problems and follow their resolution.</p></div>
                <div className="text-xs text-muted">{sourceSummary ? `Connected: ${sourceSummary}` : 'Portal reports only'}</div>
            </header>

            <section className="space-y-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <h2 className="text-sm font-bold uppercase tracking-widest text-plex">Report media</h2>
                    <div className="relative w-full max-w-md">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                        <input
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                            placeholder="Search library (e.g. Cyberpunk)"
                            className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm text-text"
                        />
                    </div>
                </div>

                {searchQuery.trim().length >= 2 && (
                    <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                            {searching ? 'Searching…' : `Search results${searchResults.length ? ` (${searchResults.length})` : ''}`}
                        </p>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {searchResults.map(mediaButton)}
                            {!searching && !searchResults.length && (
                                <p className="text-sm text-muted">No library matches for “{searchQuery.trim()}”.</p>
                            )}
                        </div>
                    </div>
                )}

                <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">Recently played</p>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {recent.map(mediaButton)}
                        {!recent.length && <p className="text-sm text-muted">No recent playback history is available.</p>}
                    </div>
                    <p className="text-xs text-muted">
                        Recently played is your account only. Use search for titles watched on another profile.
                    </p>
                </div>
            </section>

            {selected && <section className="rounded-lg border border-plex/30 bg-card p-4">
                <div className="mb-4 flex items-center gap-3"><AlertTriangle className="h-5 w-5 text-plex" /><h2 className="font-bold text-text">Report: {selected.title}</h2></div>
                <div className="grid gap-3 md:grid-cols-[12rem_1fr_auto]">
                    <select value={issueType} onChange={(event) => setIssueType(Number(event.target.value))} className="rounded-lg border border-border bg-background px-3 py-2 text-text">{ISSUE_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select>
                    <input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="What is wrong?" maxLength={2000} className="rounded-lg border border-border bg-background px-3 py-2 text-text" />
                    <button type="button" disabled={busy || message.trim().length < 3} onClick={submit} className="rounded-lg bg-plex px-5 py-2 font-bold text-black disabled:opacity-50">Submit</button>
                </div>
            </section>}

            <section>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><button type="button" onClick={() => setStatusFilter('open')} className={`rounded-lg px-3 py-2 text-sm font-bold ${statusFilter === 'open' ? 'bg-plex text-black' : 'border border-border text-muted'}`}>Open {openCount}</button><button type="button" onClick={() => setStatusFilter('resolved')} className={`rounded-lg px-3 py-2 text-sm font-bold ${statusFilter === 'resolved' ? 'bg-plex text-black' : 'border border-border text-muted'}`}>Resolved {resolvedCount}</button></div><button type="button" title="Refresh" onClick={() => { void load(true); }} className="p-2 text-muted hover:text-text"><RefreshCw className="h-4 w-4" /></button></div>
                {error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
                <div className="space-y-3">
                    {visibleIssues.map((issue) => <article key={issue.id} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 md:flex-row md:flex-wrap md:items-center">
                        {issue.thumbUrl ? <img src={resolvePortalAssetUrl(issue.thumbUrl)} alt="" className="h-20 w-14 flex-none rounded object-cover bg-background" loading="lazy" /> : <div className="flex h-20 w-14 flex-none items-center justify-center rounded bg-background">{issue.mediaType === 'show' || issue.mediaType === 'tv' ? <Tv className="h-5 w-5 text-plex" /> : <Film className="h-5 w-5 text-plex" />}</div>}
                        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-text">{issue.title}</h3>{issue.year && <span className="text-xs text-muted">{issue.year}</span>}<span className="rounded border border-border px-2 py-0.5 text-[10px] uppercase text-muted">{sourceLabel(issue.source)}</span>{remediationLabel(issue.remediationStatus) && <span className="rounded border border-plex/30 bg-plex/10 px-2 py-0.5 text-[10px] uppercase text-plex">{remediationLabel(issue.remediationStatus)}</span>}</div>{issue.subtitle && <p className="mt-1 text-xs font-medium text-muted">{issue.subtitle}</p>}<p className="mt-2 line-clamp-2 text-sm text-text/80">{issue.message || 'No description provided.'}</p><p className="mt-1 text-xs text-muted">Reported {formatReportDate(issue.createdAt)}{isAdmin && issue.reporter ? ` by ${issue.reporter}` : ''}</p></div>
                        {isAdmin && issue.status === 'open' && <div className="flex flex-wrap gap-2"><button type="button" disabled={busy || !['pending-review', 'approved-unmatched'].includes(issue.remediationStatus)} title="Approve and download the highest-ranked acceptable replacement." onClick={() => runAction(issue, 'approve-search')} className="flex items-center gap-2 rounded-lg border border-plex/40 px-3 py-2 text-sm font-bold text-plex disabled:opacity-40"><Search className="h-4 w-4" />Approve</button><button type="button" disabled={busy} title={issue.source === 'plex' ? 'Marks this report resolved in the portal. Plex does not expose a supported resolve action.' : 'Marks this issue resolved.'} onClick={() => runAction(issue, 'resolve')} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-text"><Check className="h-4 w-4" />Resolve</button></div>}
                        <IssueConversation issueId={issue.id} count={issue.commentCount || 0} canComment={issue.canComment === true} />
                    </article>)}
                    {!visibleIssues.length && !error && <p className="text-sm text-muted">No {statusFilter} issues.</p>}
                </div>
            </section>
        </div>
    );
};
