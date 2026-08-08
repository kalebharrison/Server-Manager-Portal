import { getReadyArrInstances } from '../media-stack/arr-instances.js';
import { classifyUpgraderLibrary } from './upgrader-library.js';
import { libraryKeyForItem } from './upgrader-hunt-queue.js';

const queueQueryFor = (type) => {
    if (type === 'sonarr') return 'includeSeries=true&includeEpisode=true&includeUnknownSeriesItems=true';
    if (type === 'radarr') return 'includeMovie=true&includeUnknownMovieItems=true';
    return 'includeArtist=true&includeAlbum=true&includeUnknownArtistItems=true';
};

const apiVersionFor = (type) => (type === 'lidarr' ? 'v1' : 'v3');

const recordsOf = (payload) => (
    Array.isArray(payload?.records) ? payload.records : Array.isArray(payload) ? payload : []
);

export const entityIdFromQueueRecord = (record = {}, arrType = '') => {
    if (arrType === 'radarr') return Number(record.movieId ?? record.movie?.id) || null;
    if (arrType === 'sonarr') return Number(record.seriesId ?? record.series?.id) || null;
    if (arrType === 'lidarr') return Number(record.albumId ?? record.album?.id) || null;
    return Number(record.movieId ?? record.seriesId ?? record.albumId) || null;
};

export const downloadSlotKey = (record = {}) => {
    const downloadId = String(record.downloadId || '').trim().toLowerCase();
    if (downloadId) return `dl:${downloadId}`;
    const hash = String(record.hash || record.client?.hash || '').trim().toLowerCase();
    if (hash) return `hash:${hash}`;
    // Season packs: many Sonarr queue rows share one release title / client name.
    const packTitle = String(record.title || record.client?.name || '').trim().toLowerCase();
    const seriesId = Number(record.seriesId ?? record.series?.id);
    if (packTitle && Number.isFinite(seriesId) && seriesId > 0) {
        return `pack:${record.arrInstanceId || 'arr'}:${seriesId}:${packTitle}`;
    }
    if (record.id != null) return `q:${record.arrInstanceId || 'arr'}:${record.id}`;
    return `t:${String(record.title || record.movie?.title || record.series?.title || Math.random())}`;
};

/** Map an Arr queue row to a QC library key via index stamp or root-folder classify. */
export const libraryKeyForQueueRecord = (record = {}, instance = {}, indexByEntity = new Map()) => {
    const type = instance.type || record.arrType || '';
    const entityId = entityIdFromQueueRecord(record, type);
    if (entityId != null && instance.id != null) {
        const indexItem = indexByEntity.get(`${type}:${instance.id}:${entityId}`);
        if (indexItem) return libraryKeyForItem(indexItem);
    }
    const nested = record.movie || record.series || record.album || record;
    return classifyUpgraderLibrary(instance, nested).libraryKey;
};

export const buildIndexByEntity = (indexItems = []) => {
    const map = new Map();
    for (const item of indexItems) {
        if (!item || item.entityId == null || item.arrInstanceId == null) continue;
        const type = item.arrType || 'arr';
        map.set(`${type}:${item.arrInstanceId}:${item.entityId}`, item);
    }
    return map;
};

/**
 * Count unique active Arr downloads per QC library.
 * @returns {Map<string, number>}
 */
export const countDownloadsByLibrary = (queueRecords = [], {
    instances = [],
    indexItems = [],
} = {}) => {
    const indexByEntity = buildIndexByEntity(indexItems);
    const instanceById = new Map(
        (instances || []).map((instance) => [String(instance.id), instance]),
    );
    const slotsByLibrary = new Map();

    for (const record of queueRecords || []) {
        const instance = instanceById.get(String(record.arrInstanceId))
            || {
                id: record.arrInstanceId,
                type: record.arrType,
                name: record.arrInstanceName,
            };
        const libraryKey = libraryKeyForQueueRecord(record, instance, indexByEntity);
        if (!slotsByLibrary.has(libraryKey)) slotsByLibrary.set(libraryKey, new Set());
        slotsByLibrary.get(libraryKey).add(downloadSlotKey(record));
    }

    const counts = new Map();
    for (const [key, slots] of slotsByLibrary) {
        counts.set(key, slots.size);
    }
    return counts;
};

export const remainingDownloadSlots = (counts, libraryKey, maxPerLibrary = 5) => {
    const max = Math.max(1, Number(maxPerLibrary) || 5);
    const current = Number(counts.get(libraryKey) || 0) || 0;
    return Math.max(0, max - current);
};

/** Fetch Arr queues (same shape as QC download health). */
export const fetchArrQueueRecords = async (config, request, { log = () => {} } = {}) => {
    const types = ['sonarr', 'radarr', 'lidarr'];
    const items = [];
    for (const type of types) {
        const instances = getReadyArrInstances(config, type);
        const version = apiVersionFor(type);
        for (const instance of instances) {
            try {
                let page = 1;
                let totalRecords = Number.POSITIVE_INFINITY;
                while ((page - 1) * 200 < totalRecords && page <= 25) {
                    const payload = await request(
                        instance,
                        `/api/${version}/queue?page=${page}&pageSize=200&${queueQueryFor(type)}`,
                    );
                    const records = recordsOf(payload);
                    totalRecords = Number(payload?.totalRecords);
                    if (!Number.isFinite(totalRecords)) {
                        totalRecords = ((page - 1) * 200) + records.length;
                    }
                    for (const record of records) {
                        items.push({
                            ...record,
                            arrType: type,
                            arrInstanceId: instance.id,
                            arrInstanceName: instance.name,
                        });
                    }
                    if (records.length < 200) break;
                    page += 1;
                }
            } catch (error) {
                log(`[upgrader] ${instance.name || type} queue failed: ${error.message}`);
            }
        }
    }
    return items;
};

export const maxDownloadsPerLibraryFromConfig = (config = {}) => (
    Math.max(1, Number(config.upgraderMaxDownloadsPerLibrary) || 5)
);
