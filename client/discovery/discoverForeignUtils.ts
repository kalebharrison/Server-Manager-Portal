/** Client-side foreign/anime helpers (mirrors lib/request-app/request-app-media.js). */

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

/** International toolbar: non-English with a popularity floor (Colony-tier, not obscure softcore). */
export const isInternationalBrowseItem = (item: any): boolean => {
    if (!isForeignLanguageItem(item)) return false;
    const votes = Number(item?.voteCount ?? item?.vote_count ?? 0);
    // Missing voteCount (rare) — keep; TMDB discover already applies vote_count.gte.
    if (!Number.isFinite(votes) || votes <= 0) return true;
    return votes >= 100;
};
