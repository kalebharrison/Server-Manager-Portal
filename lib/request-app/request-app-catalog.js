import { cacheRefreshMs, startAdaptiveCacheWarmer } from '../cache/cache-refresh.js';
import {
    isAdultMediaItem,
    normalizeMediaItem,
    normalizeMediaType,
} from './request-app-media.js';
import { getRequestAppGate } from './request-app-gate.js';
import { createAcquisitionApplier, createCatalogDiscover } from './request-app-catalog-discover.js';
import { createCatalogOperations } from './request-app-catalog-operations.js';

export const createRequestAppCatalog = ({
    client,
    users,
    tvdbService = null,
    getActiveAcquisitionKeys = async () => new Set(),
    log = () => {},
}) => {
    const {
        imageCache,
        proxyPoster,
        getCredentials,
        fetchSeerrJson,
        cachedSeerrJson,
        invalidateRequestLists,
    } = client;
    const { resolveRequestUserId, ensureRequestAppUser } = users;

    const { applyAcquisitionState } = createAcquisitionApplier(getActiveAcquisitionKeys);
    const { search, discover } = createCatalogDiscover({
        getCredentials,
        cachedSeerrJson,
        proxyPoster,
        applyAcquisitionState,
    });

    const getMediaDetails = async (config, { mediaType, tmdbId }) => {
        const type = normalizeMediaType(mediaType);
        const id = Number(tmdbId);
        if (!Number.isFinite(id) || id <= 0) throw new Error('Invalid media id');
        const { publicBaseUrl } = getCredentials(config);
        const payload = await cachedSeerrJson(config, `/api/v1/${type}/${encodeURIComponent(id)}`, 30_000, 5 * 60_000);
        if (isAdultMediaItem(payload)) throw new Error('This title is not available in the portal');
        const item = normalizeMediaItem({ ...payload, mediaType: type, id }, publicBaseUrl, proxyPoster);
        const enriched = tvdbService ? await tvdbService.enrichSeries(config, item) : item;
        return (await applyAcquisitionState(config, [enriched]))[0];
    };

    const operations = createCatalogOperations({
        getCredentials,
        fetchSeerrJson,
        cachedSeerrJson,
        proxyPoster,
        invalidateRequestLists,
        resolveRequestUserId,
        ensureRequestAppUser,
        getMediaDetails,
    });

    const startCacheWarmer = (loadConfig) => {
        const warm = async (config) => {
            if (!getRequestAppGate(config).ready) return;
            const pages = await Promise.all(['trending', 'popular', 'upcoming'].map((category) => (
                discover(config, { category, mediaType: 'all', page: 1 })
            )));
            const remotePosters = pages.flatMap((page) => page.results).map((item) => {
                try {
                    return new URL(item.posterUrl, 'http://portal').searchParams.get('url');
                } catch {
                    return null;
                }
            }).filter(Boolean);
            await imageCache.warm(remotePosters);
        };
        return startAdaptiveCacheWarmer({ loadConfig, warm, log: (message) => log(`Request discovery ${message}`) });
    };

    return {
        search,
        discover,
        getMediaDetails,
        ...operations,
        startCacheWarmer,
    };
};
