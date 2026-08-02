import React, { useCallback, useEffect, useState } from 'react';
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

type IntegrityScanResponse = {
    ran?: boolean;
    reason?: string;
    dryRun?: boolean;
    scanned?: number;
    skipped?: number;
    passed?: number;
    findingCount?: number;
    findings?: IntegrityFinding[];
    setup?: {
        ready?: boolean;
        tools?: { ffprobe?: boolean; ffmpeg?: boolean };
        pathMapCount?: number;
    };
};

type Props = {
    onToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
    integrityEnabled?: boolean;
};

export const QcIntegrityPanel: React.FC<Props> = ({ onToast, integrityEnabled = false }) => {
    const [scanning, setScanning] = useState(false);
    const [replacingKey, setReplacingKey] = useState<string | null>(null);
    const [result, setResult] = useState<IntegrityScanResponse | null>(null);

    const runScan = useCallback(async () => {
        setScanning(true);
        try {
            const payload = await apiFetch('/api/upgrader/qc/integrity/scan', {
                method: 'POST',
                body: JSON.stringify({ dryRun: true, force: true }),
            }) as IntegrityScanResponse;
            setResult(payload);
            if (!payload.ran) {
                onToast?.(payload.reason || 'Integrity scan did not run.', 'error');
            } else {
                onToast?.(
                    `Scan done: ${payload.findingCount || 0} findings · ${payload.scanned || 0} probed · ${payload.skipped || 0} cached.`,
                    'success',
                );
            }
        } catch (error: any) {
            onToast?.(error?.message || 'Integrity scan failed', 'error');
        } finally {
            setScanning(false);
        }
    }, [onToast]);

    useEffect(() => {
        if (integrityEnabled) void runScan();
    }, [integrityEnabled, runScan]);

    const replaceOne = async (finding: IntegrityFinding) => {
        setReplacingKey(finding.key);
        try {
            await apiFetch('/api/upgrader/qc/integrity/replace', {
                method: 'POST',
                body: JSON.stringify({ finding, dryRun: false }),
            });
            onToast?.(`Queued replace for ${finding.title}`, 'success');
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

    if (!integrityEnabled) {
        return (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-5 space-y-3">
                <div className="flex items-start gap-3">
                    <ShieldAlert className="w-5 h-5 text-amber-200 shrink-0 mt-0.5" />
                    <div>
                        <h3 className="text-sm font-bold text-amber-100">Library integrity is off</h3>
                        <p className="text-sm text-amber-100/80 mt-1">
                            Enable it in Settings, mount media read-only into the portal container, and add Arr→container path maps.
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

    const findings = result?.findings || [];

    return (
        <div className="space-y-4">
            <div className="rounded-2xl border border-border/60 bg-card/40 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Library integrity</h2>
                    <p className="text-xs text-muted mt-1">
                        ffprobe + quick decode at start / middle / near-end on Arr-known files. Dry-run by default.
                    </p>
                    {result?.setup && !result.setup.ready && (
                        <p className="text-xs text-amber-200 mt-2">
                            ffmpeg/ffprobe missing in this environment. Install them in the portal image before scanning.
                        </p>
                    )}
                </div>
                <button
                    type="button"
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-plex text-background text-xs font-bold hover:bg-plex-hover disabled:opacity-50"
                    disabled={scanning}
                    onClick={() => void runScan()}
                >
                    {scanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FlaskConical className="w-3.5 h-3.5" />}
                    {scanning ? 'Scanning…' : 'Dry-run scan'}
                </button>
            </div>

            {result?.ran && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                        ['Probed', result.scanned || 0],
                        ['Cached skip', result.skipped || 0],
                        ['Passed', result.passed || 0],
                        ['Findings', result.findingCount || 0],
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
                        className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-text"
                        disabled={scanning}
                        onClick={() => void runScan()}
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                </div>
                {!result && !scanning && (
                    <p className="text-xs text-muted">Run a dry-run scan to list corrupt or unreadable files.</p>
                )}
                {scanning && !result && (
                    <p className="text-xs text-muted">Scanning…</p>
                )}
                {result?.ran && findings.length === 0 && (
                    <p className="text-xs text-emerald-300">No integrity findings in this pass.</p>
                )}
                {findings.map((finding) => (
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
                            <button
                                type="button"
                                className="shrink-0 px-2.5 py-1 rounded-md border border-border text-[11px] font-bold hover:border-plex/40 disabled:opacity-50"
                                disabled={replacingKey === finding.key}
                                onClick={() => void replaceOne(finding)}
                            >
                                {replacingKey === finding.key ? 'Replacing…' : 'Replace'}
                            </button>
                        </div>
                    </div>
                ))}
            </section>
        </div>
    );
};
