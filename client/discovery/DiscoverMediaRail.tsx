import React from 'react';
import { DiscoverPosterCard } from '../screens';
import { Carousel } from './Carousel';
import { DiscoverQuickRequestButton } from './DiscoverQuickRequestButton';
import { DiscoverStatusOverlay } from './DiscoverStatusOverlay';
import { DiscoverRailSectionHeader } from './DiscoverRailSectionHeader';
import { discoveryTheme } from './discoveryThemeClasses';
import { useDiscoverI18n } from './i18n';
import type { RailMediaFilter } from './discoverRailBrowse';
import type { useDiscoverNotify } from './useDiscoverNotify';
import type { useDiscoverQuickRequest } from './useDiscoverQuickRequest';

/** Horizontal poster rail shared by Movies/Series browse tabs (mirrors DiscoverHomeRow). */
export const DiscoverMediaRail: React.FC<{
    title: string;
    items: any[];
    posterCardClass: string;
    formatItem: (item: any) => any;
    onSelect: (item: any) => void;
    viewAllLabel?: string;
    onViewAll?: () => void;
    onBrowseRail?: (media: RailMediaFilter) => void;
    showMediaPicker?: boolean;
    browseDefaultMedia?: RailMediaFilter;
    empty?: React.ReactNode;
    animateEnter?: boolean;
    quickRequest?: ReturnType<typeof useDiscoverQuickRequest>;
    notify?: ReturnType<typeof useDiscoverNotify>;
    showPosterQualityBadges?: boolean;
}> = ({
    title,
    items,
    posterCardClass,
    formatItem,
    onSelect,
    viewAllLabel,
    onViewAll,
    onBrowseRail,
    showMediaPicker = false,
    browseDefaultMedia = 'movie',
    empty,
    animateEnter = false,
    quickRequest,
    notify,
    showPosterQualityBadges = false,
}) => {
    const { t } = useDiscoverI18n();
    const header = onBrowseRail ? (
        <DiscoverRailSectionHeader
            title={title}
            viewAllLabel={viewAllLabel}
            showMediaPicker={showMediaPicker}
            defaultMedia={browseDefaultMedia}
            onNavigate={onBrowseRail}
        />
    ) : (
        <div className="flex items-center gap-3 min-w-0 px-2 pr-16">
            <h2 className={`${discoveryTheme.sectionTitle} truncate`}>{title}</h2>
            {onViewAll && viewAllLabel && (
                <button type="button" onClick={onViewAll} className="shrink-0 text-xs font-bold text-plex hover:underline">
                    {viewAllLabel}
                </button>
            )}
        </div>
    );

    if (!items?.length) {
        if (!empty) return null;
        return (
            <div className="flex flex-col gap-2 relative">
                {header}
                {empty}
            </div>
        );
    }
    return (
        <div className="flex flex-col gap-2 relative">
            {header}
            <Carousel>
                {items.map((rawItem, idx) => {
                    if (!rawItem) return null;
                    const formatted = formatItem(rawItem);
                    const requesting = !!quickRequest?.isRequesting(formatted);
                    const requestedLocal = !!quickRequest?.isRequested(formatted);
                    const showRequest = !!quickRequest
                        && (quickRequest.canQuickRequest(formatted) || requesting);
                    const showNotify = !!notify
                        && (notify.canNotify(rawItem)
                            || notify.isNotifying(rawItem)
                            || notify.isBusy(rawItem))
                        && !showRequest;
                    const showRequestedBadge = requestedLocal
                        && !showNotify
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
