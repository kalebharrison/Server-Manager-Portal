import { getReadyArrInstances } from './arr-instances.js';
import { mapWithConcurrency } from '../core/concurrency.js';

export const recordsOf = (payload) => Array.isArray(payload?.records) ? payload.records : Array.isArray(payload) ? payload : [];

export const toLocalYmd = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export const normalizedTitleKey = (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Fingerprint instances without putting API keys into the hash input.
export const instanceIdentity = (config, types) => types.flatMap((type) => (
    getReadyArrInstances(config, type).flatMap((instance) => [
        instance.id,
        instance.url,
        String(instance.apiKey || '').length,
        String(instance.apiKey || '').slice(0, 4),
        String(instance.apiKey || '').slice(-4),
    ])
));

export const annotate = (records, instance) => records.map((record) => ({
    ...record,
    arrInstanceId: instance.id,
    arrInstanceName: instance.name,
}));

export const mergePayloads = (bundles, key) => {
    const records = bundles.flatMap((bundle) => annotate(recordsOf(bundle[key]), bundle.instance));
    return { records, totalRecords: records.length };
};

export const createFetchArr = ({ fetch, normalizeExternalBaseUrl }) => async (instance, endpoint) => {
    if (!instance?.url || !instance?.apiKey) return null;
    try {
        const safeBaseUrl = normalizeExternalBaseUrl(instance.url, { allowPrivate: true, allowHttp: true });
        const response = await fetch(new URL(endpoint, safeBaseUrl).toString(), { headers: { 'X-Api-Key': instance.apiKey } });
        return response.ok ? await response.json() : null;
    } catch {
        return null;
    }
};

export const hydrateQueue = async (queue, type, instance, fetchArr) => {
    const records = recordsOf(queue);
    const mediaKey = type === 'sonarr' ? 'series' : type === 'radarr' ? 'movie' : 'album';
    const idKey = type === 'sonarr' ? 'seriesId' : type === 'radarr' ? 'movieId' : 'albumId';
    const endpointPrefix = type === 'sonarr' ? '/api/v3/series/' : type === 'radarr' ? '/api/v3/movie/' : '/api/v1/album/';
    const resolved = new Map();
    const readMedia = (id) => {
        if (!id) return null;
        if (!resolved.has(id)) resolved.set(id, fetchArr(instance, `${endpointPrefix}${encodeURIComponent(id)}`));
        return resolved.get(id);
    };
    const episodes = new Map();
    const readEpisode = (id) => {
        if (!id || type !== 'sonarr') return null;
        if (!episodes.has(id)) episodes.set(id, fetchArr(instance, `/api/v3/episode/${encodeURIComponent(id)}`));
        return episodes.get(id);
    };
    const hydrated = await mapWithConcurrency(records, 4, async (record) => {
        const currentMedia = record?.[mediaKey];
        const needsMedia = !currentMedia?.title
            || (type === 'radarr' && typeof currentMedia?.hasFile !== 'boolean')
            || (type === 'lidarr' && currentMedia?.statistics?.trackFileCount === undefined);
        const needsEpisode = type === 'sonarr' && typeof record?.episode?.hasFile !== 'boolean';
        const [media, episode] = await Promise.all([
            needsMedia ? readMedia(record?.[idKey]) : null,
            needsEpisode ? readEpisode(record?.episodeId) : null,
        ]);
        return {
            ...record,
            ...(media ? { [mediaKey]: { ...(currentMedia || {}), ...media } } : {}),
            ...(episode ? { episode: { ...(record.episode || {}), ...episode } } : {}),
        };
    });
    return { records: hydrated, totalRecords: hydrated.length };
};
