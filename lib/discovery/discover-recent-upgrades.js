/**
 * Recently upgraded titles from Arr import history (Discover Movies/Series rails).
 *
 * Note: some Radarr/Sonarr builds omit data.isUpgrade on downloadFolderImported.
 * Upgrades are reliably marked on movieFileDeleted / episodeFileDeleted with
 * data.reason = "Upgrade", usually followed by an import for the same entity.
 */

import { getReadyArrInstances } from '../media-stack/arr-instances.js';
import { fetchArrInstanceJson } from '../arr-service.js';
import {
    historyRecordToIntegrityStub,
    isSuccessfulImportHistoryEvent,
} from '../upgrader/qc-integrity-recent-imports.js';

const HISTORY_PAGE_SIZE = 50;
const HISTORY_MAX_PAGES = 12;
const DEFAULT_SINCE_MS = 30 * 24 * 60 * 60 * 1000;

const recordsOf = (payload) => (
    Array.isArray(payload?.records) ? payload.records : Array.isArray(payload) ? payload : []
);

const truthyUpgrade = (value) => {
    const text = String(value ?? '').toLowerCase();
    return value === true || text === 'true' || text === 'yes' || text === '1';
};

const recordData = (record = {}) => record?.data || record?.Data || {};

const recordEventType = (record = {}) => String(record?.eventType || record?.EventType || '');

const recordEntityId = (type, record = {}) => {
    if (type === 'radarr') {
        return Number(record.movieId ?? record.MovieId ?? record.movie?.id ?? record.Movie?.id);
    }
    return Number(record.seriesId ?? record.SeriesId ?? record.series?.id ?? record.Series?.id);
};

/** True for Arr history rows that mean a quality/file upgrade. */
export const historyRecordIsUpgrade = (record = {}) => {
    const data = recordData(record);
    if (truthyUpgrade(data.isUpgrade) || truthyUpgrade(data.IsUpgrade)) return true;
    if (truthyUpgrade(record.isUpgrade) || truthyUpgrade(record.IsUpgrade)) return true;
    const event = recordEventType(record);
    if (/upgrade/i.test(event)) return true;
    const reason = String(data.reason || data.Reason || '');
    if (/upgrade/i.test(reason)) return true;
    return false;
};

export const historyRecordIsUpgradeDelete = (record = {}) => {
    const event = recordEventType(record).toLowerCase();
    if (event !== 'moviefiledeleted' && event !== 'episodefiledeleted') return false;
    return historyRecordIsUpgrade(record);
};

const historyQuery = (type, page) => {
    const params = new URLSearchParams({
        page: String(page),
        pageSize: String(HISTORY_PAGE_SIZE),
        sortKey: 'date',
        sortDirection: 'descending',
    });
    // Do not filter eventType in the query: some Arr builds return empty for
    // eventType=downloadFolderImported even though those rows exist unfiltered.
    if (type === 'sonarr') {
        params.set('includeSeries', 'true');
        params.set('includeEpisode', 'true');
    } else if (type === 'radarr') {
        params.set('includeMovie', 'true');
    }
    return `/api/v3/history?${params.toString()}`;
};

const hydrateStubIds = async (type, instance, stub, resolveUrl) => {
    if (!stub) return null;
    const tmdbId = Number(stub.tmdbId);
    if (Number.isFinite(tmdbId) && tmdbId > 0) return stub;
    const entityId = Number(stub.entityId);
    if (!Number.isFinite(entityId) || entityId <= 0) return stub;

    try {
        if (type === 'radarr') {
            const movie = await fetchArrInstanceJson(instance, `/api/v3/movie/${entityId}`, { resolveUrl });
            if (movie) {
                stub.tmdbId = movie.tmdbId ?? movie.TmdbId ?? stub.tmdbId;
                stub.title = stub.title || movie.title || movie.Title;
                stub.year = stub.year ?? movie.year ?? movie.Year ?? null;
                stub.overview = stub.overview || movie.overview || movie.Overview || '';
                stub.imdbId = stub.imdbId || movie.imdbId || movie.ImdbId || null;
            }
        } else if (type === 'sonarr') {
            const series = await fetchArrInstanceJson(instance, `/api/v3/series/${entityId}`, { resolveUrl });
            if (series) {
                stub.tmdbId = series.tmdbId ?? series.TmdbId ?? stub.tmdbId;
                stub.tvdbId = series.tvdbId ?? series.TvdbId ?? stub.tvdbId;
                stub.title = stub.title || series.title || series.Title;
                stub.year = stub.year ?? series.year ?? series.Year ?? null;
                stub.overview = stub.overview || series.overview || series.Overview || '';
                stub.imdbId = stub.imdbId || series.imdbId || series.ImdbId || null;
            }
        }
    } catch {
        // Best-effort hydrate.
    }
    return stub;
};

const stubFromEntityId = (type, instance, entityId, importedAt) => ({
    arrType: type,
    arrInstanceId: instance.id,
    arrInstanceName: instance.name || null,
    mediaType: type === 'sonarr' ? 'show' : 'movie',
    mediaKind: 'video',
    entityId,
    title: null,
    year: null,
    overview: '',
    tmdbId: null,
    isUpgrade: true,
    importedAt,
});

const fetchUpgradeStubs = async (instance, type, { resolveUrl, cutoff }) => {
    const pages = [];
    for (let page = 1; page <= HISTORY_MAX_PAGES; page += 1) {
        const payload = await fetchArrInstanceJson(instance, historyQuery(type, page), { resolveUrl });
        const records = recordsOf(payload);
        if (!records.length) break;
        pages.push(...records);
        const oldest = records[records.length - 1];
        const oldestAt = Date.parse(oldest?.date || oldest?.Date || '');
        if ((Number.isFinite(oldestAt) && oldestAt < cutoff) || records.length < HISTORY_PAGE_SIZE) break;
    }

    const upgradedEntityIds = new Set();
    const deleteAtByEntity = new Map();
    for (const record of pages) {
        const at = Date.parse(record?.date || record?.Date || '');
        if (Number.isFinite(at) && at < cutoff) continue;
        const entityId = recordEntityId(type, record);
        if (!Number.isFinite(entityId) || entityId <= 0) continue;
        if (historyRecordIsUpgradeDelete(record) || (
            isSuccessfulImportHistoryEvent(recordEventType(record)) && historyRecordIsUpgrade(record)
        )) {
            upgradedEntityIds.add(entityId);
            if (historyRecordIsUpgradeDelete(record)) {
                const prev = deleteAtByEntity.get(entityId);
                if (!prev || (Number.isFinite(at) && at > prev)) deleteAtByEntity.set(entityId, at);
            }
        }
    }

    const importByEntity = new Map();
    for (const record of pages) {
        const at = Date.parse(record?.date || record?.Date || '');
        if (Number.isFinite(at) && at < cutoff) continue;
        if (!isSuccessfulImportHistoryEvent(recordEventType(record))) continue;
        const entityId = recordEntityId(type, record);
        if (!Number.isFinite(entityId) || entityId <= 0) continue;
        if (!upgradedEntityIds.has(entityId) && !historyRecordIsUpgrade(record)) continue;
        upgradedEntityIds.add(entityId);
        const existing = importByEntity.get(entityId);
        if (!existing || (Number.isFinite(at) && at > Date.parse(existing?.date || 0))) {
            importByEntity.set(entityId, record);
        }
    }

    const stubs = [];
    for (const entityId of upgradedEntityIds) {
        const record = importByEntity.get(entityId);
        let stub = record
            ? historyRecordToIntegrityStub(type, instance, {
                ...record,
                data: { ...(recordData(record) || {}), isUpgrade: 'True' },
            })
            : stubFromEntityId(
                type,
                instance,
                entityId,
                deleteAtByEntity.has(entityId)
                    ? new Date(deleteAtByEntity.get(entityId)).toISOString()
                    : null,
            );
        if (!stub) continue;
        stub.isUpgrade = true;
        stub = await hydrateStubIds(type, instance, stub, resolveUrl);
        stubs.push(stub);
    }
    return stubs;
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
    sinceMs = DEFAULT_SINCE_MS,
    resolveUrl = (url) => url,
} = {}) => {
    const cutoff = Date.now() - Math.max(60_000, Number(sinceMs) || DEFAULT_SINCE_MS);
    const types = mediaType === 'movie'
        ? ['radarr']
        : mediaType === 'tv'
            ? ['sonarr']
            : ['radarr', 'sonarr'];
    const stubs = [];

    for (const type of types) {
        const instances = getReadyArrInstances(config, type);
        for (const instance of instances) {
            const pageStubs = await fetchUpgradeStubs(instance, type, { resolveUrl, cutoff });
            stubs.push(...pageStubs);
        }
    }

    stubs.sort((a, b) => Date.parse(b?.importedAt || 0) - Date.parse(a?.importedAt || 0));

    const seen = new Set();
    const results = [];
    for (const stub of stubs) {
        const type = stub.mediaType === 'tv' || stub.mediaType === 'show' ? 'tv' : 'movie';
        const tmdbId = Number(stub.tmdbId);
        const tvdbId = Number(stub.tvdbId);
        const entityId = Number(stub.entityId);
        const key = Number.isFinite(tmdbId) && tmdbId > 0
            ? `${type}:tmdb:${tmdbId}`
            : Number.isFinite(tvdbId) && tvdbId > 0
                ? `${type}:tvdb:${tvdbId}`
                : Number.isFinite(entityId) && entityId > 0
                    ? `${type}:arr:${stub.arrInstanceId || 'x'}:${entityId}`
                    : `${type}:title:${String(stub.title || '').trim().toLowerCase()}`;
        if (!key || seen.has(key) || key.endsWith(':title:')) continue;
        seen.add(key);

        const id = Number.isFinite(tmdbId) && tmdbId > 0
            ? tmdbId
            : Number.isFinite(tvdbId) && tvdbId > 0
                ? tvdbId
                : entityId;
        results.push({
            id,
            tmdbId: Number.isFinite(tmdbId) && tmdbId > 0 ? tmdbId : null,
            tvdbId: Number.isFinite(tvdbId) && tvdbId > 0 ? tvdbId : null,
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
