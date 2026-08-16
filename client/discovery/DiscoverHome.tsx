import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ClipboardList } from 'lucide-react';
import { apiFetch } from '../shared/api';
import { DiscoverPosterCard } from '../screens';
import { Carousel } from './Carousel';
import { portalRequestToDiscoveryRowItem } from './myRequestUtils';
import { filterDiscoverBrowseItems, useDiscoveryPreferences } from './useDiscoveryPreferences';
import { enrichDiscoverItemsWithAvailability } from './discoverAvailabilityEnrich';
import type { DiscoverBrowseMode } from './discoverAvailability';
import { DiscoverHomeSkeleton } from '../shared/skeletons';
import { discoveryTheme } from './discoveryThemeClasses';
import { DiscoverGridSizeSelect } from './DiscoverGridSizeSelect';
import { useDiscoverGridSize } from './useDiscoverGridSize';
import { discoverRowCardWidthClass } from '../shared/portalLayout';
import { useDiscoverI18n } from './i18n';
import { DiscoverQuickRequestButton } from './DiscoverQuickRequestButton';
import { DiscoverStatusOverlay } from './DiscoverStatusOverlay';
import { useDiscoverQuickRequest } from './useDiscoverQuickRequest';
import { useDiscoverNotify } from './useDiscoverNotify';
import { DiscoverDownloadsSection } from '../screens/DiscoverDownloadsSection';
import { backfillFilteredDiscoverResults } from './discoverFetchUtils';
import { claimExclusiveRailItems, mergeDiscoveryRails } from './discoverRailUtils';

const REQUESTS_CACHE_KEY = 'discover-my-requests-v1';

const readCachedRequestItems = (): any[] | null => {
    try {
        const raw = sessionStorage.getItem(REQUESTS_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
};

const writeCachedRequestItems = (items: any[]) => {
    try {
        sessionStorage.setItem(REQUESTS_CACHE_KEY, JSON.stringify(items));
    } catch {
        /* ignore quota */
    }
};

const EmptyRail: React.FC<{
    title: string;
    body: string;
    actionLabel: string;
    onAction: () => void;
    icon: React.ReactNode;
}> = ({ title, body, actionLabel, onAction, icon }) => (
    <div className={`${discoveryTheme.emptyState} !py-8 px-4 flex flex-col items-center gap-3`}>
        <div className="w-10 h-10 rounded-full bg-plex/15 text-plex flex items-center justify-center">
            {icon}
        </div>
        <div>
            <p className={discoveryTheme.emptyTitle}>{title}</p>
            <p className={discoveryTheme.emptyBody}>{body}</p>
        </div>
        <button
            type="button"
            onClick={onAction}
            className="mt-1 px-4 py-2 rounded-lg bg-plex text-black text-xs font-black hover:bg-plex-hover transition-colors"
        >
            {actionLabel}
        </button>
    </div>
);

/** Stable row component — must live outside DiscoverHome or every setState remounts posters. */
const DiscoverHomeRow: React.FC<{
    title: string;
    items: any[];
    posterCardClass: string;
    viewAllLabel: string;
    formatItem: (item: any) => any;
    onSelect: (item: any) => void;
    onViewAll?: () => void;
    empty?: React.ReactNode;
    animateEnter?: boolean;
    quickRequest?: ReturnType<typeof useDiscoverQuickRequest>;
    notify?: ReturnType<typeof useDiscoverNotify>;
    showPosterQualityBadges?: boolean;
}> = ({
    title,
    items,
    posterCardClass,
    viewAllLabel,
    formatItem,
    onSelect,
    onViewAll,
    empty,
    animateEnter = false,
    quickRequest,
    notify,
    showPosterQualityBadges = false,
}) => {
    const { t } = useDiscoverI18n();
    if (!items?.length) {
        if (!empty) return null;
        return (
            <div className="flex flex-col gap-2 relative">
                <div className="flex items-center gap-3 min-w-0 px-2 pr-16">
                    <h2 className={`${discoveryTheme.sectionTitle} truncate`}>{title}</h2>
                    {onViewAll && (
                        <button type="button" onClick={onViewAll} className="shrink-0 text-xs font-bold text-plex hover:underline">
                            {viewAllLabel}
                        </button>
                    )}
                </div>
                {empty}
            </div>
        );
    }
    return (
        <div className="flex flex-col gap-2 relative">
            <div className="flex items-center gap-3 min-w-0 px-2 pr-16">
                <h2 className={`${discoveryTheme.sectionTitle} truncate`}>{title}</h2>
                {onViewAll && (
                    <button type="button" onClick={onViewAll} className="shrink-0 text-xs font-bold text-plex hover:underline">
                        {viewAllLabel}
                    </button>
                )}
            </div>
            <Carousel>
                {items.map((rawItem, idx) => {
                    if (!rawItem) return null;
                    const formatted = formatItem(rawItem);
                    const showRequest = !!quickRequest
                        && (quickRequest.canQuickRequest(formatted)
                            || quickRequest.isRequesting(formatted)
                            || quickRequest.isRequested(formatted));
                    const showNotify = !!notify
                        && (notify.canNotify(rawItem)
                            || notify.isNotifying(rawItem)
                            || notify.isBusy(rawItem));
                    const showRequestedBadge = !!quickRequest?.isRequested(formatted)
                        && (!formatted.availability || formatted.availability.kind === 'none');
                    const overlay = (
                        <>
                            {showRequestedBadge ? (
                                <DiscoverStatusOverlay state={{
                                    kind: 'requested',
                                    label: 'Requested',
                                    detail: 'Your request was submitted.',
                                    mediaStatus: 2,
                                    hasUserRequest: true,
                                    userRequestId: null,
                                    userRequestStatus: 1,
                                }} />
                            ) : formatted.overlay}
                            {showNotify && notify && !showRequest && (
                                <button
                                    type="button"
                                    disabled={notify.isBusy(rawItem)}
                                    onClick={(event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        void notify.toggleNotify(rawItem);
                                    }}
                                    className="absolute bottom-2 left-2 right-2 z-20 inline-flex items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] font-black uppercase tracking-wide transition-colors pointer-events-auto bg-sky-500/25 text-sky-100 border-sky-500/40 hover:bg-sky-500/40 disabled:opacity-70"
                                >
                                    {notify.isNotifying(rawItem) ? t('browse.notifying') : t('browse.notify')}
                                </button>
                            )}
                            {showRequest && quickRequest && (
                                <DiscoverQuickRequestButton item={formatted} api={quickRequest} />
                            )}
                        </>
                    );
                    return (
                        <div
                            key={`${title}-${formatted.id || idx}`}
                            className={`${posterCardClass} flex-shrink-0 relative group poster-rail-item${animateEnter ? ' discover-poster-enter' : ''}`}
                            style={animateEnter ? { animationDelay: `${Math.min(idx, 12) * 30}ms` } : undefined}
                        >
                            <DiscoverPosterCard
                                item={{
                                    ...formatted,
                                    tags: Array.isArray(formatted.qualityTags) ? formatted.qualityTags : [],
                                }}
                                overlay={overlay}
                                showQualityBadges={
                                    showPosterQualityBadges
                                    && (formatted.availability?.kind === 'available'
                                        || formatted.availability?.kind === 'upToDate'
                                        || formatted.availability?.kind === 'partial')
                                    && Array.isArray(formatted.qualityTags)
                                    && formatted.qualityTags.length > 0
                                }
                                onPosterClick={() => onSelect(formatted)}
                            />
                        </div>
                    );
                })}
            </Carousel>
        </div>
    );
};

export const DiscoverHome: React.FC<{
    onSelect: (item: any) => void;
    formatItem: (item: any) => any;
    navigate: (path: string) => void;
    pushToast?: (msg: string, type: 'success' | 'error') => void;
    providerLabel?: string;
    showPosterQualityBadges?: boolean;
    mediaServerType?: string;
    browseMode?: DiscoverBrowseMode;
}> = ({
    onSelect,
    formatItem,
    navigate,
    pushToast,
    providerLabel: _providerLabel = 'Plex',
    showPosterQualityBadges = false,
    mediaServerType = 'plex',
    browseMode = 'discover',
}) => {
    const { t, locale } = useDiscoverI18n();
    const { preferences } = useDiscoveryPreferences();
    const quickRequest = useDiscoverQuickRequest(pushToast);
    const notify = useDiscoverNotify(pushToast);
    const [gridSize, setGridSize] = useDiscoverGridSize();
    const posterCardClass = discoverRowCardWidthClass(gridSize);
    const seededRequests = readCachedRequestItems();
    const isDiscover = browseMode === 'discover';
    const [rows, setRows] = useState({
        recentlyRequested: [] as any[],
        myRequests: seededRequests || [] as any[],
        trending: [] as any[],
        upcoming: [] as any[],
        popular: [] as any[],
    });
    const [requestsReady, setRequestsReady] = useState(() => seededRequests != null);
    const [loading, setLoading] = useState(true);
    const loadGenRef = useRef(0);
    const hasPaintedRef = useRef(false);
    const [enterAnim, setEnterAnim] = useState(true);

    const loadData = useCallback(async () => {
        const gen = ++loadGenRef.current;
        // Avoid skeleton ↔ content flicker on preference/locale refreshes after first paint.
        if (!hasPaintedRef.current) setLoading(true);
        try {
            const CACHE_STALE_MS = 5 * 60 * 1000;

            const pageResults = (page: any) => (Array.isArray(page?.results) ? page.results : []);

            // Home rails already carry warm Arr/disk stamps — filter sync so posters paint immediately.
            const prepareFromStamps = (items: any[]) => (
                filterDiscoverBrowseItems(Array.isArray(items) ? items : [], { mode: browseMode })
            );

            const prepareCatalog = async (items: any[]) => {
                // Request mode: live-enrich only unstamped titles (batch is warm-catalog now).
                if (browseMode === 'request') {
                    const next = await enrichDiscoverItemsWithAvailability(Array.isArray(items) ? items : []);
                    return filterDiscoverBrowseItems(next, { mode: browseMode });
                }
                return prepareFromStamps(items);
            };

            const paintFromHome = async (home: any) => {
                if (gen !== loadGenRef.current || !home) return;

                let trending = prepareFromStamps(pageResults(home?.trending));
                let upcoming = prepareFromStamps(mergeDiscoveryRails(home?.upcomingMovies, home?.upcomingSeries));
                let popular = prepareFromStamps(mergeDiscoveryRails(
                    home?.popularMovies,
                    home?.popularSeries || home?.popularTv,
                ));

                [trending, upcoming, popular] = claimExclusiveRailItems(
                    [{ items: trending }, { items: upcoming }, { items: popular }],
                    { interleave: true, maxPerRail: 24 },
                );

                setRows((prev) => ({
                    ...prev,
                    trending,
                    upcoming,
                    popular,
                }));
                if (!hasPaintedRef.current) {
                    hasPaintedRef.current = true;
                    setLoading(false);
                    window.setTimeout(() => setEnterAnim(false), 700);
                }

                // Request: refine stamps + backfill dense rails without blocking first paint.
                if (browseMode !== 'request') return;
                void (async () => {
                    try {
                        let [nextTrending, nextUpcoming, nextPopular] = await Promise.all([
                            prepareCatalog(pageResults(home?.trending)),
                            prepareCatalog(mergeDiscoveryRails(home?.upcomingMovies, home?.upcomingSeries)),
                            prepareCatalog(mergeDiscoveryRails(
                                home?.popularMovies,
                                home?.popularSeries || home?.popularTv,
                            )),
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
                                [
                                    (page) => `/api/discovery/proxy/discover/movies/upcoming?page=${page}`,
                                    (page) => `/api/discovery/proxy/discover/tv/upcoming?page=${page}`,
                                ],
                                prepareCatalog,
                                { minItems: 20, maxPages: 4 },
                            ),
                            backfillFilteredDiscoverResults(
                                nextPopular,
                                [
                                    (page) => `/api/discovery/proxy/discover/movies?page=${page}&sortBy=popularity.desc`,
                                    (page) => `/api/discovery/proxy/discover/tv?page=${page}&sortBy=popularity.desc`,
                                ],
                                prepareCatalog,
                                { minItems: 20, maxPages: 5 },
                            ),
                        ]);
                        if (gen !== loadGenRef.current) return;

                        [nextTrending, nextUpcoming, nextPopular] = claimExclusiveRailItems(
                            [{ items: nextTrending }, { items: nextUpcoming }, { items: nextPopular }],
                            { interleave: true, maxPerRail: 24 },
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
            };

            // Side rails stay live (per-user) and never gate the skeleton.
            if (isDiscover) {
                void (async () => {
                    try {
                        if (gen !== loadGenRef.current) return;
                        const [recentRes, reqRes] = await Promise.all([
                            apiFetch('/api/discovery/recent-requests?take=40').catch(() => null),
                            apiFetch('/api/discovery/my-requests?filter=all&take=40', {
                                cacheTtlMs: 15_000,
                                staleIfErrorMs: 120_000,
                            }).catch(() => null),
                        ]);

                        if (gen !== loadGenRef.current) return;

                        const recentlyRequested = Array.isArray(recentRes?.results) ? recentRes.results : [];
                        const myRequests = Array.isArray(reqRes?.results)
                            ? reqRes.results.map(portalRequestToDiscoveryRowItem)
                            : [];

                        if (reqRes) {
                            writeCachedRequestItems(myRequests);
                            setRequestsReady(true);
                        } else {
                            setRequestsReady(true);
                        }

                        setRows((prev) => ({
                            ...prev,
                            recentlyRequested,
                            ...(reqRes ? { myRequests } : {}),
                        }));
                    } catch {
                        // Side rails are best-effort.
                        if (gen === loadGenRef.current) setRequestsReady(true);
                    }
                })();
            }

            // Shared rails from server prewarm cache (one round-trip).
            const home = await apiFetch('/api/discovery/home').catch(() => null);
            if (gen !== loadGenRef.current) return;
            await paintFromHome(home);

            // Soft-revalidate only when the snapshot is older than the 5m refresh window.
            const generatedAt = Number(home?.generatedAt || 0);
            if (generatedAt > 0 && Date.now() - generatedAt >= CACHE_STALE_MS) {
                void apiFetch('/api/discovery/home').then(async (fresh) => {
                    if (gen !== loadGenRef.current || !fresh) return;
                    await paintFromHome(fresh);
                }).catch(() => {});
            }

            if (!hasPaintedRef.current) {
                hasPaintedRef.current = true;
                setLoading(false);
            }
        } catch (e) {
            console.error(e);
            if (gen === loadGenRef.current) setLoading(false);
        } finally {
            if (gen === loadGenRef.current) setLoading(false);
        }
    }, [
        browseMode,
        isDiscover,
        preferences.discoverRegion,
        preferences.discoverLanguage,
        locale,
    ]);

    useEffect(() => {
        loadData();
        return () => {
            loadGenRef.current += 1;
        };
    }, [loadData]);

    if (loading) {
        return (
            <div aria-busy="true">
                <DiscoverHomeSkeleton />
            </div>
        );
    }

    const isJellyfinPortal = String(mediaServerType || '').toLowerCase() === 'jellyfin';
    const browseBase = browseMode === 'request' ? '/request' : '/discovery';

    return (
        <div className={`flex flex-col gap-6 w-full max-w-full overflow-hidden pb-8 px-1${enterAnim ? ' discover-content-enter' : ''}`}>
            {isDiscover && !isJellyfinPortal && (
                <DiscoverDownloadsSection
                    layout="rail"
                    posterCardClass={posterCardClass}
                    gridSize={gridSize}
                />
            )}

            {isDiscover && (
                <DiscoverHomeRow
                    title={t('home.recentlyRequested') || 'Recently requested'}
                    items={rows.recentlyRequested}
                    posterCardClass={posterCardClass}
                    viewAllLabel={t('common.viewAll')}
                    formatItem={formatItem}
                    onSelect={onSelect}
                    animateEnter={enterAnim}
                    notify={notify}
                    showPosterQualityBadges={showPosterQualityBadges}
                />
            )}

            {isDiscover && (
                <DiscoverHomeRow
                    title={t('home.yourRequests')}
                    items={rows.myRequests}
                    posterCardClass={posterCardClass}
                    viewAllLabel={t('common.viewAll')}
                    formatItem={formatItem}
                    onSelect={onSelect}
                    animateEnter={enterAnim}
                    onViewAll={() => navigate('/request/requests')}
                    showPosterQualityBadges={showPosterQualityBadges}
                    empty={requestsReady ? (
                        <EmptyRail
                            title={t('home.noRequestsTitle')}
                            body={t('home.noRequestsBody')}
                            actionLabel={t('home.browseMovies')}
                            onAction={() => navigate(`${browseBase}/movies`)}
                            icon={<ClipboardList className="w-5 h-5" />}
                        />
                    ) : (
                        <div className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted mx-2">
                            Loading your requests…
                        </div>
                    )}
                />
            )}

            <section className="flex flex-col gap-6">
                <div className="px-2 flex items-center justify-end">
                    <DiscoverGridSizeSelect value={gridSize} onChange={setGridSize} />
                </div>

                <div id="discover-trending">
                    <DiscoverHomeRow
                        title={t('home.trending')}
                        items={rows.trending}
                        posterCardClass={posterCardClass}
                        viewAllLabel={t('common.viewAll')}
                        formatItem={formatItem}
                        onSelect={onSelect}
                        animateEnter={enterAnim}
                        quickRequest={quickRequest}
                        notify={notify}
                        showPosterQualityBadges={showPosterQualityBadges}
                    />
                </div>
                <DiscoverHomeRow
                    title="Upcoming"
                    items={rows.upcoming}
                    posterCardClass={posterCardClass}
                    viewAllLabel={t('common.viewAll')}
                    formatItem={formatItem}
                    onSelect={onSelect}
                    animateEnter={enterAnim}
                    quickRequest={quickRequest}
                    notify={notify}
                    showPosterQualityBadges={showPosterQualityBadges}
                />
                <DiscoverHomeRow
                    title="Popular"
                    items={rows.popular}
                    posterCardClass={posterCardClass}
                    viewAllLabel={t('common.viewAll')}
                    formatItem={formatItem}
                    onSelect={onSelect}
                    animateEnter={enterAnim}
                    quickRequest={quickRequest}
                    notify={notify}
                    showPosterQualityBadges={showPosterQualityBadges}
                />
            </section>
        </div>
    );
};
