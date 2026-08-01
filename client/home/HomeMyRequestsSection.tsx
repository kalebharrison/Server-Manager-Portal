import React from 'react';
import { DiscoverPosterCard } from '../screens';
import { portalUrl } from '../shared/basePath';
import { resolveMediaAvailabilityState } from '../discovery/discoverAvailability';
import { DiscoverStatusOverlay } from '../discovery/DiscoverStatusOverlay';
import {
    memberRequestDisplayStatus,
    portalRequestToDiscoveryRowItem,
    requestQualityChipLabel,
} from '../discovery/myRequestUtils';
import { resolveTmdbImageUrl } from '../discovery/tmdbImageUrl';
import type { PortalRequestItem } from '../requests/types';
import { RecentlyAddedScrollRow } from './recentlyAddedWidgetRenderer';

const goDiscover = (path: string) => {
    window.history.pushState({}, '', portalUrl(path));
    window.dispatchEvent(new PopStateEvent('popstate'));
};

type Props = {
    items: PortalRequestItem[];
};

export const HomeMyRequestsSection: React.FC<Props> = ({ items }) => {
    if (!items.length) return null;

    return (
        <RecentlyAddedScrollRow
            title="Your Requests"
            headerRight={(
                <button
                    type="button"
                    onClick={() => goDiscover('/discovery/requests')}
                    className="text-xs font-bold text-plex hover:underline shrink-0"
                >
                    View all
                </button>
            )}
        >
            {items.map((raw, idx) => {
                const row = portalRequestToDiscoveryRowItem(raw);
                const mediaType = String(raw.type || row.type || 'movie').toLowerCase() === 'tv' ? 'tv' : 'movie';
                const tmdbId = Number(raw.tmdbId || row.media?.tmdbId || 0) || null;
                const title = String(raw.title || row.media?.title || 'Untitled');
                const year = raw.year ? String(raw.year) : '';
                const thumbUrl = String(raw.posterUrl || '').trim()
                    || resolveTmdbImageUrl(raw.posterPath || row.media?.posterPath, 'w342');
                const availability = resolveMediaAvailabilityState(row);
                const statusLabel = memberRequestDisplayStatus(raw);
                const qualityChip = requestQualityChipLabel(raw);
                const overlay = availability.kind !== 'none'
                    ? <DiscoverStatusOverlay state={availability} />
                    : null;

                return (
                    <DiscoverPosterCard
                        key={raw.id || `${title}-${idx}`}
                        variant="home"
                        className="snap-start shrink-0 w-32 md:w-40 poster-rail-item"
                        item={{
                            title,
                            year,
                            thumbUrl,
                            plexUrl: '#',
                        }}
                        overlay={overlay}
                        showQualityBadges={false}
                        onPosterClick={() => {
                            if (tmdbId) goDiscover(`/discovery/${mediaType}/${tmdbId}`);
                            else goDiscover('/discovery/requests');
                        }}
                        footer={(
                            <div className="flex flex-col px-1">
                                <p className="text-xs font-bold text-text truncate group-hover:text-plex transition-colors">{title}</p>
                                <p className="text-[10px] text-muted font-semibold mt-0.5 truncate">
                                    {statusLabel}
                                    {qualityChip ? ` · ${qualityChip}` : ''}
                                    {year ? ` · ${year}` : ''}
                                </p>
                            </div>
                        )}
                    />
                );
            })}
        </RecentlyAddedScrollRow>
    );
};
