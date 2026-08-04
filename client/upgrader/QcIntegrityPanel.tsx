import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlaskConical, Loader2, RefreshCw, ShieldAlert } from 'lucide-react';
import { apiFetch } from '../shared/api';
import { portalUrl } from '../shared/basePath';

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
};

type CoverageBucket = {
    total?: number;
    playability?: number;
    imohash?: number;
    xxhash?: number;
    /** @deprecated legacy */
    baselined?: number;
};

type IntegrityCoverage = {
    movie?: CoverageBucket;
    show?: CoverageBucket;
    album?: CoverageBucket;
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
        findings?: IntegrityFinding[];
    } | null;
    setup?: IntegrityScanResponse['setup'];
};

type Props = {
    onToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
    integrityEnabled?: boolean;
};

const SCAN_MODES: Array<{ mode: IntegrityScanMode; label: string; xxhashOnly?: boolean }> = [
    { mode: 'baseline', label: 'Full baseline' },
    { mode: 'imohash', label: 'Full imohash' },
    { mode: 'playability', label: 'Full playability' },
    { mode: 'xxhash', label: 'Full xxhash', xxhashOnly: true },
];

const formatPair = (done?: number, total?: number) => {
    const d = Number(done || 0);
    const t = Number(total || 0);
    if (!t) return '0 / 0';
    return `${d} / ${t}`;
};

const coverageTotals = (coverage: IntegrityCoverage | null) => {
    const buckets = [coverage?.movie, coverage?.show, coverage?.album];
    return buckets.reduce(
        (acc, bucket) => ({
            total: acc.total + Number(bucket?.total || 0),
            playability: acc.playability + Number(bucket?.playability || 0),
            imohash: acc.imohash + Number(bucket?.imohash || 0),
            xxhash: acc.xxhash + Number(bucket?.xxhash || 0),
        }),
        { total: 0, playability: 0, imohash: 0, xxhash: 0 },
    );
};

export const QcIntegrityPanel: React.FC<Props> = ({ onToast, integrityEnabled = false }) => {
    const [scanning, setScanning] = useState(false);
    const [progress, setProgress] = useState<IntegrityProgress | null>(null);
    const [replacingKey, setReplacingKey] = useState<string | null>(null);
    const [snoozingKey, setSnoozingKey] = useState<string | null>(null);
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
                `${last.mode || 'scan'} done: ${last.findingCount || 0} findings · ${last.scanned || 0} probed · ${last.skippedPlaying || 0} playing skip.`,
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

    const runScan = useCallback(async (mode: IntegrityScanMode = 'baseline') => {
        setScanning(true);
        setProgress({ scanned: 0, target: 0, currentTitle: 'Starting…', mode });
        startPolling();
        try {
            const payload = await apiFetch('/api/upgrader/qc/integrity/scan', {
                method: 'POST',
                body: JSON.stringify({ mode, dryRun: true, force: false, full: true }),
            }) as IntegrityScanResponse & { started?: boolean };

            if (payload.scanning || payload.started || payload.reason === 'Scan already in progress') {
                onToast?.(
                    payload.started
                        ? `Full ${mode} pass started — this can take a while. Watching progress.`
                        : 'A scan is already running — watching progress.',
                    'info',
                );
                setProgress(payload.progress || { mode, currentTitle: 'Running…' });
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
                    `${mode}: ${payload.findingCount || 0} findings · ${payload.scanned || 0} probed · ${payload.skippedPlaying || 0} playing skip.`,
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
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-5 space-y-3">
                <div className="flex items-start gap-3">
                    <ShieldAlert className="w-5 h-5 text-amber-200 shrink-0 mt-0.5" />
                    <div>
                        <h3 className="text-sm font-bold text-amber-100">Library integrity is off</h3>
                        <p className="text-sm text-amber-100/80 mt-1">
                            Enable it in Settings, mount media read-only into the portal container, and add Arr→container path maps if needed.
                        </p>
                        <a
                            href={portalUrl('/settings#upgrader')}
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
    const visibleModes = SCAN_MODES.filter((entry) => !entry.xxhashOnly || xxhashEnabled);

    return (
        <div className="space-y-4">
            <div className="rounded-2xl border border-border/60 bg-card/40 p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div>
                        <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Library integrity</h2>
                        <p className="text-xs text-muted mt-1 max-w-2xl">
                            Checks Arr-known library files with playability decode (start/middle/end) and imohash,
                            plus optional xxhash. Includes music when enabled. Files currently playing on Plex are skipped.
                            Manual Full imohash/xxhash can run with higher concurrency. Full playability/baseline
                            uses a separate lower concurrency (ffmpeg-heavy). Scheduled jobs still use the per-cycle
                            batch size. Dry-run modes only report problems — nothing is deleted until you Replace a finding.
                        </p>
                        {result?.setup && !result.setup.ready && (
                            <p className="text-xs text-amber-200 mt-2">
                                ffmpeg/ffprobe missing in this environment. Install them in the portal image before scanning.
                            </p>
                        )}
                        {scanning && (
                            <p className="text-xs text-amber-100 mt-2">
                                Scanning{progress?.mode ? ` (${progress.mode})` : ''}
                                {progress?.currentTitle ? `: ${progress.currentTitle}` : '…'}
                                {progress?.target != null ? ` · ${progress.scanned || 0}/${progress.target} probed` : ''}
                                {progress?.findingCount ? ` · ${progress.findingCount} findings so far` : ''}
                            </p>
                        )}
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    {visibleModes.map((entry) => (
                        <button
                            key={entry.mode}
                            type="button"
                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-plex text-background text-xs font-bold hover:bg-plex-hover disabled:opacity-50"
                            disabled={scanning}
                            onClick={() => void runScan(entry.mode)}
                        >
                            {scanning && progress?.mode === entry.mode
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : <FlaskConical className="w-3.5 h-3.5" />}
                            {entry.label}
                        </button>
                    ))}
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

            {(() => {
                const totals = coverageTotals(coverage);
                const checkRows: Array<{ key: 'playability' | 'imohash' | 'xxhash'; label: string; hide?: boolean }> = [
                    { key: 'playability', label: 'Playability' },
                    { key: 'imohash', label: 'Imohash' },
                    { key: 'xxhash', label: 'Xxhash', hide: !xxhashEnabled },
                ];
                const mediaCols: Array<{ key: 'movie' | 'show' | 'album'; label: string }> = [
                    { key: 'movie', label: 'Movies' },
                    { key: 'show', label: 'TV' },
                    { key: 'album', label: 'Music' },
                ];
                return (
                    <div className="rounded-2xl border border-border/60 bg-card/40 p-4 space-y-3">
                        <div>
                            <h3 className="text-sm font-bold text-text">Coverage by check</h3>
                            <p className="text-xs text-muted mt-1">
                                Imohash can be complete while playability is still empty — they are tracked separately.
                            </p>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                                <thead>
                                    <tr className="text-[11px] uppercase tracking-wide text-muted border-b border-border/40">
                                        <th className="py-2 pr-3 font-semibold">Check</th>
                                        {mediaCols.map((col) => (
                                            <th key={col.key} className="py-2 pr-3 font-semibold">{col.label}</th>
                                        ))}
                                        <th className="py-2 font-semibold">Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {checkRows.filter((row) => !row.hide).map((row) => {
                                        const totalDone = totals[row.key];
                                        const totalAll = totals.total;
                                        return (
                                            <tr key={row.key} className="border-b border-border/20 last:border-0">
                                                <td className="py-2.5 pr-3 font-semibold text-text">{row.label}</td>
                                                {mediaCols.map((col) => {
                                                    const bucket = coverage?.[col.key];
                                                    return (
                                                        <td key={col.key} className="py-2.5 pr-3 text-text tabular-nums">
                                                            {formatPair(bucket?.[row.key], bucket?.total)}
                                                        </td>
                                                    );
                                                })}
                                                <td className="py-2.5 text-text font-bold tabular-nums">
                                                    {formatPair(totalDone, totalAll)}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                );
            })()}

            {(result?.ran || scanning) && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {[
                        ['Probed', scanning ? (progress?.scanned || 0) : (result?.scanned || 0)],
                        ['Cached skip', scanning ? (progress?.skipped || 0) : (result?.skipped || 0)],
                        ['Playing skip', scanning ? (progress?.skippedPlaying || 0) : (result?.skippedPlaying || 0)],
                        ['Passed', scanning ? (progress?.passed || 0) : (result?.passed || 0)],
                        ['Findings', scanning ? (progress?.findingCount || 0) : (result?.findingCount || displayFindings.length || 0)],
                    ].map(([label, value]) => (
                        <div key={String(label)} className="rounded-xl border border-border/50 bg-background/40 px-3 py-3">
                            <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
                            <div className="mt-1 text-lg font-bold text-text">{value}</div>
                        </div>
                    ))}
                </div>
            )}

            <section className="rounded-2xl border border-border/60 bg-card/40 p-4 space-y-3">
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
                        Run a dry-run mode above to check a batch of Arr files. Nothing is changed until you click Replace.
                        The first baseline pass is the slowest.
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
                                    disabled={replacingKey === finding.key || scanning}
                                    onClick={() => void replaceOne(finding)}
                                >
                                    {replacingKey === finding.key ? 'Replacing…' : 'Replace'}
                                </button>
                                <button
                                    type="button"
                                    className="px-2.5 py-1 rounded-md border border-border text-[11px] font-bold hover:border-plex/40 disabled:opacity-50"
                                    disabled={snoozingKey === finding.key || scanning}
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
