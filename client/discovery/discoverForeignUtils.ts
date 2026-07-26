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
