import React, { useCallback, useMemo, useRef } from 'react';
import { Filter, Tv } from 'lucide-react';
import { FilterDrawer, FilterState } from './FilterDrawer';
import { DiscoverGridSizeSelect } from './DiscoverGridSizeSelect';
import { DiscoverPosterGrid } from './DiscoverPosterGrid';
import { useDiscoverGridSize } from './useDiscoverGridSize';
import {
    buildSeriesFilterPath,
    countActiveFilters,
    defaultSeriesFilters,
    parseFiltersFromSearch,
} from './discoverUrlUtils';
import { useDiscoveryPreferences } from './useDiscoveryPreferences';
import { findNetwork, TV_GENRES } from './discoverConstants';
import { useDiscoverInfiniteScroll } from './useDiscoverInfiniteScroll';
import { DiscoverInfiniteScrollFooter } from './DiscoverInfiniteScrollFooter';
import { discoverSkeletonCountForGrid } from './discoverPaginationUtils';
import { buildDiscoverSeriesApiUrl, fetchDiscoverPageWithAdvance } from './discoverFetchUtils';
import { DiscoverHideExistingToggle } from './DiscoverHideExistingToggle';
import { DiscoverAnimeToggle } from './DiscoverAnimeToggle';
import { useHideExistingToggle } from './useHideExistingToggle';
import { useAnimeToggle } from './useAnimeToggle';
import { useDiscoverQuickRequest } from './useDiscoverQuickRequest';
import { useDiscoverNotify } from './useDiscoverNotify';
import { discoveryTheme } from './discoveryThemeClasses';
import { useDiscoverI18n } from './i18n';

export const DiscoverSeries: React.FC<{
    onSelect: (item: any) => void;
    formatItem: (item: any) => any;
    navigate: (path: string) => void;
    pushToast?: (msg: string, type: 'success' | 'error') => void;
    showPosterQualityBadges?: boolean;
}> = ({ onSelect, formatItem, navigate, pushToast, showPosterQualityBadges = false }) => {
    const { t, locale } = useDiscoverI18n();
    const { preferences } = useDiscoveryPreferences();
    const { hideExisting, setHideExisting } = useHideExistingToggle();
    const { animeOnly, setAnimeOnly } = useAnimeToggle();
    const quickRequest = useDiscoverQuickRequest(pushToast);
    const notify = useDiscoverNotify(pushToast);
    const [gridSize, setGridSize] = useDiscoverGridSize();
    const containerRef = useRef<HTMLDivElement>(null);
    const [showFilters, setShowFilters] = React.useState(false);

    const [filters, setFilters] = React.useState<FilterState>(() =>
        parseFiltersFromSearch(typeof window !== 'undefined' ? window.location.search : '', defaultSeriesFilters()),
    );

    const readFiltersFromUrl = useCallback(() => {
        setFilters(parseFiltersFromSearch(window.location.search, defaultSeriesFilters()));
    }, []);

    React.useEffect(() => {
        readFiltersFromUrl();
        window.addEventListener('popstate', readFiltersFromUrl);
        window.addEventListener('portal-discovery-navigate', readFiltersFromUrl);
        return () => {
            window.removeEventListener('popstate', readFiltersFromUrl);
            window.removeEventListener('portal-discovery-navigate', readFiltersFromUrl);
        };
    }, [readFiltersFromUrl]);

    const resetKey = useMemo(
        () => `${JSON.stringify(filters)}:${preferences.hideAvailableMedia}:${preferences.discoverLanguage}:${hideExisting}:${animeOnly}:${gridSize}:${locale}`,
        [filters, preferences.hideAvailableMedia, preferences.discoverLanguage, hideExisting, animeOnly, gridSize, locale],
    );

    const browseFilterOptions = useMemo(() => ({
        // Hide library titles (available/partial); keep requested visible with badges.
        hideAvailable: preferences.hideAvailableMedia || hideExisting,
        hideRequested: false,
        animeOnly,
    }), [preferences.hideAvailableMedia, hideExisting, animeOnly]);

    const fetchPage = useCallback(async (page: number) => fetchDiscoverPageWithAdvance(
        (nextPage) => buildDiscoverSeriesApiUrl(nextPage, filters, { anime: animeOnly }),
        page,
        browseFilterOptions,
    ), [filters, browseFilterOptions, animeOnly]);

    const {
        results,
        loading,
        loadingMore,
        hasMore,
        sentinelRef,
    } = useDiscoverInfiniteScroll({
        resetKey,
        gridSize,
        containerRef,
        fetchPage,
        filterOptions: browseFilterOptions,
    });

    const applyFilters = (newFilters: FilterState) => {
        setFilters(newFilters);
        navigate(buildSeriesFilterPath(newFilters));
    };

    const networkLabel = filters.network
        ? (filters.networkName || findNetwork(Number(filters.network))?.name || null)
        : null;
    const genreLabel = filters.genre
        ? filters.genre
            .split(',')
            .map((id) => TV_GENRES.find((genre) => String(genre.id) === id.trim())?.name)
            .filter(Boolean)
            .join(', ')
        : null;
    const keywordLabel = filters.keywordName || null;
    const activeFilterCount = countActiveFilters(filters, 'tv');
    const filterSummary = [
        networkLabel ? `Network: ${networkLabel}` : null,
        genreLabel ? `Genre: ${genreLabel}` : null,
        keywordLabel ? `Keyword: ${keywordLabel}` : null,
        filters.excludeKeywordName ? `Excluding: ${filters.excludeKeywordName}` : null,
        filters.status ? 'Status filtered' : null,
        filters.language ? `Language: ${filters.language.toUpperCase()}` : null,
        filters.watchProviders ? 'Streaming filtered' : null,
    ].filter(Boolean).join(' · ');
    const skeletonCount = discoverSkeletonCountForGrid(
        gridSize,
        containerRef.current?.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 1200),
    );

    const emptyMessage = activeFilterCount > 0 || hideExisting || animeOnly
        ? t('browse.emptySeriesFiltered')
        : t('browse.emptySeries');
    const emptyHint = hideExisting
        ? t('browse.emptyHintHideExisting')
        : animeOnly
            ? t('browse.emptyHintAnime')
            : t('browse.emptyHint');

    return (
        <div className="w-full flex flex-col md:flex-row gap-8 px-4 sm:px-8 mt-4 relative">
            <div className="flex-1 flex flex-col gap-6" ref={containerRef}>
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                        <h2 className={`${discoveryTheme.heading} flex items-center gap-2`}>
                            <Tv className="w-6 h-6 text-plex" /> {t('browse.seriesHeading')}
                        </h2>
                        {filterSummary && (
                            <p className="text-sm text-muted mt-1 line-clamp-2">{filterSummary}</p>
                        )}
                    </div>
                    <div className="flex items-center gap-3 flex-wrap justify-end">
                        <DiscoverGridSizeSelect value={gridSize} onChange={setGridSize} />
                        <DiscoverAnimeToggle checked={animeOnly} onChange={setAnimeOnly} />
                        <DiscoverHideExistingToggle checked={hideExisting} onChange={setHideExisting} />
                        <button
                            type="button"
                            onClick={() => setShowFilters(true)}
                            className={`relative ${discoveryTheme.toolbarBtn}`}
                        >
                            <Filter className="w-4 h-4" /> {t('browse.filters')}
                            {activeFilterCount > 0 && (
                                <span className="absolute -top-2 -right-2 min-w-[20px] h-5 px-1 rounded-full bg-plex text-black text-xs font-black flex items-center justify-center">
                                    {activeFilterCount}
                                </span>
                            )}
                        </button>
                    </div>
                </div>

                <DiscoverPosterGrid
                    items={results}
                    gridSize={gridSize}
                    formatItem={formatItem}
                    onSelect={onSelect}
                    loading={loading}
                    skeletonCount={skeletonCount}
                    emptyMessage={emptyMessage}
                    emptyHint={emptyHint}
                    quickRequest={quickRequest}
                    notify={notify}
                    variant="dense"
                    showPosterQualityBadges={showPosterQualityBadges}
                />

                <DiscoverInfiniteScrollFooter
                    sentinelRef={sentinelRef}
                    loadingMore={loadingMore}
                    hasMore={hasMore}
                    loading={loading}
                />
            </div>

            <FilterDrawer
                isOpen={showFilters}
                onClose={() => setShowFilters(false)}
                type="tv"
                filters={filters}
                onApply={applyFilters}
                onClear={() => applyFilters(defaultSeriesFilters())}
            />
        </div>
    );
};
