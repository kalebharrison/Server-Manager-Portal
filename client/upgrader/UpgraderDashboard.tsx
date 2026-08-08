import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import {
    ArrowUpCircle,
    RefreshCw,
    Settings as SettingsIcon,
    History,
    Ban,
    Settings2,
    LayoutDashboard,
    FlaskConical,
    HardDrive,
    Crosshair,
    ShieldCheck,
} from 'lucide-react';
import { apiFetch } from '../shared/api';
import { portalUrl } from '../shared/basePath';
import { Loader, ToastContainer, pushToast } from '../shared/toast';
import type { ToastMessage } from '../shared/types';
import { QcKpiTile } from './QcKpiTile';
import { QC_PAGE, QC_SECTION, QC_TAB_BAR, qcTabButtonClass } from './qcUi';
import type {
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

const lazyPanel = (loader: () => Promise<{ default: React.ComponentType<any> }>) => (
    lazy(loader) as React.LazyExoticComponent<React.ComponentType<any>>
);

const QcIntegrityPanel = lazyPanel(() => import('./QcIntegrityPanel').then((m) => ({ default: m.QcIntegrityPanel })));
const QcDownloadsPanel = lazyPanel(() => import('./QcDownloadsPanel').then((m) => ({ default: m.QcDownloadsPanel })));
const QcClientsPanel = lazyPanel(() => import('./QcClientsPanel').then((m) => ({ default: m.QcClientsPanel })));
const QcRulesPanel = lazyPanel(() => import('./QcRulesPanel').then((m) => ({ default: m.QcRulesPanel })));
const UpgraderProfilesTab = lazyPanel(() => import('./UpgraderProfilesTab').then((m) => ({ default: m.UpgraderProfilesTab })));
const UpgraderHistoryPanel = lazyPanel(() => import('./UpgraderHistoryPanel').then((m) => ({ default: m.UpgraderHistoryPanel })));

const TabPanelFallback: React.FC = () => (
    <div className="min-h-[240px]" aria-hidden="true" />
);

const CHROME_TABS: Array<{ id: UpgraderTab; label: string; icon: React.ReactNode; title: string }> = [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard className="w-3.5 h-3.5" />, title: 'Live status: automation, queues, and capacity' },
    { id: 'hunt', label: 'Hunt', icon: <Crosshair className="w-3.5 h-3.5" />, title: 'Preview hunts, recent grabs, and download cleanup' },
    { id: 'integrity', label: 'Integrity', icon: <ShieldCheck className="w-3.5 h-3.5" />, title: 'Scan library files for corruption (report-only unless you replace)' },
    { id: 'clients', label: 'Clients', icon: <HardDrive className="w-3.5 h-3.5" />, title: 'qBit/SAB health, optimize, and blocked extensions' },
    { id: 'rules', label: 'Rules', icon: <Ban className="w-3.5 h-3.5" />, title: 'Cleanup timing, hunt caps, and skip list' },
    { id: 'profiles', label: 'Arr scores', icon: <Settings2 className="w-3.5 h-3.5" />, title: 'Custom format repairs and Arr quality profile scores' },
    { id: 'activity', label: 'Activity', icon: <History className="w-3.5 h-3.5" />, title: 'Hunt grabs and cleanup history' },
];

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

            const [statusData, summaryData] = await Promise.all([
                apiFetch('/api/upgrader/status'),
                apiFetch('/api/upgrader/summary'),
            ]);

            setStatus(statusData || null);
            setSummary(summaryData || null);
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

    const tabButtonClass = (tab: UpgraderTab) => qcTabButtonClass(activeTab === tab);

    const maxActions = status?.maxActionsPerHour ?? 25;
    const usedActions = status?.recentUpgradeCount ?? 0;
    const remainingActions = Math.max(0, maxActions - usedActions);
    const minDelta = status?.minScoreDelta ?? 10;
    const activeByLibrary = Array.isArray(status?.activeDownloadsByLibrary)
        ? status!.activeDownloadsByLibrary!
        : [];
    const activeDownloadTotal = Number(status?.activeDownloadTotal) || 0;
    const downloadCap = Math.max(1, Number(status?.maxDownloadsPerLibrary) || 5);
    const librariesAtCap = activeByLibrary.filter((lib) => lib.active >= lib.cap).length;
    const cleanupKills = Object.values(status?.qcMetrics?.killsByReason || {})
        .reduce((sum, n) => sum + (Number(n) || 0), 0);
    const huntIntensity = status?.upgraderHuntIntensity && status.upgraderHuntIntensity !== 'custom'
        ? (status.upgraderHuntIntensityLabel || status.upgraderHuntIntensity)
        : null;
    const cleanupAggression = status?.qcCleanupAggression && status.qcCleanupAggression !== 'custom'
        ? (status.qcCleanupAggressionLabel || status.qcCleanupAggression)
        : null;
    const libraryLabel = (lib: { key?: string; label?: string }) => (
        String(lib.key || '').startsWith('lidarr:')
            || /^(lidarr|artists?|music)$/i.test(String(lib.label || ''))
            ? 'Music'
            : (lib.label || 'Library')
    );

    return (
        <div className={QC_PAGE}>
            <ToastContainer toasts={toasts} setToasts={setToasts} />
            <header className="flex flex-col gap-4 mb-2 border-b border-white/10 pb-5">
                <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
                    <div className="min-w-0">
                        <h1 className="text-2xl md:text-3xl font-black text-text flex items-center gap-3 tracking-tight">
                            <ArrowUpCircle className="w-7 h-7 text-plex shrink-0" />
                            Quality Control
                        </h1>
                        <p className="text-sm text-muted mt-1">
                            Live status and queues. Dig into tabs for hunt, clients, rules, and Arr scores.
                        </p>
                    </div>
                    {featureEnabled && (
                        <div className="flex flex-wrap gap-2 shrink-0">
                            {activeTab === 'hunt' && (
                                <button
                                    type="button"
                                    className="btn-secondary !px-3 !py-1.5 !text-xs !rounded-lg"
                                    onClick={handleDryRun}
                                    disabled={dryRunning || rebuilding || !!status?.rebuildInProgress}
                                >
                                    <FlaskConical className={`w-3.5 h-3.5 ${dryRunning ? 'animate-pulse' : ''}`} />
                                    {dryRunning ? 'Previewing…' : 'Preview hunt'}
                                </button>
                            )}
                            <button
                                type="button"
                                className="btn-primary !px-3 !py-1.5 !text-xs !rounded-lg !shadow-none"
                                onClick={handleRebuild}
                                disabled={rebuilding || !!status?.rebuildInProgress}
                            >
                                <RefreshCw className={`w-3.5 h-3.5 ${rebuilding || status?.rebuildInProgress ? 'animate-spin' : ''}`} />
                                {rebuilding || status?.rebuildInProgress ? 'Refreshing…' : 'Refresh index'}
                            </button>
                        </div>
                    )}
                </div>
            </header>

            {!featureEnabled && (
                <div className={`${QC_SECTION} text-center border-yellow-500/30 bg-yellow-500/10`}>
                    <h3 className="text-xl font-bold text-plex mb-2">Quality Control is off</h3>
                    <p className="text-sm text-muted mb-3">Turn it on to index Arr libraries, hunt upgrades, and monitor download health.</p>
                    <p className="text-xs text-muted mb-4">Settings → Quality Control → enable, then save.</p>
                    <a
                        href={portalUrl('/settings#upgrader')}
                        className="btn-primary inline-flex no-underline"
                    >
                        <SettingsIcon className="w-4 h-4" />
                        Open Settings
                    </a>
                </div>
            )}

            {featureEnabled && (
                <>
                    <div className={QC_TAB_BAR}>
                        {CHROME_TABS.map((tab) => (
                            <button
                                key={tab.id}
                                type="button"
                                className={tabButtonClass(tab.id)}
                                onClick={() => handleTabChange(tab.id)}
                                title={tab.title}
                            >
                                {tab.icon}
                                <span className="whitespace-nowrap">{tab.label}</span>
                            </button>
                        ))}
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
                                                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                                    <p className="text-sm text-amber-100">
                                                        Auto-hunt is off. Nothing will be grabbed until you enable it in Settings.
                                                    </p>
                                                    <a
                                                        href={portalUrl('/settings#upgrader')}
                                                        className="inline-flex items-center gap-2 text-xs font-bold text-plex hover:underline shrink-0"
                                                    >
                                                        Open Settings
                                                    </a>
                                                </div>
                                            )}
                                            {!status?.cleanupAutomationEnabled && (
                                                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                                    <p className="text-sm text-amber-100">
                                                        Cleanup automation is off. Manual cleanup still works on the Hunt tab.
                                                    </p>
                                                    <a
                                                        href={portalUrl('/settings#upgrader')}
                                                        className="inline-flex items-center gap-2 text-xs font-bold text-plex hover:underline shrink-0"
                                                    >
                                                        Open Settings
                                                    </a>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                        <QcKpiTile
                                            label="Auto-hunt"
                                            value={status?.automationEnabled ? 'On' : 'Off'}
                                            valueClassName={status?.automationEnabled ? 'text-emerald-300' : 'text-amber-200'}
                                            detail={huntIntensity
                                                ? `${huntIntensity} · ${remainingActions} grabs left`
                                                : `${remainingActions} grabs left this hour`}
                                            onClick={() => handleTabChange('hunt')}
                                        />
                                        <QcKpiTile
                                            label="Cleanup"
                                            value={status?.cleanupAutomationEnabled ? 'On' : 'Off'}
                                            valueClassName={status?.cleanupAutomationEnabled ? 'text-emerald-300' : 'text-amber-200'}
                                            detail={cleanupAggression
                                                ? `${cleanupAggression} · ${status?.qcThresholds?.maxStrikes ?? 3} strikes`
                                                : `${status?.qcThresholds?.maxStrikes ?? 3} strikes to kill`}
                                            onClick={() => handleTabChange('hunt')}
                                        />
                                        <QcKpiTile
                                            label="Integrity"
                                            value={!status?.integrityEnabled
                                                ? 'Off'
                                                : status?.integrityAutomationEnabled
                                                    ? 'Auto'
                                                    : 'Manual'}
                                            valueClassName={status?.integrityEnabled
                                                ? (status?.integrityAutomationEnabled ? 'text-emerald-300' : 'text-amber-200')
                                                : 'text-amber-200'}
                                            detail={status?.integrity?.setup?.ready
                                                ? 'Tools ready'
                                                : status?.integrityEnabled
                                                    ? 'Check mounts/tools'
                                                    : 'Disabled'}
                                            onClick={() => handleTabChange('integrity')}
                                        />
                                        <QcKpiTile
                                            label="Index"
                                            value={summary?.totalItems ?? status?.itemCount ?? 0}
                                            detail={formatIndexAge(summary?.generatedAt || status?.generatedAt || null)}
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                        <QcKpiTile
                                            label="Active downloads"
                                            value={activeDownloadTotal}
                                            valueClassName={librariesAtCap > 0 ? 'text-amber-200' : 'text-text'}
                                            detail={librariesAtCap > 0
                                                ? `${librariesAtCap} librar${librariesAtCap === 1 ? 'y' : 'ies'} at cap`
                                                : `Cap ${downloadCap} / library`}
                                            onClick={() => handleTabChange('hunt')}
                                        />
                                        <QcKpiTile
                                            label="Grabs this hour"
                                            value={`${usedActions}/${maxActions}`}
                                            detail={`${remainingActions} remaining`}
                                            onClick={() => handleTabChange('hunt')}
                                        />
                                        <QcKpiTile
                                            label="Cleanup kills"
                                            value={cleanupKills}
                                            detail={status?.qcMetrics?.lastCleanupAt
                                                ? `Last ${new Date(status.qcMetrics.lastCleanupAt).toLocaleString()}`
                                                : 'Lifetime recorded'}
                                            onClick={() => handleTabChange('hunt')}
                                        />
                                        <QcKpiTile
                                            label="Clients"
                                            value={(
                                                <>
                                                    qBit {status?.clientsConfigured?.qbit ? '✓' : '—'}
                                                    <span className="text-muted font-semibold"> / </span>
                                                    SAB {status?.clientsConfigured?.sab ? '✓' : '—'}
                                                </>
                                            )}
                                            detail="Optimize & extensions on Clients"
                                            onClick={() => handleTabChange('clients')}
                                        />
                                    </div>

                                    <section className="space-y-3">
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            <div>
                                                <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Active downloads by library</h2>
                                                <p className="text-xs text-muted mt-1">
                                                    In-flight Arr queue vs hunt cap ({downloadCap} / library).
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                className="text-xs font-bold text-plex hover:underline"
                                                onClick={() => handleTabChange('hunt')}
                                            >
                                                Open Hunt
                                            </button>
                                        </div>
                                        {activeByLibrary.length === 0 ? (
                                            <div className={`${QC_SECTION} text-center`}>
                                                <p className="text-xs text-muted">No library download counts yet. Refresh after Arr queues are reachable.</p>
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                                                {activeByLibrary.map((lib) => {
                                                    const pct = Math.min(100, Math.round((lib.active / Math.max(1, lib.cap)) * 100));
                                                    const atCap = lib.active >= lib.cap;
                                                    return (
                                                        <QcKpiTile
                                                            key={lib.key}
                                                            label={libraryLabel(lib)}
                                                            value={`${lib.active}/${lib.cap}`}
                                                            valueClassName={atCap ? 'text-amber-200' : 'text-text'}
                                                            detail={`${lib.remaining} free`}
                                                            onClick={() => handleTabChange('hunt')}
                                                        >
                                                            <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden">
                                                                <div
                                                                    className={`h-full rounded-full ${atCap ? 'bg-amber-400' : 'bg-plex'}`}
                                                                    style={{ width: `${pct}%` }}
                                                                />
                                                            </div>
                                                        </QcKpiTile>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </section>
                                </div>
                            )}
                                {activeTab === 'integrity' && (
                                    <Suspense fallback={<TabPanelFallback />}>
                                        <QcIntegrityPanel
                                            onToast={addToast}
                                            integrityEnabled={!!status?.integrityEnabled}
                                        />
                                    </Suspense>
                                )}

                                {activeTab === 'hunt' && (
                                    <div className="flex flex-col gap-4">
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                            <QcKpiTile
                                                label="Auto-hunt"
                                                value={status?.automationEnabled ? 'On' : 'Off'}
                                                valueClassName={status?.automationEnabled ? 'text-emerald-300' : 'text-amber-200'}
                                                detail={huntIntensity || 'Enable in Settings'}
                                            />
                                            <QcKpiTile
                                                label="Grabs this hour"
                                                value={`${usedActions}/${maxActions}`}
                                                detail={`${remainingActions} remaining`}
                                            />
                                            <QcKpiTile
                                                label="Score floor"
                                                value={`+${minDelta}`}
                                                detail="Min CF gain to grab"
                                                onClick={() => handleTabChange('rules')}
                                            />
                                            <QcKpiTile
                                                label="DL cap / library"
                                                value={downloadCap}
                                                detail={`${activeDownloadTotal} active now`}
                                                onClick={() => handleTabChange('hunt')}
                                            />
                                        </div>

                                        <Suspense fallback={<TabPanelFallback />}>
                                            <QcDownloadsPanel
                                                onToast={addToast}
                                                snoozeDefaultHours={status?.qcThresholds?.snoozeDefaultHours ?? 24}
                                                activeByLibrary={activeByLibrary}
                                                downloadCap={downloadCap}
                                            />
                                        </Suspense>

                                        {(dryRunning || dryRun) && (
                                            <section className={`${QC_SECTION} space-y-3`}>
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <div>
                                                        <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Hunt preview</h2>
                                                        <p className="text-xs text-muted mt-0.5">
                                                            {dryRunning
                                                                ? 'Searching Arr (sample per library) — nothing is grabbed.'
                                                                : (
                                                                    <>
                                                                        Preview only.
                                                                        {' '}{dryRun?.wouldGrab || 0} would grab
                                                                        {' · '}{dryRun?.skipped || 0} skipped
                                                                        {' · '}{dryRun?.searched || 0} searched
                                                                        {dryRun?.reason ? ` · ${dryRun.reason}` : ''}
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
                                                            Clear
                                                        </button>
                                                    )}
                                                </div>
                                                {dryRunning && (
                                                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 flex items-center gap-2 text-sm text-amber-100">
                                                        <FlaskConical className="w-4 h-4 animate-pulse shrink-0" />
                                                        Waiting on Arr release search…
                                                    </div>
                                                )}
                                                {!dryRunning && dryRun && dryRunByLibrary.length === 0 && (
                                                    <p className="text-xs text-muted">
                                                        {dryRun.reason || 'No titles were searched. Refresh the index if your library looks empty.'}
                                                    </p>
                                                )}
                                                {!dryRunning && dryRunByLibrary.map((group) => {
                                                    const would = group.items.filter((entry) => entry.success);
                                                    const skipped = group.items.filter((entry) => !entry.success);
                                                    if (!group.items.length && !would.length && !skipped.length) {
                                                        return (
                                                            <p key={`dry-${group.key}`} className="text-xs text-muted">
                                                                <span className="font-semibold text-text">{group.label}:</span>{' '}
                                                                {emptyDryRunMessage(group)}
                                                            </p>
                                                        );
                                                    }
                                                    return (
                                                        <div key={`dry-${group.key}`} className="space-y-1.5">
                                                            <div className="flex items-center justify-between gap-2 pt-1">
                                                                <h3 className="text-xs font-bold uppercase tracking-wide text-muted">{group.label}</h3>
                                                                <span className="text-[11px] text-muted">
                                                                    {would.length} would grab · {skipped.length} skipped
                                                                </span>
                                                            </div>
                                                            {would.map((entry: UpgraderHuntResult) => {
                                                                const isMissing = entry.huntPath === 'missing' || entry.action === 'missing_search';
                                                                const delta = entry.scoreDelta ?? (
                                                                    entry.currentScore != null && entry.candidateScore != null
                                                                        ? entry.candidateScore - entry.currentScore
                                                                        : null
                                                                );
                                                                return (
                                                                    <div key={`dry-${entry.ratingKey}-${entry.releaseTitle || entry.reason || ''}`} className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-1.5">
                                                                        <div className="flex items-center justify-between gap-2">
                                                                            <div className="text-xs font-semibold text-text truncate">{entry.title}</div>
                                                                            <span className="text-[10px] font-bold text-amber-200 shrink-0">
                                                                                {isMissing ? 'Would search' : 'Would grab'}
                                                                            </span>
                                                                        </div>
                                                                        <div className="text-[11px] text-muted mt-0.5 truncate">
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
                                                            {skipped.map((entry) => (
                                                                <div key={`skip-${entry.ratingKey}`} className="rounded-lg border border-border/40 bg-background/30 px-3 py-1.5">
                                                                    <div className="text-xs font-semibold text-text truncate">{entry.title}</div>
                                                                    <div className="text-[11px] text-muted mt-0.5 truncate">
                                                                        {entry.reason || 'No better release found'}
                                                                        {entry.currentScore != null ? ` · score ${entry.currentScore}` : ''}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    );
                                                })}
                                            </section>
                                        )}
                                    </div>
                                )}

                                {activeTab === 'clients' && (
                                    <Suspense fallback={<TabPanelFallback />}>
                                        <QcClientsPanel onToast={addToast} />
                                    </Suspense>
                                )}

                                {activeTab === 'rules' && (
                                    <Suspense fallback={<TabPanelFallback />}>
                                        <QcRulesPanel
                                            status={status}
                                            onToast={addToast}
                                            onChanged={() => loadData(true)}
                                        />
                                    </Suspense>
                                )}

                                {(activeTab === 'activity' || activeTab === 'history') && (
                                    <Suspense fallback={<TabPanelFallback />}>
                                        <UpgraderHistoryPanel />
                                    </Suspense>
                                )}

                                {activeTab === 'profiles' && (
                                    <Suspense fallback={<TabPanelFallback />}>
                                        <UpgraderProfilesTab
                                            initialInstanceId={profilesUrl.instance}
                                            initialFormatPage={profilesUrl.formatPage}
                                            initialProfilePage={profilesUrl.profilePage}
                                            onUrlStateChange={handleProfilesUrlChange}
                                            onToast={addToast}
                                        />
                                    </Suspense>
                                )}
                            </>
                        )}
                    </>
                )}
        </div>
    );
};
