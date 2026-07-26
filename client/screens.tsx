import React from 'react';
import { DiscoverPosterCard as PortalPosterCard } from './screens/DiscoverContent';

/**
 * Compatibility surface for the TMDB Discover screens checked out from main.
 * It translates their poster URL and click callback into the portal card API.
 */
export const DiscoverPosterCard: React.FC<any> = ({ item, onPosterClick, ...props }) => (
    <div
        role={onPosterClick ? 'button' : undefined}
        tabIndex={onPosterClick ? 0 : undefined}
        onClick={(event) => {
            if (!onPosterClick) return;
            event.preventDefault();
            onPosterClick(item);
        }}
        onKeyDown={(event) => {
            if (onPosterClick && (event.key === 'Enter' || event.key === ' ')) {
                event.preventDefault();
                onPosterClick(item);
            }
        }}
    >
        <PortalPosterCard
            {...props}
            item={{
                ...item,
                thumbUrl: item?.thumbUrl || item?.posterUrl || item?.posterPath || item?.thumb,
            }}
        />
    </div>
);
