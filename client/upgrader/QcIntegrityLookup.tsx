import React, { useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { apiFetch } from '../shared/api';
import { QC_KPI, QC_SECTION } from './qcUi';

type LookupMatch = {
    key: string;
    title?: string | null;
    episodeTitle?: string | null;
    seasonNumber?: number | null;
    episodeNumber?: number | null;
    filePath?: string | null;
    libraryName?: string | null;
    mediaType?: string | null;
    arrType?: string | null;
    cache?: Record<string, unknown> | null;
};

type LookupResponse = {
    query?: string;
    matches?: LookupMatch[];
    truncated?: boolean;
    error?: string;
};

type FileCheckResponse = {
    ok?: boolean;
    reason?: string | null;
    detail?: string | null;
    mode?: string | null;
    cache?: Record<string, unknown> | null;
};

const FILE_ACTIONS: Array<{ mode: 'playability' | 'trim' | 'imohash' | 'xxhash' | 'baseline'; label: string }> = [
    { mode: 'playability', label: 'Playback' },
    { mode: 'trim', label: 'Trim' },
    { mode: 'imohash', label: 'Fingerprint' },
    { mode: 'xxhash', label: 'Hash' },
    { mode: 'baseline', label: 'Playback + fingerprint' },
];

const episodeLabel = (row: LookupMatch) => {
    if (row.seasonNumber == null || row.episodeNumber == null) return null;
    return `S${String(row.seasonNumber).padStart(2, '0')}E${String(row.episodeNumber).padStart(2, '0')}`;
};

type Props = {
    onToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
    xxhashEnabled?: boolean;
    disabled?: boolean;
};

export const QcIntegrityLookup: React.FC<Props> = ({
    onToast,
    xxhashEnabled = false,
    disabled = false,
}) => {
    const [query, setQuery] = useState('');
    const [searching, setSearching] = useState(false);
    const [matches, setMatches] = useState<LookupMatch[]>([]);
    const [truncated, setTruncated] = useState(false);
    const [selected, setSelected] = useState<LookupMatch | null>(null);
    const [runningMode, setRunningMode] = useState<string | null>(null);
    const [lastCheck, setLastCheck] = useState<FileCheckResponse | null>(null);

    const search = async (event?: React.FormEvent) => {
        event?.preventDefault();
        const needle = query.trim();
        if (needle.length < 2) {
            onToast?.('Type at least 2 characters to search.', 'info');
            return;
        }
        setSearching(true);
        try {
            const payload = await apiFetch(
                `/api/upgrader/qc/integrity/lookup?q=${encodeURIComponent(needle)}`,
            ) as LookupResponse;
            const rows = Array.isArray(payload.matches) ? payload.matches : [];
            setMatches(rows);
            setTruncated(!!payload.truncated);
            setSelected(rows[0] || null);
            setLastCheck(null);
            if (!rows.length) onToast?.('No matching library files.', 'info');
        } catch (error: any) {
            onToast?.(error?.message || 'Lookup failed', 'error');
        } finally {
            setSearching(false);
        }
    };

    const runCheck = async (mode: string) => {
        if (!selected?.key) return;
        setRunningMode(mode);
        try {
            const payload = await apiFetch('/api/upgrader/qc/integrity/file-check', {
                method: 'POST',
                body: JSON.stringify({ key: selected.key, mode }),
            }) as FileCheckResponse;
            setLastCheck(payload);
            if (payload.cache) {
                setSelected((current) => current ? { ...current, cache: payload.cache } : current);
                setMatches((current) => current.map((row) => (
                    row.key === selected.key ? { ...row, cache: payload.cache } : row
                )));
            }
            onToast?.(
                payload.ok
                    ? `${selected.title || 'File'}: ${mode} saved.`
                    : `${selected.title || 'File'}: ${payload.reason || 'check failed'}`,
                payload.ok ? 'success' : 'error',
            );
        } catch (error: any) {
            onToast?.(error?.message || 'File check failed', 'error');
        } finally {
            setRunningMode(null);
        }
    };

    const visibleActions = FILE_ACTIONS.filter((entry) => entry.mode !== 'xxhash' || xxhashEnabled);

    return (
        <div className={`${QC_SECTION} space-y-3`}>
            <div>
                <h3 className="text-xs font-bold uppercase tracking-wide text-muted">Inspect a file</h3>
                <p className="text-[11px] text-muted mt-1">
                    Search the library, view the saved integrity JSON, and run one check at a time.
                    Trim remuxes only when Media trim + auto-fix are on and dry-run is off.
                </p>
            </div>
            <form className="flex flex-wrap gap-2" onSubmit={(event) => void search(event)}>
                <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Title, S01E02, or path…"
                    className="min-w-[16rem] flex-1 rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-sm text-text"
                    disabled={disabled || searching}
                />
                <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-2 text-xs font-bold text-text hover:border-plex/40 disabled:opacity-50"
                    disabled={disabled || searching}
                >
                    {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                    Search
                </button>
            </form>

            {matches.length > 0 && (
                <div className="grid gap-3 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
                    <div className="space-y-1 max-h-80 overflow-y-auto">
                        {matches.map((row) => {
                            const active = selected?.key === row.key;
                            return (
                                <button
                                    key={row.key}
                                    type="button"
                                    className={`w-full text-left rounded-lg border px-2.5 py-2 ${
                                        active ? 'border-plex/50 bg-plex/10' : 'border-border/50 hover:border-plex/30'
                                    }`}
                                    onClick={() => {
                                        setSelected(row);
                                        setLastCheck(null);
                                    }}
                                >
                                    <div className="text-xs font-semibold text-text truncate">{row.title}</div>
                                    <div className="text-[10px] text-muted mt-0.5 truncate">
                                        {[episodeLabel(row), row.episodeTitle, row.libraryName].filter(Boolean).join(' · ')}
                                    </div>
                                </button>
                            );
                        })}
                        {truncated && (
                            <p className="text-[10px] text-muted px-1">Showing first matches — narrow the search.</p>
                        )}
                    </div>

                    {selected && (
                        <div className="space-y-3 min-w-0">
                            <div className={QC_KPI}>
                                <div className="text-sm font-bold text-text">{selected.title}</div>
                                <div className="text-[11px] text-muted mt-1 break-all">{selected.filePath}</div>
                                <div className="text-[10px] text-muted mt-1 font-mono break-all">{selected.key}</div>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {visibleActions.map((entry) => (
                                    <button
                                        key={entry.mode}
                                        type="button"
                                        className="px-2 py-1 rounded-md border border-border/60 text-[10px] font-bold text-text hover:border-plex/40 disabled:opacity-50 inline-flex items-center gap-1"
                                        disabled={disabled || !!runningMode}
                                        onClick={() => void runCheck(entry.mode)}
                                    >
                                        {runningMode === entry.mode
                                            ? <Loader2 className="w-3 h-3 animate-spin text-plex" />
                                            : null}
                                        {entry.label}
                                    </button>
                                ))}
                            </div>
                            {lastCheck && (
                                <p className="text-[11px] text-muted">
                                    Last check: {lastCheck.mode || '—'} · {lastCheck.ok ? 'saved' : (lastCheck.reason || 'failed')}
                                    {lastCheck.detail ? ` · ${lastCheck.detail}` : ''}
                                </p>
                            )}
                            <pre className="text-[10px] leading-relaxed text-text/90 bg-black/30 border border-border/40 rounded-lg p-3 overflow-auto max-h-96">
                                {JSON.stringify(selected.cache || { note: 'No integrity cache row yet' }, null, 2)}
                            </pre>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
