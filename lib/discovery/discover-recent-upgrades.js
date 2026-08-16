/**
 * Recently upgraded titles from Arr import history (Discover Movies/Series rails).
 */

import { getReadyArrInstances } from '../media-stack/arr-instances.js';
import { fetchArrInstanceJson } from '../arr-service.js';
import {
    historyRecordToIntegrityStub,
    isSuccessfulImportHistoryEvent,
    RECENT_IMPORT_WINDOW_MS,
} from '../upgrader/qc-integrity-recent-imports.js';

const HISTORY_PAGE_SIZE = 50;
const HISTORY_MAX_PAGES = 6;

const recordsOf = (payload) => (
    Array.isArray(payload?.records) ? payload.records : Array.isArray(payload) ? payload : []
);

const historyIncludeQuery = (type) => {
    if (type === 'sonarr') return 'includeSeries=true&includeEpisode=true';
    if (type === 'radarr') return 'includeMovie=true';
    return '';
};

/**
 * @param {object} config
 * @param {object} [options]
 * @param {'movie'|'tv'|'all'} [options.mediaType]
 * @param {number} [options.take]
 * @param {number} [options.sinceMs]
 * @param {(url: string) => string} [options.resolveUrl]
 */
export const listRecentUpgradedDiscoverItems = async (config, {
    mediaType = 'all',
    take = 40,
    sinceMs = RECENT_IMPORT_WINDOW_MS * 7,
    resolveUrl = (url) => url,
} = {}) => {
    const cutoff = Date.now() - Math.max(60_000, Number(sinceMs) || RECENT_IMPORT_WINDOW_MS);
    const types = mediaType === 'movie'
        ? ['radarr']
        : mediaType === 'tv'
            ? ['sonarr']
            : ['radarr', 'sonarr'];
    const stubs = [];

    for (const type of types) {
        const instances = getReadyArrInstances(config, type);
        for (const instance of instances) {
            for (let page = 1; page <= HISTORY_MAX_PAGES; page += 1) {
                let records = [];
                try {
                    const payload = await fetchArrInstanceJson(
                        instance,
                        `/api/v3/history?page=${page}&pageSize=${HISTORY_PAGE_SIZE}`
                            + `&sortKey=date&sortDirection=descending&${historyIncludeQuery(type)}`,
                        { resolveUrl },
                    );
                    records = recordsOf(payload);
                } catch {
                    break;
                }
                if (!records.length) break;

                let oldestInWindow = false;
                for (const record of records) {
                    const at = Date.parse(record?.date || record?.Date || '');
                    if (Number.isFinite(at) && at < cutoff) {
                        oldestInWindow = true;
                        continue;
                    }
                    if (!isSuccessfulImportHistoryEvent(record?.eventType || record?.EventType)) continue;
                    const stub = historyRecordToIntegrityStub(type, instance, record);
                    if (!stub?.isUpgrade) continue;
                    const tmdbId = Number(stub.tmdbId);
                    if (!Number.isFinite(tmdbId) || tmdbId <= 0) continue;
                    stubs.push(stub);
                }
                if (oldestInWindow || records.length < HISTORY_PAGE_SIZE) break;
            }
        }
    }

    const seen = new Set();
    const results = [];
    for (const stub of stubs) {
        const type = stub.mediaType === 'tv' || stub.mediaType === 'show' ? 'tv' : 'movie';
        const tmdbId = Number(stub.tmdbId);
        const key = `${type}:${tmdbId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        results.push({
            id: tmdbId,
            tmdbId,
            mediaType: type,
            type,
            title: stub.title || 'Untitled',
            name: stub.title || 'Untitled',
            year: stub.year != null ? String(stub.year).slice(0, 4) : null,
            overview: stub.overview || '',
            posterPath: null,
            mediaInfo: { status: 5 },
            acquisitionKind: 'upgrade',
            importedAt: stub.importedAt || null,
        });
        if (results.length >= take) break;
    }
    return { results };
};

export default listRecentUpgradedDiscoverItems;
