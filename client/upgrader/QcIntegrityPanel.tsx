import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlaskConical, Loader2, RefreshCw, ShieldAlert } from 'lucide-react';
import { apiFetch } from '../shared/api';
import { portalUrl } from '../shared/basePath';
import { SettingHint } from '../settings/SettingHint';
import { QC_KPI, QC_SECTION } from './qcUi';

type IntegrityFinding = {
    key: string;
    title: string;
    reason?: string | null;
    detail?: string | null;
    filePath?: string | null;
    localPath?: string | null;
    arrType?: string | null;
    arrInstanceName?: string | null;
    seasonNumber?: number | null;
    episodeNumber?: number | null;
    movieFileId?: number | null;
    episodeFileId?: number | null;
    episodeId?: number | null;
    entityId?: number | null;
    arrInstanceId?: string | null;
    ratingKey?: string | null;
};

type IntegrityProgress = {
    target?: number;
    scanned?: number;
    skipped?: number;
    skippedPlaying?: number;
    passed?: number;
    findingCount?: number;
    currentTitle?: string | null;
    mode?: string | null;
    libraryKey?: string | null;
    libraryLabel?: string | null;
};

type CoverageBucket = {
    total?: number;
    playability?: number;
    imohash?: number;
    xxhash?: number;
    /** @deprecated legacy */
    baselined?: number;
};

type LibraryCoverage = CoverageBucket & {
    key: string;
    label: string;
    mediaType?: 'movie' | 'show' | 'album' | string;
};

type IntegrityCoverage = {
    movie?: CoverageBucket;
    show?: CoverageBucket;
    album?: CoverageBucket;
    byLibrary?: LibraryCoverage[];
};

type IntegrityBreaker = {
    tripped?: boolean;
    trippedAt?: string | null;
    reason?: string | null;
    clearedAt?: string | null;
};

type IntegritySettings = {
    xxhashEnabled?: boolean;
    includeMusic?: boolean;
};

type IntegrityScanMode = 'baseline' | 'imohash' | 'playability' | 'xxhash';

type IntegrityScanResponse = {
    ran?: boolean;
    reason?: string;
    dryRun?: boolean;
    mode?: string;
    scanning?: boolean;
    scanned?: number;
    skipped?: number;
    skippedPlaying?: number;
    passed?: number;
    findingCount?: number;
    findings?: IntegrityFinding[];
    progress?: IntegrityProgress | null;
    coverage?: IntegrityCoverage | null;
    breaker?: IntegrityBreaker | null;
    setup?: {
        ready?: boolean;
        tools?: { ffprobe?: boolean; ffmpeg?: boolean };
        pathMapCount?: number;
    };
};

type IntegrityStatus = {
    scanning?: boolean;
    progress?: IntegrityProgress | null;
    coverage?: IntegrityCoverage | null;
    breaker?: IntegrityBreaker | null;
    findings?: IntegrityFinding[];
    settings?: IntegritySettings | null;
    lastScan?: {
        at?: string;
        mode?: string;
        scanned?: number;
        skipped?: number;
        skippedPlaying?: number;
        passed?: number;
        findingCount?: number;
        libraryKey?: string | null;
        findings?: IntegrityFinding[];
    } | null;
    setup?: IntegrityScanResponse['setup'];
};

type Props = {
    onToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
    integrityEnabled?: boolean;
};

/** API mode → plain-language label shown in the UI. */
const MODE_LABELS: Record<IntegrityScanMode, string> = {
    playability: 'Playback check',
    imohash: 'Quick fingerprint',
    xxhash: 'Full-file hash',
    baseline: 'Run all checks',
};

const SCAN_ACTIONS: Array<{
    mode: IntegrityScanMode;
    label: string;
    shortLabel: string;
    blurb: string;
    xxhashOnly?: boolean;
}> = [
    {
        mode: 'playability',
        label: MODE_LABELS.playability,
        shortLabel: 'Playback',
        blurb: 'Decode samples at the start, middle, and end. Catches unplayable or truncated files.',
    },
    {
        mode: 'imohash',
        label: MODE_LABELS.imohash,
        shortLabel: 'Fingerprint',
        blurb: 'Fast spot-check of file size plus small slices. Good for catching silent swaps.',
    },
    {
        mode: 'xxhash',
        label: MODE_LABELS.xxhash,
        shortLabel: 'Hash',
        blurb: 'Hashes the entire file. Slowest; enable in Settings first.',
        xxhashOnly: true,
    },
    {
        mode: 'baseline',
        label: MODE_LABELS.baseline,
        shortLabel: 'All',
        blurb: 'Runs playback + fingerprint together (and full-file hash when that option is on).',
    },
];

const CHECK_STATUS: Array<{
    key: 'playability' | 'imohash' | 'xxhash';
    label: string;
    blurb: string;
    xxhashOnly?: boolean;
}> = [
    {
        key: 'playability',
        label: MODE_LABELS.playability,
        blurb: 'Has a decode pass on record',
    },
    {
        key: 'imohash',
        label: MODE_LABELS.imohash,
        blurb: 'Has a quick fingerprint on record',
    },
    {
        key: 'xxhash',
        label: MODE_LABELS.xxhash,
        blurb: 'Has a full-file hash on record',
        xxhashOnly: true,
    },
];

const labelForMode = (mode?: string | null) => {
    if (!mode) return 'scan';
    return MODE_LABELS[mode as IntegrityScanMode] || mode;
};

const formatPair = (done?: number, total?: number) => {
    const d = Number(done || 0);
    const t = Number(total || 0);
    if (!t) return '0 / 0';
    return `${d} / ${t}`;
};

const coveragePct = (done?: number, total?: number) => {
    const d = Number(done || 0);
    const t = Number(total || 0);
    if (!t) return 0;
    if (d >= t) return 100;
    // Never round incomplete coverage up to 100% (e.g. 57393/57453 → 99).
    return Math.min(99, Math.floor((d / t) * 100));
};

const FALLBACK_LIBRARY_LABELS: Record<string, string> = {
    movie: 'Movies',
    show: 'TV',
    album: 'Music',
};

const librariesFromCoverage = (coverage: IntegrityCoverage | null): LibraryCoverage[] => {
    if (Array.isArray(coverage?.byLibrary) && coverage.byLibrary.length) {
        return coverage.byLibrary;
    }
    const out: LibraryCoverage[] = [];
    for (const key of ['movie', 'show', 'album'] as const) {
        const bucket = coverage?.[key];
        if (!bucket?.total) continue;
        out.push({
            key,
            label: FALLBACK_LIBRARY_LABELS[key] || key,
            mediaType: key,
            total: bucket.total,
            playability: bucket.playability,
            imohash: bucket.imohash,
            xxhash: bucket.xxhash,
        });
    }
    return out;
};

export const QcIntegrityPanel: React.FC<Props> = ({ onToast, integrityEnabled = false }) => {
    const [scanning, setScanning] = useState(false);
    const [progress, setProgress] = useState<IntegrityProgress | null>(null);
    const [replacingKey, setReplacingKey] = useState<string | null>(null);
    const [snoozingKey, setSnoozingKey] = useState<string | null>(null);
    const [recheckingKey, setRecheckingKey] = useState<string | null>(null);
    const [clearingBreaker, setClearingBreaker] = useState(false);
    const [result, setResult] = useState<IntegrityScanResponse | null>(null);
    const [coverage, setCoverage] = useState<IntegrityCoverage | null>(null);
    const [breaker, setBreaker] = useState<IntegrityBreaker | null>(null);
    const [xxhashEnabled, setXxhashEnabled] = useState(false);
    const [findings, setFindings] = useState<IntegrityFinding[]>([]);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const wasScanningRef = useRef(false);

    const stopPolling = useCallback(() => {
        if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
    }, []);

    const loadStatus = useCallback(async () => {
        const status = await apiFetch('/api/upgrader/qc/integrity') as IntegrityStatus;
        const nowScanning = !!status.scanning;
        if (wasScanningRef.current && !nowScanning && status.lastScan) {
            const last = status.lastScan;
            onToast?.(
                `${labelForMode(last.mode)} done: ${last.findingCount || 0} findings · ${last.scanned || 0} probed · ${last.skippedPlaying || 0} playing skip.`,
                'success',
            );
            setResult({
                ran: true,
                mode: last.mode,
                scanned: last.scanned,
                skipped: last.skipped,
                skippedPlaying: last.skippedPlaying,
                passed: last.passed,
                findingCount: last.findingCount,
                findings: status.findings || last.findings || [],
                coverage: status.coverage,
                breaker: status.breaker,
                setup: status.setup,
            });
        }
        wasScanningRef.current = nowScanning;
        setScanning(nowScanning);
        setProgress(status.progress || null);
        setCoverage(status.coverage || null);
        setBreaker(status.breaker || null);
        setXxhashEnabled(!!status.settings?.xxhashEnabled);
        if (Array.isArray(status.findings)) {
            setFindings(status.findings);
        }
        if (!nowScanning && status.lastScan) {
            setResult((current) => current?.ran ? current : {
                ran: true,
                mode: status.lastScan?.mode,
                scanned: status.lastScan?.scanned,
                skipped: status.lastScan?.skipped,
                skippedPlaying: status.lastScan?.skippedPlaying,
                passed: status.lastScan?.passed,
                findingCount: status.lastScan?.findingCount,
                findings: status.findings || status.lastScan?.findings || current?.findings || [],
                coverage: status.coverage,
                breaker: status.breaker,
                setup: status.setup,
            });
        }
        return status;
    }, [onToast]);

    const startPolling = useCallback(() => {
        stopPolling();
        pollRef.current = setInterval(() => {
            void loadStatus().then((status) => {
                if (!status.scanning) stopPolling();
            }).catch(() => {});
        }, 2000);
    }, [loadStatus, stopPolling]);

    useEffect(() => {
        if (!integrityEnabled) return;
        void loadStatus().then((status) => {
            if (status.scanning) startPolling();
        }).catch(() => {});
        return stopPolling;
    }, [integrityEnabled, loadStatus, startPolling, stopPolling]);

    const runScan = useCallback(async (
        mode: IntegrityScanMode = 'baseline',
        scope?: { libraryKey?: string; libraryLabel?: string },
    ) => {
        setScanning(true);
        setProgress({
            scanned: 0,
            target: 0,
            currentTitle: 'Starting…',
            mode,
            libraryKey: scope?.libraryKey || null,
            libraryLabel: scope?.libraryLabel || null,
        });
        startPolling();
        const scopeLabel = scope?.libraryLabel ? ` · ${scope.libraryLabel}` : '';
        try {
            const payload = await apiFetch('/api/upgrader/qc/integrity/scan', {
                method: 'POST',
                body: JSON.stringify({
                    mode,
                    dryRun: true,
                    force: false,
                    full: true,
                    libraryKey: scope?.libraryKey || undefined,
                    libraryLabel: scope?.libraryLabel || undefined,
                }),
            }) as IntegrityScanResponse & { started?: boolean };

            if (payload.scanning || payload.started || payload.reason === 'Scan already in progress') {
                onToast?.(
                    payload.started
                        ? `${labelForMode(mode)}${scopeLabel} started — this can take a while. Watching progress.`
                        : 'A scan is already running — watching progress.',
                    'info',
                );
                setProgress(payload.progress || {
                    mode,
                    currentTitle: 'Running…',
                    libraryKey: scope?.libraryKey || null,
                    libraryLabel: scope?.libraryLabel || null,
                });
                return;
            }

            setResult(payload);
            if (payload.coverage) setCoverage(payload.coverage);
            if (payload.breaker) setBreaker(payload.breaker);
            if (Array.isArray(payload.findings)) setFindings(payload.findings);
            setProgress(null);
            if (!payload.ran) {
                onToast?.(payload.reason || 'Integrity scan did not run.', 'error');
            } else {
                onToast?.(
                    `${labelForMode(mode)}${scopeLabel}: ${payload.findingCount || 0} findings · ${payload.scanned || 0} probed · ${payload.skippedPlaying || 0} playing skip.`,
                    'success',
                );
            }
        } catch (error: any) {
            onToast?.(error?.message || 'Integrity scan failed', 'error');
        } finally {
            const status = await loadStatus().catch(() => null);
            if (!status?.scanning) {
                setScanning(false);
                stopPolling();
            }
        }
    }, [loadStatus, onToast, startPolling, stopPolling]);

    const clearBreaker = async () => {
        setClearingBreaker(true);
        try {
            const payload = await apiFetch('/api/upgrader/qc/integrity/breaker/clear', {
                method: 'POST',
                body: JSON.stringify({}),
            }) as { breaker?: IntegrityBreaker };
            setBreaker(payload.breaker || { tripped: false });
            onToast?.('Integrity breaker cleared', 'success');
        } catch (error: any) {
            onToast?.(error?.message || 'Failed to clear breaker', 'error');
        } finally {
            setClearingBreaker(false);
        }
    };

    const recheckOne = async (finding: IntegrityFinding) => {
        setRecheckingKey(finding.key);
        try {
            const payload = await apiFetch('/api/upgrader/qc/integrity/recheck', {
                method: 'POST',
                body: JSON.stringify({ key: finding.key, finding }),
            }) as { cleared?: boolean; finding?: IntegrityFinding; reason?: string };
            if (payload.cleared) {
                onToast?.(`Cleared ${finding.title} on recheck`, 'success');
                setFindings((current) => current.filter((entry) => entry.key !== finding.key));
                setResult((current) => current ? {
                    ...current,
                    findings: (current.findings || []).filter((entry) => entry.key !== finding.key),
                    findingCount: Math.max(0, Number(current.findingCount || 1) - 1),
                } : current);
            } else {
                const nextFinding = payload.finding || finding;
                onToast?.(
                    `${finding.title} still failing: ${nextFinding.reason || payload.reason || 'unknown'}`,
                    'error',
                );
                setFindings((current) => current.map((entry) => (
                    entry.key === finding.key ? { ...entry, ...nextFinding } : entry
                )));
                setResult((current) => current ? {
                    ...current,
                    findings: (current.findings || []).map((entry) => (
                        entry.key === finding.key ? { ...entry, ...nextFinding } : entry
                    )),
                } : current);
            }
        } catch (error: any) {
            onToast?.(error?.message || 'Recheck failed', 'error');
        } finally {
            setRecheckingKey(null);
        }
    };

    const replaceOne = async (finding: IntegrityFinding) => {
        setReplacingKey(finding.key);
        try {
            await apiFetch('/api/upgrader/qc/integrity/replace', {
                method: 'POST',
                body: JSON.stringify({ finding, dryRun: false }),
            });
            onToast?.(`Queued replace for ${finding.title}`, 'success');
            setFindings((current) => current.filter((entry) => entry.key !== finding.key));
            setResult((current) => current ? {
                ...current,
                findings: (current.findings || []).filter((entry) => entry.key !== finding.key),
                findingCount: Math.max(0, Number(current.findingCount || 1) - 1),
            } : current);
        } catch (error: any) {
            onToast?.(error?.message || 'Replace failed', 'error');
        } finally {
            setReplacingKey(null);
        }
    };

    const snoozeOne = async (finding: IntegrityFinding) => {
        setSnoozingKey(finding.key);
        try {
            await apiFetch('/api/upgrader/qc/integrity/snooze', {
                method: 'POST',
                body: JSON.stringify({ key: finding.key, hours: 24 }),
            });
            onToast?.(`Snoozed ${finding.title} for 24h`, 'success');
            setFindings((current) => current.filter((entry) => entry.key !== finding.key));
            setResult((current) => current ? {
                ...current,
                findings: (current.findings || []).filter((entry) => entry.key !== finding.key),
                findingCount: Math.max(0, Number(current.findingCount || 1) - 1),
            } : current);
        } catch (error: any) {
            onToast?.(error?.message || 'Snooze failed', 'error');
        } finally {
            setSnoozingKey(null);
        }
    };

    if (!integrityEnabled) {
        return (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-5 space-y-3">
                <div className="flex items-start gap-3">
                    <ShieldAlert className="w-5 h-5 text-amber-200 shrink-0 mt-0.5" />
                    <div>
                        <h3 className="text-sm font-bold text-amber-100">Library integrity is off</h3>
                        <p className="text-sm text-amber-100/80 mt-1">
                            Enable it in Settings, mount media read-only into the portal container, and add Arr→container path maps if needed.
                        </p>
                        <a
                            href={portalUrl('/settings#qc-integrity')}
                            className="inline-flex mt-3 text-xs font-bold text-plex hover:underline"
                        >
                            Open Settings
                        </a>
                    </div>
                </div>
            </div>
        );
    }

    const displayFindings = findings.length ? findings : (result?.findings || []);
    const visibleActions = SCAN_ACTIONS.filter((entry) => !entry.xxhashOnly || xxhashEnabled);
    const visibleStatus = CHECK_STATUS.filter((entry) => !entry.xxhashOnly || xxhashEnabled);
    const libraries = librariesFromCoverage(coverage);

    return (
        <div className="space-y-4">
            <div className={`${QC_SECTION} space-y-4`}>
                <div>
                    <h2 className="text-sm font-bold uppercase tracking-wide text-muted inline-flex items-center flex-wrap gap-x-1">
                        Library integrity
                        <SettingHint>
                            Import/upgrade webhooks validate new files (playback → optional trim → playback → fingerprint → optional full hash).
                            Nightly automation trims dirty MKVs then fingerprints the library; mismatches escalate to playback/hash.
                            Buttons below are manual tools. Dry-run only — nothing is deleted until you Replace a finding.
                            Files playing on Plex are skipped.
                        </SettingHint>
                    </h2>
                    <p className="text-xs text-muted mt-1 max-w-2xl">
                        Manual checks — dry-run only until you Replace a finding.
                    </p>
                    {result?.setup && !result.setup.ready && (
                        <p className="text-xs text-amber-200 mt-2">
                            ffmpeg/ffprobe missing in this environment. Install them in the portal image before scanning.
                        </p>
                    )}
                    {scanning && (
                        <p className="text-xs text-amber-100 mt-2">
                            Running {labelForMode(progress?.mode)}
                            {progress?.libraryLabel ? ` · ${progress.libraryLabel}` : ''}
                            {progress?.currentTitle ? `: ${progress.currentTitle}` : '…'}
                            {progress?.target != null ? ` · ${progress.scanned || 0}/${progress.target} probed` : ''}
                            {progress?.findingCount ? ` · ${progress.findingCount} findings so far` : ''}
                        </p>
                    )}
                </div>

                <div>
                    <h3 className="text-xs font-bold uppercase tracking-wide text-muted">Status by library</h3>
                    <p className="text-[11px] text-muted mt-1 max-w-3xl">
                        New imports/upgrades fingerprint first so coverage should stay near 100% on that bar.
                        Playback and full-file hash still fill from import stages, escalations, and the buttons below.
                    </p>
                    <div className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {libraries.length === 0 && (
                            <div className={`${QC_KPI} sm:col-span-2 xl:col-span-3`}>
                                <p className="text-xs text-muted">Coverage loads with the library index…</p>
                            </div>
                        )}
                        {libraries.map((lib) => {
                            const activeHere = scanning && progress?.libraryKey === lib.key;
                            return (
                                <div key={lib.key} className={QC_KPI}>
                                    <div className="flex items-baseline justify-between gap-2">
                                        <div className="text-sm font-bold text-text truncate">{lib.label}</div>
                                        <span className="text-[11px] text-muted tabular-nums shrink-0">
                                            {Number(lib.total || 0).toLocaleString()} files
                                        </span>
                                    </div>
                                    <div className="mt-2 space-y-2">
                                        {visibleStatus.map((check) => {
                                            const done = Number(lib[check.key] || 0);
                                            const total = Number(lib.total || 0);
                                            const pct = coveragePct(done, total);
                                            return (
                                                <div key={check.key}>
                                                    <div className="flex items-baseline justify-between gap-2">
                                                        <span className="text-[11px] text-muted">{check.label}</span>
                                                        <span className="text-[11px] font-semibold text-text tabular-nums">
                                                            {formatPair(done, total)}
                                                            <span className="text-muted font-medium"> · {pct}%</span>
                                                        </span>
                                                    </div>
                                                    <div className="mt-1 h-1.5 rounded-full bg-border/50 overflow-hidden">
                                                        <div
                                                            className="h-full rounded-full bg-plex/80 transition-[width]"
                                                            style={{ width: `${pct}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className="mt-3 flex flex-wrap gap-1.5">
                                        {visibleActions.map((entry) => {
                                            const active = activeHere && progress?.mode === entry.mode;
                                            return (
                                                <button
                                                    key={entry.mode}
                                                    type="button"
                                                    className="px-2 py-1 rounded-md border border-border/60 text-[10px] font-bold text-text hover:border-plex/40 disabled:opacity-50 inline-flex items-center gap-1"
                                                    disabled={scanning}
                                                    title={`${entry.label} — ${lib.label}`}
                                                    onClick={() => void runScan(entry.mode, {
                                                        libraryKey: lib.key,
                                                        libraryLabel: lib.label,
                                                    })}
                                                >
                                                    {active
                                                        ? <Loader2 className="w-3 h-3 animate-spin text-plex" />
                                                        : null}
                                                    {entry.shortLabel}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div>
                    <h3 className="text-xs font-bold uppercase tracking-wide text-muted">Run all libraries</h3>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {visibleActions.map((entry) => {
                            const active = scanning && !progress?.libraryKey && progress?.mode === entry.mode;
                            return (
                                <button
                                    key={entry.mode}
                                    type="button"
                                    className="text-left rounded-xl border border-border/60 bg-background/30 px-3 py-3 hover:border-plex/40 disabled:opacity-50"
                                    disabled={scanning}
                                    onClick={() => void runScan(entry.mode)}
                                >
                                    <div className="flex items-center gap-2">
                                        {active
                                            ? <Loader2 className="w-3.5 h-3.5 animate-spin text-plex shrink-0" />
                                            : <FlaskConical className="w-3.5 h-3.5 text-plex shrink-0" />}
                                        <span className="text-sm font-bold text-text">{entry.label}</span>
                                    </div>
                                    <p className="text-[11px] text-muted mt-1.5 leading-snug">{entry.blurb}</p>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {breaker?.tripped && (
                <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                        <div className="text-sm font-bold text-red-100">Breaker tripped</div>
                        <p className="text-xs text-red-100/80 mt-1">
                            {breaker.reason || 'mass_findings'}
                            {breaker.trippedAt ? ` · ${new Date(breaker.trippedAt).toLocaleString()}` : ''}
                        </p>
                    </div>
                    <button
                        type="button"
                        className="shrink-0 px-3 py-1.5 rounded-lg border border-red-300/40 text-xs font-bold text-red-100 hover:bg-red-500/20 disabled:opacity-50"
                        disabled={clearingBreaker || scanning}
                        onClick={() => void clearBreaker()}
                    >
                        {clearingBreaker ? 'Clearing…' : 'Clear breaker'}
                    </button>
                </div>
            )}

            {(result?.ran || scanning) && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {[
                        ['Probed', scanning ? (progress?.scanned || 0) : (result?.scanned || 0)],
                        ['Already checked', scanning ? (progress?.skipped || 0) : (result?.skipped || 0)],
                        ['Playing skip', scanning ? (progress?.skippedPlaying || 0) : (result?.skippedPlaying || 0)],
                        ['Passed', scanning ? (progress?.passed || 0) : (result?.passed || 0)],
                        ['Findings', scanning ? (progress?.findingCount || 0) : (result?.findingCount || displayFindings.length || 0)],
                    ].map(([label, value]) => (
                        <div key={String(label)} className={QC_KPI}>
                            <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
                            <div className="mt-1 text-lg font-bold text-text">{value}</div>
                        </div>
                    ))}
                </div>
            )}

            <section className={`${QC_SECTION} space-y-3`}>
                <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-text">Findings</h3>
                    <button
                        type="button"
                        className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-text disabled:opacity-50"
                        disabled={scanning}
                        onClick={() => void loadStatus()}
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                </div>
                {!result && !scanning && displayFindings.length === 0 && (
                    <p className="text-xs text-muted">
                        Run a check above. Nothing changes until you click Replace on a finding.
                    </p>
                )}
                {scanning && displayFindings.length === 0 && (
                    <p className="text-xs text-muted">Working through files now — findings will show when this pass finishes.</p>
                )}
                {result?.ran && !scanning && displayFindings.length === 0 && (
                    <p className="text-xs text-emerald-300">No integrity findings in this pass.</p>
                )}
                {displayFindings.map((finding) => (
                    <div key={finding.key} className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="text-xs font-semibold text-text truncate">{finding.title}</div>
                                <div className="text-[11px] text-muted mt-0.5">
                                    {[
                                        finding.reason,
                                        finding.seasonNumber != null && finding.episodeNumber != null
                                            ? `S${finding.seasonNumber}E${finding.episodeNumber}`
                                            : null,
                                        finding.arrInstanceName,
                                    ].filter(Boolean).join(' · ')}
                                </div>
                                <div className="text-[10px] text-muted mt-1 font-mono break-all">
                                    {finding.localPath || finding.filePath}
                                </div>
                                {finding.detail && (
                                    <div className="text-[10px] text-red-200/80 mt-1">{finding.detail}</div>
                                )}
                            </div>
                            <div className="shrink-0 flex flex-col gap-1.5">
                                <button
                                    type="button"
                                    className="px-2.5 py-1 rounded-md border border-border text-[11px] font-bold hover:border-plex/40 disabled:opacity-50"
                                    disabled={recheckingKey === finding.key || scanning}
                                    onClick={() => void recheckOne(finding)}
                                >
                                    {recheckingKey === finding.key ? 'Rechecking…' : 'Recheck'}
                                </button>
                                <button
                                    type="button"
                                    className="px-2.5 py-1 rounded-md border border-border text-[11px] font-bold hover:border-plex/40 disabled:opacity-50"
                                    disabled={replacingKey === finding.key || scanning || recheckingKey === finding.key}
                                    onClick={() => void replaceOne(finding)}
                                >
                                    {replacingKey === finding.key ? 'Replacing…' : 'Replace'}
                                </button>
                                <button
                                    type="button"
                                    className="px-2.5 py-1 rounded-md border border-border text-[11px] font-bold hover:border-plex/40 disabled:opacity-50"
                                    disabled={snoozingKey === finding.key || scanning || recheckingKey === finding.key}
                                    onClick={() => void snoozeOne(finding)}
                                >
                                    {snoozingKey === finding.key ? 'Snoozing…' : 'Snooze 24h'}
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </section>
        </div>
    );
};
