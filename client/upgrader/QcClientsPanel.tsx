import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ExternalLink, Loader2, RefreshCw, Save } from 'lucide-react';
import { apiFetch } from '../shared/api';
import { portalUrl } from '../shared/basePath';
import { SettingHint } from '../settings/SettingHint';
import { useVisibleInterval } from '../shared/useVisibleInterval';
import { QcOptimizeClientsButton } from './QcOptimizeClientsButton';
import { QC_KPI, QC_SECTION } from './qcUi';

type ExtensionPolicy = {
    qbit?: string[];
    sab?: string[];
    union?: string[];
    onlyQbit?: string[];
    onlySab?: string[];
    clients?: { qbit?: boolean; sab?: boolean };
    errors?: { qbit?: string | null; sab?: string | null };
};

type ClientHealth = {
    ok?: boolean;
    reachable?: boolean;
    reason?: string | null;
    error?: string | null;
    connectionStatus?: string | null;
    dhtNodes?: number | null;
    dnslookup?: string | null;
    publicIpv4?: string | null;
    dlSpeed?: number;
    upSpeed?: number;
    serverErrors?: string[];
};

type QbitQueue = {
    total?: number;
    downloading?: number;
    seeding?: number;
    paused?: number;
    error?: number;
    checking?: number;
    other?: number;
    dlSpeed?: number;
    upSpeed?: number;
    qcIssues?: number;
    health?: ClientHealth | null;
};

type SabQueue = {
    total?: number;
    downloading?: number;
    paused?: number;
    extracting?: number;
    verifying?: number;
    other?: number;
    history?: number;
    completed?: number;
    failed?: number;
    qcIssues?: number;
    health?: ClientHealth | null;
};

type Snapshot = {
    generatedAt?: string;
    configured?: { qbit?: boolean; sab?: boolean };
    clients?: { qbit?: boolean; sab?: boolean };
    networkHealth?: { qbit?: ClientHealth; sab?: ClientHealth };
    clientQueues?: { qbit?: QbitQueue; sab?: SabQueue };
};

type Props = {
    onToast: (message: string, type?: 'success' | 'error' | 'info') => void;
};

const CLIENTS_POLL_MS = 30_000;

const listLabel = (entries?: string[]) =>
    (entries && entries.length ? entries.join(', ') : '—');

const formatSpeed = (bytesPerSec?: number) => {
    const n = Math.max(0, Number(bytesPerSec) || 0);
    if (n < 1024) return `${Math.round(n)} B/s`;
    if (n < 1024 ** 2) return `${Math.round(n / 1024)} KB/s`;
    return `${(n / (1024 ** 2)).toFixed(1)} MB/s`;
};

const toneClass = (tone: 'ok' | 'warn' | 'bad' | 'muted') => (
    tone === 'ok' ? 'text-emerald-300'
        : tone === 'warn' ? 'text-amber-200'
            : tone === 'bad' ? 'text-red-300'
                : 'text-muted'
);

const healthStatus = (configured: boolean, health?: ClientHealth | null) => {
    if (!configured) return { label: 'Not configured', tone: 'muted' as const, detail: 'Add credentials in Settings.' };
    if (!health) return { label: 'Unknown', tone: 'muted' as const, detail: 'Waiting for live status…' };
    if (health.reason === 'not_configured') return { label: 'Not configured', tone: 'muted' as const, detail: null };
    if (!health.reachable || health.reason === 'unreachable') {
        return { label: 'Unreachable', tone: 'bad' as const, detail: health.error || 'Portal cannot reach this client.' };
    }
    if (health.reason === 'health_probe_failed') {
        return { label: 'Reachable', tone: 'ok' as const, detail: 'Queue loaded; extra health probe failed.' };
    }
    if (!health.ok) {
        const labels: Record<string, string> = {
            disconnected: 'Disconnected',
            dht_dead: 'DHT dead',
            dns_failed: 'DNS failed',
            no_public_ip: 'No public IP',
            servers_error: 'Usenet servers error',
        };
        return {
            label: labels[String(health.reason || '')] || health.reason || 'Unhealthy',
            tone: health.reason === 'no_public_ip' ? 'warn' as const : 'bad' as const,
            detail: health.serverErrors?.filter(Boolean).join(' · ') || health.error || null,
        };
    }
    if (String(health.connectionStatus || '').toLowerCase() === 'firewalled') {
        return { label: 'Firewalled', tone: 'warn' as const, detail: 'Connected, but DHT/peers may be limited.' };
    }
    return { label: 'Online', tone: 'ok' as const, detail: null };
};

const parseExtensions = (value: string) => (
    [...new Set(
        String(value || '')
            .split(/[\s,;]+/)
            .map((entry) => entry.trim().replace(/^\*\./, '').replace(/^\./, '').toLowerCase())
            .filter(Boolean),
    )].sort()
);

export const QcClientsPanel: React.FC<Props> = ({ onToast }) => {
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [policy, setPolicy] = useState<ExtensionPolicy | null>(null);
    const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
    const [text, setText] = useState('');
    const [aligned, setAligned] = useState<boolean | null>(null);
    const editorHydratedRef = useRef(false);

    const loadAll = useCallback(async (opts: { silent?: boolean; force?: boolean } = {}) => {
        const silent = opts.silent === true;
        const force = opts.force === true;
        if (!silent) setRefreshing(true);
        try {
            const [extData, snap] = await Promise.all([
                apiFetch('/api/upgrader/qc/extensions'),
                apiFetch(
                    force ? '/api/upgrader/qc/downloads?refresh=1' : '/api/upgrader/qc/downloads',
                    {
                        cacheTtlMs: force ? 0 : 10_000,
                        staleIfErrorMs: 120_000,
                        forceRefresh: force,
                        cacheKey: 'GET /api/upgrader/qc/downloads',
                    },
                ),
            ]);
            setPolicy(extData || null);
            if (force || !editorHydratedRef.current) {
                setText((extData?.union || []).join(', '));
                editorHydratedRef.current = true;
            }
            setSnapshot(snap || null);
        } catch (e: any) {
            if (!silent) onToast(e.message || 'Failed to load client status', 'error');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [onToast]);

    useEffect(() => {
        void loadAll();
    }, [loadAll]);

    useVisibleInterval(() => {
        void loadAll({ silent: true });
    }, CLIENTS_POLL_MS);

    const handleApply = async () => {
        setSaving(true);
        try {
            const data = await apiFetch('/api/upgrader/qc/extensions', {
                method: 'POST',
                body: JSON.stringify({ extensionsText: text }),
            });
            onToast(
                `Applied ${data?.extensions?.length ?? 0} blocked extension(s).`,
                'success',
            );
            await loadAll({ silent: true, force: true });
        } catch (e: any) {
            onToast(e.message || 'Failed to apply extensions', 'error');
        } finally {
            setSaving(false);
        }
    };

    const qbitConfigured = !!(policy?.clients?.qbit || snapshot?.configured?.qbit);
    const sabConfigured = !!(policy?.clients?.sab || snapshot?.configured?.sab);
    const clientsConfigured = qbitConfigured || sabConfigured;
    const qbitQueue = snapshot?.clientQueues?.qbit || {};
    const sabQueue = snapshot?.clientQueues?.sab || {};
    const qbitHealth = qbitQueue.health || snapshot?.networkHealth?.qbit || null;
    const sabHealth = sabQueue.health || snapshot?.networkHealth?.sab || null;
    const qbitStatus = healthStatus(qbitConfigured, qbitHealth);
    const sabStatus = healthStatus(sabConfigured, sabHealth);
    const draft = useMemo(() => parseExtensions(text), [text]);
    const liveUnion = policy?.union || [];
    const dirty = JSON.stringify(draft) !== JSON.stringify([...liveUnion].sort());
    const outOfSync = ((policy?.onlyQbit?.length || 0) > 0 || (policy?.onlySab?.length || 0) > 0);

    if (loading && !policy && !snapshot) {
        return (
            <div className="flex items-center justify-center gap-2 py-16 text-muted">
                <Loader2 className="w-5 h-5 animate-spin" />
                Loading client status…
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {!clientsConfigured && (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <p className="text-sm text-amber-100">
                        No download clients configured. Add qBittorrent and/or SABnzbd under Settings → Arr & Analytics.
                    </p>
                    <a
                        href={portalUrl('/settings#mediastack')}
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-plex text-background text-xs font-bold no-underline hover:bg-plex-hover shrink-0"
                    >
                        Open Settings
                    </a>
                </div>
            )}

            <section className={`${QC_SECTION} space-y-4`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h2 className="text-sm font-bold uppercase tracking-wide text-muted inline-flex items-center flex-wrap gap-x-1">
                            Download clients
                            <SettingHint>
                                Live queue and network health from qBit/SAB. Credentials stay in Settings.
                                Cleanup still happens on Hunt.
                            </SettingHint>
                        </h2>
                        <p className="text-xs text-muted mt-1">
                            Live status for hunt, import, and cleanup.
                            {snapshot?.generatedAt ? ` Updated ${new Date(snapshot.generatedAt).toLocaleTimeString()}.` : ''}
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-text disabled:opacity-50"
                            disabled={refreshing}
                            onClick={() => void loadAll({ force: true })}
                        >
                            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                            Refresh
                        </button>
                        <a
                            href={portalUrl('/settings#mediastack')}
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-plex no-underline hover:underline"
                        >
                            Edit credentials
                            <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <div className={QC_KPI}>
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <div className="text-sm font-bold text-text">qBittorrent</div>
                                <div className={`mt-0.5 text-xs font-semibold ${toneClass(qbitStatus.tone)}`}>
                                    {qbitStatus.label}
                                </div>
                            </div>
                            {qbitConfigured && (
                                <a
                                    href={portalUrl('/upgrader?tab=hunt')}
                                    className="text-[11px] font-bold text-plex no-underline hover:underline shrink-0"
                                >
                                    Open Hunt
                                </a>
                            )}
                        </div>
                        {qbitStatus.detail && (
                            <p className="text-[11px] text-amber-200 mt-1">{qbitStatus.detail}</p>
                        )}
                        {policy?.errors?.qbit && (
                            <p className="text-[11px] text-amber-200 mt-1">{policy.errors.qbit}</p>
                        )}
                        {qbitConfigured && (
                            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                                <div>
                                    <div className="text-muted uppercase tracking-wide">Queue</div>
                                    <div className="mt-0.5 text-text font-semibold tabular-nums">
                                        {Number(qbitQueue.total || 0)} torrents
                                    </div>
                                    <div className="text-muted mt-0.5">
                                        {Number(qbitQueue.downloading || 0)} dl · {Number(qbitQueue.seeding || 0)} seed
                                        {Number(qbitQueue.error || 0) ? ` · ${qbitQueue.error} error` : ''}
                                        {Number(qbitQueue.paused || 0) ? ` · ${qbitQueue.paused} paused` : ''}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-muted uppercase tracking-wide">Speed</div>
                                    <div className="mt-0.5 text-text font-semibold tabular-nums">
                                        ↓ {formatSpeed(qbitQueue.dlSpeed || qbitHealth?.dlSpeed)}
                                    </div>
                                    <div className="text-muted mt-0.5 tabular-nums">
                                        ↑ {formatSpeed(qbitQueue.upSpeed || qbitHealth?.upSpeed)}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-muted uppercase tracking-wide">Network</div>
                                    <div className="mt-0.5 text-text font-semibold">
                                        {qbitHealth?.connectionStatus || '—'}
                                    </div>
                                    <div className="text-muted mt-0.5 tabular-nums">
                                        DHT {qbitHealth?.dhtNodes ?? '—'}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-muted uppercase tracking-wide">QC issues</div>
                                    <div className={`mt-0.5 font-semibold tabular-nums ${Number(qbitQueue.qcIssues || 0) ? 'text-amber-200' : 'text-text'}`}>
                                        {Number(qbitQueue.qcIssues || 0)}
                                    </div>
                                    <div className="text-muted mt-0.5">strikes / doomed</div>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className={QC_KPI}>
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <div className="text-sm font-bold text-text">SABnzbd</div>
                                <div className={`mt-0.5 text-xs font-semibold ${toneClass(sabStatus.tone)}`}>
                                    {sabStatus.label}
                                </div>
                            </div>
                            {sabConfigured && (
                                <a
                                    href={portalUrl('/upgrader?tab=hunt')}
                                    className="text-[11px] font-bold text-plex no-underline hover:underline shrink-0"
                                >
                                    Open Hunt
                                </a>
                            )}
                        </div>
                        {sabStatus.detail && (
                            <p className="text-[11px] text-amber-200 mt-1">{sabStatus.detail}</p>
                        )}
                        {policy?.errors?.sab && (
                            <p className="text-[11px] text-amber-200 mt-1">{policy.errors.sab}</p>
                        )}
                        {sabConfigured && (
                            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                                <div>
                                    <div className="text-muted uppercase tracking-wide">Queue</div>
                                    <div className="mt-0.5 text-text font-semibold tabular-nums">
                                        {Number(sabQueue.total || 0)} active
                                    </div>
                                    <div className="text-muted mt-0.5">
                                        {Number(sabQueue.downloading || 0)} dl
                                        {Number(sabQueue.extracting || 0) ? ` · ${sabQueue.extracting} extract` : ''}
                                        {Number(sabQueue.paused || 0) ? ` · ${sabQueue.paused} paused` : ''}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-muted uppercase tracking-wide">Recent history</div>
                                    <div className="mt-0.5 text-text font-semibold tabular-nums">
                                        {Number(sabQueue.completed || 0)} done
                                    </div>
                                    <div className={`mt-0.5 ${Number(sabQueue.failed || 0) ? 'text-amber-200' : 'text-muted'}`}>
                                        {Number(sabQueue.failed || 0)} failed
                                    </div>
                                </div>
                                <div>
                                    <div className="text-muted uppercase tracking-wide">Network</div>
                                    <div className="mt-0.5 text-text font-semibold">
                                        {sabHealth?.dnslookup === 'OK'
                                            ? 'DNS OK'
                                            : sabHealth?.dnslookup || sabHealth?.publicIpv4 || '—'}
                                    </div>
                                    <div className="text-muted mt-0.5">
                                        {sabHealth?.publicIpv4 || 'Public IP unknown'}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-muted uppercase tracking-wide">QC issues</div>
                                    <div className={`mt-0.5 font-semibold tabular-nums ${Number(sabQueue.qcIssues || 0) ? 'text-amber-200' : 'text-text'}`}>
                                        {Number(sabQueue.qcIssues || 0)}
                                    </div>
                                    <div className="text-muted mt-0.5">strikes / doomed</div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </section>

            {clientsConfigured && (
                <section className={`${QC_SECTION} space-y-4`}>
                    <div>
                        <h2 className="text-sm font-bold uppercase tracking-wide text-muted inline-flex items-center flex-wrap gap-x-1">
                            Optimize for QC
                            <SettingHint>
                                Turns off SAB identical-NZB discard (so research re-grabs work) and raises qBit seed time /
                                active torrent caps so imports and packs are not false-killed.
                            </SettingHint>
                        </h2>
                        <p className="text-xs text-muted mt-1">
                            {aligned === true
                                ? 'qBit and SAB match the QC hunt/import defaults.'
                                : aligned === false
                                    ? 'One or more client prefs still fight hunt, import, or research.'
                                    : 'Check whether SAB/qBit prefs match QC.'}
                        </p>
                    </div>
                    <QcOptimizeClientsButton
                        onToast={onToast}
                        variant="full"
                        onAlignedChange={setAligned}
                    />
                </section>
            )}

            <section className={`${QC_SECTION} space-y-4`}>
                <div>
                    <h2 className="text-sm font-bold uppercase tracking-wide text-muted inline-flex items-center flex-wrap gap-x-1">
                        Blocked extensions
                        <SettingHint>
                            Apply pushes one shared list to every configured client (qBit excluded filenames,
                            SAB unwanted extensions). Comma-separated (e.g. exe, bat, lnk).
                        </SettingHint>
                    </h2>
                    <p className="text-xs text-muted mt-1">
                        Junk file types QC can kill immediately. Shared across qBit and SAB.
                    </p>
                </div>

                <div className="flex flex-wrap gap-1.5">
                    {(liveUnion.length ? liveUnion : []).map((ext) => (
                        <span
                            key={ext}
                            className="px-2 py-0.5 rounded-md border border-border/60 bg-background/40 text-[11px] font-mono text-text"
                        >
                            .{ext}
                        </span>
                    ))}
                    {!liveUnion.length && (
                        <span className="text-xs text-muted">No blocked extensions on either client.</span>
                    )}
                </div>

                {outOfSync && (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-3 space-y-1 text-xs text-amber-100">
                        <p className="font-semibold inline-flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            qBit and SAB lists differ
                        </p>
                        {(policy?.onlyQbit?.length || 0) > 0 && (
                            <p>Only on qBit: {listLabel(policy?.onlyQbit)}</p>
                        )}
                        {(policy?.onlySab?.length || 0) > 0 && (
                            <p>Only on SAB: {listLabel(policy?.onlySab)}</p>
                        )}
                        <p>Apply pushes the editor list to both.</p>
                    </div>
                )}

                <label className="block text-sm font-semibold">
                    Edit shared list
                    <input
                        type="text"
                        className="mt-2 w-full p-3 rounded-lg border border-border bg-background text-text text-sm font-mono"
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder="exe, bat, lnk"
                        disabled={!clientsConfigured}
                    />
                </label>
                <p className="text-[11px] text-muted">
                    {draft.length} extension{draft.length === 1 ? '' : 's'} in editor
                    {dirty ? ' · unsaved changes' : ''}
                    {qbitConfigured ? ` · qBit has ${policy?.qbit?.length || 0}` : ''}
                    {sabConfigured ? ` · SAB has ${policy?.sab?.length || 0}` : ''}
                </p>

                <button
                    type="button"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-plex text-background text-sm font-bold hover:bg-plex-hover disabled:opacity-50"
                    onClick={handleApply}
                    disabled={saving || !clientsConfigured || (!dirty && !outOfSync)}
                >
                    <Save className="w-4 h-4" />
                    {saving ? 'Applying…' : 'Apply to clients'}
                </button>
            </section>
        </div>
    );
};
