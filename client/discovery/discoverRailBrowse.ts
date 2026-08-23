/** Rail browse routes + fetch URL builders for infinite-scroll list pages. */

import {
    buildPaginatedRailUrlBuilders,
    buildRailBrowsePath,
    parseRailMediaFilter,
} from '../../lib/discovery/railBrowse.js';

export type DiscoverRailId =
    | 'trending'
    | 'upcoming'
    | 'popular'
    | 'recently-added'
    | 'recently-upgraded'
    | 'recent-requests'
    | 'other-requests'
    | 'community-trending'
    | 'community-movies'
    | 'community-shows'
    | 'anime-popular-movies'
    | 'anime-popular-series'
    | 'anime-upcoming-movies'
    | 'anime-upcoming-series';

export type RailMediaFilter = 'all' | 'movie' | 'tv';

export type RailBrowseContext = {
    media?: RailMediaFilter;
    anime?: boolean;
};

export type RailBrowseConfig = {
    id: DiscoverRailId;
    titleKey?: string;
    titleFallback: string;
    /** When false, title navigates directly with fixed media. */
    supportsMediaPicker: boolean;
    defaultMedia: RailMediaFilter;
    paginated: boolean;
    anime?: boolean;
};

const RAIL_CONFIG: Record<DiscoverRailId, Omit<RailBrowseConfig, 'id'>> = {
    trending: {
        titleFallback: 'Trending',
        supportsMediaPicker: true,
        defaultMedia: 'movie',
        paginated: true,
    },
    upcoming: {
        titleFallback: 'Upcoming',
        supportsMediaPicker: true,
        defaultMedia: 'movie',
        paginated: true,
    },
    popular: {
        titleFallback: 'Popular',
        supportsMediaPicker: true,
        defaultMedia: 'movie',
        paginated: true,
    },
    'recently-added': {
        titleFallback: 'Recently Added',
        supportsMediaPicker: false,
        defaultMedia: 'movie',
        paginated: false,
    },
    'recently-upgraded': {
        titleFallback: 'Recently Upgraded',
        supportsMediaPicker: false,
        defaultMedia: 'movie',
        paginated: false,
    },
    'recent-requests': {
        titleFallback: 'Other Requests',
        supportsMediaPicker: false,
        defaultMedia: 'all',
        paginated: false,
    },
    'other-requests': {
        titleFallback: 'Other Requests',
        supportsMediaPicker: false,
        defaultMedia: 'all',
        paginated: false,
    },
    'community-trending': {
        titleFallback: 'Trending This Week',
        supportsMediaPicker: false,
        defaultMedia: 'all',
        paginated: false,
    },
    'community-movies': {
        titleFallback: 'Most Watched Movies This Month',
        supportsMediaPicker: false,
        defaultMedia: 'movie',
        paginated: false,
    },
    'community-shows': {
        titleFallback: 'Most Watched Shows This Month',
        supportsMediaPicker: false,
        defaultMedia: 'tv',
        paginated: false,
    },
    'anime-popular-movies': {
        titleFallback: 'Popular Anime Movies',
        supportsMediaPicker: false,
        defaultMedia: 'movie',
        paginated: true,
        anime: true,
    },
    'anime-popular-series': {
        titleFallback: 'Popular Anime Series',
        supportsMediaPicker: false,
        defaultMedia: 'tv',
        paginated: true,
        anime: true,
    },
    'anime-upcoming-movies': {
        titleFallback: 'Upcoming Anime Movies',
        supportsMediaPicker: false,
        defaultMedia: 'movie',
        paginated: true,
        anime: true,
    },
    'anime-upcoming-series': {
        titleFallback: 'Upcoming Anime Series',
        supportsMediaPicker: false,
        defaultMedia: 'tv',
        paginated: true,
        anime: true,
    },
};

export const getRailBrowseConfig = (railId: string): RailBrowseConfig | null => {
    const entry = RAIL_CONFIG[railId as DiscoverRailId];
    if (!entry) return null;
    return { id: railId as DiscoverRailId, ...entry };
};

export { buildPaginatedRailUrlBuilders, buildRailBrowsePath, parseRailMediaFilter };

export const isMovieRailItem = (item: any) => {
    const raw = item?.mediaType ?? item?.type;
    if (raw === 'tv' || raw === 2 || raw === '2' || raw === 'show') return false;
    if (raw === 'movie' || raw === 1 || raw === '1') return true;
    if (item?.firstAirDate && !item?.releaseDate) return false;
    return true;
};

export const isTvRailItem = (item: any) => {
    const raw = item?.mediaType ?? item?.type;
    if (raw === 'tv' || raw === 2 || raw === '2' || raw === 'show') return true;
    if (raw === 'movie' || raw === 1 || raw === '1') return false;
    if (item?.firstAirDate && !item?.releaseDate) return true;
    return false;
};

export const filterRailItemsByMedia = (items: any[], media: RailMediaFilter) => {
    if (media === 'all') return items;
    if (media === 'movie') return items.filter(isMovieRailItem);
    return items.filter(isTvRailItem);
};
