const SOFTCORE_KEYWORD_IDS = new Set([155477, 190370, 445]);
const SOFTCORE_KEYWORD_NAMES = /^(softcore|erotic movie|erotica|pornography|adult video)$/i;

const keywordLooksSoftcore = (keyword) => {
    const id = Number(keyword?.id ?? keyword);
    if (Number.isFinite(id) && SOFTCORE_KEYWORD_IDS.has(id)) return true;
    const name = String(keyword?.name || keyword?.Name || '').trim();
    return !!name && SOFTCORE_KEYWORD_NAMES.test(name);
};

/** Softcore/erotica often ships with adult=false — catch via keywords when present. */
export const isSoftcoreMediaItem = (item = {}) => {
    const bags = [
        item.keywords,
        item.keywordIds,
        item.media?.keywords,
        item.mediaInfo?.keywords,
    ];
    for (const bag of bags) {
        if (!Array.isArray(bag)) continue;
        if (bag.some((entry) => keywordLooksSoftcore(entry))) return true;
    }
    return false;
};

export const isAdultMediaItem = (item = {}) => {
    const value = item.adult ?? item.isAdult ?? item.media?.adult ?? item.mediaInfo?.adult;
    if (value === true || value === 1 || String(value || '').toLowerCase() === 'true') return true;
    return isSoftcoreMediaItem(item);
};

export const isAnimeItem = (item) => {
    const language = String(item?.originalLanguage || '').toLowerCase();
    const isAnimation = Array.isArray(item?.genres)
        && item.genres.some((genre) => Number(genre?.id) === 16 || String(genre?.name || '').toLowerCase() === 'animation');
    return language === 'ja' && (!item.genres?.length || isAnimation);
};

export const isForeignLanguageItem = (item) => {
    const language = String(item?.originalLanguage || '').toLowerCase();
    return !!language && language !== 'en' && !isAnimeItem(item);
};
