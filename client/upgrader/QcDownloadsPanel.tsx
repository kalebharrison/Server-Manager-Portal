import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, FlaskConical, Trash2, Clock, X } from 'lucide-react';
import { apiFetch } from '../shared/api';
import { formatSizeCeil } from '../shared/format';

type QcDownloadItem = {
    key: string;
    title?: string;
    reason?: string | null;
    arrType?: string | null;
    upgrade?: boolean;
    size?: number;
    sizeleft?: number;
    snoozed?: boolean;
    actionable?: boolean;
    strikeEligible?: boolean;
    strikes?: number;
    maxStrikes?: number;
    killReady?: boolean;
    safetyHold?: 'genericImport' | 'stallOutage' | string | null;
    status?: string | null;
    trackedDownloadState?: string | null;
    client?: { client?: string; state?: string; name?: string } | null;
    would?: {
        action?: string;
        reason?: string;
        awardStrike?: boolean;
        strikes?: number;
        kill?: boolean;
    } | null;
};

type Snapshot = {
    items?: QcDownloadItem[];
    orphans?: QcDownloadItem[];
    metricsPreview?: { actionableCount?: number; wastedBytes?: number };
    generatedAt?: string;
    dryRun?: boolean;
    count?: number;
};

type Props = {
    onToast: (message: string, type?: 'success' | 'error' | 'info') => void;
    snoozeDefaultHours?: number;
};

const clientStateLabel = (item: QcDownloadItem) => {
    const client = item.client;
    if (client?.state) return `${client.client || 'client'}: ${client.state}`;
    if (item.trackedDownloadState) return item.trackedDownloadState;
    if (item.status) return item.status;
    return '—';
};

const safetyHoldLabel = (hold?: QcDownloadItem['safetyHold']) => {
    if (hold === 'genericImport') return 'held: not a doomed import failure';
    if (hold === 'stallOutage') return 'held: client/network outage guard';
    return null;
};

export const QcDownloadsPanel: React.FC<Props> = ({
    onToast,
    snoozeDefaultHours = 24,
}) => {
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [dryPreview, setDryPreview] = useState<QcDownloadItem[] | null>(null);

    const loadSnapshot = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const data = await apiFetch('/api/upgrader/qc/downloads');
            setSnapshot(data || null);
            setDryPreview(null);
        } catch (e: any) {
            onToast(e.message || 'Failed to load download health', 'error');
        } finally {
            if (!silent) setLoading(false);
        }
    }, [onToast]);

    useEffect(() => {
        loadSnapshot();
    }, [loadSnapshot]);

    const rows = useMemo(() => {
        if (dryPreview) return dryPreview;
        const items = Array.isArray(snapshot?.items) ? snapshot!.items! : [];
        const orphans = Array.isArray(snapshot?.orphans) ? snapshot!.orphans! : [];
        return [...items, ...orphans].filter((item) => (
            item.actionable || item.strikeEligible || item.snoozed || item.reason
        ));
    }, [snapshot, dryPreview]);

    const selectableKeys = useMemo(
        () => rows.filter((item) => (item.actionable || item.strikeEligible) && item.key).map((item) => item.key),
        [rows],
    );
    const actionableKeys = useMemo(
        () => rows.filter((item) => item.actionable && item.key).map((item) => item.key),
        [rows],
    );

    const toggleKey = (key: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const handleDryRun = async () => {
        setBusy(true);
        try {
            const data = await apiFetch('/api/upgrader/qc/cleanup', {
                method: 'POST',
                body: JSON.stringify({ dryRun: true }),
            });
            const items = Array.isArray(data?.items) ? data.items : [];
            setDryPreview(items);
            onToast(
                `Dry-run cleanup: ${data?.count ?? 0} would kill, ${data?.strikeCount ?? items.length} strike-eligible.`,
                'success',
            );
        } catch (e: any) {
            onToast(e.message || 'Dry-run cleanup failed', 'error');
        } finally {
            setBusy(false);
        }
    };

    const handleLiveCleanup = async () => {
        const keys = selected.size > 0 ? [...selected] : undefined;
        const label = keys ? `${keys.length} selected` : 'all actionable';
        if (!window.confirm(`Live cleanup will remove ${label} doomed downloads from Arr + clients. Continue?`)) {
            return;
        }
        setBusy(true);
        try {
            const data = await apiFetch('/api/upgrader/qc/cleanup', {
                method: 'POST',
                body: JSON.stringify({
                    live: true,
                    dryRun: false,
                    ...(keys ? { itemKeys: keys } : {}),
                }),
            });
            onToast(
                `Cleanup done: ${data?.killed ?? data?.count ?? 0} removed.`,
                'success',
            );
            setSelected(new Set());
            await loadSnapshot(true);
        } catch (e: any) {
            onToast(e.message || 'Live cleanup failed', 'error');
        } finally {
            setBusy(false);
        }
    };

    const handleSnooze = async (key: string) => {
        try {
            await apiFetch('/api/upgrader/qc/snooze', {
                method: 'POST',
                body: JSON.stringify({ key, hours: snoozeDefaultHours }),
            });
            onToast(`Snoozed for ${snoozeDefaultHours}h.`, 'success');
            await loadSnapshot(true);
        } catch (e: any) {
            onToast(e.message || 'Snooze failed', 'error');
        }
    };

    const handleClearSnooze = async (key: string) => {
        try {
            await apiFetch('/api/upgrader/qc/snooze/clear', {
                method: 'POST',
                body: JSON.stringify({ key }),
            });
            onToast('Snooze cleared.', 'success');
            await loadSnapshot(true);
        } catch (e: any) {
            onToast(e.message || 'Clear snooze failed', 'error');
        }
    };

    if (loading && !snapshot) {
        return (
            <div className="flex items-center justify-center gap-2 py-16 text-muted">
                <Loader2 className="w-5 h-5 animate-spin" />
                Loading download health…
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <section className="rounded-2xl border border-border/60 bg-card/40 p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Download health</h2>
                        <p className="text-xs text-muted mt-1">
                            {dryPreview
                                ? `Dry-run preview · ${dryPreview.filter((item) => item.killReady || item.would?.kill).length} would kill · ${dryPreview.length} strike-eligible`
                                : `${actionableKeys.length} ready to kill · ${selectableKeys.length} strike-eligible`}
                            {snapshot?.generatedAt ? ` · ${new Date(snapshot.generatedAt).toLocaleString()}` : ''}
                        </p>
                        <p className="text-[11px] text-muted mt-1 max-w-2xl">
                            Cleanup uses strikes: a problem must be seen across multiple healthy scans before a kill.
                            Manual Live cleanup on a selection can still force-remove earlier. Stalls skip while qBit/SAB network looks down.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-xs font-bold text-text hover:border-plex/40 disabled:opacity-50"
                            onClick={() => loadSnapshot()}
                            disabled={busy}
                        >
                            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                            Refresh
                        </button>
                        <button
                            type="button"
                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-xs font-bold text-text hover:border-plex/40 disabled:opacity-50"
                            onClick={handleDryRun}
                            disabled={busy}
                        >
                            <FlaskConical className="w-3.5 h-3.5" />
                            Dry-run cleanup
                        </button>
                        <button
                            type="button"
                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/90 text-white text-xs font-bold hover:bg-red-500 disabled:opacity-50"
                            onClick={handleLiveCleanup}
                            disabled={busy || (actionableKeys.length === 0 && selected.size === 0)}
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                            {selected.size > 0 ? `Force cleanup (${selected.size})` : 'Live cleanup'}
                        </button>
                    </div>
                </div>

                {dryPreview && (
                    <button
                        type="button"
                        className="text-xs font-bold text-muted hover:text-text"
                        onClick={() => setDryPreview(null)}
                    >
                        Clear dry-run preview
                    </button>
                )}

                {rows.length === 0 ? (
                    <p className="text-sm text-muted py-6 text-center">
                        No flagged downloads. Queues look healthy.
                    </p>
                ) : (
                    <div className="space-y-2">
                        {rows.map((item) => {
                            const key = item.key || item.title || '';
                            const isSelected = selected.has(key);
                            return (
                                <div
                                    key={key}
                                    className={`rounded-lg border px-3 py-2 ${
                                        item.actionable
                                            ? 'border-amber-500/25 bg-amber-500/5'
                                            : 'border-border/50 bg-background/40'
                                    }`}
                                >
                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                        <label className="flex items-start gap-2 min-w-0 flex-1 cursor-pointer">
                                            {(item.actionable || item.strikeEligible) && (
                                                <input
                                                    type="checkbox"
                                                    className="mt-1 h-3.5 w-3.5 accent-plex shrink-0"
                                                    checked={isSelected}
                                                    onChange={() => toggleKey(key)}
                                                />
                                            )}
                                            <div className="min-w-0">
                                                <div className="text-xs font-semibold text-text truncate">
                                                    {item.title || 'Unknown'}
                                                </div>
                                                <div className="text-[11px] text-muted mt-0.5 break-words">
                                                    {[
                                                        item.reason || (item.would?.reason ?? null),
                                                        (item.maxStrikes || item.would?.strikes != null)
                                                            ? `strikes ${(item.would?.strikes ?? item.strikes ?? 0)}/${item.maxStrikes ?? 3}`
                                                            : null,
                                                        item.killReady || item.would?.kill ? 'ready' : null,
                                                        item.arrType,
                                                        item.upgrade ? 'upgrade' : null,
                                                        item.size ? formatSizeCeil(item.size) : null,
                                                        clientStateLabel(item),
                                                        item.snoozed ? 'snoozed' : null,
                                                        safetyHoldLabel(item.safetyHold),
                                                        !item.actionable && item.reason && !item.snoozed && !item.safetyHold
                                                            ? 'not actionable'
                                                            : null,
                                                        item.would?.action ? `would ${item.would.action}` : null,
                                                    ].filter(Boolean).join(' · ')}
                                                </div>
                                            </div>
                                        </label>
                                        <div className="flex items-center gap-2 shrink-0">
                                            {item.snoozed ? (
                                                <button
                                                    type="button"
                                                    className="inline-flex items-center gap-1 text-[11px] font-bold text-plex"
                                                    onClick={() => handleClearSnooze(key)}
                                                >
                                                    <X className="w-3 h-3" />
                                                    Clear snooze
                                                </button>
                                            ) : (
                                                <button
                                                    type="button"
                                                    className="inline-flex items-center gap-1 text-[11px] font-bold text-muted hover:text-text"
                                                    onClick={() => handleSnooze(key)}
                                                >
                                                    <Clock className="w-3 h-3" />
                                                    Snooze {snoozeDefaultHours}h
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>
        </div>
    );
};
