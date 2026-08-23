import React, { useCallback, useMemo, useRef } from 'react';
import { ArrowLeft } from 'lucide-react';
import { apiFetch } from '../shared/api';
import { DiscoverPosterGrid } from './DiscoverPosterGrid';
import { DiscoverGridSizeSelect } from './DiscoverGridSizeSelect';
import { useDiscoverGridSize } from './useDiscoverGridSize';
import { useDiscoveryPreferences } from './useDiscoveryPreferences';
import { useDiscoverInfiniteScroll } from './useDiscoverInfiniteScroll';
import { DiscoverInfiniteScrollFooter } from './DiscoverInfiniteScrollFooter';
import { discoverSkeletonCountForGrid } from './discoverPaginationUtils';
import {
    buildPaginatedRailUrlBuilders,
    filterRailItemsByMedia,
    getRailBrowseConfig,
    type DiscoverRailId,
    type RailMediaFilter,
} from './discoverRailBrowse';
import {
    fetchDiscoverPageWithAdvance,
} from './discoverFetchUtils';
import type { DiscoverPagePayload } from './useDiscoverInfiniteScroll';
import { useDiscoverI18n } from './i18n';
import { useHideExistingToggle } from './useHideExistingToggle';
import { useDiscoverQuickRequest } from './useDiscoverQuickRequest';
import { useDiscoverNotify } from './useDiscoverNotify';
import { useClientInfiniteList } from './useClientInfiniteList';
import { enrichDiscoverItemsWithAvailability } from './discoverAvailabilityEnrich';
import { discoverViewsOverlay } from '../screens/DiscoverContent';
import { filterDiscoverBrowseItems } from './discoverAvailability';
import type { DiscoverBrowseMode } from './discoverAvailability';
import { libraryRecentToDiscoveryItem } from './discoverRailUtils';
import { mergeDiscoverResults } from './discoverItemUtils';
import { portalRequestToDiscoveryRowItem } from './myRequestUtils';

type Props = {
    railId: DiscoverRailId;
    media: RailMediaFilter;
    browseMode: DiscoverBrowseMode;
    onBack: () => void;
    onSelect: (item: any) => void;
    formatItem: (item: any) => any;
    pushToast?: (msg: string, type: 'success' | 'error') => void;
    showPosterQualityBadges?: boolean;
    mediaServerType?: string;
    onMediaChange?: (media: RailMediaFilter) => void;
};

const mergePagedResults = (payloads: DiscoverPagePayload[]) => {
    let merged: any[] = [];
    let totalPages = 1;
    for (const payload of payloads) {
        merged = mergeDiscoverResults(merged, payload.results || []);
        totalPages = Math.max(totalPages, Number(payload.totalPages) || 1);
    }
    return { results: merged, totalPages, lastFetchedPage: payloads[0]?.lastFetchedPage ?? 1 };
};

export const DiscoverRailPage: React.FC<Props> = ({
    railId,
    media,
    browseMode,
    onBack,
    onSelect,
    formatItem,
    pushToast,
    showPosterQualityBadges = false,
    mediaServerType = 'plex',
    onMediaChange,
}) => {
    const { t, locale } = useDiscoverI18n();
    const config = getRailBrowseConfig(railId);
    const { preferences } = useDiscoveryPreferences();
    const { hideExisting } = useHideExistingToggle();
    const quickRequest = useDiscoverQuickRequest(pushToast);
    const notify = useDiscoverNotify(pushToast);
    const [gridSize, setGridSize] = useDiscoverGridSize();
    const containerRef = useRef<HTMLDivElement>(null);
    const isCommunityRail = railId.startsWith('community-');

    const formatCommunityItem = useCallback((item: any) => ({
        ...item,
        id: item.ratingKey || item.id,
        thumbUrl: item.thumb || item.thumbUrl,
        title: item.title,
        overlay: item.views ? discoverViewsOverlay(item.views) : null,
    }), []);

    const effectiveFormatItem = isCommunityRail ? formatCommunityItem : formatItem;

    const handleSelect = useCallback((item: any) => {
        if (isCommunityRail && item?.plexUrl) {
            window.open(item.plexUrl, '_blank', 'noopener,noreferrer');
            return;
        }
        onSelect(item);
    }, [isCommunityRail, onSelect]);

    const hideAvailable = preferences.hideAvailableMedia || hideExisting;
    const isJellyfinPortal = String(mediaServerType || '').toLowerCase() === 'jellyfin';

    const title = useMemo(() => {
        if (!config) return 'Browse';
        if (config.titleKey) return t(config.titleKey as any);
        return config.titleFallback;
    }, [config, t]);

    const filterOptions = useMemo(() => ({
        hideAvailable,
        hideRequested: false,
        mode: browseMode,
    }), [browseMode, hideAvailable]);

    const resetKey = `${railId}:${media}:${hideAvailable}:${gridSize}:${locale}:${browseMode}`;

    const urlBuilders = useMemo(
        () => buildPaginatedRailUrlBuilders(railId, media),
        [media, railId],
    );

    const fetchPaginatedPage = useCallback(async (page: number) => {
        const payloads = await Promise.all(
            urlBuilders.map((buildUrl) => fetchDiscoverPageWithAdvance(
                buildUrl,
                page,
                filterOptions,
            )),
        );
        const merged = mergePagedResults(payloads);
        const filtered = filterRailItemsByMedia(merged.results, media);
        return {
            ...merged,
            results: filtered,
            lastFetchedPage: page,
        };
    }, [filterOptions, media, urlBuilders]);

    const paginated = config?.paginated !== false && urlBuilders.length > 0;

    const {
        results: pagedResults,
        loading: pagedLoading,
        loadingMore: pagedLoadingMore,
        hasMore: pagedHasMore,
        sentinelRef: pagedSentinelRef,
    } = useDiscoverInfiniteScroll({
        resetKey: paginated ? resetKey : 'static',
        gridSize,
        containerRef,
        fetchPage: fetchPaginatedPage,
        filterOptions,
    });

    const [staticItems, setStaticItems] = React.useState<any[]>([]);
    const [staticLoading, setStaticLoading] = React.useState(!paginated);

    React.useEffect(() => {
        if (paginated) return undefined;
        let cancelled = false;
        const load = async () => {
            setStaticLoading(true);
            try {
                let items: any[] = [];
                if (railId === 'recently-added') {
                    const endpoint = isJellyfinPortal ? '/api/jellyfin/dashboard' : '/api/plex/library';
                    const data = await apiFetch(`${endpoint}?limit=250`);
                    const raw = media === 'tv'
                        ? (data?.recentShows || [])
                        : (data?.recentMovies || []);
                    items = raw.map((item: any) => libraryRecentToDiscoveryItem(
                        item,
                        media === 'tv' ? 'tv' : 'movie',
                    ));
                } else if (railId === 'recently-upgraded') {
                    const res = await apiFetch(
                        `/api/discovery/recent-upgrades?mediaType=${media === 'tv' ? 'tv' : 'movie'}&take=200`,
                        { forceRefresh: true, cacheTtlMs: 0 },
                    );
                    items = Array.isArray(res?.results) ? res.results : [];
                } else if (railId === 'recent-requests' || railId === 'other-requests') {
                    const res = await apiFetch('/api/discovery/recent-requests?take=200').catch(() => null);
                    items = Array.isArray(res?.results) ? res.results : [];
                } else if (railId.startsWith('community-')) {
                    const res = await apiFetch('/api/plex/stats/trending', {
                        cacheTtlMs: 5 * 60_000,
                        staleIfErrorMs: 60 * 60_000,
                    });
                    if (railId === 'community-trending') items = res?.trending7Days || [];
                    else if (railId === 'community-movies') items = res?.movies30Days || [];
                    else items = res?.shows30Days || [];
                }

                if (browseMode === 'request'
                    && !isCommunityRail
                    && railId !== 'recent-requests'
                    && railId !== 'other-requests') {
                    items = await enrichDiscoverItemsWithAvailability(items);
                }
                if (!isCommunityRail) {
                    items = filterDiscoverBrowseItems(items, { mode: browseMode, hideAvailable: false });
                }
                items = filterRailItemsByMedia(items, media);

                if (railId === 'other-requests') {
                    const mine = await apiFetch('/api/discovery/my-requests?filter=all&take=200', {
                        cacheTtlMs: 15_000,
                    }).catch(() => null);
                    const mineKeys = new Set(
                        (Array.isArray(mine?.results) ? mine.results : [])
                            .map((row: any) => portalRequestToDiscoveryRowItem(row))
                            .map((row: any) => `${row.mediaType || row.type}:${row.tmdbId || row.id}`),
                    );
                    items = items.filter((item) => {
                        const key = `${item.mediaType || item.type}:${item.tmdbId || item.id}`;
                        return !mineKeys.has(key);
                    });
                }

                if (!cancelled) setStaticItems(items);
            } catch (error) {
                console.error(error);
                if (!cancelled) setStaticItems([]);
            } finally {
                if (!cancelled) setStaticLoading(false);
            }
        };
        void load();
        return () => { cancelled = true; };
    }, [browseMode, hideAvailable, isCommunityRail, isJellyfinPortal, media, paginated, railId]);

    const {
        results: staticPaged,
        loadingMore: staticLoadingMore,
        hasMore: staticHasMore,
        sentinelRef: staticSentinelRef,
    } = useClientInfiniteList(staticItems, resetKey);

    const results = paginated ? pagedResults : staticPaged;
    const loading = paginated ? pagedLoading : staticLoading;
    const loadingMore = paginated ? pagedLoadingMore : staticLoadingMore;
    const hasMore = paginated ? pagedHasMore : staticHasMore;
    const sentinelRef = paginated ? pagedSentinelRef : staticSentinelRef;

    const skeletonCount = discoverSkeletonCountForGrid(
        gridSize,
        containerRef.current?.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 1200),
    );

    const showMediaTabs = config?.supportsMediaPicker && onMediaChange;

    return (
        <div className="w-full flex flex-col gap-6 pb-12">
            <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-text transition-colors w-fit"
            >
                <ArrowLeft className="w-4 h-4" />
                {t('browse.backToBrowse')}
            </button>

            <div className="px-2">
                <div className="flex flex-col gap-4 p-6 rounded-2xl border border-border bg-gradient-to-br from-card/90 to-background/60">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                        <div className="min-w-0">
                            <h1 className="text-3xl sm:text-4xl font-black text-text tracking-tight">{title}</h1>
                            <p className="text-sm text-muted mt-2">{t('browse.railSubtitle')}</p>
                        </div>
                        <DiscoverGridSizeSelect
                            value={gridSize}
                            onChange={setGridSize}
                            className="w-44 self-start sm:self-center flex-shrink-0"
                        />
                    </div>
                    {showMediaTabs ? (
                        <div className="flex flex-wrap gap-2">
                            {([
                                ['movie', t('mediaType.movies')],
                                ['tv', t('mediaType.series')],
                                ['all', t('browse.moviesAndTv')],
                            ] as const).map(([value, label]) => (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => onMediaChange?.(value)}
                                    className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                                        media === value
                                            ? 'bg-plex text-black border-plex'
                                            : 'bg-white/5 text-muted border-border hover:text-text'
                                    }`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    ) : null}
                </div>
            </div>

            <div className="px-2 flex flex-col gap-4" ref={containerRef}>
                <DiscoverPosterGrid
                    items={results}
                    gridSize={gridSize}
                    formatItem={effectiveFormatItem}
                    onSelect={handleSelect}
                    loading={loading}
                    skeletonCount={skeletonCount}
                    emptyMessage={t('browse.railEmpty', { title })}
                    emptyHint={hideExisting ? t('browse.emptyHintHideExisting') : undefined}
                    quickRequest={isCommunityRail ? undefined : quickRequest}
                    notify={isCommunityRail ? undefined : notify}
                    showPosterQualityBadges={showPosterQualityBadges}
                />

                <DiscoverInfiniteScrollFooter
                    sentinelRef={sentinelRef}
                    loadingMore={loadingMore}
                    hasMore={hasMore}
                    loading={loading}
                />
            </div>
        </div>
    );
};
