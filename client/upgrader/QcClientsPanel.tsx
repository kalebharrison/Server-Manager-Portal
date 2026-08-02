import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { apiFetch } from '../shared/api';
import { portalUrl } from '../shared/basePath';

type ExtensionPolicy = {
    qbit?: string[];
    sab?: string[];
    union?: string[];
    onlyQbit?: string[];
    onlySab?: string[];
    clients?: { qbit?: boolean; sab?: boolean };
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

    const loadPolicy = useCallback(async () => {
        setLoading(true);
        try {
            const data = await apiFetch('/api/upgrader/qc/extensions');
            setPolicy(data || null);
            setText((data?.union || []).join('\n'));
        } catch (e: any) {
            onToast(e.message || 'Failed to load extension policy', 'error');
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

    const clientsConfigured = !!(policy?.clients?.qbit || policy?.clients?.sab);

    return (
        <div className="space-y-4">
            {!clientsConfigured && (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <p className="text-sm text-amber-100">
                        No download clients configured. Add qBittorrent and/or SABnzbd under Settings → Quality Control.
                    </p>
                    <a
                        href={portalUrl('/settings#upgrader')}
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-plex text-background text-xs font-bold no-underline hover:bg-plex-hover shrink-0"
                    >
                        Open Settings
                    </a>
                </div>
            )}

            <section className="rounded-2xl border border-border/60 bg-card/40 p-5 space-y-4">
                <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Blocked extensions</h2>
                <p className="text-xs text-muted">
                    Union list is pushed to both clients when you apply. Comma or newline separated (e.g. <code className="text-text">exe, bat, lnk</code>).
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                    <div className="rounded-xl border border-border/50 bg-background/40 px-3 py-3">
                        <div className="text-[11px] uppercase tracking-wide text-muted mb-1">
                            qBittorrent {policy?.clients?.qbit ? '' : '(not configured)'}
                        </div>
                        <div className="text-text break-words">{listLabel(policy?.qbit)}</div>
                    </div>
                    <div className="rounded-xl border border-border/50 bg-background/40 px-3 py-3">
                        <div className="text-[11px] uppercase tracking-wide text-muted mb-1">
                            SABnzbd {policy?.clients?.sab ? '' : '(not configured)'}
                        </div>
                        <div className="text-text break-words">{listLabel(policy?.sab)}</div>
                    </div>
                    <div className="rounded-xl border border-border/50 bg-background/40 px-3 py-3">
                        <div className="text-[11px] uppercase tracking-wide text-muted mb-1">Union</div>
                        <div className="text-text break-words">{listLabel(policy?.union)}</div>
                    </div>
                </div>

                {((policy?.onlyQbit?.length || 0) > 0 || (policy?.onlySab?.length || 0) > 0) && (
                    <div className="rounded-xl border border-border/50 bg-background/30 px-3 py-3 space-y-1 text-xs text-muted">
                        {(policy?.onlyQbit?.length || 0) > 0 && (
                            <p><span className="font-semibold text-text">Only qBit:</span> {listLabel(policy?.onlyQbit)}</p>
                        )}
                        {(policy?.onlySab?.length || 0) > 0 && (
                            <p><span className="font-semibold text-text">Only SAB:</span> {listLabel(policy?.onlySab)}</p>
                        )}
                    </div>
                )}

                <label className="block text-sm font-semibold">
                    Edit union list
                    <textarea
                        className="mt-2 w-full min-h-[120px] p-3 rounded-lg border border-border bg-background text-text text-sm font-mono"
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder="exe&#10;bat&#10;lnk"
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
