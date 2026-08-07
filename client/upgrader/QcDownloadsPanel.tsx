import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, FlaskConical, Trash2, Clock, X } from 'lucide-react';
import { apiFetch } from '../shared/api';
import { formatSizeCeil } from '../shared/format';
import { SettingHint } from '../settings/SettingHint';
import { QC_KPI, QC_SECTION } from './qcUi';

type QcDownloadItem = {
    key: string;
    title?: string;
    reason?: string | null;
    arrType?: string | null;
    arrInstanceId?: string | null;
    arrInstanceName?: string | null;
    libraryKey?: string | null;
    libraryName?: string | null;
    downloadId?: string | null;
    upgrade?: boolean;
    size?: number;
    sizeleft?: number;
    progress?: number;
    ageMs?: number | null;
    seeding?: boolean;
    snoozed?: boolean;
    actionable?: boolean;
    strikeEligible?: boolean;
    strikes?: number;
    maxStrikes?: number;
    killReady?: boolean;
    safetyHold?: 'genericImport' | 'stallOutage' | string | null;
    status?: string | null;
    trackedDownloadState?: string | null;
    client?: { client?: string; state?: string; name?: string; hash?: string } | null;
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
    metricsPreview?: { actionableCount?: number; strikeEligibleCount?: number };
    generatedAt?: string;
};

type GroupedRow = {
    groupKey: string;
    keys: string[];
    item: QcDownloadItem;
    episodeCount: number;
    anySelectable: boolean;
    allSnoozed: boolean;
    unhealthy: boolean;
    waitingImport: boolean;
    latestHunt: boolean;
};

type LibraryBucket = {
    key: string;
    label: string;
    active?: number;
    cap?: number;
    remaining?: number;
    rows: GroupedRow[];
    unhealthyCount: number;
    latestGroupKey: string | null;
};

type ActiveLibrary = {
    key: string;
    label: string;
    active: number;
    cap: number;
    remaining: number;
};

type Props = {
    onToast: (message: string, type?: 'success' | 'error' | 'info') => void;
    snoozeDefaultHours?: number;
    activeByLibrary?: ActiveLibrary[];
    downloadCap?: number;
};

const formatAge = (ageMs?: number | null) => {
    const ms = Number(ageMs);
    if (!Number.isFinite(ms) || ms <= 0) return null;
    const minutes = Math.floor(ms / 60_000);
    if (minutes < 1) return '<1m';
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 48) {
        const rem = minutes % 60;
        return rem ? `${hours}h ${rem}m` : `${hours}h`;
    }
    const days = Math.floor(hours / 24);
    return `${days}d`;
};

const humanReason = (reason?: string | null) => {
    switch (String(reason || '')) {
        case 'completedNotImporting': return 'waiting to import (overdue)';
        case 'slowDownload': return 'slow download';
        case 'stalled': return 'stalled';
        case 'metaDL': return 'stuck fetching metadata';
        case 'failedImport': return 'import failed';
        case 'qualityDowngrade': return 'resolution downgrade';
        case 'blockedExtension': return 'blocked extension';
        case 'duplicate': return 'duplicate';
        case 'orphan': return 'orphan';
        default: return reason || null;
    }
};

/** Prefer Arr import phase over raw qBit seeding jargon (stalledUP / stoppedUP). */
const phaseLabel = (item: QcDownloadItem) => {
    const tracked = String(item.trackedDownloadState || '').toLowerCase();
    const status = String(item.status || '').toLowerCase();
    if (item.reason) return humanReason(item.reason);
    if (tracked === 'importing') return 'importing';
    if (tracked === 'importpending') return 'waiting to import';
    if (tracked === 'importfailed' || tracked === 'failed') return 'import failed';
    if (status === 'completed' && tracked !== 'imported') return 'waiting to import';
    if (item.seeding || (Number(item.progress) >= 1 && /up$/i.test(String(item.client?.state || '')))) {
        return 'downloaded · seeding';
    }
    if (Number(item.progress) >= 1) return 'downloaded';
    return 'downloading';
};

const isWaitingImport = (item: QcDownloadItem) => {
    const tracked = String(item.trackedDownloadState || '').toLowerCase();
    const status = String(item.status || '').toLowerCase();
    if (item.reason === 'completedNotImporting') return true;
    if (tracked === 'importpending' || tracked === 'importing') return true;
    return status === 'completed' && tracked !== 'imported';
};

const humanClientState = (item: QcDownloadItem) => {
    const client = item.client;
    if (!client?.state && !client?.client) return null;
    const raw = String(client.state || '').toLowerCase();
    const name = client.client === 'qbit' ? 'qBit'
        : client.client === 'sab' ? 'SAB'
            : (client.client || 'client');
    const labels: Record<string, string> = {
        stalledup: 'seeding',
        stoppedup: 'seeding paused',
        pausedup: 'seeding paused',
        uploading: 'seeding',
        forcedup: 'seeding',
        queuedup: 'seed queued',
        checkingup: 'checking',
        moving: 'moving',
        downloading: 'downloading',
        stalleddl: 'stalled',
        forceddl: 'downloading',
        queueddl: 'queued',
        metadl: 'fetching metadata',
        allocating: 'allocating',
        checkingdl: 'checking',
        pauseddl: 'paused',
        stoppeddl: 'stopped',
        error: 'error',
        missingfiles: 'missing files',
        completed: 'completed',
        extracting: 'extracting',
        running: 'downloading',
        queued: 'queued',
        paused: 'paused',
        failed: 'failed',
    };
    return `${name}: ${labels[raw] || raw || '—'}`;
};

const safetyHoldLabel = (hold?: QcDownloadItem['safetyHold']) => {
    if (hold === 'genericImport') return 'held: not a doomed import failure';
    if (hold === 'importQueueBusy') return 'held: waiting behind active import';
    if (hold === 'stallOutage') return 'held: client/network outage guard';
    if (hold === 'metaDlOutage') return 'held: qBit network/DHT down';
    if (hold === 'orphanGrace') return 'held: orphan grace';
    return null;
};

const isImporting = (item: QcDownloadItem) => (
    String(item.trackedDownloadState || '').toLowerCase() === 'importing'
);

const isStrikeProblem = (item: QcDownloadItem) => {
    if (item.actionable || item.killReady || item.would?.kill || item.strikeEligible) return true;
    const reason = String(item.reason || '');
    // Waiting-to-import overdue is yellow caution, not strike red — unless already strike-eligible.
    if (!reason || reason === 'completedNotImporting') return false;
    return true;
};

const isUnhealthy = (item: QcDownloadItem) => Boolean(
    isStrikeProblem(item)
    || item.safetyHold,
);

const healthRank = (item: QcDownloadItem) => {
    if (item.actionable || item.killReady || item.would?.kill) return 0;
    if (isStrikeProblem(item)) return 1;
    if (item.safetyHold) return 2;
    if (isWaitingImport(item) && !isImporting(item)) return 3;
    if (isImporting(item)) return 4;
    if (item.snoozed) return 5;
    return 6;
};

const libraryLabelOf = (item: QcDownloadItem) => {
    if (item.libraryName) return String(item.libraryName);
    if (item.arrType === 'lidarr' || String(item.libraryKey || '').startsWith('lidarr:')) return 'Music';
    return item.arrInstanceName || (item.arrType === 'radarr' ? 'Radarr' : item.arrType === 'sonarr' ? 'Sonarr' : 'Library');
};

/** Collapse Sonarr season-pack episode rows into one download. */
const downloadUiGroupKey = (item: QcDownloadItem) => {
    const downloadId = String(item.downloadId || '').trim().toLowerCase();
    if (downloadId) return `dl:${downloadId}`;
    const hash = String(item.client?.hash || '').trim().toLowerCase();
    if (hash) return `hash:${hash}`;
    const clientName = String(item.client?.name || '').trim().toLowerCase();
    if (clientName) return `client:${item.arrType || ''}:${item.arrInstanceId || ''}:${clientName}`;
    const title = String(item.title || '').trim().toLowerCase();
    if (title) return `title:${item.arrType || ''}:${item.arrInstanceId || ''}:${title}`;
    return `key:${item.key}`;
};

const pickRepresentative = (items: QcDownloadItem[]) => (
    [...items].sort((a, b) => {
        const health = healthRank(a) - healthRank(b);
        if (health !== 0) return health;
        const as = Number(a.would?.strikes ?? a.strikes ?? 0);
        const bs = Number(b.would?.strikes ?? b.strikes ?? 0);
        if (bs !== as) return bs - as;
        return Number(b.ageMs || 0) - Number(a.ageMs || 0);
    })[0]
);

type RowTone = 'red' | 'yellow' | 'green' | 'blue' | 'neutral';

const TONE: Record<RowTone, { border: string; fill: string }> = {
    red: { border: 'rgba(239, 68, 68, 0.55)', fill: 'rgba(239, 68, 68, 0.10)' },
    yellow: { border: 'rgba(234, 179, 8, 0.55)', fill: 'rgba(234, 179, 8, 0.10)' },
    green: { border: 'rgba(16, 185, 129, 0.50)', fill: 'rgba(16, 185, 129, 0.10)' },
    blue: { border: 'rgba(59, 130, 246, 0.60)', fill: 'rgba(59, 130, 246, 0.12)' },
    neutral: { border: 'rgba(148, 163, 184, 0.25)', fill: 'rgba(15, 23, 42, 0.25)' },
};

/** Status tone only — Latest is layered separately (and can split the border). */
const primaryTone = (item: QcDownloadItem): RowTone => {
    if (isStrikeProblem(item)) return 'red';
    if (item.safetyHold) return 'yellow';
    if (isImporting(item)) return 'green';
    if (isWaitingImport(item)) return 'yellow';
    return 'neutral';
};

const rowShell = (item: QcDownloadItem, latestHunt = false): { className: string; style?: React.CSSProperties } => {
    const tone = primaryTone(item);
    if (latestHunt && tone !== 'neutral') {
        // Diagonal BL→TR: Latest blue on the bottom half, status color on the top half.
        return {
            className: 'border-2 border-transparent',
            style: {
                backgroundImage: [
                    `linear-gradient(${TONE[tone].fill}, ${TONE[tone].fill})`,
                    `linear-gradient(to top right, ${TONE.blue.border} 50%, ${TONE[tone].border} 50%)`,
                ].join(', '),
                backgroundOrigin: 'border-box',
                backgroundClip: 'padding-box, border-box',
            },
        };
    }
    if (latestHunt) {
        return { className: 'border-2 border-blue-500/50 bg-blue-500/10' };
    }
    if (tone === 'red') return { className: 'border border-red-500/45 bg-red-500/10' };
    if (tone === 'yellow') return { className: 'border border-yellow-500/45 bg-yellow-500/10' };
    if (tone === 'green') return { className: 'border border-emerald-500/45 bg-emerald-500/10' };
    return { className: 'border border-border/40 bg-background/25' };
};

const statusBadge = (item: QcDownloadItem) => {
    if (item.actionable || item.killReady || item.would?.kill) {
        return { text: 'Kill ready', className: 'text-red-300' };
    }
    if (isStrikeProblem(item)) {
        return { text: 'Strikes', className: 'text-red-300' };
    }
    if (isImporting(item)) {
        return { text: 'Importing', className: 'text-emerald-300' };
    }
    if (isWaitingImport(item)) {
        return { text: 'Waiting', className: 'text-yellow-200' };
    }
    if (item.safetyHold) {
        return { text: 'Held', className: 'text-yellow-200' };
    }
    return null;
};

/** Youngest in-flight download in the library; prefer portal upgrade grabs on ties. */
const pickLatestHuntGroupKey = (rows: GroupedRow[]) => {
    let best: GroupedRow | null = null;
    for (const row of rows) {
        const age = Number(row.item.ageMs);
        if (!Number.isFinite(age) || age < 0) continue;
        if (!best) {
            best = row;
            continue;
        }
        const bestAge = Number(best.item.ageMs) || 0;
        if (age < bestAge) {
            best = row;
            continue;
        }
        if (age === bestAge && row.item.upgrade && !best.item.upgrade) {
            best = row;
        }
    }
    return best?.groupKey || null;
};

export const QcDownloadsPanel: React.FC<Props> = ({
    onToast,
    snoozeDefaultHours = 24,
    activeByLibrary = [],
    downloadCap = 5,
}) => {
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [dryPreview, setDryPreview] = useState<QcDownloadItem[] | null>(null);
    const [showHealthy, setShowHealthy] = useState(true);

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

    const allItems = useMemo(() => {
        if (dryPreview) return dryPreview;
        const items = Array.isArray(snapshot?.items) ? snapshot!.items! : [];
        const orphans = Array.isArray(snapshot?.orphans) ? snapshot!.orphans! : [];
        return [...items, ...orphans];
    }, [snapshot, dryPreview]);

    const groupedRows = useMemo((): GroupedRow[] => {
        const map = new Map<string, QcDownloadItem[]>();
        for (const item of allItems) {
            const groupKey = downloadUiGroupKey(item);
            if (!map.has(groupKey)) map.set(groupKey, []);
            map.get(groupKey)!.push(item);
        }
        return [...map.entries()].map(([groupKey, items]) => {
            const keys = items.map((item) => item.key).filter(Boolean);
            const item = pickRepresentative(items);
            return {
                groupKey,
                keys,
                item,
                episodeCount: items.length,
                anySelectable: items.some((entry) => entry.actionable || entry.strikeEligible),
                allSnoozed: items.every((entry) => entry.snoozed),
                unhealthy: items.some((entry) => isUnhealthy(entry)),
                waitingImport: items.some((entry) => isWaitingImport(entry)),
                latestHunt: false,
            };
        }).sort((a, b) => healthRank(a.item) - healthRank(b.item));
    }, [allItems]);

    const libraries = useMemo((): LibraryBucket[] => {
        const buckets = new Map<string, LibraryBucket>();
        const ensure = (key: string, label: string, meta?: Partial<ActiveLibrary>) => {
            if (!buckets.has(key)) {
                buckets.set(key, {
                    key,
                    label,
                    active: meta?.active,
                    cap: meta?.cap ?? downloadCap,
                    remaining: meta?.remaining,
                    rows: [],
                    unhealthyCount: 0,
                    latestGroupKey: null,
                });
            }
            return buckets.get(key)!;
        };

        for (const lib of activeByLibrary) {
            const label = String(lib.key || '').startsWith('lidarr:')
                || /^(lidarr|artists?|music)$/i.test(String(lib.label || ''))
                ? 'Music'
                : lib.label;
            ensure(lib.key, label, lib);
        }

        for (const row of groupedRows) {
            const isOrphan = String(row.item.reason || '') === 'orphan'
                || (!row.item.libraryKey && !row.item.arrInstanceId);
            const key = isOrphan && !row.item.libraryKey
                ? 'orphans'
                : (row.item.libraryKey || `arr:${row.item.arrType || 'arr'}:${row.item.arrInstanceId || libraryLabelOf(row.item)}`);
            const label = key === 'orphans' ? 'Orphans' : libraryLabelOf(row.item);
            const bucket = ensure(key, label);
            bucket.rows.push(row);
            if (row.unhealthy) bucket.unhealthyCount += 1;
        }

        for (const bucket of buckets.values()) {
            const latestGroupKey = pickLatestHuntGroupKey(bucket.rows);
            bucket.latestGroupKey = latestGroupKey;
            if (!latestGroupKey) continue;
            bucket.rows = bucket.rows.map((row) => (
                row.groupKey === latestGroupKey
                    ? { ...row, latestHunt: true }
                    : row
            ));
            // Unhealthy first; latest hunt sits just under that band.
            bucket.rows.sort((a, b) => {
                const health = healthRank(a.item) - healthRank(b.item);
                if (health !== 0) return health;
                if (a.latestHunt !== b.latestHunt) return a.latestHunt ? -1 : 1;
                return Number(a.item.ageMs || Number.POSITIVE_INFINITY)
                    - Number(b.item.ageMs || Number.POSITIVE_INFINITY);
            });
        }

        return [...buckets.values()]
            .filter((bucket) => bucket.rows.length > 0 || (bucket.active != null && bucket.active > 0))
            .sort((a, b) => {
                if (a.unhealthyCount !== b.unhealthyCount) return b.unhealthyCount - a.unhealthyCount;
                return a.label.localeCompare(b.label);
            });
    }, [activeByLibrary, downloadCap, groupedRows]);

    const selectableKeys = useMemo(
        () => groupedRows.filter((row) => row.anySelectable).flatMap((row) => row.keys),
        [groupedRows],
    );
    const actionableKeys = useMemo(
        () => allItems.filter((item) => item.actionable && item.key).map((item) => item.key),
        [allItems],
    );
    const unhealthyTotal = useMemo(
        () => groupedRows.filter((row) => row.unhealthy).length,
        [groupedRows],
    );
    const selectedGroupCount = useMemo(
        () => groupedRows.filter((row) => row.keys.some((key) => selected.has(key))).length,
        [groupedRows, selected],
    );

    const toggleGroup = (keys: string[]) => {
        setSelected((prev) => {
            const next = new Set(prev);
            const allSelected = keys.length > 0 && keys.every((key) => next.has(key));
            if (allSelected) {
                for (const key of keys) next.delete(key);
            } else {
                for (const key of keys) next.add(key);
            }
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
        const label = keys
            ? `${selectedGroupCount || keys.length} selected download${(selectedGroupCount || keys.length) === 1 ? '' : 's'}`
            : 'all actionable';
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

    const handleSnooze = async (keys: string[]) => {
        try {
            await Promise.all(keys.map((key) => apiFetch('/api/upgrader/qc/snooze', {
                method: 'POST',
                body: JSON.stringify({ key, hours: snoozeDefaultHours }),
            })));
            onToast(`Snoozed for ${snoozeDefaultHours}h.`, 'success');
            await loadSnapshot(true);
        } catch (e: any) {
            onToast(e.message || 'Snooze failed', 'error');
        }
    };

    const handleClearSnooze = async (keys: string[]) => {
        try {
            await Promise.all(keys.map((key) => apiFetch('/api/upgrader/qc/snooze/clear', {
                method: 'POST',
                body: JSON.stringify({ key }),
            })));
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
                Loading downloads…
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-sm font-bold uppercase tracking-wide text-muted inline-flex items-center flex-wrap gap-x-1">
                        Downloads by library
                        <SettingHint>
                            Every in-flight Arr download, grouped by library. Borders: importing green, waiting yellow,
                            strikes red, latest blue — shared latest+status splits the border diagonally (blue on the bottom half).
                            are highlighted — healthy ones stay muted.
                        </SettingHint>
                    </h2>
                    <p className="text-xs text-muted mt-1">
                        {dryPreview
                            ? `Dry-run preview · ${dryPreview.filter((item) => item.killReady || item.would?.kill).length} would kill`
                            : `${groupedRows.length} downloads · ${unhealthyTotal} unhealthy · ${actionableKeys.length} ready to kill`}
                        {snapshot?.generatedAt ? ` · ${new Date(snapshot.generatedAt).toLocaleTimeString()}` : ''}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        className="btn-secondary !px-3 !py-1.5 !text-xs !rounded-lg"
                        onClick={() => setShowHealthy((value) => !value)}
                    >
                        {showHealthy ? 'Hide healthy' : 'Show healthy'}
                    </button>
                    <button
                        type="button"
                        className="btn-secondary !px-3 !py-1.5 !text-xs !rounded-lg"
                        onClick={() => loadSnapshot()}
                        disabled={busy}
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                    <button
                        type="button"
                        className="btn-secondary !px-3 !py-1.5 !text-xs !rounded-lg"
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
                        {selected.size > 0
                            ? `Force cleanup (${selectedGroupCount || selected.size})`
                            : 'Live cleanup'}
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

            {libraries.length === 0 ? (
                <div className={`${QC_SECTION} text-center`}>
                    <p className="text-sm text-muted">No downloads in Arr queues right now.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    {libraries.map((library) => {
                        const visibleRows = showHealthy
                            ? library.rows
                            : library.rows.filter((row) => row.unhealthy || row.waitingImport || row.latestHunt);
                        const atCap = library.active != null && library.cap != null && library.active >= library.cap;
                        const pct = library.active != null && library.cap
                            ? Math.min(100, Math.round((library.active / Math.max(1, library.cap)) * 100))
                            : null;
                        return (
                            <section
                                key={library.key}
                                className={`${QC_SECTION} space-y-3 ${
                                    library.unhealthyCount > 0 ? 'border-red-500/25' : ''
                                }`}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <h3 className="text-sm font-bold text-text truncate">{library.label}</h3>
                                        <p className="text-[11px] text-muted mt-0.5">
                                            {library.active != null && library.cap != null
                                                ? `${library.active}/${library.cap} in flight`
                                                : `${library.rows.length} download${library.rows.length === 1 ? '' : 's'}`}
                                            {library.unhealthyCount > 0
                                                ? ` · ${library.unhealthyCount} unhealthy`
                                                : ' · healthy'}
                                        </p>
                                    </div>
                                    {library.unhealthyCount > 0 ? (
                                        <span className="shrink-0 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-300">
                                            {library.unhealthyCount} issue{library.unhealthyCount === 1 ? '' : 's'}
                                        </span>
                                    ) : (
                                        <span className="shrink-0 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-300">
                                            OK
                                        </span>
                                    )}
                                </div>

                                {pct != null && (
                                    <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                                        <div
                                            className={`h-full rounded-full ${atCap ? 'bg-amber-400' : 'bg-plex'}`}
                                            style={{ width: `${pct}%` }}
                                        />
                                    </div>
                                )}

                                {visibleRows.length === 0 ? (
                                    <p className="text-xs text-muted py-2">
                                        {library.rows.length === 0
                                            ? 'No downloads in this library.'
                                            : 'No unhealthy downloads (healthy hidden).'}
                                    </p>
                                ) : (
                                    <div className="space-y-1.5">
                                        {visibleRows.map((row) => {
                                            const { item, keys, episodeCount } = row;
                                            const isSelected = keys.length > 0 && keys.every((key) => selected.has(key));
                                            const progress = Math.max(0, Math.min(1, Number(item.progress) || 0));
                                            const shell = rowShell(item, row.latestHunt);
                                            return (
                                                <div
                                                    key={row.groupKey}
                                                    className={`rounded-lg px-3 py-2 ${shell.className}`}
                                                    style={shell.style}
                                                >
                                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                                        <label className="flex items-start gap-2 min-w-0 flex-1 cursor-pointer">
                                                            {row.anySelectable && (
                                                                <input
                                                                    type="checkbox"
                                                                    className="mt-1 h-3.5 w-3.5 accent-plex shrink-0"
                                                                    checked={isSelected}
                                                                    onChange={() => toggleGroup(keys)}
                                                                />
                                                            )}
                                                            <div className="min-w-0 flex-1">
                                                                <div className="flex items-center gap-2 min-w-0">
                                                                    <div className="text-xs font-semibold text-text truncate">
                                                                        {item.title || 'Unknown'}
                                                                    </div>
                                                                    {row.latestHunt && (
                                                                        <span className="shrink-0 text-[10px] font-bold uppercase text-blue-300">
                                                                            Latest
                                                                        </span>
                                                                    )}
                                                                    {(() => {
                                                                        const badge = statusBadge(item);
                                                                        return badge ? (
                                                                            <span className={`shrink-0 text-[10px] font-bold uppercase ${badge.className}`}>
                                                                                {badge.text}
                                                                            </span>
                                                                        ) : null;
                                                                    })()}
                                                                </div>
                                                                <div className="text-[11px] text-muted mt-0.5 break-words">
                                                                    {[
                                                                        phaseLabel(item),
                                                                        formatAge(item.ageMs),
                                                                        episodeCount > 1 ? `${episodeCount} episodes` : null,
                                                                        (item.maxStrikes || item.would?.strikes != null)
                                                                            ? `strikes ${(item.would?.strikes ?? item.strikes ?? 0)}/${item.maxStrikes ?? 3}`
                                                                            : null,
                                                                        item.upgrade ? 'upgrade' : null,
                                                                        item.size ? formatSizeCeil(item.size) : null,
                                                                        humanClientState(item),
                                                                        item.snoozed ? 'snoozed' : null,
                                                                        safetyHoldLabel(item.safetyHold),
                                                                        item.would?.action ? `would ${item.would.action}` : null,
                                                                    ].filter(Boolean).join(' · ')}
                                                                </div>
                                                                {progress > 0 && progress < 1 && (
                                                                    <div className="mt-1.5 h-1 rounded-full bg-white/10 overflow-hidden">
                                                                        <div
                                                                            className="h-full rounded-full bg-plex/80"
                                                                            style={{ width: `${Math.round(progress * 100)}%` }}
                                                                        />
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </label>
                                                        <div className="flex items-center gap-2 shrink-0">
                                                            {row.allSnoozed ? (
                                                                <button
                                                                    type="button"
                                                                    className="inline-flex items-center gap-1 text-[11px] font-bold text-plex"
                                                                    onClick={() => handleClearSnooze(keys)}
                                                                >
                                                                    <X className="w-3 h-3" />
                                                                    Clear snooze
                                                                </button>
                                                            ) : row.unhealthy ? (
                                                                <button
                                                                    type="button"
                                                                    className="inline-flex items-center gap-1 text-[11px] font-bold text-muted hover:text-text"
                                                                    onClick={() => handleSnooze(keys)}
                                                                >
                                                                    <Clock className="w-3 h-3" />
                                                                    Snooze {snoozeDefaultHours}h
                                                                </button>
                                                            ) : null}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </section>
                        );
                    })}
                </div>
            )}

            {selectableKeys.length === 0 && unhealthyTotal === 0 && groupedRows.length > 0 && (
                <div className={`${QC_KPI} text-xs text-muted`}>
                    All in-flight downloads look healthy.
                </div>
            )}
        </div>
    );
};
