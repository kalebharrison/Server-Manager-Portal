import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { apiFetch } from '../shared/api';
import { DiscoverHomeRowSkeleton } from '../shared/skeletons';
import { discoverRowCardWidthClass } from '../shared/portalLayout';
import { DiscoverGridSizeSelect } from './DiscoverGridSizeSelect';
import { DiscoverMediaRail } from './DiscoverMediaRail';
import { enrichDiscoverItemsWithAvailability } from './discoverAvailabilityEnrich';
import type { DiscoverBrowseMode } from './discoverAvailability';
import { backfillFilteredDiscoverResults } from './discoverFetchUtils';
import { claimExclusiveRailItems } from './discoverRailUtils';
import { discoveryTheme } from './discoveryThemeClasses';
import { useDiscoverGridSize } from './useDiscoverGridSize';
import { useDiscoverI18n } from './i18n';
import { useDiscoverNotify } from './useDiscoverNotify';
import { useDiscoverQuickRequest } from './useDiscoverQuickRequest';
import { filterDiscoverBrowseItems } from './useDiscoveryPreferences';

const pageResults = (page: any) => (Array.isArray(page?.results) ? page.results : []);

const isMovieItem = (item: any) => {
    const raw = item?.mediaType ?? item?.type;
    if (raw === 'tv' || raw === 2 || raw === '2' || raw === 'show') return false;
    if (raw === 'movie' || raw === 1 || raw === '1') return true;
    if (item?.firstAirDate && !item?.releaseDate) return false;
    return true;
};

const isTvItem = (item: any) => !isMovieItem(item);

/** Dedicated Anime tab — Japanese animation movies + series (no toggle gymnastics). */
export const DiscoverAnime: React.FC<{
    onSelect: (item: any) => void;
    formatItem: (item: any) => any;
    navigate: (path: string) => void;
    pushToast?: (msg: string, type: 'success' | 'error') => void;
    showPosterQualityBadges?: boolean;
    browseMode?: DiscoverBrowseMode;
}> = ({
    onSelect,
    formatItem,
    navigate: _navigate,
    pushToast,
    showPosterQualityBadges = false,
    browseMode = 'discover',
}) => {
    const { t, locale } = useDiscoverI18n();
    const quickRequest = useDiscoverQuickRequest(pushToast);
    const notify = useDiscoverNotify(pushToast);
    const [gridSize, setGridSize] = useDiscoverGridSize();
    const posterCardClass = discoverRowCardWidthClass(gridSize);
    const loadGenRef = useRef(0);
    const [loading, setLoading] = useState(true);
    const [enterAnim, setEnterAnim] = useState(true);
    const [rows, setRows] = useState({
        popularMovies: [] as any[],
        upcomingMovies: [] as any[],
        popularSeries: [] as any[],
        upcomingSeries: [] as any[],
    });

    const prepareMovies = useCallback(async (items: any[]) => {
        let next = (Array.isArray(items) ? items : []).filter(isMovieItem);
        if (browseMode === 'request') {
            next = await enrichDiscoverItemsWithAvailability(next);
        }
        return filterDiscoverBrowseItems(next, { mode: browseMode, hideAvailable: false });
    }, [browseMode]);

    const prepareShows = useCallback(async (items: any[]) => {
        let next = (Array.isArray(items) ? items : []).filter(isTvItem);
        if (browseMode === 'request') {
            next = await enrichDiscoverItemsWithAvailability(next);
        }
        return filterDiscoverBrowseItems(next, { mode: browseMode, hideAvailable: false });
    }, [browseMode]);

    const loadData = useCallback(async () => {
        const gen = ++loadGenRef.current;
        setLoading(true);
        try {
            const [moviesPopular, moviesUpcoming, tvPopular, tvUpcoming] = await Promise.all([
                apiFetch('/api/discovery/proxy/discover/movies?page=1&sortBy=popularity.desc&anime=1').catch(() => null),
                apiFetch('/api/discovery/proxy/discover/movies/upcoming?page=1&anime=1').catch(() => null),
                apiFetch('/api/discovery/proxy/discover/tv?page=1&sortBy=popularity.desc&anime=1').catch(() => null),
                apiFetch('/api/discovery/proxy/discover/tv/upcoming?page=1&anime=1').catch(() => null),
            ]);
            if (gen !== loadGenRef.current) return;

            let [popularMovies, upcomingMovies, popularSeries, upcomingSeries] = await Promise.all([
                prepareMovies(pageResults(moviesPopular)),
                prepareMovies(pageResults(moviesUpcoming)),
                prepareShows(pageResults(tvPopular)),
                prepareShows(pageResults(tvUpcoming)),
            ]);
            if (gen !== loadGenRef.current) return;

            const [claimedMovies, claimedUpcomingMovies] = claimExclusiveRailItems(
                [{ items: popularMovies }, { items: upcomingMovies }],
                { maxPerRail: 24 },
            );
            const [claimedSeries, claimedUpcomingSeries] = claimExclusiveRailItems(
                [{ items: popularSeries }, { items: upcomingSeries }],
                { maxPerRail: 24 },
            );
            popularMovies = claimedMovies;
            upcomingMovies = claimedUpcomingMovies;
            popularSeries = claimedSeries;
            upcomingSeries = claimedUpcomingSeries;

            setRows({ popularMovies, upcomingMovies, popularSeries, upcomingSeries });
            setEnterAnim(true);
            setLoading(false);
            window.setTimeout(() => setEnterAnim(false), 700);

            if (browseMode !== 'request') return;

            void (async () => {
                try {
                    let [nextMovies, nextUpcomingMovies, nextSeries, nextUpcomingSeries] = await Promise.all([
                        backfillFilteredDiscoverResults(
                            popularMovies,
                            [(page) => `/api/discovery/proxy/discover/movies?page=${page}&sortBy=popularity.desc&anime=1`],
                            prepareMovies,
                            { minItems: 18, maxPages: 5 },
                        ),
                        backfillFilteredDiscoverResults(
                            upcomingMovies,
                            [(page) => `/api/discovery/proxy/discover/movies/upcoming?page=${page}&anime=1`],
                            prepareMovies,
                            { minItems: 12, maxPages: 4 },
                        ),
                        backfillFilteredDiscoverResults(
                            popularSeries,
                            [(page) => `/api/discovery/proxy/discover/tv?page=${page}&sortBy=popularity.desc&anime=1`],
                            prepareShows,
                            { minItems: 18, maxPages: 5 },
                        ),
                        backfillFilteredDiscoverResults(
                            upcomingSeries,
                            [(page) => `/api/discovery/proxy/discover/tv/upcoming?page=${page}&anime=1`],
                            prepareShows,
                            { minItems: 12, maxPages: 4 },
                        ),
                    ]);
                    if (gen !== loadGenRef.current) return;
                    [nextMovies, nextUpcomingMovies] = claimExclusiveRailItems(
                        [{ items: nextMovies }, { items: nextUpcomingMovies }],
                        { maxPerRail: 24 },
                    );
                    [nextSeries, nextUpcomingSeries] = claimExclusiveRailItems(
                        [{ items: nextSeries }, { items: nextUpcomingSeries }],
                        { maxPerRail: 24 },
                    );
                    setRows({
                        popularMovies: nextMovies,
                        upcomingMovies: nextUpcomingMovies,
                        popularSeries: nextSeries,
                        upcomingSeries: nextUpcomingSeries,
                    });
                } catch {
                    // Background densify is best-effort.
                }
            })();
        } catch (e) {
            console.error(e);
            if (gen === loadGenRef.current) setLoading(false);
        }
    }, [browseMode, locale, prepareMovies, prepareShows]);

    useEffect(() => {
        loadData();
        return () => {
            loadGenRef.current += 1;
        };
    }, [loadData]);

    return (
        <div className="w-full flex flex-col gap-6 px-4 sm:px-8 mt-4 relative pb-8">
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <h2 className={`${discoveryTheme.heading} flex items-center gap-2`}>
                    <Sparkles className="w-6 h-6 text-plex" /> {t('nav.anime')}
                </h2>
                <DiscoverGridSizeSelect value={gridSize} onChange={setGridSize} />
            </div>

            {loading ? (
                <div className="flex flex-col gap-6" aria-busy="true">
                    <DiscoverHomeRowSkeleton />
                    <DiscoverHomeRowSkeleton />
                    <DiscoverHomeRowSkeleton />
                    <DiscoverHomeRowSkeleton />
                </div>
            ) : (
                <div className={`flex flex-col gap-6 w-full max-w-full overflow-hidden${enterAnim ? ' discover-content-enter' : ''}`}>
                    <DiscoverMediaRail
                        title={t('home.popularMovies')}
                        items={rows.popularMovies}
                        posterCardClass={posterCardClass}
                        formatItem={formatItem}
                        onSelect={onSelect}
                        animateEnter={enterAnim}
                        quickRequest={quickRequest}
                        notify={notify}
                        showPosterQualityBadges={showPosterQualityBadges}
                    />
                    <DiscoverMediaRail
                        title={t('home.popularSeries')}
                        items={rows.popularSeries}
                        posterCardClass={posterCardClass}
                        formatItem={formatItem}
                        onSelect={onSelect}
                        animateEnter={enterAnim}
                        quickRequest={quickRequest}
                        notify={notify}
                        showPosterQualityBadges={showPosterQualityBadges}
                    />
                    <DiscoverMediaRail
                        title={t('home.upcomingMovies')}
                        items={rows.upcomingMovies}
                        posterCardClass={posterCardClass}
                        formatItem={formatItem}
                        onSelect={onSelect}
                        animateEnter={enterAnim}
                        quickRequest={quickRequest}
                        notify={notify}
                        showPosterQualityBadges={showPosterQualityBadges}
                    />
                    <DiscoverMediaRail
                        title={t('home.upcomingSeries')}
                        items={rows.upcomingSeries}
                        posterCardClass={posterCardClass}
                        formatItem={formatItem}
                        onSelect={onSelect}
                        animateEnter={enterAnim}
                        quickRequest={quickRequest}
                        notify={notify}
                        showPosterQualityBadges={showPosterQualityBadges}
                    />
                </div>
            )}
        </div>
    );
};
