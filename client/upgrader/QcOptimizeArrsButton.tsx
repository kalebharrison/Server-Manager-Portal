import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Sparkles } from 'lucide-react';
import { apiFetch } from '../shared/api';

type AlignmentRow = {
    key: string;
    label: string;
    current: string | number | null;
    recommended: string | number | null;
    ok: boolean;
};

type ArrInstanceAlignment = {
    kind?: string;
    name?: string;
    configured?: boolean;
    aligned?: boolean;
    rows?: AlignmentRow[];
    error?: string;
};

type AlignmentPayload = {
    aligned?: boolean;
    arrs?: { sonarr?: boolean; radarr?: boolean; lidarr?: boolean };
    instances?: ArrInstanceAlignment[];
    errors?: Record<string, string | null>;
    message?: string;
};

type Props = {
    onToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
    variant?: 'compact' | 'full';
    className?: string;
};

export const QcOptimizeArrsButton: React.FC<Props> = ({
    onToast,
    variant = 'full',
    className = '',
}) => {
    const [loading, setLoading] = useState(true);
    const [applying, setApplying] = useState(false);
    const [alignment, setAlignment] = useState<AlignmentPayload | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const data = await apiFetch('/api/upgrader/qc/arr-alignment');
            setAlignment(data || null);
        } catch {
            setAlignment(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const arrsConfigured = Boolean(
        alignment?.arrs?.sonarr || alignment?.arrs?.radarr || alignment?.arrs?.lidarr,
    );

    const handleOptimize = async () => {
        setApplying(true);
        try {
            const data = await apiFetch('/api/upgrader/qc/arr-alignment', {
                method: 'POST',
                body: '{}',
            });
            setAlignment(data || null);
            onToast?.(
                data?.aligned
                    ? (data.message || 'Arrs optimized for Integrity + media announces.')
                    : 'Applied recommended Arr hooks (check remaining diffs).',
                data?.aligned ? 'success' : 'info',
            );
        } catch (error: any) {
            onToast?.(error.message || 'Failed to optimize Arrs', 'error');
            void refresh();
        } finally {
            setApplying(false);
        }
    };

    if (loading && !alignment) {
        return (
            <div className={`inline-flex items-center gap-2 text-xs text-muted ${className}`}>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Checking Arrs…
            </div>
        );
    }

    if (!arrsConfigured) {
        return variant === 'full' ? (
            <p className={`text-xs text-muted ${className}`}>
                Configure Sonarr / Radarr / Lidarr under Settings to enable Optimize Arrs.
            </p>
        ) : null;
    }

    const aligned = !!alignment?.aligned;
    const alignmentRows = (alignment?.instances || []).flatMap((instance) => instance.rows || []);

    const button = (
        <button
            type="button"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-plex text-background text-sm font-bold hover:bg-plex-hover disabled:opacity-50"
            onClick={handleOptimize}
            disabled={applying}
            title="Write Portal Integrity Connect webhooks so imports and upgrades reach QC"
        >
            {applying
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Sparkles className="w-4 h-4" />}
            {applying ? 'Optimizing…' : 'Optimize Arrs'}
        </button>
    );

    if (variant === 'compact') {
        return (
            <div className={`flex flex-wrap items-center gap-3 ${className}`}>
                <div className={`inline-flex items-center gap-1.5 text-xs font-bold ${aligned ? 'text-emerald-300' : 'text-amber-200'}`}>
                    {aligned
                        ? <><CheckCircle2 className="w-3.5 h-3.5" /> Arrs aligned</>
                        : <><AlertTriangle className="w-3.5 h-3.5" /> Arrs need optimize</>}
                </div>
                {button}
            </div>
        );
    }

    return (
        <div className={`space-y-4 ${className}`}>
            <div className={`inline-flex items-center gap-1.5 text-xs font-bold ${aligned ? 'text-emerald-300' : 'text-amber-200'}`}>
                {aligned
                    ? <><CheckCircle2 className="w-3.5 h-3.5" /> Aligned</>
                    : <><AlertTriangle className="w-3.5 h-3.5" /> Needs optimize</>}
            </div>

            {!aligned && alignmentRows.length > 0 && (
                <div className="overflow-x-auto rounded-xl border border-border/50">
                    <table className="w-full text-xs text-left">
                        <thead className="bg-background/50 text-muted uppercase tracking-wide">
                            <tr>
                                <th className="px-3 py-2 font-semibold">Setting</th>
                                <th className="px-3 py-2 font-semibold">Current</th>
                                <th className="px-3 py-2 font-semibold">Recommended</th>
                            </tr>
                        </thead>
                        <tbody>
                            {alignmentRows.map((row) => (
                                <tr key={row.key} className="border-t border-border/40">
                                    <td className="px-3 py-2 text-text">{row.label}</td>
                                    <td className={`px-3 py-2 ${row.ok ? 'text-emerald-300' : 'text-amber-200'}`}>
                                        {row.current == null ? '—' : String(row.current)}
                                    </td>
                                    <td className="px-3 py-2 text-muted">
                                        {row.recommended == null ? '—' : String(row.recommended)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {Object.values(alignment?.errors || {}).some(Boolean) && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100 space-y-1">
                    {Object.entries(alignment?.errors || {}).filter(([, message]) => message).map(([kind, message]) => (
                        <p key={kind}>{kind}: {message}</p>
                    ))}
                </div>
            )}

            {button}
        </div>
    );
};
