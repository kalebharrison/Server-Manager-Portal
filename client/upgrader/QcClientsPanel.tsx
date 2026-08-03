import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Save, ExternalLink } from 'lucide-react';
import { apiFetch } from '../shared/api';
import { portalUrl } from '../shared/basePath';
import { QcOptimizeClientsButton } from './QcOptimizeClientsButton';

type ExtensionPolicy = {
    qbit?: string[];
    sab?: string[];
    union?: string[];
    onlyQbit?: string[];
    onlySab?: string[];
    clients?: { qbit?: boolean; sab?: boolean };
    errors?: { qbit?: string | null; sab?: string | null };
};

type Props = {
    onToast: (message: string, type?: 'success' | 'error' | 'info') => void;
};

const listLabel = (entries?: string[]) =>
    (entries && entries.length ? entries.join(', ') : '—');

export const QcClientsPanel: React.FC<Props> = ({ onToast }) => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [policy, setPolicy] = useState<ExtensionPolicy | null>(null);
    const [text, setText] = useState('');
    const [aligned, setAligned] = useState<boolean | null>(null);

    const loadPolicy = useCallback(async () => {
        setLoading(true);
        try {
            const extData = await apiFetch('/api/upgrader/qc/extensions');
            setPolicy(extData || null);
            setText((extData?.union || []).join('\n'));
        } catch (e: any) {
            onToast(e.message || 'Failed to load client policy', 'error');
        } finally {
            setLoading(false);
        }
    }, [onToast]);

    useEffect(() => {
        loadPolicy();
    }, [loadPolicy]);

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
            await loadPolicy();
        } catch (e: any) {
            onToast(e.message || 'Failed to apply extensions', 'error');
        } finally {
            setSaving(false);
        }
    };

    if (loading && !policy) {
        return (
            <div className="flex items-center justify-center gap-2 py-16 text-muted">
                <Loader2 className="w-5 h-5 animate-spin" />
                Loading client policy…
            </div>
        );
    }

    const qbitConfigured = !!policy?.clients?.qbit;
    const sabConfigured = !!policy?.clients?.sab;
    const clientsConfigured = qbitConfigured || sabConfigured;
    const sabEmpty = sabConfigured && !(policy?.sab?.length);
    const qbitEmpty = qbitConfigured && !(policy?.qbit?.length);

    return (
        <div className="space-y-4">
            {!clientsConfigured && (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <p className="text-sm text-amber-100">
                        No download clients configured. Add qBittorrent and/or SABnzbd under Settings → Apps &amp; Automation.
                    </p>
                    <a
                        href={portalUrl('/settings#mediastack')}
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-plex text-background text-xs font-bold no-underline hover:bg-plex-hover shrink-0"
                    >
                        Open Settings
                    </a>
                </div>
            )}

            <section className="rounded-2xl border border-border/60 bg-card/40 p-5 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Download clients</h2>
                        <p className="text-xs text-muted mt-1">
                            Connection settings live in Settings. Optimize tunes SAB/qBit for QC hunt and cleanup.
                        </p>
                    </div>
                    <a
                        href={portalUrl('/settings#mediastack')}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-plex no-underline hover:underline"
                    >
                        Edit credentials
                        <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-xl border border-border/50 bg-background/40 px-3 py-3">
                        <div className="text-[11px] uppercase tracking-wide text-muted">qBittorrent</div>
                        <div className={`mt-1 text-sm font-semibold ${qbitConfigured ? 'text-emerald-300' : 'text-muted'}`}>
                            {qbitConfigured ? 'Configured' : 'Not configured'}
                        </div>
                        {policy?.errors?.qbit && (
                            <p className="text-[11px] text-amber-200 mt-1">{policy.errors.qbit}</p>
                        )}
                    </div>
                    <div className="rounded-xl border border-border/50 bg-background/40 px-3 py-3">
                        <div className="text-[11px] uppercase tracking-wide text-muted">SABnzbd</div>
                        <div className={`mt-1 text-sm font-semibold ${sabConfigured ? 'text-emerald-300' : 'text-muted'}`}>
                            {sabConfigured ? 'Configured' : 'Not configured'}
                        </div>
                        {policy?.errors?.sab && (
                            <p className="text-[11px] text-amber-200 mt-1">{policy.errors.sab}</p>
                        )}
                    </div>
                </div>
            </section>

            {clientsConfigured && (
                <section className="rounded-2xl border border-border/60 bg-card/40 p-5 space-y-4">
                    <div>
                        <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Optimize for QC</h2>
                        <p className="text-xs text-muted mt-1">
                            Turns off SAB identical-NZB discard (so research re-grabs work) and raises qBit seed time /
                            active torrent caps so imports and packs are not false-killed.
                            {aligned === true ? ' Currently aligned.' : aligned === false ? ' Currently needs apply.' : ''}
                        </p>
                    </div>
                    <QcOptimizeClientsButton
                        onToast={onToast}
                        variant="full"
                        onAlignedChange={setAligned}
                    />
                </section>
            )}

            <section className="rounded-2xl border border-border/60 bg-card/40 p-5 space-y-4">
                <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Blocked extensions</h2>
                <p className="text-xs text-muted">
                    Apply pushes one shared list to every configured client (qBit excluded filenames,
                    SAB unwanted extensions). Comma or newline separated
                    (e.g. <code className="text-text">exe, bat, lnk</code>).
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                    <div className="rounded-xl border border-border/50 bg-background/40 px-3 py-3">
                        <div className="text-[11px] uppercase tracking-wide text-muted mb-1">qBittorrent</div>
                        <div className="text-text break-words">
                            {qbitEmpty ? <span className="text-muted">Empty blacklist</span> : listLabel(policy?.qbit)}
                        </div>
                    </div>
                    <div className="rounded-xl border border-border/50 bg-background/40 px-3 py-3">
                        <div className="text-[11px] uppercase tracking-wide text-muted mb-1">SABnzbd</div>
                        <div className="text-text break-words">
                            {sabEmpty
                                ? <span className="text-muted">Empty — will match qBit after Apply</span>
                                : listLabel(policy?.sab)}
                        </div>
                    </div>
                    <div className="rounded-xl border border-border/50 bg-background/40 px-3 py-3">
                        <div className="text-[11px] uppercase tracking-wide text-muted mb-1">Shared list</div>
                        <div className="text-text break-words">{listLabel(policy?.union)}</div>
                    </div>
                </div>

                {((policy?.onlyQbit?.length || 0) > 0 || (policy?.onlySab?.length || 0) > 0) && (
                    <div className="rounded-xl border border-border/50 bg-background/30 px-3 py-3 space-y-1 text-xs text-muted">
                        <p className="font-semibold text-text">Out of sync</p>
                        {(policy?.onlyQbit?.length || 0) > 0 && (
                            <p>Only on qBit right now: {listLabel(policy?.onlyQbit)}</p>
                        )}
                        {(policy?.onlySab?.length || 0) > 0 && (
                            <p>Only on SAB right now: {listLabel(policy?.onlySab)}</p>
                        )}
                        <p>Hit Apply to push the shared list to both.</p>
                    </div>
                )}

                <label className="block text-sm font-semibold">
                    Edit shared list
                    <textarea
                        className="mt-2 w-full min-h-[140px] p-3 rounded-lg border border-border bg-background text-text text-sm font-mono"
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder={"exe\nbat\nlnk"}
                        disabled={!clientsConfigured}
                    />
                </label>

                <button
                    type="button"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-plex text-background text-sm font-bold hover:bg-plex-hover disabled:opacity-50"
                    onClick={handleApply}
                    disabled={saving || !clientsConfigured}
                >
                    <Save className="w-4 h-4" />
                    {saving ? 'Applying…' : 'Apply to clients'}
                </button>
            </section>
        </div>
    );
};
