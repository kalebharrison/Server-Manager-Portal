/** Client-side anime / adult helpers (mirrors lib/media/mediaFilters.js). */

const ADULTISH_TITLE_RE = /\b(hentai|softcore|erotic|erotica|porn(?:ography|ographic)?|xxx|adult\s*(?:film|movie|video)|jav\b|av\s*idol)\b/i;
const SOFTCORE_KEYWORD_IDS = new Set([155477, 190370, 445]);

const genreIdsOf = (item: any): number[] => {
    if (Array.isArray(item?.genreIds)) {
        return item.genreIds.map((id: unknown) => Number(id)).filter((id: number) => Number.isFinite(id));
    }
    if (Array.isArray(item?.genres)) {
        return item.genres
            .map((genre: any) => Number(genre?.id))
            .filter((id: number) => Number.isFinite(id));
    }
    return [];
};

const titleBlob = (item: any): string => (
    [
        item?.title,
        item?.name,
        item?.originalTitle,
        item?.originalName,
    ].filter(Boolean).join(' ')
);

/** Mirror server isAdultMediaItem — list rows often lack keywords. */
export const isAdultBrowseItem = (item: any): boolean => {
    const value = item?.adult ?? item?.isAdult ?? item?.media?.adult;
    if (value === true || value === 1 || String(value || '').toLowerCase() === 'true') return true;
    const bags = [item?.keywords, item?.keywordIds, item?.media?.keywords];
    for (const bag of bags) {
        if (!Array.isArray(bag)) continue;
        if (bag.some((entry: any) => {
            const id = Number(entry?.id ?? entry);
            return Number.isFinite(id) && SOFTCORE_KEYWORD_IDS.has(id);
        })) return true;
    }
    return ADULTISH_TITLE_RE.test(titleBlob(item));
};

export const isAnimeItem = (item: any): boolean => {
    const language = String(item?.originalLanguage || '').toLowerCase();
    if (language !== 'ja') return false;
    const genreIds = genreIdsOf(item);
    if (!genreIds.length && !Array.isArray(item?.genres)) return true;
    const isAnimation = genreIds.includes(16)
        || (Array.isArray(item?.genres) && item.genres.some(
            (genre: any) => String(genre?.name || '').toLowerCase() === 'animation',
        ));
    return isAnimation;
};

/** Anime toolbar: Japanese animation (adult titles still excluded). */
export const isAnimeBrowseItem = (item: any): boolean => {
    if (!isAnimeItem(item)) return false;
    if (isAdultBrowseItem(item)) return false;
    return true;
};
