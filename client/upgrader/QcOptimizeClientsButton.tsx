import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Sparkles } from 'lucide-react';
import { apiFetch } from '../shared/api';

type AlignmentRow = {
    key: string;
    label: string;
    current: number | null;
    recommended: number | null;
    ok: boolean;
    meaning?: string;
};

type AlignmentPayload = {
    aligned?: boolean;
    clients?: { qbit?: boolean; sab?: boolean };
    sab?: { configured?: boolean; aligned?: boolean; rows?: AlignmentRow[]; error?: string };
    qbit?: { configured?: boolean; aligned?: boolean; rows?: AlignmentRow[]; error?: string };
    errors?: { qbit?: string | null; sab?: string | null };
};

type Props = {
    onToast: (message: string, type?: 'success' | 'error' | 'info') => void;
    /** Compact = Overview strip; full = Clients tab with diff table. */
    variant?: 'compact' | 'full';
    className?: string;
    onAlignedChange?: (aligned: boolean | null) => void;
};

const formatRowValue = (row: AlignmentRow) => {
    if (row.meaning) return `${row.current} (${row.meaning})`;
    if (row.current == null) return '—';
    return String(row.current);
};

export const QcOptimizeClientsButton: React.FC<Props> = ({
    onToast,
    variant = 'compact',
    className = '',
    onAlignedChange,
}) => {
    const [loading, setLoading] = useState(true);
    const [applying, setApplying] = useState(false);
    const [alignment, setAlignment] = useState<AlignmentPayload | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const data = await apiFetch('/api/upgrader/qc/client-alignment');
            setAlignment(data || null);
            onAlignedChange?.(data?.aligned ?? null);
        } catch {
            setAlignment(null);
            onAlignedChange?.(null);
        } finally {
            setLoading(false);
        }
    }, [onAlignedChange]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const clientsConfigured = Boolean(alignment?.clients?.qbit || alignment?.clients?.sab);

    const handleOptimize = async () => {
        setApplying(true);
        try {
            const data = await apiFetch('/api/upgrader/qc/client-alignment', {
                method: 'POST',
                body: '{}',
            });
            setAlignment(data || null);
            onAlignedChange?.(data?.aligned ?? null);
            onToast(
                data?.aligned
                    ? 'qBit & SAB optimized for Quality Control.'
                    : 'Applied recommended settings (check remaining diffs).',
                data?.aligned ? 'success' : 'info',
            );
        } catch (e: any) {
            onToast(e.message || 'Failed to optimize qBit & SAB', 'error');
        } finally {
            setApplying(false);
        }
    };

    if (loading && !alignment) {
        return (
            <div className={`inline-flex items-center gap-2 text-xs text-muted ${className}`}>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Checking clients…
            </div>
        );
    }

    if (!clientsConfigured) {
        return variant === 'full' ? null : (
            <p className={`text-xs text-muted ${className}`}>
                Configure qBit/SAB under Settings to enable Optimize.
            </p>
        );
    }

    const aligned = !!alignment?.aligned;
    const alignmentRows = [
        ...(alignment?.sab?.configured ? (alignment.sab.rows || []) : []),
        ...(alignment?.qbit?.configured ? (alignment.qbit.rows || []) : []),
    ];

    const button = (
        <button
            type="button"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-plex text-background text-sm font-bold hover:bg-plex-hover disabled:opacity-50"
            onClick={handleOptimize}
            disabled={applying}
            title="Set SAB/qBit prefs that match QC hunt, import, and research"
        >
            {applying
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Sparkles className="w-4 h-4" />}
            {applying ? 'Optimizing…' : 'Optimize qBit & SAB'}
        </button>
    );

    if (variant === 'compact') {
        return (
            <div className={`flex flex-wrap items-center gap-3 ${className}`}>
                <div className={`inline-flex items-center gap-1.5 text-xs font-bold ${aligned ? 'text-emerald-300' : 'text-amber-200'}`}>
                    {aligned
                        ? <><CheckCircle2 className="w-3.5 h-3.5" /> Clients aligned</>
                        : <><AlertTriangle className="w-3.5 h-3.5" /> Clients need optimize</>}
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

            {alignmentRows.length > 0 && (
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
                                        {formatRowValue(row)}
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

            {(alignment?.errors?.sab || alignment?.errors?.qbit || alignment?.sab?.error || alignment?.qbit?.error) && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100 space-y-1">
                    {(alignment?.errors?.sab || alignment?.sab?.error) && (
                        <p>SAB: {alignment?.errors?.sab || alignment?.sab?.error}</p>
                    )}
                    {(alignment?.errors?.qbit || alignment?.qbit?.error) && (
                        <p>qBit: {alignment?.errors?.qbit || alignment?.qbit?.error}</p>
                    )}
                </div>
            )}

            {button}
        </div>
    );
};
