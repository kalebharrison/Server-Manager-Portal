import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ArrowUpCircle,
    RefreshCw,
    Settings as SettingsIcon,
    History,
    Ban,
    Settings2,
    LayoutDashboard,
    FlaskConical,
    Download,
    HardDrive,
    Crosshair,
    ShieldCheck,
} from 'lucide-react';
import { apiFetch } from '../shared/api';
import { portalUrl } from '../shared/basePath';
import { Loader, ToastContainer, pushToast } from '../shared/toast';
import type { ToastMessage } from '../shared/types';
import { UpgraderHistoryPanel } from './UpgraderHistoryPanel';
import { UpgraderProfilesTab } from './UpgraderProfilesTab';
import { QcClientsPanel } from './QcClientsPanel';
import { QcDownloadsPanel } from './QcDownloadsPanel';
import { QcIntegrityPanel } from './QcIntegrityPanel';
import { QcPolicySummary } from './QcPolicySummary';
import { QcRulesPanel } from './QcRulesPanel';
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

const CHROME_TABS: Array<{ id: UpgraderTab; label: string; icon: React.ReactNode; title: string }> = [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard className="w-4 h-4" />, title: 'Active downloads, timing, and recent activity' },
    { id: 'hunt', label: 'Hunt', icon: <Crosshair className="w-4 h-4" />, title: 'How it hunts and dry-run preview' },
    { id: 'integrity', label: 'Integrity', icon: <ShieldCheck className="w-4 h-4" />, title: 'Validate library files and replace corrupt ones' },
    { id: 'downloads', label: 'Downloads', icon: <Download className="w-4 h-4" />, title: 'Download health, strikes, and cleanup' },
    { id: 'clients', label: 'Clients', icon: <HardDrive className="w-4 h-4" />, title: 'Download client connection and blocked extensions' },
    { id: 'rules', label: 'Rules', icon: <Ban className="w-4 h-4" />, title: 'Full policy: timing, caps, hunt targets, skip list' },
    { id: 'activity', label: 'Activity', icon: <History className="w-4 h-4" />, title: 'Live hunt grabs and cleanup history' },
];

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
    return msg.includes('library upgrader is disabled')
        || msg.includes('quality control is disabled')
        || msg.includes('plex-only');
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
                    name: String(instance.name || (
                        instance.type === 'radarr' ? 'Radarr'
                            : instance.type === 'lidarr' ? 'Lidarr'
                                : 'Sonarr'
                    )),
                    type: String(instance.type || 'arr'),
                }))
                : [];
            // Prefer configured Arr libraries (includes Lidarr). Fall back to indexed / instances.
            setLibraries(configuredLibraries.length
                ? configuredLibraries
                : (indexedLibraries.length ? indexedLibraries : instanceList));

            const grabs = (Array.isArray(auditData?.entries) ? auditData.entries : [])
                .filter((entry: UpgraderAuditEntry) => entry.action === 'upgrade' && entry.success !== false && !entry.dryRun)
                .slice(0, 48);
            setRecentGrabs(grabs);
        } catch (e: any) {
            if (isUpgraderDisabledError(e)) {
                setFeatureEnabled(false);
                return;
            }
            addToast(e.message || 'Failed to load Quality Control', 'error');
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
        setActiveTab('hunt');
        setDryRunning(true);
        setDryRun(null);
        addToast('Dry run started — searching Arr for a small sample per library…', 'info');
        try {
            const result = await apiFetch('/api/upgrader/hunt', {
                method: 'POST',
                body: JSON.stringify({ dryRun: true, limit: 2 }),
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
        return (dryRun.libraries || [])
            .map((lib) => ({
                key: lib.key,
                label: lib.label || 'Library',
                available: Number(lib.available || 0),
                considered: Number(lib.considered || 0),
                indexed: Number(lib.indexed || 0),
                withFiles: Number(lib.withFiles || 0),
                items: results.filter((entry) => entry.libraryKey === lib.key),
            }))
            .filter((group) => group.withFiles > 0 || group.available > 0 || group.considered > 0 || group.items.length > 0)
            .sort((a, b) => a.label.localeCompare(b.label));
    }, [dryRun]);

    const emptyDryRunMessage = (group: {
        withFiles: number;
        available: number;
        considered: number;
    }) => {
        if ((group.withFiles || 0) === 0) {
            return 'No titles with files in the Quality Control index for this library. Click Refresh index, wait for it to finish, then dry-run again.';
        }
        if ((group.available || 0) === 0) {
            return 'Titles are on disk, but none are hunt-eligible yet (scores still unknown, excluded, or cooling down).';
        }
        if ((group.considered || 0) === 0) {
            return 'Eligible titles were queued, but this library was not searched (dry run stopped early). Try again.';
        }
        return 'Nothing sampled from this library. Try dry-run again.';
    };

    const tabButtonClass = (tab: UpgraderTab) =>
        `inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold border transition-colors ${
            activeTab === tab ? 'bg-plex text-background border-plex' : 'bg-white/5 text-muted border-white/10 hover:text-text'
        }`;

    const maxActions = status?.maxActionsPerHour ?? 25;
    const usedActions = status?.recentUpgradeCount ?? 0;
    const remainingActions = Math.max(0, maxActions - usedActions);
    const minDelta = status?.minScoreDelta ?? 10;
    const prefs = status?.preferences;
    const killsByReason = status?.qcMetrics?.killsByReason || {};
    const killEntries = Object.entries(killsByReason).filter(([, n]) => Number(n) > 0);
    const activeByLibrary = Array.isArray(status?.activeDownloadsByLibrary)
        ? status!.activeDownloadsByLibrary!
        : [];
    const activeDownloadTotal = Number(status?.activeDownloadTotal) || 0;
    const downloadCap = Math.max(1, Number(status?.maxDownloadsPerLibrary) || 5);

    return (
        <div className="page-shell">
            <ToastContainer toasts={toasts} setToasts={setToasts} />
            <div className="flex flex-col gap-6">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <ArrowUpCircle className="w-8 h-8 text-plex" />
                            <h1 className="page-title">Quality Control</h1>
                        </div>
                        <p className="text-sm text-muted max-w-2xl">
                            Download health and Sonarr/Radarr/Lidarr upgrades. Hunt better releases and clean doomed queues.
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
                                {dryRunning ? 'Dry run…' : 'Dry run hunt'}
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
                        <h3 className="text-xl font-bold text-plex mb-2">Quality Control is off</h3>
                        <p className="text-sm text-muted mb-3">Turn it on to index Arr libraries, hunt upgrades, and monitor download health.</p>
                        <p className="text-xs text-muted mb-4">Settings → Quality Control → enable, then save.</p>
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
                            {CHROME_TABS.map((tab) => (
                                <button
                                    key={tab.id}
                                    type="button"
                                    className={tabButtonClass(tab.id)}
                                    onClick={() => handleTabChange(tab.id)}
                                    title={tab.title}
                                >
                                    {tab.icon}
                                    {tab.label}
                                </button>
                            ))}
                            {activeTab === 'profiles' && (
                                <button
                                    type="button"
                                    className={tabButtonClass('profiles')}
                                    onClick={() => handleTabChange('profiles')}
                                    title="Tune Arr custom formats / quality profiles"
                                >
                                    <Settings2 className="w-4 h-4" />
                                    Arr scores
                                </button>
                            )}
                        </div>

                        {loading ? (
                            <Loader isLoading />
                        ) : (
                            <>
                                {activeTab === 'overview' && (
                                    <div className="flex flex-col gap-6">
                                        {(!status?.automationEnabled || !status?.cleanupAutomationEnabled) && (
                                            <div className="space-y-3">
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
                                                            Open Settings
                                                        </a>
                                                    </div>
                                                )}
                                                {!status?.cleanupAutomationEnabled && (
                                                    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                                        <p className="text-sm text-amber-100">
                                                            Download cleanup automation is off. Manual cleanup still works on the Downloads tab.
                                                        </p>
                                                        <a
                                                            href={portalUrl('/settings#upgrader')}
                                                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-plex text-background text-xs font-bold no-underline hover:bg-plex-hover shrink-0"
                                                        >
                                                            <SettingsIcon className="w-3.5 h-3.5" />
                                                            Open Settings
                                                        </a>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        <section className="rounded-2xl border border-border/60 bg-card/40 p-5 space-y-4">
                                            <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Automation</h2>
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                                <div className="rounded-xl border border-border/50 bg-background/40 px-3 py-3">
                                                    <div className="text-[11px] uppercase tracking-wide text-muted">Auto-hunt</div>
                                                    <div className={`mt-1 text-lg font-bold ${status?.automationEnabled ? 'text-emerald-300' : 'text-amber-200'}`}>
                                                        {status?.automationEnabled ? 'On' : 'Off'}
                                                    </div>
                                                    <p className="mt-1 text-[11px] text-muted">
                                                        Missing TV {status?.huntMissingEpisodes === false ? 'off' : 'on'}
                                                        {' · '}Movies {status?.huntAvailableMovies === false ? 'off' : 'on'}
                                                    </p>
                                                </div>
                                                <div className="rounded-xl border border-border/50 bg-background/40 px-3 py-3">
                                                    <div className="text-[11px] uppercase tracking-wide text-muted">Cleanup</div>
                                                    <div className={`mt-1 text-lg font-bold ${status?.cleanupAutomationEnabled ? 'text-emerald-300' : 'text-amber-200'}`}>
                                                        {status?.cleanupAutomationEnabled ? 'On' : 'Off'}
                                                    </div>
                                                    <p className="mt-1 text-[11px] text-muted">
                                                        {status?.qcThresholds?.maxStrikes ?? 3} strikes to kill
                                                    </p>
                                                </div>
                                                <div className="rounded-xl border border-border/50 bg-background/40 px-3 py-3">
                                                    <div className="text-[11px] uppercase tracking-wide text-muted">Integrity</div>
                                                    <div className={`mt-1 text-lg font-bold ${status?.integrityEnabled ? (status?.integrityAutomationEnabled ? 'text-emerald-300' : 'text-amber-200') : 'text-amber-200'}`}>
                                                        {!status?.integrityEnabled
                                                            ? 'Off'
                                                            : status?.integrityAutomationEnabled
                                                                ? 'Auto'
                                                                : 'Manual'}
                                                    </div>
                                                    <p className="mt-1 text-[11px] text-muted">
                                                        {status?.integrity?.setup?.ready
                                                            ? 'Tools ready'
                                                            : status?.integrityEnabled
                                                                ? 'Check mounts/tools'
                                                                : 'Disabled'}
                                                    </p>
                                                </div>
                                                <div className="rounded-xl border border-border/50 bg-background/40 px-3 py-3">
                                                    <div className="text-[11px] uppercase tracking-wide text-muted">Grabs this hour</div>
                                                    <div className="mt-1 text-lg font-bold text-text">
                                                        {usedActions}/{maxActions}
                                                        <span className="ml-1 text-xs font-semibold text-muted">({remainingActions} left)</span>
                                                    </div>
                                                    <p className="mt-1 text-[11px] text-muted">
                                                        Cap {downloadCap} DLs / library
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                                <div className="rounded-xl border border-border/50 bg-background/40 px-3 py-3">
                                                    <div className="text-[11px] uppercase tracking-wide text-muted">Active downloads</div>
                                                    <div className="mt-1 text-lg font-bold text-text">{activeDownloadTotal}</div>
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
                                                <div className="rounded-xl border border-border/50 bg-background/40 px-3 py-3">
                                                    <div className="text-[11px] uppercase tracking-wide text-muted">Clients</div>
                                                    <div className="mt-1 text-sm font-bold text-text">
                                                        qBit {status?.clientsConfigured?.qbit ? '✓' : '—'}
                                                        {' · '}SAB {status?.clientsConfigured?.sab ? '✓' : '—'}
                                                    </div>
                                                </div>
                                            </div>
                                            {summary && (
                                                <p className="text-xs text-muted">
                                                    {summary.upgradeCandidates ?? 0} titles with files
                                                    {summary.avgCustomFormatScore != null ? ` · avg Arr score ${summary.avgCustomFormatScore}` : ''}
                                                    {' · '}min score gain {minDelta}
                                                    {summary.scoreUnknownCount ? ` · ${summary.scoreUnknownCount} shows unscored` : ''}
                                                </p>
                                            )}
                                        </section>

                                        <section className="rounded-2xl border border-border/60 bg-card/40 p-5 space-y-3">
                                            <div className="flex flex-wrap items-center justify-between gap-3">
                                                <div>
                                                    <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Active downloads by library</h2>
                                                    <p className="text-xs text-muted mt-1">
                                                        In-flight Arr queue items vs hunt cap ({downloadCap} / library).
                                                    </p>
                                                </div>
                                                <button
                                                    type="button"
                                                    className="text-xs font-bold text-plex hover:underline"
                                                    onClick={() => handleTabChange('downloads')}
                                                >
                                                    Open Downloads
                                                </button>
                                            </div>
                                            {activeByLibrary.length === 0 ? (
                                                <p className="text-xs text-muted">No library download counts yet. Refresh after Arr queues are reachable.</p>
                                            ) : (
                                                <div className="space-y-2">
                                                    {activeByLibrary.map((lib) => {
                                                        const pct = Math.min(100, Math.round((lib.active / Math.max(1, lib.cap)) * 100));
                                                        const atCap = lib.active >= lib.cap;
                                                        return (
                                                            <div key={lib.key} className="rounded-xl border border-border/50 bg-background/40 px-3 py-2.5">
                                                                <div className="flex items-center justify-between gap-3 text-xs">
                                                                    <span className="font-semibold text-text truncate">{lib.label}</span>
                                                                    <span className={`font-bold shrink-0 ${atCap ? 'text-amber-200' : 'text-text'}`}>
                                                                        {lib.active}/{lib.cap}
                                                                        <span className="ml-1 font-semibold text-muted">
                                                                            ({lib.remaining} free)
                                                                        </span>
                                                                    </span>
                                                                </div>
                                                                <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden">
                                                                    <div
                                                                        className={`h-full rounded-full ${atCap ? 'bg-amber-400' : 'bg-plex'}`}
                                                                        style={{ width: `${pct}%` }}
                                                                    />
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </section>

                                        <section className="rounded-2xl border border-border/60 bg-card/40 p-5">
                                            <QcPolicySummary status={status} compact />
                                        </section>

                                        <section className="rounded-2xl border border-border/60 bg-card/40 p-5 space-y-3">
                                            <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Kills by reason</h2>
                                            {killEntries.length === 0 ? (
                                                <p className="text-xs text-muted">No cleanup kills recorded yet.</p>
                                            ) : (
                                                <div className="flex flex-wrap gap-2">
                                                    {killEntries.map(([reason, count]) => (
                                                        <span
                                                            key={reason}
                                                            className="inline-flex items-center gap-1.5 rounded-lg border border-border/50 bg-background/40 px-2.5 py-1 text-xs"
                                                        >
                                                            <span className="font-semibold text-text">{reason}</span>
                                                            <span className="text-muted">{count}</span>
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                            {status?.qcMetrics?.lastCleanupAt && (
                                                <p className="text-[11px] text-muted">
                                                    Last cleanup {new Date(status.qcMetrics.lastCleanupAt).toLocaleString()}
                                                </p>
                                            )}
                                        </section>

                                        <section className="rounded-2xl border border-border/60 bg-card/40 p-4 flex flex-wrap gap-3">
                                            <button
                                                type="button"
                                                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-xs font-bold text-text hover:border-plex/40"
                                                onClick={handleDryRun}
                                                disabled={dryRunning}
                                            >
                                                <FlaskConical className="w-3.5 h-3.5" />
                                                Dry-run hunt
                                            </button>
                                            <button
                                                type="button"
                                                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-xs font-bold text-text hover:border-plex/40"
                                                onClick={() => handleTabChange('downloads')}
                                            >
                                                <Download className="w-3.5 h-3.5" />
                                                Downloads
                                            </button>
                                            <button
                                                type="button"
                                                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-xs font-bold text-text hover:border-plex/40"
                                                onClick={() => handleTabChange('rules')}
                                            >
                                                <Ban className="w-3.5 h-3.5" />
                                                Full policy
                                            </button>
                                            <button
                                                type="button"
                                                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-xs font-bold text-text hover:border-plex/40"
                                                onClick={() => handleTabChange('hunt')}
                                            >
                                                <Crosshair className="w-3.5 h-3.5" />
                                                Hunt details
                                            </button>
                                        </section>

                                        <section className="space-y-4">
                                            <div className="flex items-center justify-between gap-3">
                                                <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Just hunted</h2>
                                                <button
                                                    type="button"
                                                    className="text-xs font-bold text-plex hover:underline"
                                                    onClick={() => handleTabChange('activity')}
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
                                                            <div className="space-y-2">
                                                                {group.items.slice(0, 8).map((entry) => {
                                                                    const when = entryTime(entry);
                                                                    const delta = entry.currentScore != null && entry.candidateScore != null
                                                                        ? entry.candidateScore - entry.currentScore
                                                                        : null;
                                                                    return (
                                                                        <div key={entry.id} className="rounded-lg border border-border/50 bg-background/40 px-3 py-2">
                                                                            <div className="flex items-center justify-between gap-2">
                                                                                <div className="text-xs font-semibold text-text">{entry.title}</div>
                                                                                {delta != null && (
                                                                                    <span className="text-[10px] font-bold text-emerald-300 shrink-0">+{delta}</span>
                                                                                )}
                                                                            </div>
                                                                            <div className="text-[11px] text-muted mt-0.5">
                                                                                {[
                                                                                    entry.releaseTitle,
                                                                                    when ? new Date(when).toLocaleString() : null,
                                                                                ].filter(Boolean).join(' · ')}
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

                                {activeTab === 'integrity' && (
                                    <QcIntegrityPanel
                                        onToast={addToast}
                                        integrityEnabled={!!status?.integrityEnabled}
                                    />
                                )}

                                {activeTab === 'hunt' && (
                                    <div className="flex flex-col gap-6">
                                        <section className="rounded-2xl border border-border/60 bg-card/40 p-5 space-y-3">
                                            <div className="flex flex-wrap items-center justify-between gap-3">
                                                <h2 className="text-sm font-bold uppercase tracking-wide text-muted">How it hunts</h2>
                                                <button
                                                    type="button"
                                                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-xs font-bold text-text hover:border-plex/40"
                                                    onClick={() => handleTabChange('profiles')}
                                                >
                                                    <Settings2 className="w-3.5 h-3.5" />
                                                    Arr scores
                                                </button>
                                            </div>
                                            <ol className="space-y-2 text-sm text-muted list-decimal list-inside">
                                                <li>
                                                    <span className="text-text font-semibold">Fair per library.</span>{' '}
                                                    Each configured Arr root folder gets a turn every cycle (round-robin). Shared Sonarr/Radarr/Lidarr instances with multiple roots are hunted separately. Hunts also stop grabbing for a library once it already has {status?.maxDownloadsPerLibrary ?? 5} in-flight Arr downloads.
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
                                            <div className="pt-2">
                                                <button
                                                    type="button"
                                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-bold text-text hover:border-plex/40 disabled:opacity-50"
                                                    onClick={handleDryRun}
                                                    disabled={dryRunning || rebuilding || !!status?.rebuildInProgress}
                                                >
                                                    <FlaskConical className={`w-4 h-4 ${dryRunning ? 'animate-pulse' : ''}`} />
                                                    {dryRunning ? 'Dry run…' : 'Dry-run hunt'}
                                                </button>
                                            </div>
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
                                                                    {emptyDryRunMessage(group)}
                                                                </p>
                                                            )}
                                                            {would.length > 0 && (
                                                                <div className="space-y-2">
                                                                    {would.map((entry: UpgraderHuntResult) => {
                                                                        const isMissing = entry.huntPath === 'missing' || entry.action === 'missing_search';
                                                                        const delta = entry.scoreDelta ?? (
                                                                            entry.currentScore != null && entry.candidateScore != null
                                                                                ? entry.candidateScore - entry.currentScore
                                                                                : null
                                                                        );
                                                                        return (
                                                                            <div key={`dry-${entry.ratingKey}-${entry.releaseTitle || entry.reason || ''}`} className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
                                                                                <div className="flex items-center justify-between gap-2">
                                                                                    <div className="text-xs font-semibold text-text">{entry.title}</div>
                                                                                    <span className="text-[10px] font-bold text-amber-200 shrink-0">
                                                                                        {isMissing ? 'Would search missing' : 'Would grab'}
                                                                                    </span>
                                                                                </div>
                                                                                <div className="text-[11px] text-muted mt-0.5">
                                                                                    {isMissing
                                                                                        ? [
                                                                                            entry.missingAiredCount != null
                                                                                                ? `${entry.missingAiredCount} missing aired`
                                                                                                : null,
                                                                                            entry.reason,
                                                                                            entry.releaseTitle,
                                                                                        ].filter(Boolean).join(' · ')
                                                                                        : [
                                                                                            entry.currentScore != null && entry.candidateScore != null
                                                                                                ? `${entry.currentScore} → ${entry.candidateScore}`
                                                                                                : null,
                                                                                            delta != null ? `+${delta}` : null,
                                                                                            entry.releaseTitle,
                                                                                        ].filter(Boolean).join(' · ')}
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
                                    </div>
                                )}

                                {activeTab === 'downloads' && (
                                    <QcDownloadsPanel
                                        onToast={addToast}
                                        snoozeDefaultHours={status?.qcThresholds?.snoozeDefaultHours ?? 24}
                                    />
                                )}

                                {activeTab === 'clients' && (
                                    <QcClientsPanel onToast={addToast} />
                                )}

                                {activeTab === 'rules' && (
                                    <QcRulesPanel
                                        status={status}
                                        onToast={addToast}
                                        onChanged={() => loadData(true)}
                                    />
                                )}

                                {(activeTab === 'activity' || activeTab === 'history') && <UpgraderHistoryPanel />}

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
