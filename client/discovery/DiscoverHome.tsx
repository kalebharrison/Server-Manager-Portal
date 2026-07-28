import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronDown, ChevronUp, ClipboardList, Film, Sparkles } from 'lucide-react';
import { apiFetch } from '../shared/api';
import { DiscoverPosterCard } from '../screens';
import { Carousel } from './Carousel';
import { enrichDiscoveryItems, normalizeRawDiscoveryItem } from './discoverItemUtils';
import { portalRequestToDiscoveryRowItem } from './myRequestUtils';
import { filterHiddenAvailableItems, useDiscoveryPreferences } from './useDiscoveryPreferences';
import { fetchDiscoverHomeRowResults } from './discoverFetchUtils';
import { enrichDiscoverItemsWithAvailability } from './discoverAvailabilityEnrich';
import { WatchlistPanel } from './WatchlistPanel';
import { DiscoverHomeSkeleton } from '../shared/skeletons';
import { discoveryTheme } from './discoveryThemeClasses';
import { useLibraryQueueToggle } from './useLibraryQueueToggle';
import { DiscoverGridSizeSelect } from './DiscoverGridSizeSelect';
import { useDiscoverGridSize } from './useDiscoverGridSize';
import { discoverRowCardWidthClass } from '../shared/portalLayout';
import { useDiscoverI18n } from './i18n';
import { DiscoverQuickRequestButton } from './DiscoverQuickRequestButton';
import { DiscoverStatusOverlay } from './DiscoverStatusOverlay';
import { useDiscoverQuickRequest } from './useDiscoverQuickRequest';
import { useDiscoverNotify } from './useDiscoverNotify';

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
                            className={`${posterCardClass} flex-shrink-0 relative group${animateEnter ? ' discover-poster-enter' : ''}`}
                            style={animateEnter ? { animationDelay: `${Math.min(idx, 12) * 30}ms` } : undefined}
                        >
                            <DiscoverPosterCard
                                item={{
                                    ...formatted,
                                    tags: Array.isArray(formatted.qualityTags) ? formatted.qualityTags : [],
                                }}
                                overlay={overlay}
                                showQualityBadges={
                                    (formatted.availability?.kind === 'available'
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
}> = ({ onSelect, formatItem, navigate, pushToast, providerLabel = 'Plex' }) => {
    const { t, locale } = useDiscoverI18n();
    const { preferences, loaded } = useDiscoveryPreferences();
    const { showLibraryQueue, toggleLibraryQueue } = useLibraryQueueToggle();
    const quickRequest = useDiscoverQuickRequest(pushToast);
    const notify = useDiscoverNotify(pushToast);
    const [gridSize, setGridSize] = useDiscoverGridSize();
    const posterCardClass = discoverRowCardWidthClass(gridSize);
    const [rows, setRows] = useState({
        recentlyAdded: [] as any[],
        recentRequests: [] as any[],
        plexWatchlist: [] as any[],
        trending: [] as any[],
        upcomingMovies: [] as any[],
        popularSeries: [] as any[],
        upcomingSeries: [] as any[],
    });
    const [loading, setLoading] = useState(true);
    const loadGenRef = useRef(0);
    const hasPaintedRef = useRef(false);
    const [enterAnim, setEnterAnim] = useState(true);

    const loadData = useCallback(async () => {
        if (!loaded) return;
        const gen = ++loadGenRef.current;
        const paintAbort = new AbortController();
        const paintTimer = window.setTimeout(() => paintAbort.abort(), 10000);
        // Avoid skeleton ↔ content flicker on preference/locale refreshes after first paint.
        if (!hasPaintedRef.current) setLoading(true);
        try {
            const hideAvailable = preferences.hideAvailableMedia;
            // Seerr-style: one endpoint per rail; advance same URL pages only (no multi-source storm).
            const rowOpts = {
                needsBackfill: hideAvailable,
                // Availability stamps on the proxy mean fewer empty pages to scan.
                maxPages: hideAvailable ? 2 : 1,
                maxItems: 20,
                minItems: hideAvailable ? 12 : 12,
                hideRequested: false,
                trustAttachedAvailability: true,
                pageConcurrency: 1,
                requirePoster: true,
                signal: paintAbort.signal,
            };
            const trendingUrl = (page: number) => `/api/discovery/proxy/discover/trending?page=${page}`;
            const upcomingMoviesUrl = (page: number) => `/api/discovery/proxy/discover/movies/upcoming?page=${page}`;
            const seriesUrl = (page: number) => `/api/discovery/proxy/discover/tv?sortBy=popularity.desc&page=${page}`;
            const upcomingSeriesUrl = (page: number) => `/api/discovery/proxy/discover/tv/upcoming?page=${page}`;

            const [
                trendingRes,
                upcomingMovies,
                popularSeries,
                upcomingSeries,
            ] = await Promise.all([
                fetchDiscoverHomeRowResults(trendingUrl, hideAvailable, rowOpts).catch(() => []),
                fetchDiscoverHomeRowResults(upcomingMoviesUrl, hideAvailable, rowOpts).catch(() => []),
                fetchDiscoverHomeRowResults(seriesUrl, hideAvailable, rowOpts).catch(() => []),
                fetchDiscoverHomeRowResults(upcomingSeriesUrl, hideAvailable, rowOpts).catch(() => []),
            ]);

            if (gen !== loadGenRef.current) return;

            setRows({
                recentlyAdded: [],
                recentRequests: [],
                plexWatchlist: [],
                trending: filterHiddenAvailableItems(trendingRes, hideAvailable),
                upcomingMovies: filterHiddenAvailableItems(upcomingMovies, hideAvailable),
                popularSeries: filterHiddenAvailableItems(popularSeries, hideAvailable),
                upcomingSeries: filterHiddenAvailableItems(upcomingSeries, hideAvailable),
            });
            hasPaintedRef.current = true;
            setLoading(false);
            // Stagger enter only on the first successful paint.
            window.setTimeout(() => setEnterAnim(false), 700);

            // Side rails + poster enrich after first paint (never block the skeleton).
            void (async () => {
                try {
                    if (gen !== loadGenRef.current) return;
                    const [addedRes, reqRes, watchlistRes] = await Promise.all([
                        (hideAvailable || preferences.showRecentlyAdded === false)
                            ? Promise.resolve(null)
                            : apiFetch('/api/discovery/proxy/media?filter=allavailable&take=40&sort=mediaAdded').catch(() => null),
                        apiFetch('/api/discovery/my-requests?filter=all&take=40').catch(() => null),
                        preferences.showWatchlist === false
                            ? Promise.resolve(null)
                            : apiFetch('/api/discovery/watchlist').catch(() => null),
                    ]);

                    if (gen !== loadGenRef.current) return;

                    const myRequestItems = Array.isArray(reqRes?.results)
                        ? reqRes.results.map(portalRequestToDiscoveryRowItem)
                        : [];

                    // Normalize library/requests; enrich watchlist posters + availability (Request vs Available).
                    const recentlyAdded = (addedRes?.results || []).map(normalizeRawDiscoveryItem);
                    const recentRequests = await enrichDiscoveryItems(myRequestItems);
                    const watchlistPosters = await enrichDiscoveryItems(watchlistRes?.results || []);
                    const plexWatchlist = await enrichDiscoverItemsWithAvailability(watchlistPosters);

                    if (gen !== loadGenRef.current) return;
                    setRows((prev) => ({
                        ...prev,
                        recentlyAdded,
                        recentRequests: filterHiddenAvailableItems(recentRequests, hideAvailable),
                        plexWatchlist,
                    }));
                } catch {
                    // Side rails are best-effort.
                }
            })();
        } catch (e) {
            console.error(e);
            if (gen === loadGenRef.current) setLoading(false);
        } finally {
            window.clearTimeout(paintTimer);
            if (gen === loadGenRef.current) setLoading(false);
        }
    }, [loaded, preferences.hideAvailableMedia, preferences.discoverRegion, preferences.discoverLanguage, preferences.showRecentlyAdded, preferences.showWatchlist, locale]);

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

    return (
        <div className={`flex flex-col gap-6 w-full max-w-full overflow-hidden pb-8 px-1${enterAnim ? ' discover-content-enter' : ''}`}>
            {showLibraryQueue ? (
                <section className={discoveryTheme.personalPanel}>
                    <div className="px-1 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <p className={discoveryTheme.personalEyebrow}>{t('home.forYou')}</p>
                            <h2 className="text-lg sm:text-xl font-black text-text mt-1">{t('home.libraryQueue')}</h2>
                            <p className="text-sm text-muted mt-1">{t('home.libraryQueueHint')}</p>
                        </div>
                        <button
                            type="button"
                            onClick={toggleLibraryQueue}
                            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-white/5 hover:bg-white/10 text-xs font-bold text-muted hover:text-text transition-colors"
                            aria-expanded={true}
                            aria-controls="discover-library-queue"
                            title={t('home.hideLibraryQueue')}
                        >
                            {t('common.hide')}
                            <ChevronUp className="w-3.5 h-3.5" />
                        </button>
                    </div>

                    <div id="discover-library-queue" className="flex flex-col gap-5">
                        <DiscoverHomeRow
                            title={t('home.yourRequests')}
                            items={rows.recentRequests}
                            posterCardClass={posterCardClass}
                            viewAllLabel={t('common.viewAll')}
                            formatItem={formatItem}
                            onSelect={onSelect}
                            animateEnter={enterAnim}
                            onViewAll={() => navigate('/discovery/requests')}
                            empty={(
                                <EmptyRail
                                    title={t('home.noRequestsTitle')}
                                    body={t('home.noRequestsBody')}
                                    actionLabel={t('home.browseMovies')}
                                    onAction={() => navigate('/discovery/movies')}
                                    icon={<ClipboardList className="w-5 h-5" />}
                                />
                            )}
                        />

                        {preferences.showWatchlist !== false && rows.plexWatchlist.length > 0 ? (
                            <WatchlistPanel
                                items={rows.plexWatchlist}
                                formatItem={formatItem}
                                onSelect={onSelect}
                                navigate={navigate}
                                pushToast={pushToast}
                                onRefresh={loadData}
                                variant="row"
                                providerLabel={providerLabel}
                                rowCardClassName={posterCardClass}
                            />
                        ) : preferences.showWatchlist !== false ? (
                            <div className="flex flex-col gap-2">
                                <h2 className={`${discoveryTheme.sectionTitle} px-2`}>{t('watchlist.title', { provider: providerLabel })}</h2>
                                <EmptyRail
                                    title={t('home.watchlistEmptyTitle')}
                                    body={t('home.watchlistEmptyBody', { provider: providerLabel })}
                                    actionLabel={t('home.seeTrending')}
                                    onAction={() => {
                                        document.getElementById('discover-trending')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                    }}
                                    icon={<Sparkles className="w-5 h-5" />}
                                />
                            </div>
                        ) : null}
                    </div>
                </section>
            ) : (
                <section className="rounded-xl border border-border/60 bg-white/[0.02] px-3 py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex items-baseline gap-2 sm:gap-3">
                        <p className={discoveryTheme.personalEyebrow}>{t('home.forYou')}</p>
                        <h2 className="text-sm font-bold text-text truncate">{t('home.libraryQueue')}</h2>
                    </div>
                    <button
                        type="button"
                        onClick={toggleLibraryQueue}
                        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-white/5 hover:bg-white/10 text-xs font-bold text-muted hover:text-text transition-colors"
                        aria-expanded={false}
                        aria-controls="discover-library-queue"
                        title={t('home.showLibraryQueue')}
                    >
                        {t('common.show')}
                        <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                </section>
            )}

            <section className={discoveryTheme.browseSection}>
                <div className="px-3 flex items-end justify-between gap-3 flex-wrap">
                    <div>
                        <p className={discoveryTheme.personalEyebrow}>{t('home.browse')}</p>
                        <h2 className="text-lg sm:text-xl font-black text-text mt-1">{t('home.whatsPopular')}</h2>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-3">
                        <DiscoverGridSizeSelect value={gridSize} onChange={setGridSize} />
                        <button
                            type="button"
                            onClick={() => navigate('/discovery/movies')}
                            className="text-xs font-bold text-plex hover:underline inline-flex items-center gap-1"
                        >
                            <Film className="w-3.5 h-3.5" /> {t('home.allMovies')}
                        </button>
                    </div>
                </div>

                {preferences.showRecentlyAdded !== false && (
                    <DiscoverHomeRow
                        title={t('home.recentlyAdded')}
                        items={rows.recentlyAdded}
                        posterCardClass={posterCardClass}
                        viewAllLabel={t('common.viewAll')}
                        formatItem={formatItem}
                        onSelect={onSelect}
                        animateEnter={enterAnim}
                    />
                )}
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
                    />
                </div>
                <DiscoverHomeRow
                    title={t('home.upcomingMovies')}
                    items={rows.upcomingMovies}
                    posterCardClass={posterCardClass}
                    viewAllLabel={t('common.viewAll')}
                    formatItem={formatItem}
                    onSelect={onSelect}
                    animateEnter={enterAnim}
                    quickRequest={quickRequest}
                    notify={notify}
                />
                <DiscoverHomeRow
                    title={t('home.popularSeries')}
                    items={rows.popularSeries}
                    posterCardClass={posterCardClass}
                    viewAllLabel={t('common.viewAll')}
                    formatItem={formatItem}
                    onSelect={onSelect}
                    animateEnter={enterAnim}
                    onViewAll={() => navigate('/discovery/series')}
                    quickRequest={quickRequest}
                    notify={notify}
                />
                <DiscoverHomeRow
                    title={t('home.upcomingSeries')}
                    items={rows.upcomingSeries}
                    posterCardClass={posterCardClass}
                    viewAllLabel={t('common.viewAll')}
                    formatItem={formatItem}
                    onSelect={onSelect}
                    animateEnter={enterAnim}
                    quickRequest={quickRequest}
                    notify={notify}
                />
            </section>
        </div>
    );
};
