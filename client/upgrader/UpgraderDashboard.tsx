import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowUpCircle, RefreshCw, Settings as SettingsIcon, History, Ban, Settings2, LayoutDashboard, FlaskConical } from 'lucide-react';
import { apiFetch } from '../shared/api';
import { portalUrl, resolvePortalAssetUrl } from '../shared/basePath';
import { Loader, ToastContainer, pushToast } from '../shared/toast';
import type { ToastMessage } from '../shared/types';
import { UpgraderHistoryPanel } from './UpgraderHistoryPanel';
import { UpgraderExclusionsPanel } from './UpgraderExclusionsPanel';
import { UpgraderProfilesTab } from './UpgraderProfilesTab';
import type {
    UpgraderAuditEntry,
    UpgraderHuntResponse,
    UpgraderHuntResult,
    UpgraderStatus,
    UpgraderSummary,
} from './types';
import {
    readUpgraderUrl,
    replaceUpgraderUrl,
    type UpgraderProfilesUrlState,
    type UpgraderTab,
} from './upgraderUrlState';

type LibraryGroup<T> = { key: string; label: string; items: T[] };

const groupByLibrary = <T extends { arrInstanceName?: string | null; libraryName?: string | null; arrType?: string | null; libraryKey?: string | null }>(
    entries: T[],
    libraryOrder: Array<{ id?: string; name?: string; type?: string }> = [],
): LibraryGroup<T>[] => {
    const groups = new Map<string, LibraryGroup<T>>();
    const ensure = (key: string, label: string) => {
        if (!groups.has(key)) groups.set(key, { key, label, items: [] });
        return groups.get(key)!;
    };

    for (const lib of libraryOrder) {
        const key = lib.id || `${lib.type || 'arr'}:${lib.name || 'unknown'}`;
        ensure(key, lib.name || (lib.type === 'radarr' ? 'Radarr' : lib.type === 'sonarr' ? 'Sonarr' : 'Library'));
    }

    for (const entry of entries) {
        const label = entry.libraryName || entry.arrInstanceName || (entry.arrType === 'radarr' ? 'Radarr' : entry.arrType === 'sonarr' ? 'Sonarr' : 'Library');
        const key = entry.libraryKey || `name:${label}`;
        ensure(key, label).items.push(entry);
    }

    const ordered = [...groups.values()];
    ordered.sort((a, b) => a.label.localeCompare(b.label));
    return ordered;
};

const formatIndexAge = (generatedAt: string | null) => {
    if (!generatedAt) return 'never built';
    const ageMs = Date.now() - Date.parse(generatedAt);
    if (!Number.isFinite(ageMs) || ageMs < 0) return 'just now';
    const hours = Math.floor(ageMs / (60 * 60 * 1000));
    if (hours < 1) return 'under 1h ago';
    if (hours < 48) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
};

const entryTime = (entry: UpgraderAuditEntry) => entry.timestamp || entry.at || null;

const isUpgraderDisabledError = (error: unknown) => {
    const msg = String((error as Error)?.message || error || '').toLowerCase();
    return msg.includes('library upgrader is disabled') || msg.includes('plex-only');
};

export const UpgraderDashboard: React.FC = () => {
    const initialUrl = useMemo(() => readUpgraderUrl(), []);
    const [toasts, setToasts] = useState<ToastMessage[]>([]);
    const [loading, setLoading] = useState(true);
    const [rebuilding, setRebuilding] = useState(false);
    const [featureEnabled, setFeatureEnabled] = useState(false);
    const [status, setStatus] = useState<UpgraderStatus | null>(null);
    const [summary, setSummary] = useState<UpgraderSummary | null>(null);
    const [recentGrabs, setRecentGrabs] = useState<UpgraderAuditEntry[]>([]);
    const [libraries, setLibraries] = useState<Array<{ id: string; name: string; type: string }>>([]);
    const [dryRun, setDryRun] = useState<UpgraderHuntResponse | null>(null);
    const [dryRunning, setDryRunning] = useState(false);
    const [activeTab, setActiveTab] = useState<UpgraderTab>(initialUrl.tab);
    const [profilesUrl, setProfilesUrl] = useState<UpgraderProfilesUrlState>(initialUrl.profiles);

    const addToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
        setToasts((prev) => pushToast(prev, message, type === 'info' ? 'success' : type));
    }, []);

    const syncUpgraderUrl = useCallback(() => {
        replaceUpgraderUrl({
            tab: activeTab,
            profiles: profilesUrl,
        });
    }, [activeTab, profilesUrl]);

    useEffect(() => {
        syncUpgraderUrl();
    }, [syncUpgraderUrl]);

    useEffect(() => {
        const onPopState = () => {
            const next = readUpgraderUrl();
            setActiveTab(next.tab);
            setProfilesUrl(next.profiles);
        };
        window.addEventListener('popstate', onPopState);
        return () => window.removeEventListener('popstate', onPopState);
    }, []);

    const handleTabChange = useCallback((tab: UpgraderTab) => {
        setActiveTab(tab);
    }, []);

    const handleProfilesUrlChange = useCallback((patch: Partial<UpgraderProfilesUrlState>) => {
        setProfilesUrl((prev) => ({ ...prev, ...patch }));
    }, []);

    const loadData = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const configData = await apiFetch('/api/config');
            const enabled = !!configData?.settings?.upgraderEnabled;
            setFeatureEnabled(enabled);
            if (!enabled) return;

            const [statusData, summaryData, auditData, profilesData] = await Promise.all([
                apiFetch('/api/upgrader/status'),
                apiFetch('/api/upgrader/summary'),
                apiFetch('/api/upgrader/audit?limit=40'),
                apiFetch('/api/upgrader/profiles').catch(() => null),
            ]);

            setStatus(statusData || null);
            setSummary(summaryData || null);
            const indexedLibraries = Array.isArray(summaryData?.libraries)
                ? summaryData.libraries.map((lib: any) => ({
                    id: String(lib.key || lib.id),
                    name: String(lib.name || 'Library'),
                    type: String(lib.type || 'arr'),
                }))
                : [];
            const configuredLibraries = Array.isArray(profilesData?.libraries)
                ? profilesData.libraries.map((lib: any) => ({
                    id: String(lib.key || lib.id),
                    name: String(lib.name || 'Library'),
                    type: String(lib.type || 'arr'),
                }))
                : [];
            const instanceList = Array.isArray(profilesData?.instances)
                ? profilesData.instances.map((instance: any) => ({
                    id: String(instance.id),
                    name: String(instance.name || (instance.type === 'radarr' ? 'Radarr' : 'Sonarr')),
                    type: String(instance.type || 'arr'),
                }))
                : [];
            setLibraries(indexedLibraries.length ? indexedLibraries : (configuredLibraries.length ? configuredLibraries : instanceList));

            const grabs = (Array.isArray(auditData?.entries) ? auditData.entries : [])
                .filter((entry: UpgraderAuditEntry) => entry.action === 'upgrade' && entry.success !== false && !entry.dryRun)
                .slice(0, 48);
            setRecentGrabs(grabs);
        } catch (e: any) {
            if (isUpgraderDisabledError(e)) {
                setFeatureEnabled(false);
                return;
            }
            addToast(e.message || 'Failed to load Quality Hunt', 'error');
        } finally {
            if (!silent) setLoading(false);
        }
    }, [addToast]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    useEffect(() => {
        if (status?.rebuildInProgress) {
            setRebuilding(true);
        } else if (rebuilding) {
            setRebuilding(false);
        }
    }, [status?.rebuildInProgress, rebuilding]);

    useEffect(() => {
        if (!rebuilding && !status?.rebuildInProgress) return undefined;
        const poll = window.setInterval(() => {
            loadData(true);
        }, 2500);
        return () => window.clearInterval(poll);
    }, [rebuilding, status?.rebuildInProgress, loadData]);

    const handleRebuild = async () => {
        try {
            await apiFetch('/api/upgrader/rebuild', { method: 'POST' });
            addToast('Library index rebuild started.', 'success');
            setRebuilding(true);
            await loadData(true);
        } catch (e: any) {
            addToast(e.message || 'Failed to rebuild index', 'error');
        }
    };

    const handleDryRun = async () => {
        setActiveTab('overview');
        setDryRunning(true);
        setDryRun(null);
        addToast('Dry run started — searching Arr for a small sample per library…', 'info');
        try {
            const result = await apiFetch('/api/upgrader/hunt', {
                method: 'POST',
                body: JSON.stringify({ dryRun: true, limit: 2 }), // per-library sample size
            }) as UpgraderHuntResponse;
            setDryRun(result || null);
            if (!result?.ran) {
                addToast(result?.reason || 'Dry run did not run.', 'error');
            } else if (!(Number(result.searched) > 0)) {
                addToast(result.reason || 'Dry run found no eligible titles to search.', 'error');
            } else {
                addToast(
                    `Dry run done: ${result.wouldGrab || 0} would grab · ${result.skipped || 0} skipped · ${result.searched || 0} searched.`,
                    'success',
                );
            }
        } catch (e: any) {
            addToast(e.message || 'Dry run failed (request may have timed out — try Refresh index first).', 'error');
        } finally {
            setDryRunning(false);
        }
    };

    const grabsByLibrary = useMemo(
        () => groupByLibrary(
            recentGrabs.map((entry) => ({
                ...entry,
                libraryName: entry.libraryName || entry.arrInstanceName,
                libraryKey: entry.libraryKey
                    || (entry.arrInstanceId ? `${entry.arrType || 'arr'}:${entry.arrInstanceId}` : undefined),
            })),
            libraries,
        ),
        [recentGrabs, libraries],
    );

    const dryRunByLibrary = useMemo(() => {
        if (!dryRun) return [];
        const results = dryRun.results || [];
        const byKey = new Map<string, {
            key: string;
            label: string;
            available: number;
            considered: number;
            indexed: number;
            withFiles: number;
            items: UpgraderHuntResult[];
        }>();

        for (const lib of libraries) {
            const key = lib.id || `${lib.type || 'arr'}:${lib.name || 'unknown'}`;
            byKey.set(key, {
                key,
                label: lib.name || (lib.type === 'radarr' ? 'Radarr' : 'Sonarr'),
                available: 0,
                considered: 0,
                indexed: 0,
                withFiles: 0,
                items: [],
            });
        }

        for (const lib of (dryRun.libraries || [])) {
            const existing = byKey.get(lib.key);
            byKey.set(lib.key, {
                key: lib.key,
                label: lib.label || existing?.label || 'Library',
                available: Number(lib.available || 0),
                considered: Number(lib.considered || 0),
                indexed: Number(lib.indexed || 0),
                withFiles: Number(lib.withFiles || 0),
                items: results.filter((entry) => entry.libraryKey === lib.key),
            });
        }

        // Results without a libraryStats row (older responses) still land in a group.
        for (const entry of results) {
            const key = entry.libraryKey || `name:${entry.libraryName || 'Library'}`;
            if (!byKey.has(key)) {
                byKey.set(key, {
                    key,
                    label: entry.libraryName || 'Library',
                    available: 0,
                    considered: 0,
                    indexed: 0,
                    withFiles: 0,
                    items: [],
                });
            }
            const group = byKey.get(key)!;
            if (!group.items.some((item) => item === entry)) group.items.push(entry);
        }

        return [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label));
    }, [dryRun, libraries]);

    const tabButtonClass = (tab: UpgraderTab) =>
        `inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold border transition-colors ${
            activeTab === tab ? 'bg-plex text-background border-plex' : 'bg-white/5 text-muted border-white/10 hover:text-text'
        }`;

    const maxActions = status?.maxActionsPerHour ?? 25;
    const usedActions = status?.recentUpgradeCount ?? 0;
    const remainingActions = Math.max(0, maxActions - usedActions);
    const minDelta = status?.minScoreDelta ?? 10;
    const prefs = status?.preferences;

    return (
        <div className="page-shell">
            <ToastContainer toasts={toasts} setToasts={setToasts} />
            <div className="flex flex-col gap-6">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <ArrowUpCircle className="w-8 h-8 text-plex" />
                            <h1 className="page-title">Quality Hunt</h1>
                        </div>
                        <p className="text-sm text-muted max-w-2xl">
                            Hands-off Sonarr/Radarr upgrades. The hunt finds higher-scoring releases and grabs them on a schedule.
                        </p>
                    </div>
                    {featureEnabled && (
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-border text-text font-bold hover:border-plex/40 transition-colors disabled:opacity-50"
                                onClick={handleDryRun}
                                disabled={dryRunning || rebuilding || !!status?.rebuildInProgress}
                            >
                                <FlaskConical className={`w-4 h-4 ${dryRunning ? 'animate-pulse' : ''}`} />
                                {dryRunning ? 'Dry run…' : 'Dry run'}
                            </button>
                            <button
                                type="button"
                                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-plex text-background font-bold hover:bg-plex-hover transition-colors disabled:opacity-50"
                                onClick={handleRebuild}
                                disabled={rebuilding || !!status?.rebuildInProgress}
                            >
                                <RefreshCw className={`w-4 h-4 ${rebuilding || status?.rebuildInProgress ? 'animate-spin' : ''}`} />
                                {rebuilding || status?.rebuildInProgress ? 'Refreshing…' : 'Refresh index'}
                            </button>
                        </div>
                    )}
                </div>

                {!featureEnabled && (
                    <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-6 text-center">
                        <h3 className="text-xl font-bold text-plex mb-2">Quality Hunt is off</h3>
                        <p className="text-sm text-muted mb-3">Turn it on to index Arr libraries and run the auto-hunt.</p>
                        <p className="text-xs text-muted mb-4">Settings → Quality Hunt → enable, then save.</p>
                        <a
                            href={portalUrl('/settings#upgrader')}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-plex text-background font-bold no-underline hover:bg-plex-hover transition-colors"
                        >
                            <SettingsIcon className="w-4 h-4" />
                            Open Settings
                        </a>
                    </div>
                )}

                {featureEnabled && (
                    <>
                        <div className="flex flex-wrap gap-2">
                            <button type="button" className={tabButtonClass('overview')} onClick={() => handleTabChange('overview')} title="Hunt status and recent grabs">
                                <LayoutDashboard className="w-4 h-4" />
                                Overview
                            </button>
                            <button type="button" className={tabButtonClass('history')} onClick={() => handleTabChange('history')} title="What Quality Hunt grabbed or skipped">
                                <History className="w-4 h-4" />
                                Activity
                            </button>
                            <button type="button" className={tabButtonClass('exclusions')} onClick={() => handleTabChange('exclusions')} title="Titles the hunt should ignore">
                                <Ban className="w-4 h-4" />
                                Skip list
                            </button>
                            <button type="button" className={tabButtonClass('profiles')} onClick={() => handleTabChange('profiles')} title="Tune Arr custom formats / quality profiles">
                                <Settings2 className="w-4 h-4" />
                                Arr scores
                            </button>
                        </div>

                        {loading ? (
                            <Loader isLoading />
                        ) : (
                            <>
                                {activeTab === 'overview' && (
                                    <div className="flex flex-col gap-6">
                                        {!status?.automationEnabled && (
                                            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                                <p className="text-sm text-amber-100">
                                                    Auto-hunt is off. Nothing will be grabbed until you enable it.
                                                </p>
                                                <a
                                                    href={portalUrl('/settings#upgrader')}
                                                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-plex text-background text-xs font-bold no-underline hover:bg-plex-hover shrink-0"
                                                >
                                                    <SettingsIcon className="w-3.5 h-3.5" />
                                                    Enable in Settings
                                                </a>
                                            </div>
                                        )}

                                        <section className="rounded-2xl border border-border/60 bg-card/40 p-5 space-y-4">
                                            <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Status</h2>
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                                <div className="rounded-xl border border-border/50 bg-background/40 px-3 py-3">
                                                    <div className="text-[11px] uppercase tracking-wide text-muted">Auto-hunt</div>
                                                    <div className={`mt-1 text-lg font-bold ${status?.automationEnabled ? 'text-emerald-300' : 'text-amber-200'}`}>
                                                        {status?.automationEnabled ? 'On' : 'Off'}
                                                    </div>
                                                </div>
                                                <div className="rounded-xl border border-border/50 bg-background/40 px-3 py-3">
                                                    <div className="text-[11px] uppercase tracking-wide text-muted">Grabs this hour</div>
                                                    <div className="mt-1 text-lg font-bold text-text">
                                                        {usedActions}/{maxActions}
                                                        <span className="ml-1 text-xs font-semibold text-muted">({remainingActions} left)</span>
                                                    </div>
                                                </div>
                                                <div className="rounded-xl border border-border/50 bg-background/40 px-3 py-3">
                                                    <div className="text-[11px] uppercase tracking-wide text-muted">Index</div>
                                                    <div className="mt-1 text-lg font-bold text-text">
                                                        {summary?.totalItems ?? status?.itemCount ?? 0}
                                                        <span className="ml-1 text-xs font-semibold text-muted">· {formatIndexAge(summary?.generatedAt || status?.generatedAt || null)}</span>
                                                    </div>
                                                </div>
                                                <div className="rounded-xl border border-border/50 bg-background/40 px-3 py-3">
                                                    <div className="text-[11px] uppercase tracking-wide text-muted">Libraries</div>
                                                    <div className="mt-1 text-lg font-bold text-text">
                                                        {libraries.length || (status?.arrConfigured ? 'Configured' : 'None')}
                                                    </div>
                                                </div>
                                            </div>
                                            {summary && (
                                                <p className="text-xs text-muted">
                                                    {summary.upgradeCandidates ?? 0} titles with files on disk
                                                    {summary.avgCustomFormatScore != null ? ` · avg Arr score ${summary.avgCustomFormatScore}` : ''}
                                                    {' · '}min score gain {minDelta}
                                                    {' · '}libraries are Sonarr/Radarr root folders
                                                </p>
                                            )}
                                        </section>

                                        <section className="rounded-2xl border border-border/60 bg-card/40 p-5 space-y-3">
                                            <h2 className="text-sm font-bold uppercase tracking-wide text-muted">How it hunts</h2>
                                            <ol className="space-y-2 text-sm text-muted list-decimal list-inside">
                                                <li>
                                                    <span className="text-text font-semibold">Fair per library.</span>{' '}
                                                    Each configured Arr root folder gets a turn every cycle (round-robin). Shared Sonarr/Radarr instances with multiple roots are hunted separately.
                                                </li>
                                                <li>
                                                    <span className="text-text font-semibold">Worst scores first inside each library.</span>{' '}
                                                    Within a library it tries the lowest Arr scores first, capped per cycle so it keeps moving.
                                                </li>
                                                <li>
                                                    <span className="text-text font-semibold">No repeat loops.</span>{' '}
                                                    After a grab or a “nothing better” search (~7 days), that title cools down so the next cycle moves on.
                                                </li>
                                                <li>
                                                    <span className="text-text font-semibold">TV targets the weakest season.</span>{' '}
                                                    Interactive Arr release search for that season (or the movie) — not a whole-library Arr command.
                                                </li>
                                                <li>
                                                    <span className="text-text font-semibold">Never downgrade resolution.</span>{' '}
                                                    A 1080p season pack cannot beat a 4K season floor. Score must beat current by at least {minDelta}
                                                    {prefs ? (
                                                        <>
                                                            {', with portal boosts for '}
                                                            {[
                                                                prefs.preferDolbyVisionHdr !== false ? 'DV/HDR' : null,
                                                                prefs.preferAtmos !== false ? 'Atmos' : null,
                                                                prefs.preferRemux !== false ? 'Remux' : null,
                                                                prefs.preferSeasonPacks !== false ? 'season packs' : null,
                                                            ].filter(Boolean).join(', ') || 'your enabled prefs'}
                                                            .
                                                        </>
                                                    ) : '.'}
                                                </li>
                                            </ol>
                                        </section>

                                        {(dryRunning || dryRun) && (
                                            <section className="space-y-4">
                                                <div className="flex flex-wrap items-center justify-between gap-3">
                                                    <div>
                                                        <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Dry run preview</h2>
                                                        <p className="text-xs text-muted mt-1">
                                                            {dryRunning
                                                                ? 'Searching Arr now (small sample per library). This can take a minute…'
                                                                : (
                                                                    <>
                                                                        No grabs were sent.
                                                                        {' '}{dryRun?.wouldGrab || 0} would grab
                                                                        {' · '}{dryRun?.skipped || 0} skipped
                                                                        {' · '}{dryRun?.searched || 0} searched
                                                                        {(dryRun?.libraries || []).length ? ` · ${(dryRun?.libraries || []).length} libraries` : ''}.
                                                                        {dryRun?.reason ? ` ${dryRun.reason}` : ''}
                                                                    </>
                                                                )}
                                                        </p>
                                                    </div>
                                                    {!dryRunning && (
                                                        <button
                                                            type="button"
                                                            className="text-xs font-bold text-muted hover:text-text"
                                                            onClick={() => setDryRun(null)}
                                                        >
                                                            Clear preview
                                                        </button>
                                                    )}
                                                </div>
                                                {dryRunning && (
                                                    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6 flex items-center gap-3 text-sm text-amber-100">
                                                        <FlaskConical className="w-5 h-5 animate-pulse shrink-0" />
                                                        Dry run in progress — waiting on Sonarr/Radarr release search…
                                                    </div>
                                                )}
                                                {!dryRunning && dryRun && dryRunByLibrary.length === 0 && (
                                                    <div className="rounded-2xl border border-border/60 bg-card/40 p-6 text-center">
                                                        <p className="text-sm text-muted">
                                                            {dryRun.reason || 'No titles were searched. Refresh the index if your library looks empty.'}
                                                        </p>
                                                    </div>
                                                )}
                                                {!dryRunning && dryRunByLibrary.map((group) => {
                                                    const would = group.items.filter((entry) => entry.success);
                                                    const skipped = group.items.filter((entry) => !entry.success);
                                                    return (
                                                        <div key={`dry-${group.key}`} className="rounded-2xl border border-border/60 bg-card/40 p-4 space-y-3">
                                                            <div className="flex items-center justify-between gap-2">
                                                                <h3 className="text-sm font-bold text-text">{group.label}</h3>
                                                                <span className="text-[11px] text-muted">
                                                                    {would.length} would grab · {skipped.length} skipped
                                                                    {group.withFiles != null ? ` · ${group.withFiles} with files in index` : ''}
                                                                </span>
                                                            </div>
                                                            {group.items.length === 0 && (
                                                                <p className="text-xs text-muted">
                                                                    {(group.withFiles || group.available || 0) === 0
                                                                        ? 'No titles with files in the Quality Hunt index for this library. Click Refresh index, wait for it to finish, then dry-run again.'
                                                                        : 'Eligible titles exist in the index but none were sampled (unexpected). Try dry-run again.'}
                                                                </p>
                                                            )}
                                                            {would.length > 0 && (
                                                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                                                                    {would.map((entry: UpgraderHuntResult) => {
                                                                        const thumb = entry.thumbUrl ? resolvePortalAssetUrl(entry.thumbUrl) : '';
                                                                        const delta = entry.scoreDelta ?? (
                                                                            entry.currentScore != null && entry.candidateScore != null
                                                                                ? entry.candidateScore - entry.currentScore
                                                                                : null
                                                                        );
                                                                        return (
                                                                            <div key={`dry-${entry.ratingKey}-${entry.releaseTitle || ''}`} className="min-w-0 flex flex-col gap-2">
                                                                                <div className="relative rounded-xl overflow-hidden bg-background border border-amber-500/20 aspect-[2/3] w-full">
                                                                                    {thumb ? (
                                                                                        <img src={thumb} alt={entry.title} className="w-full h-full object-cover" />
                                                                                    ) : (
                                                                                        <div className="w-full h-full flex items-center justify-center p-3 text-center bg-white/5">
                                                                                            <span className="text-xs font-bold text-muted line-clamp-3">{entry.title}</span>
                                                                                        </div>
                                                                                    )}
                                                                                    <span className="absolute top-2 left-2 text-[10px] font-bold px-2 py-1 rounded-full border bg-amber-500/15 border-amber-500/30 text-amber-100">
                                                                                        Would grab
                                                                                    </span>
                                                                                    {delta != null && (
                                                                                        <span className="absolute top-2 right-2 text-[10px] font-bold px-2 py-1 rounded-full border bg-emerald-500/15 border-emerald-500/30 text-emerald-300">
                                                                                            +{delta}
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                                <div className="px-0.5 space-y-0.5">
                                                                                    <div className="text-xs font-medium text-text line-clamp-2 leading-tight">{entry.title}</div>
                                                                                    <div className="text-[10px] text-muted line-clamp-2">
                                                                                        {[
                                                                                            entry.currentScore != null && entry.candidateScore != null
                                                                                                ? `${entry.currentScore} → ${entry.candidateScore}`
                                                                                                : null,
                                                                                            entry.releaseTitle,
                                                                                        ].filter(Boolean).join(' · ')}
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            )}
                                                            {skipped.length > 0 && (
                                                                <div className="space-y-2">
                                                                    {skipped.map((entry) => (
                                                                        <div key={`skip-${entry.ratingKey}`} className="rounded-lg border border-border/50 bg-background/40 px-3 py-2">
                                                                            <div className="text-xs font-semibold text-text">{entry.title}</div>
                                                                            <div className="text-[11px] text-muted mt-0.5">
                                                                                {entry.reason || 'No better release found'}
                                                                                {entry.currentScore != null ? ` · current score ${entry.currentScore}` : ''}
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </section>
                                        )}

                                        <section className="space-y-4">
                                            <div className="flex items-center justify-between gap-3">
                                                <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Just hunted</h2>
                                                <button
                                                    type="button"
                                                    className="text-xs font-bold text-plex hover:underline"
                                                    onClick={() => handleTabChange('history')}
                                                >
                                                    Full activity
                                                </button>
                                            </div>
                                            {grabsByLibrary.length === 0 ? (
                                                <div className="rounded-2xl border border-border/60 bg-card/40 p-8 text-center">
                                                    <p className="text-sm text-muted">
                                                        No libraries indexed yet. Refresh the index, or run a dry run to preview candidates.
                                                    </p>
                                                </div>
                                            ) : (
                                                grabsByLibrary.map((group) => (
                                                    <div key={group.key} className="rounded-2xl border border-border/60 bg-card/40 p-4 space-y-3">
                                                        <div className="flex items-center justify-between gap-2">
                                                            <h3 className="text-sm font-bold text-text">{group.label}</h3>
                                                            <span className="text-[11px] text-muted">
                                                                {group.items.length ? `${group.items.length} recent` : 'No recent grabs'}
                                                            </span>
                                                        </div>
                                                        {group.items.length === 0 ? (
                                                            <p className="text-xs text-muted">Nothing grabbed from this library yet.</p>
                                                        ) : (
                                                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                                                                {group.items.slice(0, 12).map((entry) => {
                                                                    const thumb = entry.thumbUrl ? resolvePortalAssetUrl(entry.thumbUrl) : '';
                                                                    const when = entryTime(entry);
                                                                    const delta = entry.currentScore != null && entry.candidateScore != null
                                                                        ? entry.candidateScore - entry.currentScore
                                                                        : null;
                                                                    return (
                                                                        <div key={entry.id} className="min-w-0 flex flex-col gap-2">
                                                                            <div className="relative rounded-xl overflow-hidden bg-background border border-white/5 aspect-[2/3] w-full">
                                                                                {thumb ? (
                                                                                    <img src={thumb} alt={entry.title} className="w-full h-full object-cover" />
                                                                                ) : (
                                                                                    <div className="w-full h-full flex items-center justify-center p-3 text-center bg-white/5">
                                                                                        <span className="text-xs font-bold text-muted line-clamp-3">{entry.title}</span>
                                                                                    </div>
                                                                                )}
                                                                                {delta != null && (
                                                                                    <span className="absolute top-2 right-2 text-[10px] font-bold px-2 py-1 rounded-full border bg-emerald-500/15 border-emerald-500/30 text-emerald-300">
                                                                                        +{delta}
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                            <div className="px-0.5 space-y-0.5">
                                                                                <div className="text-xs font-medium text-text line-clamp-2 leading-tight">{entry.title}</div>
                                                                                <div className="text-[10px] text-muted line-clamp-2">
                                                                                    {[
                                                                                        entry.releaseTitle,
                                                                                        when ? new Date(when).toLocaleString() : null,
                                                                                    ].filter(Boolean).join(' · ')}
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))
                                            )}
                                        </section>
                                    </div>
                                )}

                                {activeTab === 'history' && <UpgraderHistoryPanel />}

                                {activeTab === 'exclusions' && (
                                    <UpgraderExclusionsPanel addToast={addToast} onChanged={() => loadData(true)} />
                                )}

                                {activeTab === 'profiles' && (
                                    <UpgraderProfilesTab
                                        initialInstanceId={profilesUrl.instance}
                                        initialFormatPage={profilesUrl.formatPage}
                                        initialProfilePage={profilesUrl.profilePage}
                                        onUrlStateChange={handleProfilesUrlChange}
                                    />
                                )}
                            </>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};
