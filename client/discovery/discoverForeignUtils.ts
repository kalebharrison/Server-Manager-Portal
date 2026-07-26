/** Client-side foreign/anime helpers (mirrors lib/request-app/request-app-media.js). */

const ADULTISH_TITLE_RE = /\b(hentai|softcore|erotic|erotica|porn|xxx)\b/i;

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

export const isForeignLanguageItem = (item: any): boolean => {
    const language = String(item?.originalLanguage || '').toLowerCase();
    return !!language && language !== 'en' && !isAnimeItem(item);
};

/** International toolbar: non-English / non-anime (server already merges popular catalogs). */
export const isInternationalBrowseItem = (item: any): boolean => {
    if (!isForeignLanguageItem(item)) return false;
    if (ADULTISH_TITLE_RE.test(titleBlob(item))) return false;
    return true;
};

/** Anime toolbar: Japanese animation with an adult-title + popularity safety net. */
export const isAnimeBrowseItem = (item: any): boolean => {
    if (!isAnimeItem(item)) return false;
    if (ADULTISH_TITLE_RE.test(titleBlob(item))) return false;
    const votes = Number(item?.voteCount ?? item?.vote_count ?? 0);
    if (Number.isFinite(votes) && votes > 0 && votes < 100) return false;
    return true;
};
