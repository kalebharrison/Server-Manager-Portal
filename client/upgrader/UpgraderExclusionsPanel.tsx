import React, { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { apiFetch } from '../shared/api';
import type { ToastMessage } from '../shared/types';
import { SettingHint } from '../settings/SettingHint';
import { QC_SECTION } from './qcUi';

type PrefsShape = {
    excludedRatingKeys?: string[];
    excludedTitles?: string[];
    excludedLibraries?: string[];
    snoozed?: Record<string, string> | Array<{ ratingKey: string; until: string | null }>;
    downloadSnoozed?: Record<string, string>;
    [key: string]: unknown;
};

type SnoozeRow = { key: string; until: string; kind: 'hunt' | 'download' };

type UpgraderExclusionsPanelProps = {
    addToast: (message: string, type?: ToastMessage['type']) => void;
    onChanged?: () => void;
};

const activeSnoozeRows = (prefs: PrefsShape): SnoozeRow[] => {
    const now = Date.now();
    const rows: SnoozeRow[] = [];
    const hunt = prefs.snoozed;
    if (Array.isArray(hunt)) {
        for (const entry of hunt) {
            const until = entry?.until;
            if (until && Date.parse(until) > now) {
                rows.push({ key: String(entry.ratingKey), until, kind: 'hunt' });
            }
        }
    } else if (hunt && typeof hunt === 'object') {
        for (const [key, until] of Object.entries(hunt)) {
            if (until && Date.parse(String(until)) > now) {
                rows.push({ key, until: String(until), kind: 'hunt' });
            }
        }
    }
    const downloads = prefs.downloadSnoozed || {};
    for (const [key, until] of Object.entries(downloads)) {
        if (until && Date.parse(String(until)) > now) {
            rows.push({ key, until: String(until), kind: 'download' });
        }
    }
    return rows.sort((a, b) => Date.parse(a.until) - Date.parse(b.until));
};

export const UpgraderExclusionsPanel: React.FC<UpgraderExclusionsPanelProps> = ({ addToast, onChanged }) => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [prefs, setPrefs] = useState<PrefsShape | null>(null);
    const [titleInput, setTitleInput] = useState('');

    const loadPrefs = useCallback(async () => {
        setLoading(true);
        try {
            const data = await apiFetch('/api/upgrader/preferences');
            setPrefs(data?.upgrader || {
                excludedRatingKeys: [],
                excludedTitles: [],
                excludedLibraries: [],
                snoozed: {},
                downloadSnoozed: {},
            });
        } catch (e: any) {
            addToast(e.message || 'Failed to load exclusions', 'error');
        } finally {
            setLoading(false);
        }
    }, [addToast]);

    useEffect(() => {
        loadPrefs();
    }, [loadPrefs]);

    const savePrefs = async (next: PrefsShape) => {
        setSaving(true);
        try {
            await apiFetch('/api/upgrader/preferences', {
                method: 'POST',
                body: JSON.stringify({ upgrader: next }),
            });
            setPrefs(next);
            onChanged?.();
            addToast('Skip list updated.', 'success');
        } catch (e: any) {
            addToast(e.message || 'Failed to save exclusions', 'error');
        } finally {
            setSaving(false);
        }
    };

    const unsnoozeHunt = async (ratingKey: string) => {
        try {
            await apiFetch('/api/upgrader/unsnooze', {
                method: 'POST',
                body: JSON.stringify({ ratingKey }),
            });
            await loadPrefs();
            onChanged?.();
        } catch (e: any) {
            addToast(e.message || 'Failed to unsnooze item', 'error');
        }
    };

    const unsnoozeDownload = async (key: string) => {
        try {
            await apiFetch('/api/upgrader/qc/snooze/clear', {
                method: 'POST',
                body: JSON.stringify({ key }),
            });
            await loadPrefs();
            onChanged?.();
        } catch (e: any) {
            addToast(e.message || 'Failed to clear download snooze', 'error');
        }
    };

    if (loading || !prefs) {
        return (
            <div className="flex items-center justify-center gap-2 py-16 text-muted">
                <Loader2 className="w-5 h-5 animate-spin" />
                Loading exclusions…
            </div>
        );
    }

    const titles = Array.isArray(prefs.excludedTitles) ? prefs.excludedTitles : [];
    const snoozedRows = activeSnoozeRows(prefs);

    return (
        <div className="space-y-6">
            <section className={`${QC_SECTION} space-y-3`}>
                <h3 className="text-sm font-bold text-text inline-flex items-center flex-wrap gap-x-1">
                    Snoozed
                    <SettingHint>
                        Hunt snoozes hide titles from auto-hunt. Download snoozes skip cleanup for a queue row.
                    </SettingHint>
                </h3>
                {snoozedRows.length === 0 ? (
                    <p className="text-xs text-muted">Nothing snoozed right now.</p>
                ) : snoozedRows.map((entry) => (
                    <div key={`${entry.kind}:${entry.key}`} className="flex items-center justify-between gap-3 py-2 border-b border-border/40 last:border-b-0">
                        <div className="min-w-0">
                            <div className="text-sm font-medium text-text truncate">{entry.key}</div>
                            <div className="text-[11px] text-muted">
                                {entry.kind === 'download' ? 'Download cleanup' : 'Hunt'}
                                {' · '}Until {new Date(entry.until).toLocaleString()}
                            </div>
                        </div>
                        <button
                            type="button"
                            className="text-xs font-bold text-plex shrink-0"
                            onClick={() => (entry.kind === 'download' ? unsnoozeDownload(entry.key) : unsnoozeHunt(entry.key))}
                        >
                            Unsnooze
                        </button>
                    </div>
                ))}
            </section>

            <section className={`${QC_SECTION} space-y-3`}>
                <h3 className="text-sm font-bold text-text">Always skip (exact title)</h3>
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={titleInput}
                        onChange={(e) => setTitleInput(e.target.value)}
                        placeholder="Exact title to exclude…"
                        className="flex-1 p-2 rounded border border-border bg-background text-text text-sm"
                    />
                    <button
                        type="button"
                        disabled={saving || !titleInput.trim()}
                        className="px-3 py-2 rounded bg-plex text-background text-xs font-bold disabled:opacity-50"
                        onClick={() => {
                            const title = titleInput.trim();
                            if (!title) return;
                            const next = {
                                ...prefs,
                                excludedTitles: [...new Set([...titles, title])],
                            };
                            setTitleInput('');
                            savePrefs(next);
                        }}
                    >
                        Add
                    </button>
                </div>
                {titles.length === 0 ? (
                    <p className="text-xs text-muted">No title exclusions.</p>
                ) : titles.map((title) => (
                    <div key={title} className="flex items-center justify-between gap-3 py-2 border-b border-border/40 last:border-b-0">
                        <span className="text-sm text-text">{title}</span>
                        <button
                            type="button"
                            className="text-xs font-bold text-red-300"
                            onClick={() => savePrefs({
                                ...prefs,
                                excludedTitles: titles.filter((entry) => entry !== title),
                            })}
                        >
                            Remove
                        </button>
                    </div>
                ))}
            </section>
        </div>
    );
};
