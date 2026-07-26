import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { DiscoverPosterCard } from '../screens';
import { PosterCardSkeleton } from '../shared/skeletons';
import { upgraderPosterGridClass, upgraderPosterGridStyle, type UpgraderGridSize } from '../shared/portalLayout';
import { dedupeDiscoverResults, getDiscoverItemKey } from './discoverItemUtils';
import { DiscoverQuickRequestButton, type DiscoverQuickRequestApi } from './DiscoverQuickRequestButton';
import { discoveryTheme } from './discoveryThemeClasses';
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
}) => {
    const { t } = useDiscoverI18n();
    const visibleItems = useMemo(() => dedupeDiscoverResults(items), [items]);
    // Enter-animate only the first paint after a loading cycle. Infinite-scroll appends
    // must not remount or re-animate existing posters (that flashed the grid to opacity 0).
    const wasLoadingRef = useRef(true);
    const animateEnter = !loading && wasLoadingRef.current;

    useLayoutEffect(() => {
        wasLoadingRef.current = loading;
    }, [loading]);

    if (loading) {
        return (
            <div
                className={upgraderPosterGridClass(gridSize)}
                style={upgraderPosterGridStyle(gridSize)}
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
            style={upgraderPosterGridStyle(gridSize)}
        >
            {visibleItems.map((rawItem, index) => {
                const formatted = formatItem(rawItem);
                const itemKey = getDiscoverItemKey(rawItem) || `${formatted.mediaType || formatted.type}-${formatted.id}`;
                const showRequest = !!quickRequest
                    && (quickRequest.canQuickRequest(formatted)
                        || quickRequest.isRequesting(formatted)
                        || quickRequest.isRequested(formatted));
                const overlay = (
                    <>
                        {formatted.overlay}
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
                            item={formatted}
                            overlay={overlay}
                            showQualityBadges={false}
                            onPosterClick={() => onSelect(formatted)}
                        />
                    </div>
                );
            })}
        </div>
    );
};
