import React from 'react';
import { browseCategories, genreFilters, mediaFilters, type BrowseCategory, type MediaFilter, type RequestView } from './requestDashboardConstants';

type RequestDashboardFiltersProps = {
    isAdmin: boolean;
    activeView: RequestView;
    browseCategory: BrowseCategory;
    mediaFilter: MediaFilter;
    animeOnly: boolean;
    foreignOnly: boolean;
    genreId: number | null;
    includeExisting: boolean;
    onActiveViewChange: (view: RequestView) => void;
    onBrowseCategoryChange: (category: BrowseCategory) => void;
    onMediaFilterChange: (filter: MediaFilter) => void;
    onAnimeOnlyToggle: () => void;
    onForeignOnlyToggle: () => void;
    onGenreIdChange: (genreId: number | null) => void;
    onIncludeExistingToggle: () => void;
};

export const RequestDashboardFilters: React.FC<RequestDashboardFiltersProps> = ({
    isAdmin,
    activeView,
    browseCategory,
    mediaFilter,
    animeOnly,
    foreignOnly,
    genreId,
    includeExisting,
    onActiveViewChange,
    onBrowseCategoryChange,
    onMediaFilterChange,
    onAnimeOnlyToggle,
    onForeignOnlyToggle,
    onGenreIdChange,
    onIncludeExistingToggle,
}) => (
    <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-card/60 p-3">
        <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted mr-1">Category</span>
            {browseCategories.map((category) => (
                <button
                    key={category.id}
                    type="button"
                    onClick={() => { onActiveViewChange('browse'); onBrowseCategoryChange(category.id); }}
                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeView === 'browse' && browseCategory === category.id ? 'bg-plex text-background shadow-lg shadow-plex/20' : 'bg-background/60 border border-border text-muted hover:text-text hover:bg-white/5'}`}
                >
                    {category.label}
                </button>
            ))}
            <label className="inline-flex items-center gap-2 ml-0 sm:ml-2">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted">Genre</span>
                <select
                    value={genreId || ''}
                    onChange={(event) => onGenreIdChange(event.target.value ? Number(event.target.value) : null)}
                    className="h-9 rounded-lg border border-border bg-background/60 px-3 text-sm font-bold text-text outline-none focus:border-plex"
                >
                    <option value="">All genres</option>
                    {genreFilters.map((genre) => <option key={genre.id} value={genre.id}>{genre.label}</option>)}
                </select>
            </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted mr-1">Type</span>
            {mediaFilters.map((filter) => (
                <button
                    key={filter.id}
                    type="button"
                    onClick={() => { onActiveViewChange(activeView === 'queue' ? 'browse' : activeView); onMediaFilterChange(filter.id); }}
                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${mediaFilter === filter.id ? 'bg-plex text-background shadow-lg shadow-plex/20' : 'bg-background/60 border border-border text-muted hover:text-text hover:bg-white/5'}`}
                >
                    {filter.label}
                </button>
            ))}
            <button
                type="button"
                onClick={() => { onActiveViewChange(activeView === 'queue' ? 'browse' : activeView); onAnimeOnlyToggle(); }}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${animeOnly ? 'bg-fuchsia-400 text-background shadow-lg shadow-fuchsia-400/20' : 'bg-background/60 border border-border text-muted hover:text-text hover:bg-white/5'}`}
                title="Show only Japanese animation. Combine with Movies, TV, or a genre."
            >
                Anime
            </button>
            <button
                type="button"
                onClick={() => { onActiveViewChange(activeView === 'queue' ? 'browse' : activeView); onForeignOnlyToggle(); }}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${foreignOnly ? 'bg-violet-400 text-background shadow-lg shadow-violet-400/20' : 'bg-background/60 border border-border text-muted hover:text-text hover:bg-white/5'}`}
                title="Show only non-English, non-anime titles. Combine with Movies, TV, or a genre."
            >
                Foreign
            </button>
            <button
                type="button"
                onClick={onIncludeExistingToggle}
                className={`ml-0 sm:ml-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${includeExisting ? 'bg-amber-400 text-background shadow-lg shadow-amber-400/20' : 'bg-background/60 border border-border text-muted hover:text-text hover:bg-white/5'}`}
                title="Existing and in-progress titles are shown by default."
            >
                {includeExisting ? 'Hide Existing' : 'Show Existing'}
            </button>
            <button
                type="button"
                onClick={() => onActiveViewChange('search')}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeView === 'search' ? 'bg-plex text-background shadow-lg shadow-plex/20' : 'bg-background/60 border border-border text-muted hover:text-text hover:bg-white/5'}`}
            >
                Search
            </button>
            <button
                type="button"
                onClick={() => onActiveViewChange('ask')}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeView === 'ask' ? 'bg-plex text-background shadow-lg shadow-plex/20' : 'bg-background/60 border border-border text-muted hover:text-text hover:bg-white/5'}`}
                title="Chat with the media discovery agent"
            >
                Ask
            </button>
            {isAdmin && (
                <button
                    type="button"
                    onClick={() => onActiveViewChange('queue')}
                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeView === 'queue' ? 'bg-plex text-background shadow-lg shadow-plex/20' : 'bg-background/60 border border-border text-muted hover:text-text hover:bg-white/5'}`}
                >
                    Queue
                </button>
            )}
        </div>
    </div>
);
