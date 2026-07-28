import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { DiscoverPosterCard } from '../screens';
import { PosterCardSkeleton } from '../shared/skeletons';
import { upgraderPosterGridClass, discoverBrowseGridStyle, type UpgraderGridSize } from '../shared/portalLayout';
import { dedupeDiscoverResults, getDiscoverItemKey } from './discoverItemUtils';
import { DiscoverBrowseCard } from './DiscoverBrowseCard';
import { DiscoverQuickRequestButton, type DiscoverQuickRequestApi } from './DiscoverQuickRequestButton';
import { DiscoverStatusOverlay } from './DiscoverStatusOverlay';
import { discoveryTheme } from './discoveryThemeClasses';
import type { DiscoverNotifyApi } from './useDiscoverNotify';
import { useDiscoverI18n } from './i18n';

type Props = {
    items: any[];
    gridSize: UpgraderGridSize;
    formatItem: (item: any) => any;
    onSelect: (item: any) => void;
    loading?: boolean;
    skeletonCount?: number;
    emptyMessage?: string;
    emptyHint?: string;
    quickRequest?: DiscoverQuickRequestApi;
    notify?: DiscoverNotifyApi;
    /** Dense RequestMediaCard-style layout (Movies/Series). Compact posters for Home. */
    variant?: 'compact' | 'dense';
    showPosterQualityBadges?: boolean;
};

export const DiscoverPosterGrid: React.FC<Props> = ({
    items,
    gridSize,
    formatItem,
    onSelect,
    loading = false,
    skeletonCount = 15,
    emptyMessage = 'No results found.',
    emptyHint,
    quickRequest,
    notify,
    variant = 'compact',
    showPosterQualityBadges = false,
}) => {
    const { t } = useDiscoverI18n();
    const visibleItems = useMemo(() => dedupeDiscoverResults(items), [items]);
    const wasLoadingRef = useRef(true);
    const animateEnter = !loading && wasLoadingRef.current;

    useLayoutEffect(() => {
        wasLoadingRef.current = loading;
    }, [loading]);

    if (loading) {
        return (
            <div
                className={upgraderPosterGridClass(gridSize)}
                style={discoverBrowseGridStyle(gridSize)}
                aria-busy="true"
                aria-label="Loading results"
            >
                {[...Array(skeletonCount)].map((_, i) => (
                    <PosterCardSkeleton
                        key={i}
                        variant="discover"
                        delayMs={Math.min(i, 14) * 28}
                    />
                ))}
            </div>
        );
    }

    if (visibleItems.length === 0) {
        return (
            <div className={`${discoveryTheme.posterEmpty} discover-content-enter`}>
                <p className={discoveryTheme.emptyTitle}>{emptyMessage}</p>
                <p className={discoveryTheme.emptyBody}>
                    {emptyHint || t('browse.emptyHint')}
                </p>
            </div>
        );
    }

    return (
        <div
            className={upgraderPosterGridClass(gridSize)}
            style={discoverBrowseGridStyle(gridSize)}
        >
            {visibleItems.map((rawItem, index) => {
                const formatted = formatItem(rawItem);
                const itemKey = getDiscoverItemKey(rawItem) || `${formatted.mediaType || formatted.type}-${formatted.id}`;

                if (variant === 'dense') {
                    return (
                        <div
                            key={itemKey}
                            className={animateEnter ? 'discover-poster-enter min-w-0' : 'min-w-0'}
                            style={animateEnter
                                ? { animationDelay: `${Math.min(index, 18) * 22}ms` }
                                : undefined}
                        >
                            <DiscoverBrowseCard
                                item={rawItem}
                                formatted={formatted}
                                onSelect={onSelect}
                                quickRequest={quickRequest}
                                notify={notify}
                                priority={index < 6}
                                showPosterQualityBadges={showPosterQualityBadges}
                            />
                        </div>
                    );
                }

                const showRequest = !!quickRequest
                    && (quickRequest.canQuickRequest(formatted)
                        || quickRequest.isRequesting(formatted)
                        || quickRequest.isRequested(formatted));
                const showNotify = !!notify
                    && (notify.canNotify(rawItem)
                        || notify.isNotifying(rawItem)
                        || notify.isBusy(rawItem));
                const availability = formatted.availability;
                const showRequestedBadge = !!quickRequest?.isRequested(formatted)
                    && (!availability || availability.kind === 'none');
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
                        key={itemKey}
                        className={animateEnter ? 'discover-poster-enter min-w-0' : 'min-w-0'}
                        style={animateEnter
                            ? { animationDelay: `${Math.min(index, 18) * 22}ms` }
                            : undefined}
                    >
                        <DiscoverPosterCard
                            item={{
                                ...formatted,
                                tags: Array.isArray(formatted.qualityTags) ? formatted.qualityTags : [],
                            }}
                            overlay={overlay}
                            showQualityBadges={
                                showPosterQualityBadges
                                && (availability?.kind === 'available' || availability?.kind === 'partial')
                                && Array.isArray(formatted.qualityTags)
                                && formatted.qualityTags.length > 0
                            }
                            onPosterClick={() => onSelect(formatted)}
                        />
                    </div>
                );
            })}
        </div>
    );
};
