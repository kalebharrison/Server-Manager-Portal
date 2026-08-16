import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Tv } from 'lucide-react';
import { apiFetch } from '../shared/api';
import { DiscoverHomeRowSkeleton } from '../shared/skeletons';
import { discoverRowCardWidthClass } from '../shared/portalLayout';
import { DiscoverGridSizeSelect } from './DiscoverGridSizeSelect';
import { DiscoverMediaRail } from './DiscoverMediaRail';
import { enrichDiscoverItemsWithAvailability } from './discoverAvailabilityEnrich';
import type { DiscoverBrowseMode } from './discoverAvailability';
import { enrichDiscoveryItems } from './discoverItemUtils';
import { backfillFilteredDiscoverResults } from './discoverFetchUtils';
import { claimExclusiveRailItems, libraryRecentToDiscoveryItem, partitionNetNewAndUpgrades } from './discoverRailUtils';
import { discoveryTheme } from './discoveryThemeClasses';
import { useDiscoverGridSize } from './useDiscoverGridSize';
import { useDiscoverI18n } from './i18n';
import { useDiscoverNotify } from './useDiscoverNotify';
import { useDiscoverQuickRequest } from './useDiscoverQuickRequest';
import { filterDiscoverBrowseItems } from './useDiscoveryPreferences';

const pageResults = (page: any) => (Array.isArray(page?.results) ? page.results : []);

const isTvItem = (item: any) => {
    const raw = item?.mediaType ?? item?.type;
    if (raw === 'movie' || raw === 1 || raw === '1') return false;
    if (raw === 'tv' || raw === 2 || raw === '2' || raw === 'show') return true;
    if (item?.releaseDate && !item?.firstAirDate) return false;
    return true;
};

export const DiscoverSeries: React.FC<{
    onSelect: (item: any) => void;
    formatItem: (item: any) => any;
    navigate: (path: string) => void;
    pushToast?: (msg: string, type: 'success' | 'error') => void;
    showPosterQualityBadges?: boolean;
    browseMode?: DiscoverBrowseMode;
    mediaServerType?: string;
}> = ({
    onSelect,
    formatItem,
    navigate: _navigate,
    pushToast,
    showPosterQualityBadges = false,
    browseMode = 'discover',
    mediaServerType = 'plex',
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
        trending: [] as any[],
        upcoming: [] as any[],
        popular: [] as any[],
        recentlyAdded: [] as any[],
        recentlyUpgraded: [] as any[],
    });

    const prepareCatalog = useCallback(async (items: any[]) => {
        let next = Array.isArray(items) ? items.filter(isTvItem) : [];
        if (browseMode === 'request') {
            next = await enrichDiscoverItemsWithAvailability(next);
        }
        return filterDiscoverBrowseItems(next, {
            mode: browseMode,
            animeOnly: false,
            hideAvailable: false,
        });
    }, [browseMode]);

    const prepareFromStamps = useCallback((items: any[]) => (
        filterDiscoverBrowseItems(
            (Array.isArray(items) ? items : []).filter(isTvItem),
            { mode: browseMode, animeOnly: false, hideAvailable: false },
        )
    ), [browseMode]);

    const loadData = useCallback(async () => {
        const gen = ++loadGenRef.current;
        setLoading(true);
        try {
            const server = String(mediaServerType || 'plex').toLowerCase();
            const dashboardPath = server === 'jellyfin'
                ? '/api/jellyfin/dashboard'
                : '/api/plex/dashboard';

            const [home, popularRes, upcomingRes, dashboard, upgrades] = await Promise.all([
                apiFetch('/api/discovery/home').catch(() => null),
                apiFetch('/api/discovery/proxy/discover/tv?page=1&sortBy=popularity.desc').catch(() => null),
                apiFetch('/api/discovery/proxy/discover/tv/upcoming?page=1').catch(() => null),
                browseMode === 'discover'
                    ? apiFetch(dashboardPath, { forceRefresh: true, cacheTtlMs: 0 }).catch(() => null)
                    : Promise.resolve(null),
                browseMode === 'discover'
                    ? apiFetch('/api/discovery/recent-upgrades?mediaType=tv&take=40', { forceRefresh: true, cacheTtlMs: 0 }).catch(() => null)
                    : Promise.resolve(null),
            ]);
            if (gen !== loadGenRef.current) return;

            const trendingRaw = pageResults(home?.trending).filter(isTvItem);
            const upcomingSource = upcomingRes?.results?.length
                ? upcomingRes
                : home?.upcomingSeries;

            let trending = prepareFromStamps(trendingRaw);
            let upcoming = prepareFromStamps(pageResults(upcomingSource));
            let popular = prepareFromStamps(pageResults(popularRes));
            [trending, upcoming, popular] = claimExclusiveRailItems(
                [{ items: trending }, { items: upcoming }, { items: popular }],
                { maxPerRail: 24 },
            );

            let recentlyAdded: any[] = [];
            let recentlyUpgraded: any[] = [];
            if (browseMode === 'discover') {
                const mappedRecent = (Array.isArray(dashboard?.recentShows) ? dashboard.recentShows : [])
                    .map((item: any) => libraryRecentToDiscoveryItem(item, 'tv'));
                const upgradeRaw = pageResults(upgrades);
                const [addedPrepared, upgradedEnriched] = await Promise.all([
                    prepareCatalog(mappedRecent),
                    enrichDiscoveryItems(upgradeRaw).then((items) => prepareCatalog(items)),
                ]);
                if (gen !== loadGenRef.current) return;
                ({ recentlyAdded, recentlyUpgraded } = partitionNetNewAndUpgrades(
                    addedPrepared,
                    upgradedEnriched,
                    { maxPerRail: 24 },
                ));
            }

            setRows({
                trending,
                upcoming,
                popular,
                recentlyAdded,
                recentlyUpgraded,
            });
            setEnterAnim(true);
            setLoading(false);
            window.setTimeout(() => setEnterAnim(false), 700);

            if (browseMode !== 'request') return;
            void (async () => {
                try {
                    let [nextTrending, nextUpcoming, nextPopular] = await Promise.all([
                        prepareCatalog(trendingRaw),
                        prepareCatalog(pageResults(upcomingSource)),
                        prepareCatalog(pageResults(popularRes)),
                    ]);
                    if (gen !== loadGenRef.current) return;
                    [nextTrending, nextUpcoming, nextPopular] = await Promise.all([
                        backfillFilteredDiscoverResults(
                            nextTrending,
                            [(page) => `/api/discovery/trending?page=${page}`],
                            prepareCatalog,
                            { minItems: 20, maxPages: 5 },
                        ),
                        backfillFilteredDiscoverResults(
                            nextUpcoming,
                            [(page) => `/api/discovery/proxy/discover/tv/upcoming?page=${page}`],
                            prepareCatalog,
                            { minItems: 20, maxPages: 4 },
                        ),
                        backfillFilteredDiscoverResults(
                            nextPopular,
                            [(page) => `/api/discovery/proxy/discover/tv?page=${page}&sortBy=popularity.desc`],
                            prepareCatalog,
                            { minItems: 20, maxPages: 5 },
                        ),
                    ]);
                    if (gen !== loadGenRef.current) return;
                    [nextTrending, nextUpcoming, nextPopular] = claimExclusiveRailItems(
                        [{ items: nextTrending }, { items: nextUpcoming }, { items: nextPopular }],
                        { maxPerRail: 24 },
                    );
                    setRows((prev) => ({
                        ...prev,
                        trending: nextTrending,
                        upcoming: nextUpcoming,
                        popular: nextPopular,
                    }));
                } catch {
                    // Background refine is best-effort.
                }
            })();
        } catch (e) {
            console.error(e);
            if (gen === loadGenRef.current) setLoading(false);
        }
    }, [browseMode, locale, mediaServerType, prepareCatalog, prepareFromStamps]);

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
                    <Tv className="w-6 h-6 text-plex" /> {t('browse.seriesHeading')}
                </h2>
                <div className="flex items-center gap-3 flex-wrap justify-end">
                    <DiscoverGridSizeSelect value={gridSize} onChange={setGridSize} />
                </div>
            </div>

            {loading ? (
                <div className="flex flex-col gap-6" aria-busy="true">
                    <DiscoverHomeRowSkeleton />
                    <DiscoverHomeRowSkeleton />
                    <DiscoverHomeRowSkeleton />
                    {browseMode === 'discover' && (
                        <>
                            <DiscoverHomeRowSkeleton />
                            <DiscoverHomeRowSkeleton />
                        </>
                    )}
                </div>
            ) : (
                <div className={`flex flex-col gap-6 w-full max-w-full overflow-hidden${enterAnim ? ' discover-content-enter' : ''}`}>
                    {browseMode === 'discover' && (
                        <>
                            <DiscoverMediaRail
                                title={t('home.recentlyAdded')}
                                items={rows.recentlyAdded}
                                posterCardClass={posterCardClass}
                                formatItem={formatItem}
                                onSelect={onSelect}
                                animateEnter={enterAnim}
                                showPosterQualityBadges={showPosterQualityBadges}
                            />
                            <DiscoverMediaRail
                                title={t('home.recentlyUpgraded')}
                                items={rows.recentlyUpgraded}
                                posterCardClass={posterCardClass}
                                formatItem={formatItem}
                                onSelect={onSelect}
                                animateEnter={enterAnim}
                                showPosterQualityBadges={showPosterQualityBadges}
                            />
                        </>
                    )}
                    <DiscoverMediaRail
                        title={t('home.trending')}
                        items={rows.trending}
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
                        items={rows.upcoming}
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
                        items={rows.popular}
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
