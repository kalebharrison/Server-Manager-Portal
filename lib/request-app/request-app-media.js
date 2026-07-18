import { ISSUE_TYPES } from './request-app-media-constants.js';
export { seerrImageUrl, tmdbImageUrl } from './request-app-media-images.js';
import {
    isAdultMediaItem,
} from './request-app-media-status.js';
export {
    findRequestState,
    isAdultMediaItem,
    mediaStatusLabel,
    normalizeMediaType,
    requestStatusLabel,
} from './request-app-media-status.js';
export { normalizeMediaItem, normalizeRequestItem } from './request-app-media-normalize.js';

export const safePage = (value) => {
    const page = Math.max(1, Number(value) || 1);
    return Math.min(page, 50);
};

export const normalizeIssueType = (value) => ISSUE_TYPES[String(value || '').toLowerCase()] || ISSUE_TYPES.other;

export const normalizeDiscoverMediaType = (value) => {
    const type = String(value || '').toLowerCase();
    if (type === 'movie' || type === 'movies') return 'movie';
    if (type === 'tv' || type === 'show' || type === 'shows') return 'tv';
    return 'all';
};

export const isAnimeItem = (item) => {
    const language = String(item?.originalLanguage || '').toLowerCase();
    const isAnimation = Array.isArray(item?.genres) && item.genres.some((genre) => Number(genre?.id) === 16 || String(genre?.name || '').toLowerCase() === 'animation');
    return language === 'ja' && (!item.genres?.length || isAnimation);
};

export const isForeignLanguageItem = (item) => {
    const language = String(item?.originalLanguage || '').toLowerCase();
    return !!language && language !== 'en' && !isAnimeItem(item);
};

export const normalizeGenreId = (value) => {
    const id = Number(value);
    return Number.isFinite(id) && id > 0 ? id : null;
};

export const filterMediaItems = (items, mediaType, anime, foreign, genreId = null) => items
    .filter((item) => !isAdultMediaItem(item))
    .filter((item) => mediaType === 'all' || item.mediaType === mediaType)
    .filter((item) => {
        const isAnime = isAnimeItem(item);
        const isForeign = isForeignLanguageItem(item);
        if (anime || foreign) return (anime && isAnime) || (foreign && isForeign);
        return !isAnime && !isForeign;
    })
    .filter((item) => !genreId || item.genres?.some((genre) => Number(genre?.id) === genreId));
