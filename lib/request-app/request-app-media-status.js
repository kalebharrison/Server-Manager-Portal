export const requestStatusLabel = (status) => {
    const value = Number(status);
    if (value === 1) return 'pending';
    if (value === 2) return 'approved';
    if (value === 3) return 'declined';
    if (value === 4) return 'failed';
    return 'unknown';
};

export const mediaStatusLabel = (status) => {
    const value = Number(status);
    if (value === 2) return 'pending';
    if (value === 3) return 'processing';
    if (value === 4) return 'partially_available';
    if (value === 5) return 'available';
    return 'unknown';
};

export const normalizeMediaType = (value) => {
    const type = String(value || '').toLowerCase();
    if (type === 'tv' || type === 'show') return 'tv';
    return 'movie';
};

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

export const findRequestState = (item = {}) => {
    const mediaInfo = item.mediaInfo || item.media || {};
    const request = item.request || mediaInfo.request || (Array.isArray(mediaInfo.requests) ? mediaInfo.requests[0] : null);
    const requestStatus = request?.status ?? item.requestStatus ?? null;
    const mediaStatus = mediaInfo.status ?? item.mediaStatus ?? null;
    const requestLabel = requestStatusLabel(requestStatus);
    const mediaLabel = mediaStatusLabel(mediaStatus);
    const available = mediaLabel === 'available' || mediaLabel === 'partially_available';
    const pending = requestLabel === 'pending' || mediaLabel === 'pending';
    const approved = requestLabel === 'approved';
    const requested = mediaLabel === 'processing' || pending || approved;

    return {
        requestId: request?.id ?? null,
        requestStatus: Number(requestStatus) || null,
        requestStatusLabel: requestStatus ? requestLabel : null,
        mediaStatus: Number(mediaStatus) || null,
        mediaStatusLabel: mediaStatus ? mediaLabel : null,
        available,
        processing: false,
        requested,
        pending,
        approved,
        canRequest: !(available || requested),
    };
};
