import React from 'react';
import { Check, X } from 'lucide-react';

import { portalUrl } from '../shared/basePath';
import { CustomSelect } from '../shared/ui';

export const MaintenanceExclusionsSection: React.FC<{
    addToast: (message: string, type?: 'success' | 'error') => void;
    excludedRatingKeySet: Set<string>;
    exclusionsSummary: { ratingKeys: any[]; titles: any[]; libraries: any[] };
    libraryBrowseId: string;
    libraryBrowseLimit: number;
    libraryBrowseLoading: boolean;
    libraryBrowsePage: number;
    libraryBrowseSearch: string;
    libraryBrowseTotal: number;
    libraryItems: any[];
    libraryOptions: Array<{ id: string; title: string; count: number }>;
    loadExclusionsSummary: () => Promise<void>;
    loadLibraryBrowse: () => Promise<void>;
    preferences: any;
    savePreferences: (nextPrefs: any) => Promise<void>;
    selectedExcludeKeys: string[];
    setLibraryBrowseId: (value: string) => void;
    setLibraryBrowsePage: React.Dispatch<React.SetStateAction<number>>;
    setLibraryBrowseSearch: (value: string) => void;
    setPreferences: React.Dispatch<React.SetStateAction<any>>;
    setSelectedExcludeKeys: React.Dispatch<React.SetStateAction<string[]>>;
    updateRatingKeyExclusions: (nextKeys: string[]) => Promise<void>;
}> = ({
    addToast,
    excludedRatingKeySet,
    exclusionsSummary,
    libraryBrowseId,
    libraryBrowseLimit,
    libraryBrowseLoading,
    libraryBrowsePage,
    libraryBrowseSearch,
    libraryBrowseTotal,
    libraryItems,
    libraryOptions,
    loadExclusionsSummary,
    loadLibraryBrowse,
    preferences,
    savePreferences,
    selectedExcludeKeys,
    setLibraryBrowseId,
    setLibraryBrowsePage,
    setLibraryBrowseSearch,
    setPreferences,
    setSelectedExcludeKeys,
    updateRatingKeyExclusions
}) => (
    <div className="glass-card-sm p-4 md:p-5 space-y-3">
        <h3 className="text-xl font-bold text-plex">Exclusions</h3>
        <p className="text-sm text-muted">Click posters to select them for bulk actions. Selected items show a checkmark overlay. Use the Exclude link under each title for one-off changes.</p>
        <div className="bg-background/30 border border-white/5 rounded-lg p-3 md:p-4 space-y-2.5">
            <div className="min-w-0 md:w-[220px] h-9">
                <CustomSelect
                    value={libraryBrowseId}
                    onChange={(value) => {
                        setLibraryBrowseId(value);
                        setLibraryBrowsePage(1);
                    }}
                    options={[
                        { label: 'All Libraries', value: 'all' },
                        ...libraryOptions.map((library) => ({
                            label: `${library.title} (${library.count})`,
                            value: library.id
                        }))
                    ]}
                />
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 items-center mt-1">
                <input
                    className="h-9 px-2.5 rounded border border-border bg-card text-text text-xs md:text-sm min-w-0"
                    placeholder="Search title..."
                    value={libraryBrowseSearch}
                    onChange={(e) => {
                        setLibraryBrowseSearch(e.target.value);
                        setLibraryBrowsePage(1);
                    }}
                />
                <button type="button" className="h-9 px-3 bg-border text-text rounded-md text-xs md:text-sm font-semibold whitespace-nowrap" onClick={loadLibraryBrowse}>Refresh</button>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] md:flex md:flex-wrap items-center gap-2">
                <button
                    type="button"
                    className="h-9 px-3 bg-border text-text rounded-md text-xs md:text-sm font-semibold whitespace-nowrap"
                    onClick={() => setSelectedExcludeKeys(libraryItems.map((item: any) => String(item.ratingKey || '')).filter(Boolean))}
                    disabled={!libraryItems.length}
                >
                    Select Page
                </button>
                <button
                    type="button"
                    className="h-9 px-3 bg-plex text-background rounded-md text-xs md:text-sm font-semibold whitespace-nowrap"
                    onClick={async () => {
                        if (!selectedExcludeKeys.length) {
                            addToast('Select posters to exclude first.', 'error');
                            return;
                        }
                        const merged = Array.from(new Set([...(preferences?.exclusions?.ratingKeys || []).map((v: string) => String(v)), ...selectedExcludeKeys]));
                        await updateRatingKeyExclusions(merged);
                        setSelectedExcludeKeys([]);
                        addToast(`Excluded ${selectedExcludeKeys.length} selected title(s).`);
                    }}
                >
                    Exclude Selected ({selectedExcludeKeys.length})
                </button>
                <button
                    type="button"
                    className="h-9 w-9 flex items-center justify-center bg-red-500/15 border border-red-500/40 text-red-300 rounded-md hover:bg-red-500/25 transition-colors"
                    onClick={() => setSelectedExcludeKeys([])}
                    title="Clear Selection"
                    aria-label="Clear Selection"
                >
                    <X className="w-3.5 h-3.5 md:w-4 md:h-4" />
                </button>
                <button
                    type="button"
                    className="col-span-2 md:col-auto h-9 px-3 bg-border text-text rounded-md text-xs md:text-sm font-semibold whitespace-nowrap"
                    onClick={async () => {
                        if (!selectedExcludeKeys.length) {
                            addToast('Select posters to unexclude first.', 'error');
                            return;
                        }
                        const removedCount = selectedExcludeKeys.length;
                        const remaining = (preferences?.exclusions?.ratingKeys || []).map((v: string) => String(v)).filter((key: string) => !selectedExcludeKeys.includes(key));
                        await updateRatingKeyExclusions(remaining);
                        setSelectedExcludeKeys([]);
                        addToast(`Removed ${removedCount} selected exclusion(s).`);
                    }}
                >
                    Remove Selected Exclusions
                </button>
                <p className="col-span-2 text-[11px] md:text-xs text-muted w-full md:w-auto md:ml-auto md:text-right">Showing {libraryItems.length} of {libraryBrowseTotal} titles · page {libraryBrowsePage}</p>
            </div>
            {libraryBrowseLoading ? (
                <p className="text-sm text-muted">Loading posters...</p>
            ) : (
                <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-8 gap-2 md:gap-3 max-h-[1240px] overflow-y-auto custom-scrollbar pr-1">
                    {libraryItems.map((item: any) => {
                        const key = String(item.ratingKey || '');
                        const selected = selectedExcludeKeys.includes(key);
                        const excluded = item.excluded || excludedRatingKeySet.has(key);
                        const toggleQuickExclude = async (event: React.MouseEvent) => {
                            event.preventDefault();
                            event.stopPropagation();
                            const currentKeys = (preferences?.exclusions?.ratingKeys || []).map((v: string) => String(v));
                            const nextKeys = excluded ? currentKeys.filter((v: string) => v !== key) : Array.from(new Set([...currentKeys, key]));
                            await updateRatingKeyExclusions(nextKeys);
                            addToast(excluded ? `Removed exclusion for ${item.title}.` : `Excluded ${item.title}.`);
                        };
                        return (
                            <div
                                key={`exclude-item-${key}`}
                                className={`relative w-full border rounded-lg overflow-hidden transition-all ${selected ? 'border-plex bg-plex/5 shadow-[0_0_0_1px_rgba(229,160,13,0.35)]' : 'border-white/5'} ${excluded ? 'ring-1 ring-red-500/60' : ''}`}
                            >
                                <button
                                    type="button"
                                    className="w-full text-left"
                                    aria-pressed={selected}
                                    onClick={() => {
                                        setSelectedExcludeKeys((prev) => prev.includes(key) ? prev.filter((v) => v !== key) : [...prev, key]);
                                    }}
                                >
                                    <div className="aspect-[2/3] bg-black/40 relative">
                                        {item.thumb ? (
                                            <img src={portalUrl(`/api/plex/image?path=${encodeURIComponent(item.thumb)}&width=220&height=330`)} alt={item.title} loading="lazy" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-xs text-muted">No Poster</div>
                                        )}
                                        {selected && (
                                            <>
                                                <div className="absolute inset-0 bg-plex/20 pointer-events-none" />
                                                <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-plex text-background flex items-center justify-center shadow-md pointer-events-none">
                                                    <Check className="w-3.5 h-3.5" strokeWidth={3} />
                                                </div>
                                            </>
                                        )}
                                        {excluded && (
                                            <span className="absolute top-2 right-2 text-[10px] px-1.5 py-0.5 rounded bg-red-600/95 text-white font-bold pointer-events-none">
                                                Excluded
                                            </span>
                                        )}
                                    </div>
                                    <p className="px-2 pt-2 text-xs text-text line-clamp-2">{item.title}</p>
                                </button>
                                <div className="px-2 pb-2 pt-1 flex items-center justify-between gap-2 min-h-[2rem]">
                                    <p className="text-[11px] text-muted truncate">{item.libraryTitle}</p>
                                    <button
                                        type="button"
                                        className={`text-[10px] font-semibold shrink-0 whitespace-nowrap transition-colors ${excluded ? 'text-muted hover:text-text' : 'text-plex hover:text-plex-hover'}`}
                                        onClick={toggleQuickExclude}
                                    >
                                        {excluded ? 'Unexclude' : 'Exclude'}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                    {!libraryItems.length && <p className="text-sm text-muted col-span-full">No titles found for the current library/search.</p>}
                </div>
            )}
            <div className="flex items-center justify-between">
                <button
                    type="button"
                    className="px-3 py-1.5 bg-border text-text rounded-md text-sm font-semibold disabled:opacity-50"
                    disabled={libraryBrowsePage <= 1}
                    onClick={() => setLibraryBrowsePage((p) => Math.max(1, p - 1))}
                >
                    Previous
                </button>
                <button
                    type="button"
                    className="px-3 py-1.5 bg-border text-text rounded-md text-sm font-semibold disabled:opacity-50"
                    disabled={(libraryBrowsePage * libraryBrowseLimit) >= libraryBrowseTotal}
                    onClick={() => setLibraryBrowsePage((p) => p + 1)}
                >
                    Next
                </button>
            </div>
        </div>
        <div className="bg-background/30 border border-white/5 rounded-lg p-3 space-y-3">
            <h4 className="text-sm font-bold text-text">Current Exclusions (Resolved)</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <ResolvedRatingKeyExclusions entries={exclusionsSummary.ratingKeys} />
                <ResolvedTextExclusions entries={exclusionsSummary.titles} emptyText="No title exclusions set." label="Excluded Title Terms" prefix="resolved-title" titleKey="title" />
                <ResolvedTextExclusions entries={exclusionsSummary.libraries} emptyText="No library exclusions set." label="Excluded Libraries" prefix="resolved-library" titleKey="libraryTitle" />
            </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <ExclusionTextarea
                label="Title Exclusions (advanced, one per line)"
                value={preferences?.exclusions?.titles || []}
                onChange={(values) => setPreferences((prev: any) => ({ ...prev, exclusions: { ...(prev.exclusions || {}), titles: values } }))}
            />
            <ExclusionTextarea
                label="Library Exclusions (advanced, one per line)"
                value={preferences?.exclusions?.libraries || []}
                onChange={(values) => setPreferences((prev: any) => ({ ...prev, exclusions: { ...(prev.exclusions || {}), libraries: values } }))}
            />
            <ExclusionTextarea
                label="RatingKey Exclusions (advanced, one per line)"
                value={preferences?.exclusions?.ratingKeys || []}
                onChange={(values) => setPreferences((prev: any) => ({ ...prev, exclusions: { ...(prev.exclusions || {}), ratingKeys: values } }))}
            />
        </div>
        <button type="button" className="px-3 py-2 bg-plex text-background rounded-md text-sm font-semibold" onClick={async () => { await savePreferences(preferences); await loadExclusionsSummary(); addToast('Exclusions saved.'); }}>
            Save Exclusions
        </button>
    </div>
);

const ExclusionTextarea: React.FC<{
    label: string;
    onChange: (values: string[]) => void;
    value: string[];
}> = ({ label, onChange, value }) => (
    <div>
        <label className="text-xs text-muted font-bold uppercase">{label}</label>
        <textarea
            className="w-full min-h-[180px] p-3 rounded-lg border border-border bg-card text-text text-xs"
            value={value.join('\n')}
            onChange={(e) => onChange(e.target.value.split('\n').map(v => v.trim()).filter(Boolean))}
        />
    </div>
);

const ResolvedRatingKeyExclusions: React.FC<{ entries: any[] }> = ({ entries }) => (
    <div className="bg-background/30 border border-white/5 rounded-lg p-3 space-y-2">
        <p className="text-xs font-bold text-muted uppercase tracking-wider">Excluded Titles by RatingKey</p>
        <div className="space-y-2 max-h-52 overflow-y-auto custom-scrollbar pr-1">
            {entries.map((entry: any) => (
                <div key={`resolved-key-${entry.ratingKey}`} className="flex items-center gap-2 bg-background/30 border border-white/5 rounded-md p-2">
                    <div className="w-10 h-14 rounded overflow-hidden bg-black/40 flex-shrink-0">
                        {entry.thumb ? (
                            <img src={portalUrl(`/api/plex/image?path=${encodeURIComponent(entry.thumb)}&width=80&height=120`)} alt={entry.title} className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-[9px] text-muted">No Poster</div>
                        )}
                    </div>
                    <div className="min-w-0">
                        <p className="text-xs text-text line-clamp-2">{entry.title}</p>
                        <p className="text-[10px] text-muted line-clamp-1">{entry.libraryTitle || entry.ratingKey}</p>
                    </div>
                </div>
            ))}
            {!entries.length && <p className="text-xs text-muted">No ratingKey exclusions set.</p>}
        </div>
    </div>
);

const ResolvedTextExclusions: React.FC<{
    emptyText: string;
    entries: any[];
    label: string;
    prefix: string;
    titleKey: string;
}> = ({ emptyText, entries, label, prefix, titleKey }) => (
    <div className="bg-background/30 border border-white/5 rounded-lg p-3 space-y-2">
        <p className="text-xs font-bold text-muted uppercase tracking-wider">{label}</p>
        <div className="space-y-1.5 max-h-52 overflow-y-auto custom-scrollbar pr-1">
            {entries.map((entry: any) => (
                <div key={`${prefix}-${entry[titleKey]}`} className="bg-background/30 border border-white/5 rounded-md px-2 py-1.5">
                    <p className="text-xs text-text line-clamp-1">{entry[titleKey]}</p>
                    <p className="text-[10px] text-muted">{entry.matchCount} {titleKey === 'title' ? 'indexed match(es)' : 'indexed item(s)'}</p>
                </div>
            ))}
            {!entries.length && <p className="text-xs text-muted">{emptyText}</p>}
        </div>
    </div>
);
