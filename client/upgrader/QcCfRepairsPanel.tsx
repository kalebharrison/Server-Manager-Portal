import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, ShieldCheck, Wrench } from 'lucide-react';
import { apiFetch } from '../shared/api';
import { SettingHint } from '../settings/SettingHint';
import { QC_KPI, QC_SECTION } from './qcUi';

type RepairCatalogEntry = {
    id: string;
    title: string;
    summary: string;
    appliesTo?: string[];
};

type RepairInstanceRow = {
    instanceId?: string;
    instanceName?: string;
    type?: string;
    needingCount?: number;
    error?: string;
    repairs?: Array<{
        id: string;
        title: string;
        summary: string;
        healthy?: boolean;
        needingCount?: number;
        needing?: Array<{ id?: number; name?: string }>;
    }>;
};

type RepairsResponse = {
    healthy?: boolean;
    needingCount?: number;
    catalog?: RepairCatalogEntry[];
    results?: RepairInstanceRow[];
};

type Props = {
    onToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
    /** Skip outer glass card when nested in SettingsCollapseSection. */
    embedded?: boolean;
};

export const QcCfRepairsPanel: React.FC<Props> = ({ onToast, embedded = false }) => {
    const [loading, setLoading] = useState(true);
    const [repairing, setRepairing] = useState(false);
    const [status, setStatus] = useState<RepairsResponse | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const payload = await apiFetch('/api/upgrader/customformats/repairs') as RepairsResponse;
            setStatus(payload);
        } catch (error: any) {
            onToast?.(error?.message || 'Failed to load CF repairs', 'error');
        } finally {
            setLoading(false);
        }
    }, [onToast]);

    useEffect(() => {
        void load();
    }, [load]);

    const runRepairs = async () => {
        setRepairing(true);
        try {
            const payload = await apiFetch('/api/upgrader/customformats/repairs', {
                method: 'POST',
                body: JSON.stringify({}),
            }) as { repairedCount?: number };
            const count = Number(payload?.repairedCount || 0);
            onToast?.(
                count ? `Applied ${count} custom-format repair(s).` : 'No CF repairs needed.',
                'success',
            );
            await load();
        } catch (error: any) {
            onToast?.(error?.message || 'CF repair failed', 'error');
        } finally {
            setRepairing(false);
        }
    };

    const needing = Number(status?.needingCount || 0);
    const catalog = status?.catalog || [];
    const results = status?.results || [];

    return (
        <section className={`${embedded ? 'space-y-4' : `${QC_SECTION} space-y-4`}`}>
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div>
                    {!embedded && (
                    <h2 className="text-sm font-bold uppercase tracking-wide text-muted flex items-center gap-2 flex-wrap">
                        <Wrench className="w-4 h-4 text-plex" />
                        Custom format repairs
                        <SettingHint>
                            Known TRaSH/CF holes that block good upgrades. Checked against live Sonarr/Radarr formats
                            so we do not forget them after a sync.
                        </SettingHint>
                    </h2>
                    )}
                    <p className={`text-xs text-muted max-w-2xl ${embedded ? '' : 'mt-1'}`}>
                        Auto-checks known CF gaps against live Arr instances.
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <button
                        type="button"
                        className="px-3 py-1.5 rounded-lg border border-border text-xs font-bold text-text hover:border-plex/40 disabled:opacity-50"
                        disabled={loading || repairing}
                        onClick={() => void load()}
                    >
                        Refresh
                    </button>
                    <button
                        type="button"
                        className="px-3 py-1.5 rounded-lg bg-plex text-background text-xs font-bold hover:bg-plex-hover disabled:opacity-50"
                        disabled={loading || repairing || needing === 0}
                        onClick={() => void runRepairs()}
                    >
                        {repairing ? 'Repairing…' : needing > 0 ? `Repair ${needing}` : 'All healthy'}
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center gap-2 text-xs text-muted">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Checking Arr custom formats…
                </div>
            ) : (
                <>
                    <div className={`rounded-xl border px-3 py-3 ${needing > 0 ? 'border-amber-500/30 bg-amber-500/10' : 'border-emerald-500/30 bg-emerald-500/10'}`}>
                        <div className="flex items-center gap-2 text-sm font-bold">
                            <ShieldCheck className={`w-4 h-4 ${needing > 0 ? 'text-amber-200' : 'text-emerald-300'}`} />
                            <span className={needing > 0 ? 'text-amber-100' : 'text-emerald-100'}>
                                {needing > 0
                                    ? `${needing} repair(s) needed across Arr instances`
                                    : 'All known CF repairs are healthy'}
                            </span>
                        </div>
                    </div>

                    <div className="space-y-3">
                        {catalog.map((entry) => {
                            const hits = results.flatMap((row) => (
                                (row.repairs || [])
                                    .filter((repair) => repair.id === entry.id && Number(repair.needingCount || 0) > 0)
                                    .map((repair) => ({
                                        instanceName: row.instanceName,
                                        type: row.type,
                                        formats: repair.needing || [],
                                    }))
                            ));
                            return (
                                <div key={entry.id} className={QC_KPI}>
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <div className="text-sm font-semibold text-text">{entry.title}</div>
                                            <p className="text-xs text-muted mt-1">{entry.summary}</p>
                                        </div>
                                        <div className={`text-[11px] font-bold uppercase tracking-wide ${hits.length ? 'text-amber-200' : 'text-emerald-300'}`}>
                                            {hits.length ? 'Needs repair' : 'Healthy'}
                                        </div>
                                    </div>
                                    {hits.length > 0 && (
                                        <ul className="mt-2 text-xs text-muted space-y-1">
                                            {hits.map((hit) => (
                                                <li key={`${entry.id}:${hit.instanceName}`}>
                                                    {hit.instanceName} ({hit.type}): {(hit.formats || []).map((f) => f.name).join(', ') || 'format match'}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {results.some((row) => row.error) && (
                        <div className="text-xs text-amber-200">
                            {results.filter((row) => row.error).map((row) => (
                                <div key={row.instanceId}>{row.instanceName}: {row.error}</div>
                            ))}
                        </div>
                    )}
                </>
            )}
        </section>
    );
};
