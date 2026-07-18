import type { RequestMediaItem } from './types';

export type RequestView = 'browse' | 'search' | 'queue';
export type BrowseCategory = 'trending' | 'popular' | 'upcoming';
export type MediaFilter = 'all' | 'movie' | 'tv';

export const browseCategories = [
    { id: 'trending' as const, label: 'Trending' },
    { id: 'popular' as const, label: 'Popular' },
    { id: 'upcoming' as const, label: 'Upcoming' },
];

export const mediaFilters = [
    { id: 'all' as const, label: 'All' },
    { id: 'movie' as const, label: 'Movies' },
    { id: 'tv' as const, label: 'TV' },
];

export const genreFilters = [
    { id: 28, label: 'Action' }, { id: 12, label: 'Adventure' }, { id: 16, label: 'Animation' },
    { id: 35, label: 'Comedy' }, { id: 80, label: 'Crime' }, { id: 18, label: 'Drama' },
    { id: 10751, label: 'Family' }, { id: 14, label: 'Fantasy' }, { id: 27, label: 'Horror' },
    { id: 9648, label: 'Mystery' }, { id: 10749, label: 'Romance' }, { id: 878, label: 'Science Fiction' },
    { id: 53, label: 'Thriller' }, { id: 10759, label: 'Action & Adventure' }, { id: 10765, label: 'Sci-Fi & Fantasy' },
];

export const cardSkeletons = Array.from({ length: 12 }, (_, index) => index);

export const isExistingOrInProgress = (item: RequestMediaItem) => (
    !!(item.available || item.processing || item.requested || item.pending || item.approved)
);
