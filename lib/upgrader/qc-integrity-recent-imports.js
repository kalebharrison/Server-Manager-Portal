/**
 * Catch up Integrity import baselines from Arr history (last 24h).
 * Used after restarts / missed webhooks — not a full-library backfill.
 */

import { getReadyArrInstances } from '../media-stack/arr-instances.js';
import { enrichArrIntegrityPayload } from './arr-integrity-triggers.js';

export const RECENT_IMPORT_WINDOW_MS = 24 * 60 * 60 * 1000;
const HISTORY_PAGE_SIZE = 100;
const HISTORY_MAX_PAGES = 20;

export const isSuccessfulImportHistoryEvent = (eventType) => {
    const event = String(eventType || '').toLowerCase();
    if (!event.includes('import')) return false;
    if (event.includes('failed') || event.includes('ignored')) return false;
    return true;
};

const apiVersionFor = (type) => (type === 'lidarr' ? 'v1' : 'v3');

const historyIncludeQuery = (type) => {
    if (type === 'sonarr') return 'includeSeries=true&includeEpisode=true';
    if (type === 'radarr') return 'includeMovie=true';
    return 'includeArtist=true&includeAlbum=true';
};

const recordsOf = (payload) => (
    Array.isArray(payload?.records) ? payload.records : Array.isArray(payload) ? payload : []
);

const pickPath = (...values) => {
    for (const value of values) {
        const text = String(value || '').trim();
        if (text) return text.replace(/\\/g, '/');
    }
    return null;
};

const firstId = (...values) => {
    for (const value of values) {
        if (value == null || value === '') continue;
        const numeric = Number(value);
        if (Number.isFinite(numeric) && numeric > 0) return numeric;
        return value;
    }
    return null;
};

const truthyUpgrade = (value) => {
    const text = String(value ?? '').toLowerCase();
    return value === true || text === 'true' || text === 'yes' || text === '1';
};

export const importBaselineSatisfied = (entry) => {
    if (!entry || entry.ok === false) return false;
    return !!(entry.playabilityAt && entry.imohash);
};

export const historyRecordToIntegrityStub = (type, instance, record = {}) => {
    const kind = String(type || '').toLowerCase();
    const downloadId = record.downloadId || record.DownloadId || null;
    const sourceTitle = record.sourceTitle || record.title || null;
    const isUpgrade = truthyUpgrade(record.data?.isUpgrade)
        || truthyUpgrade(record.data?.IsUpgrade)
        || /upgrade/i.test(String(record.eventType || ''));
    const importedAt = record.date || record.Date || null;

    if (kind === 'radarr') {
        const movie = record.movie || record.Movie || {};
        const movieFile = record.movieFile || record.MovieFile || movie.movieFile || movie.MovieFile || {};
        const entityId = record.movieId ?? record.MovieId ?? movie.id ?? movie.Id ?? null;
        const movieFileId = firstId(
            record.movieFileId,
            record.MovieFileId,
            movieFile.id,
            movieFile.Id,
            movie.movieFileId,
            movie.MovieFileId,
            record.data?.movieFileId,
            record.data?.MovieFileId,
        );
        const filePath = pickPath(
            movieFile.path,
            movieFile.Path,
            record.data?.importedPath,
            record.data?.ImportedPath,
        );
        if (entityId == null && !filePath) return null;
        return {
            arrType: 'radarr',
            arrInstanceId: instance.id,
            arrInstanceName: instance.name || null,
            mediaType: 'movie',
            mediaKind: 'video',
            entityId,
            movieFileId,
            filePath,
            title: movie.title || movie.Title || sourceTitle,
            year: movie.year ?? movie.Year ?? null,
            overview: movie.overview || movie.Overview || '',
            tmdbId: movie.tmdbId ?? movie.TmdbId ?? null,
            imdbId: movie.imdbId ?? movie.ImdbId ?? null,
            originalLanguage: movie.originalLanguage ?? movie.OriginalLanguage ?? null,
            downloadId,
            sourceTitle,
            isUpgrade,
            importedAt,
        };
    }

    if (kind === 'sonarr') {
        const series = record.series || record.Series || {};
        const episode = record.episode || record.Episode || {};
        const episodeFile = record.episodeFile || record.EpisodeFile || episode.episodeFile || {};
        const entityId = record.seriesId ?? record.SeriesId ?? series.id ?? series.Id ?? null;
        const episodeId = record.episodeId ?? record.EpisodeId ?? episode.id ?? episode.Id ?? null;
        const episodeFileId = firstId(
            record.episodeFileId,
            record.EpisodeFileId,
            episode.episodeFileId,
            episode.EpisodeFileId,
            episodeFile.id,
            episodeFile.Id,
            record.data?.episodeFileId,
            record.data?.EpisodeFileId,
        );
        const filePath = pickPath(
            episodeFile.path,
            episodeFile.Path,
            record.data?.importedPath,
            record.data?.ImportedPath,
        );
        if (entityId == null && episodeId == null && !filePath) return null;
        return {
            arrType: 'sonarr',
            arrInstanceId: instance.id,
            arrInstanceName: instance.name || null,
            mediaType: 'show',
            mediaKind: 'video',
            entityId,
            episodeId,
            episodeFileId,
            seasonNumber: episode.seasonNumber ?? episode.SeasonNumber ?? null,
            episodeNumber: episode.episodeNumber ?? episode.EpisodeNumber ?? null,
            episodeTitle: episode.title || episode.Title || null,
            filePath,
            title: series.title || series.Title || sourceTitle,
            year: series.year ?? series.Year ?? null,
            overview: series.overview || series.Overview || '',
            tmdbId: series.tmdbId ?? series.TmdbId ?? null,
            tvdbId: series.tvdbId ?? series.TvdbId ?? null,
            imdbId: series.imdbId ?? series.ImdbId ?? null,
            originalLanguage: series.originalLanguage ?? series.OriginalLanguage ?? null,
            downloadId,
            sourceTitle,
            isUpgrade,
            importedAt,
        };
    }

    if (kind === 'lidarr') {
        const album = record.album || record.Album || {};
        const artist = record.artist || record.Artist || {};
        const trackFile = record.trackFile || record.TrackFile || {};
        const entityId = record.albumId ?? record.AlbumId ?? album.id ?? album.Id ?? null;
        const trackFileId = firstId(
            record.trackFileId,
            record.TrackFileId,
            trackFile.id,
            trackFile.Id,
            record.data?.trackFileId,
            record.data?.TrackFileId,
        );
        const filePath = pickPath(
            trackFile.path,
            trackFile.Path,
            record.data?.importedPath,
            record.data?.ImportedPath,
        );
        if (entityId == null && !filePath) return null;
        return {
            arrType: 'lidarr',
            arrInstanceId: instance.id,
            arrInstanceName: instance.name || null,
            mediaType: 'album',
            mediaKind: 'audio',
            entityId,
            trackFileId,
            filePath,
            title: album.title || album.Title || artist.name || artist.Name || sourceTitle,
            downloadId,
            sourceTitle,
            isUpgrade,
            importedAt,
        };
    }

    return null;
};

const hydrateStub = async (stub, instance, request) => {
    if (!stub || typeof request !== 'function') return stub;
    const version = apiVersionFor(stub.arrType);
    try {
        if (stub.arrType === 'radarr' && stub.entityId != null && (!stub.movieFileId || !stub.filePath)) {
            const movie = await request(instance, `/api/${version}/movie/${encodeURIComponent(stub.entityId)}`);
            const file = movie?.movieFile || movie?.MovieFile || {};
            return {
                ...stub,
                movieFileId: stub.movieFileId || file.id || file.Id || null,
                filePath: stub.filePath || pickPath(file.path, file.Path),
                title: stub.title || movie?.title || movie?.Title || null,
                originalLanguage: stub.originalLanguage || movie?.originalLanguage || movie?.OriginalLanguage || null,
            };
        }
        if (stub.arrType === 'sonarr' && stub.episodeId != null && (!stub.episodeFileId || !stub.filePath)) {
            const episode = await request(instance, `/api/${version}/episode/${encodeURIComponent(stub.episodeId)}`);
            const file = episode?.episodeFile || episode?.EpisodeFile || {};
            return {
                ...stub,
                episodeFileId: stub.episodeFileId || episode?.episodeFileId || episode?.EpisodeFileId || file.id || file.Id || null,
                filePath: stub.filePath || pickPath(file.path, file.Path),
                seasonNumber: stub.seasonNumber ?? episode?.seasonNumber ?? episode?.SeasonNumber ?? null,
                episodeNumber: stub.episodeNumber ?? episode?.episodeNumber ?? episode?.EpisodeNumber ?? null,
                episodeTitle: stub.episodeTitle || episode?.title || episode?.Title || null,
            };
        }
        if (stub.arrType === 'lidarr' && stub.entityId != null && (!stub.trackFileId || !stub.filePath)) {
            const files = await request(
                instance,
                `/api/${version}/trackfile?albumId=${encodeURIComponent(stub.entityId)}`,
            );
            const list = Array.isArray(files) ? files : [];
            const match = stub.filePath
                ? list.find((file) => pickPath(file.path, file.Path) === stub.filePath)
                : list[0];
            if (!match) return stub;
            return {
                ...stub,
                trackFileId: stub.trackFileId || match.id || match.Id || null,
                filePath: stub.filePath || pickPath(match.path, match.Path),
            };
        }
    } catch {
        return stub;
    }
    return stub;
};

export const collectRecentImportPayloads = async (config, {
    request,
    now = Date.now(),
    sinceMs = RECENT_IMPORT_WINDOW_MS,
    includeMusic = true,
} = {}) => {
    if (typeof request !== 'function') return [];
    const cutoff = now - Math.max(60_000, Number(sinceMs) || RECENT_IMPORT_WINDOW_MS);
    const types = includeMusic === false ? ['sonarr', 'radarr'] : ['sonarr', 'radarr', 'lidarr'];
    const stubs = [];

    for (const type of types) {
        const instances = getReadyArrInstances(config, type);
        const version = apiVersionFor(type);
        for (const instance of instances) {
            for (let page = 1; page <= HISTORY_MAX_PAGES; page += 1) {
                let records = [];
                try {
                    const payload = await request(
                        instance,
                        `/api/${version}/history?page=${page}&pageSize=${HISTORY_PAGE_SIZE}`
                            + `&sortKey=date&sortDirection=descending&${historyIncludeQuery(type)}`,
                    );
                    records = recordsOf(payload);
                } catch {
                    break;
                }
                if (!records.length) break;

                let sawInWindow = false;
                let oldestInWindow = false;
                for (const record of records) {
                    const at = Date.parse(record?.date || record?.Date || '');
                    if (Number.isFinite(at) && at < cutoff) {
                        oldestInWindow = true;
                        continue;
                    }
                    if (!isSuccessfulImportHistoryEvent(record?.eventType || record?.EventType)) continue;
                    sawInWindow = true;
                    const stub = historyRecordToIntegrityStub(type, instance, record);
                    if (stub) stubs.push(stub);
                }
                if (oldestInWindow || records.length < HISTORY_PAGE_SIZE) break;
                if (!sawInWindow && page > 1) break;
            }
        }
    }

    const hydrated = [];
    const seen = new Set();
    for (const stub of stubs) {
        const instance = getReadyArrInstances(config, stub.arrType)
            .find((row) => String(row.id) === String(stub.arrInstanceId));
        const next = instance ? await hydrateStub(stub, instance, request) : stub;
        if (!next?.filePath) continue;
        const payload = enrichArrIntegrityPayload(config, next);
        const key = payload?.key || `${payload?.arrType}:${payload?.entityId}:${payload?.filePath}`;
        if (!key || seen.has(String(key))) continue;
        seen.add(String(key));
        hydrated.push(payload);
    }
    return hydrated;
};
