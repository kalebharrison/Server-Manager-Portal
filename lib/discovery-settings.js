/**
 * Request/discovery engines are portal-only (hard cut).
 * Seerr credentials may still exist for Discord/Ask glue, but Discover +
 * requests always run through the portal + TMDB path.
 */
export const normalizeRequestEngine = (_value) => 'portal';

export const getRequestEngine = (_config = {}) => 'portal';

export const normalizeDiscoverySource = (_value) => 'tmdb';

export const getDiscoverySource = (_config = {}) => 'tmdb';

export const isPortalRequestEngineEnabled = (_config = {}) => true;

export const shouldHideAvailableMediaItem = (item = {}) => {
    const status = Number(item?.mediaInfo?.status ?? item?.status);
    return status === 4 || status === 5;
};

export const filterAvailableMedia = (items = []) => (
    Array.isArray(items) ? items.filter((item) => !shouldHideAvailableMediaItem(item)) : []
);
