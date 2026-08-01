/**
 * Portal library availability (Phase 3).
 * Resolves in-library / partial / downloading without external mediaInfo,
 * using Radarr (movies) + Sonarr (TV) catalogs with aggressive in-memory caches.
 */

import {
    fetchArrInstanceCatalogItems,
    fetchArrQueueSummary,
    getArrInstances,
    isArrInstanceReady,
    lookupSonarrSeriesByTmdb,
    lookupSonarrSeriesByTvdb,
} from '../arr-service.js';
import {
    applySonarrLibraryStatusToTvDetails,
    enrichTvDetailsWithSonarrLibraryStatus,
    fetchSonarrLibraryStatusForShow,
} from '../sonarr-library-status.js';
import { filterAvailableMedia, shouldHideAvailableMediaItem } from '../discovery-settings.js';
import {
    buildSonarrSeriesIndexes,
    matchSonarrSeriesFromIndexes,
    normalizeSeriesTitleKey,
    resolveImdbIdFromTmdb,
    resolveTmdbIdFromTvdb,
    resolveTvdbIdFromTmdb,
    seriesYearFromSonarr,
} from './sonarrSeriesMatch.js';
import { extractArrMovieDisplayTags, extractArrSeriesDisplayTags } from './arrDisplayTags.js';

const MEDIA_STATUS_UNKNOWN = 1;
const MEDIA_STATUS_PROCESSING = 3;
const MEDIA_STATUS_PARTIAL = 4;
const MEDIA_STATUS_AVAILABLE = 5;

const CATALOG_CACHE_MS = 5 * 60 * 1000;
const EMPTY_CATALOG_CACHE_MS = 30 * 1000;
const QUEUE_CACHE_MS = 45 * 1000;
const STATUS_CACHE_MS = 90 * 1000;

const movieCatalogCache = new Map(); // key → { at, byTmdb: Map, list }
const seriesCatalogCache = new Map(); // key → { at, byTmdb: Map, list }
const queueCache = new Map(); // instanceKey → { at, movieIds: Set, seriesIds: Set }
const movieStatusCache = new Map(); // tmdbId → { at, value }
const movieCatalogInflight = new Map(); // instanceKey → Promise
const seriesCatalogInflight = new Map(); // instanceKey → Promise

const now = () => Date.now();

const instanceCacheKey = (instance) => String(instance?.id || instance?.url || '');

const isCatalogFresh = (cached) => {
    if (!cached) return false;
    // Empty downloads must not stick for 5 minutes — that made the Discovery
    // Availability Cache task finish instantly with 0 badges.
    const ttl = (Array.isArray(cached.list) && cached.list.length > 0)
        ? CATALOG_CACHE_MS
        : EMPTY_CATALOG_CACHE_MS;
    return now() - cached.at < ttl;
};

/**
 * Sync snapshot of cached catalogs.
 * @param {{ allowStale?: boolean }} [opts] When allowStale, return expired catalogs
 *   instead of null so Discover can keep Available badges while a refresh runs.
 */
const peekMovieCatalogIndex = (config, { allowStale = false } = {}) => {
    const instances = getArrInstances(config, { type: 'radarr', enabledOnly: true })
        .filter(isArrInstanceReady);
    if (!instances.length) return new Map();
    const byTmdb = new Map();
    let sawAny = false;
    let allFresh = true;
    for (const instance of instances) {
        const cached = movieCatalogCache.get(instanceCacheKey(instance));
        if (!cached?.byTmdb) {
            allFresh = false;
            continue;
        }
        sawAny = true;
        if (!isCatalogFresh(cached)) allFresh = false;
        for (const [tmdb, entry] of cached.byTmdb.entries()) {
            if (!byTmdb.has(tmdb)) byTmdb.set(tmdb, entry);
        }
    }
    if (!sawAny) return null;
    if (!allFresh && !allowStale) return null;
    return byTmdb;
};

const peekSeriesCatalogIndexes = (config, { allowStale = false } = {}) => {
    const instances = getArrInstances(config, { type: 'sonarr', enabledOnly: true })
        .filter(isArrInstanceReady);
    if (!instances.length) {
        return { byTmdb: new Map(), byTvdb: new Map(), byTitleYear: new Map() };
    }
    const byTmdb = new Map();
    const byTvdb = new Map();
    const byTitleYear = new Map();
    let sawAny = false;
    let allFresh = true;
    for (const instance of instances) {
        const cached = seriesCatalogCache.get(instanceCacheKey(instance));
        if (!cached?.byTmdb) {
            allFresh = false;
            continue;
        }
        sawAny = true;
        if (!isCatalogFresh(cached)) allFresh = false;
        for (const [tmdb, entry] of (cached.byTmdb || new Map()).entries()) {
            if (!byTmdb.has(tmdb)) byTmdb.set(tmdb, entry);
        }
        for (const [tvdb, entry] of (cached.byTvdb || new Map()).entries()) {
            if (!byTvdb.has(tvdb)) byTvdb.set(tvdb, entry);
        }
        for (const [titleKey, entry] of (cached.byTitleYear || new Map()).entries()) {
            if (!byTitleYear.has(titleKey)) byTitleYear.set(titleKey, entry);
        }
    }
    if (!sawAny) return null;
    if (!allFresh && !allowStale) return null;
    return { byTmdb, byTvdb, byTitleYear };
};

const peekSeriesCatalogIndex = (config, opts = {}) => {
    const indexes = peekSeriesCatalogIndexes(config, opts);
    return indexes ? indexes.byTmdb : null;
};

const loadInstanceMovieCatalog = async (instance, fetchOpts = {}) => {
    const key = instanceCacheKey(instance);
    const forceRefresh = fetchOpts.forceRefresh === true;
    const cached = movieCatalogCache.get(key);
    if (!forceRefresh && isCatalogFresh(cached)) return cached;

    // Never join a short-timeout Discover warm when doing a forced cache rebuild.
    if (!forceRefresh && movieCatalogInflight.has(key)) return movieCatalogInflight.get(key);

    const pending = (async () => {
        const list = await fetchArrInstanceCatalogItems(instance, fetchOpts);
        if (!Array.isArray(list)) {
            throw new Error(`Radarr catalog fetch failed (${instance?.name || instance?.id || 'instance'})`);
        }
        const index = new Map();
        const byImdb = new Map();
        for (const movie of list) {
            const tmdb = Number(movie?.tmdbId);
            if (Number.isFinite(tmdb) && tmdb > 0 && !index.has(tmdb)) {
                index.set(tmdb, { movie, instance });
            }
            const imdb = String(movie?.imdbId || '').trim().toLowerCase();
            if (imdb && !byImdb.has(imdb)) {
                byImdb.set(imdb, { movie, instance });
            }
        }
        const value = { at: now(), list, byTmdb: index, byImdb };
        movieCatalogCache.set(key, value);
        return value;
    })().finally(() => {
        if (movieCatalogInflight.get(key) === pending) movieCatalogInflight.delete(key);
    });

    movieCatalogInflight.set(key, pending);
    return pending;
};

const loadInstanceSeriesCatalog = async (instance, fetchOpts = {}) => {
    const key = instanceCacheKey(instance);
    const forceRefresh = fetchOpts.forceRefresh === true;
    const cached = seriesCatalogCache.get(key);
    if (!forceRefresh && isCatalogFresh(cached)) return cached;

    if (!forceRefresh && seriesCatalogInflight.has(key)) return seriesCatalogInflight.get(key);

    const pending = (async () => {
        const list = await fetchArrInstanceCatalogItems(instance, fetchOpts);
        if (!Array.isArray(list)) {
            throw new Error(`Sonarr catalog fetch failed (${instance?.name || instance?.id || 'instance'})`);
        }
        const indexes = buildSonarrSeriesIndexes(list, instance);
        const value = {
            at: now(),
            list,
            byTmdb: indexes.byTmdb,
            byTvdb: indexes.byTvdb,
            byTitleYear: indexes.byTitleYear,
        };
        seriesCatalogCache.set(key, value);
        return value;
    })().finally(() => {
        if (seriesCatalogInflight.get(key) === pending) seriesCatalogInflight.delete(key);
    });

    seriesCatalogInflight.set(key, pending);
    return pending;
};

const loadMovieCatalogIndexes = async (config, fetchOpts) => {
    const instances = getArrInstances(config, { type: 'radarr', enabledOnly: true })
        .filter(isArrInstanceReady);
    const byTmdb = new Map();
    const byImdb = new Map();
    await Promise.all(instances.map(async (instance) => {
        const cached = await loadInstanceMovieCatalog(instance, fetchOpts);
        for (const [tmdb, entry] of cached.byTmdb.entries()) {
            if (!byTmdb.has(tmdb)) byTmdb.set(tmdb, entry);
        }
        for (const [imdb, entry] of (cached.byImdb || new Map()).entries()) {
            if (!byImdb.has(imdb)) byImdb.set(imdb, entry);
        }
    }));
    return { byTmdb, byImdb };
};

const loadMovieCatalogIndex = async (config, fetchOpts) => {
    const indexes = await loadMovieCatalogIndexes(config, fetchOpts);
    return indexes.byTmdb;
};

const loadSeriesCatalogIndexes = async (config, fetchOpts) => {
    const instances = getArrInstances(config, { type: 'sonarr', enabledOnly: true })
        .filter(isArrInstanceReady);
    const byTmdb = new Map();
    const byTvdb = new Map();
    const byTitleYear = new Map();
    await Promise.all(instances.map(async (instance) => {
        const cached = await loadInstanceSeriesCatalog(instance, fetchOpts);
        for (const [tmdb, entry] of (cached.byTmdb || new Map()).entries()) {
            if (!byTmdb.has(tmdb)) byTmdb.set(tmdb, entry);
        }
        for (const [tvdb, entry] of (cached.byTvdb || new Map()).entries()) {
            if (!byTvdb.has(tvdb)) byTvdb.set(tvdb, entry);
        }
        for (const [titleKey, entry] of (cached.byTitleYear || new Map()).entries()) {
            if (!byTitleYear.has(titleKey)) byTitleYear.set(titleKey, entry);
        }
    }));
    return { byTmdb, byTvdb, byTitleYear };
};

const loadSeriesCatalogIndex = async (config, fetchOpts) => {
    const indexes = await loadSeriesCatalogIndexes(config, fetchOpts);
    return indexes.byTmdb;
};

/** Fire-and-forget catalog warm so later enrichItems can be sync-fast. */
let lastCatalogWarmKickAt = 0;
const CATALOG_WARM_KICK_COOLDOWN_MS = 60 * 1000;
const warmCatalogsInBackground = (config, fetchOpts) => {
    const kickedAt = now();
    if (kickedAt - lastCatalogWarmKickAt < CATALOG_WARM_KICK_COOLDOWN_MS) return;
    lastCatalogWarmKickAt = kickedAt;
    loadMovieCatalogIndex(config, fetchOpts).catch(() => {});
    loadSeriesCatalogIndex(config, fetchOpts).catch(() => {});
};

const resolveMediaType = (item = {}) => {
    const raw = item?.mediaType ?? item?.media?.mediaType ?? item?.type;
    if (raw === 'movie' || raw === 1 || raw === '1') return 'movie';
    if (raw === 'tv' || raw === 2 || raw === '2') return 'tv';
    if (item?.firstAirDate && !item?.releaseDate) return 'tv';
    if (item?.releaseDate && !item?.firstAirDate) return 'movie';
    if (item?.name && !item?.title) return 'tv';
    if (item?.title && !item?.name) return 'movie';
    return null;
};

const resolveTmdbId = (item = {}) => {
    const id = Number(item?.tmdbId ?? item?.id);
    return Number.isFinite(id) && id > 0 ? id : null;
};

const movieHasFile = (movie = {}) => {
    if (movie.hasFile === true) return true;
    if (Number(movie.movieFileId) > 0) return true;
    if (movie.movieFile && (movie.movieFile.id || movie.movieFile.relativePath)) return true;
    return false;
};

/**
 * Discover completeness for a Sonarr series.
 * Specials (season 0) never gate Available / Up to date — most libraries skip them.
 * Use monitored episodeCount / percentOfEpisodes, not totalEpisodeCount (specials +
 * unmonitored inflate that and falsely mark caught-up shows as Partial).
 */
const seriesStatsStatus = (series = {}) => {
    const stats = series?.statistics || {};
    const episodeFileCount = Number(stats.episodeFileCount) || 0;
    if (episodeFileCount <= 0) return MEDIA_STATUS_PROCESSING;

    const seasons = Array.isArray(series.seasons) ? series.seasons : [];
    let sawMonitoredMain = false;

    for (const season of seasons) {
        const seasonNumber = Number(season?.seasonNumber);
        if (!Number.isFinite(seasonNumber) || seasonNumber <= 0) continue;
        if (season.monitored === false) continue;

        const s = season?.statistics || {};
        const sFiles = Number(s.episodeFileCount) || 0;
        // Monitored aired count only — do not use totalEpisodeCount (unaired / extras).
        const sExpected = Number(s.episodeCount) || 0;
        const sPercent = Number(s.percentOfEpisodes);
        if (sExpected <= 0 && !(Number.isFinite(sPercent) && sPercent > 0 && sPercent < 100)) {
            continue;
        }

        sawMonitoredMain = true;
        if (sExpected > 0 && sFiles < sExpected) return MEDIA_STATUS_PARTIAL;
        if (Number.isFinite(sPercent) && sPercent < 100 && (sFiles > 0 || sExpected > 0)) {
            return MEDIA_STATUS_PARTIAL;
        }
        if (sExpected > 0 && sFiles <= 0) return MEDIA_STATUS_PARTIAL;
    }

    if (sawMonitoredMain) return MEDIA_STATUS_AVAILABLE;

    // Catalog without season rows: trust Sonarr's monitored completeness only.
    const monitored = Number(stats.episodeCount) || 0;
    const percent = Number(stats.percentOfEpisodes);
    const monitoredComplete = (
        (Number.isFinite(percent) && percent >= 100)
        || (monitored > 0 && episodeFileCount >= monitored)
    );
    return monitoredComplete ? MEDIA_STATUS_AVAILABLE : MEDIA_STATUS_PARTIAL;
};

/** Expected files for a main season stamp — monitored count, not inflated totals. */
const seasonExpectedFileCount = (stats = {}) => Number(stats.episodeCount) || 0;

const loadQueueSets = async (instance, fetchOpts) => {
    const key = instanceCacheKey(instance);
    const cached = queueCache.get(key);
    if (cached && now() - cached.at < QUEUE_CACHE_MS) return cached;

    const movieIds = new Set();
    const seriesIds = new Set();
    try {
        const summary = await fetchArrQueueSummary(instance, fetchOpts);
        for (const row of summary.records || []) {
            const movieId = Number(row?.movieId);
            const seriesId = Number(row?.seriesId);
            if (Number.isFinite(movieId) && movieId > 0) movieIds.add(movieId);
            if (Number.isFinite(seriesId) && seriesId > 0) seriesIds.add(seriesId);
        }
    } catch {
        // Ignore queue failures — availability still works from catalog.
    }

    const value = { at: now(), movieIds, seriesIds };
    queueCache.set(key, value);
    return value;
};

const statusLabelFor = (status) => {
    if (status === MEDIA_STATUS_AVAILABLE) return 'available';
    if (status === MEDIA_STATUS_PARTIAL) return 'partial';
    if (status === MEDIA_STATUS_PROCESSING) return 'processing';
    return 'unknown';
};

/**
 * @param {object} config Portal config
 * @param {object} [options]
 * @param {(url: string) => string} [options.resolveUrl]
 * @param {typeof fetch} [options.fetchImpl]
 * @param {object[]} [options.upgraderItems]
 */
export const createLibraryAvailability = (config = {}, options = {}) => {
    const catalogTimeoutMs = Number(options.catalogTimeoutMs) > 0 ? Number(options.catalogTimeoutMs) : 8000;
    const fetchOpts = {
        resolveUrl: options.resolveUrl || ((url) => url),
        fetchImpl: options.fetchImpl || fetch,
        timeoutMs: catalogTimeoutMs,
        forceRefresh: options.forceCatalogRefresh === true,
    };
    const upgraderItems = Array.isArray(options.upgraderItems) ? options.upgraderItems : [];
    // Only warm when explicitly requested (cache rebuild). Request-path callers must not
    // kick multi‑MB Sonarr/Radarr downloads that freeze /api/config and Settings.
    if (options.warmOnCreate === true) {
        warmCatalogsInBackground(config, { ...fetchOpts, forceRefresh: false });
    }

    const getMovieStatus = async (tmdbId, { networkLookups = true } = {}) => {
        const id = Number(tmdbId);
        if (!Number.isFinite(id) || id <= 0) {
            return {
                mediaType: 'movie',
                tmdbId: id,
                inLibrary: false,
                partial: false,
                downloading: false,
                status: null,
                statusLabel: null,
                mediaInfo: null,
            };
        }

        const cached = movieStatusCache.get(String(id));
        if (cached && now() - cached.at < STATUS_CACHE_MS) return cached.value;

        const miss = {
            mediaType: 'movie',
            tmdbId: id,
            inLibrary: false,
            partial: false,
            downloading: false,
            status: null,
            statusLabel: null,
            mediaInfo: null,
        };

        let indexes;
        if (!networkLookups) {
            // Prefer fresh; fall back to stale so badges don't blank between catalog refreshes.
            const byTmdb = peekMovieCatalogIndex(config)
                || peekMovieCatalogIndex(config, { allowStale: true });
            if (!byTmdb) return miss;
            indexes = { byTmdb, byImdb: new Map() };
        } else {
            indexes = await loadMovieCatalogIndexes(config, fetchOpts);
        }

        let hit = indexes.byTmdb.get(id);
        if (!hit && networkLookups) {
            const imdbId = await resolveImdbIdFromTmdb(config, id, {
                mediaType: 'movie',
                fetchImpl: fetchOpts.fetchImpl || fetch,
            });
            if (imdbId) {
                hit = indexes.byImdb.get(String(imdbId).trim().toLowerCase()) || null;
            }
        }
        if (!hit) {
            if (networkLookups) movieStatusCache.set(String(id), { at: now(), value: miss });
            return miss;
        }

        const { movie, instance } = hit;
        let downloading = false;
        if (networkLookups) {
            const queue = await loadQueueSets(instance, fetchOpts);
            downloading = queue.movieIds.has(Number(movie.id));
        }
        const hasFile = movieHasFile(movie);

        let status = MEDIA_STATUS_PROCESSING;
        if (hasFile && !downloading) status = MEDIA_STATUS_AVAILABLE;
        else if (hasFile && downloading) status = MEDIA_STATUS_PROCESSING;
        else if (downloading) status = MEDIA_STATUS_PROCESSING;

        const mediaInfo = {
            id: Number(movie.id) || id,
            tmdbId: id,
            status,
            mediaType: 'movie',
        };
        if (downloading) {
            mediaInfo.downloadStatus = [{ status: 'downloading', movieId: movie.id }];
        }
        const displayTags = hasFile ? extractArrMovieDisplayTags(movie) : [];
        if (displayTags.length) mediaInfo.displayTags = displayTags;

        const value = {
            mediaType: 'movie',
            tmdbId: id,
            inLibrary: hasFile,
            partial: false,
            downloading,
            status,
            statusLabel: statusLabelFor(status),
            mediaInfo,
            displayTags,
            radarrLibraryStatus: {
                matched: true,
                movieId: movie.id,
                instanceId: instance.id,
                instanceName: instance.name || 'Radarr',
                hasFile,
                downloading,
                displayTags,
            },
        };
        movieStatusCache.set(String(id), { at: now(), value });
        return value;
    };

    /** Fast list-path TV status from Sonarr series statistics (no episode fan-out). */
    const getTvListStatus = async (tmdbId, {
        title = '',
        year = null,
        tvdbId: tvdbIdHint = null,
        networkLookups = true,
    } = {}) => {
        const id = Number(tmdbId);
        const miss = {
            mediaType: 'tv',
            tmdbId: id,
            inLibrary: false,
            partial: false,
            downloading: false,
            status: null,
            statusLabel: null,
            mediaInfo: null,
        };
        if (!Number.isFinite(id) || id <= 0) return miss;

        let indexes;
        let hit = null;

        if (!networkLookups) {
            // List/stamp path: Map/peek only — never block on Sonarr/TMDB HTTP.
            indexes = peekSeriesCatalogIndexes(config)
                || peekSeriesCatalogIndexes(config, { allowStale: true });
            if (!indexes) return miss;
            hit = indexes.byTmdb.get(id) || null;
            const hinted = Number(tvdbIdHint);
            if (!hit && Number.isFinite(hinted) && hinted > 0 && indexes.byTvdb.has(hinted)) {
                hit = indexes.byTvdb.get(hinted);
            }
            if (!hit && title) {
                const keyWithYear = normalizeSeriesTitleKey(title, year);
                if (keyWithYear && indexes.byTitleYear.has(keyWithYear)) {
                    hit = indexes.byTitleYear.get(keyWithYear);
                } else {
                    const keyNoYear = normalizeSeriesTitleKey(title, null);
                    if (keyNoYear && indexes.byTitleYear.has(keyNoYear)) {
                        hit = indexes.byTitleYear.get(keyNoYear);
                    }
                }
            }
        } else {
            indexes = await loadSeriesCatalogIndexes(config, fetchOpts);
            hit = await matchSonarrSeriesFromIndexes(config, id, indexes, {
                fetchImpl: fetchOpts.fetchImpl || fetch,
                title,
                year,
                tvdbId: tvdbIdHint,
            });

            if (!hit) {
                // Sonarr lookup fills the gap when library rows lack tmdbId but are already monitored.
                for (const instance of getArrInstances(config, { type: 'sonarr', enabledOnly: true }).filter(isArrInstanceReady)) {
                    try {
                        const lookup = await lookupSonarrSeriesByTmdb(instance, id, fetchOpts);
                        if (lookup?.id) {
                            hit = { series: lookup, instance };
                            break;
                        }
                        const lookupTvdb = Number(lookup?.tvdbId);
                        if (Number.isFinite(lookupTvdb) && lookupTvdb > 0 && indexes.byTvdb.has(lookupTvdb)) {
                            hit = indexes.byTvdb.get(lookupTvdb);
                            break;
                        }
                    } catch {
                        // try next instance
                    }
                }
            }

            if (!hit) {
                const hinted = Number(tvdbIdHint);
                const tvdbId = (Number.isFinite(hinted) && hinted > 0)
                    ? hinted
                    : await resolveTvdbIdFromTmdb(config, id, { fetchImpl: fetchOpts.fetchImpl || fetch });
                if (tvdbId) {
                    if (indexes.byTvdb.has(tvdbId)) {
                        hit = indexes.byTvdb.get(tvdbId);
                    } else {
                        for (const instance of getArrInstances(config, { type: 'sonarr', enabledOnly: true }).filter(isArrInstanceReady)) {
                            try {
                                const lookup = await lookupSonarrSeriesByTvdb(instance, tvdbId, fetchOpts);
                                if (lookup?.id) {
                                    hit = { series: lookup, instance };
                                    break;
                                }
                            } catch {
                                // try next instance
                            }
                        }
                    }
                }
            }
        }

        if (!hit?.series) return miss;

        const { series, instance } = hit;
        let downloading = false;
        if (networkLookups) {
            const queue = await loadQueueSets(instance, fetchOpts);
            downloading = queue.seriesIds.has(Number(series.id));
        }
        let status = seriesStatsStatus(series);
        if (downloading && status === MEDIA_STATUS_AVAILABLE) status = MEDIA_STATUS_PARTIAL;

        const mediaInfo = {
            id: Number(series.id) || id,
            tmdbId: id,
            status,
            mediaType: 'tv',
        };
        if (downloading) {
            mediaInfo.downloadStatus = [{ status: 'downloading', seriesId: series.id }];
        }
        const displayTags = (status === MEDIA_STATUS_AVAILABLE || status === MEDIA_STATUS_PARTIAL)
            ? extractArrSeriesDisplayTags(series)
            : [];
        if (displayTags.length) mediaInfo.displayTags = displayTags;

        // Lightweight season hints from Sonarr season stats when present.
        const seasons = Array.isArray(series.seasons)
            ? series.seasons
                .map((season) => {
                    const seasonNumber = Number(season?.seasonNumber);
                    if (!Number.isFinite(seasonNumber) || seasonNumber <= 0) return null;
                    const stats = season?.statistics || {};
                    const episodeFileCount = Number(stats.episodeFileCount) || 0;
                    if (episodeFileCount <= 0) return null;
                    const expected = seasonExpectedFileCount(stats);
                    return {
                        seasonNumber,
                        status: expected > 0 && episodeFileCount >= expected
                            ? MEDIA_STATUS_AVAILABLE
                            : MEDIA_STATUS_PARTIAL,
                    };
                })
                .filter(Boolean)
            : [];
        if (seasons.length) mediaInfo.seasons = seasons;

        return {
            mediaType: 'tv',
            tmdbId: id,
            inLibrary: status === MEDIA_STATUS_AVAILABLE || status === MEDIA_STATUS_PARTIAL,
            partial: status === MEDIA_STATUS_PARTIAL,
            downloading,
            status,
            statusLabel: statusLabelFor(status),
            mediaInfo,
            displayTags,
            sonarrLibraryStatus: {
                matched: true,
                seriesId: series.id,
                instanceId: instance.id,
                instanceName: instance.name || 'Sonarr',
                showComplete: status === MEDIA_STATUS_AVAILABLE && !downloading,
                hasActiveDownloads: downloading,
                nextAiring: series.nextAiring || series.nextAiringUtc || null,
                seriesStatus: series.status || null,
                source: 'catalog',
                displayTags,
            },
        };
    };

    const getMediaStatus = async (mediaType, tmdbId) => {
        const type = mediaType === 'tv' ? 'tv' : 'movie';
        if (type === 'movie') return getMovieStatus(tmdbId);

        // Detail-grade Sonarr status (episode-aware) for single lookups.
        const sonarrStatus = await fetchSonarrLibraryStatusForShow(config, tmdbId, {
            ...fetchOpts,
            upgraderItems,
        });
        if (!sonarrStatus?.matched) {
            return {
                mediaType: 'tv',
                tmdbId: Number(tmdbId),
                inLibrary: false,
                partial: false,
                downloading: false,
                status: null,
                statusLabel: null,
                mediaInfo: null,
                sonarrLibraryStatus: sonarrStatus,
            };
        }

        let status = MEDIA_STATUS_UNKNOWN;
        if (sonarrStatus.showComplete && !sonarrStatus.hasActiveDownloads) {
            status = MEDIA_STATUS_AVAILABLE;
        } else if ((sonarrStatus.fileCount || 0) > 0 || (sonarrStatus.seasons || []).some((s) => s.withFile > 0)) {
            status = MEDIA_STATUS_PARTIAL;
        } else if (sonarrStatus.hasActiveDownloads) {
            status = MEDIA_STATUS_PROCESSING;
        } else {
            status = MEDIA_STATUS_PROCESSING;
        }

        const mediaInfo = {
            id: Number(sonarrStatus.seriesId) || Number(tmdbId),
            tmdbId: Number(tmdbId),
            status,
            mediaType: 'tv',
            seasons: (sonarrStatus.seasons || [])
                .filter((season) => Number(season?.seasonNumber) > 0 && (season.airedTotal > 0 || season.withFile > 0))
                .map((season) => ({
                    seasonNumber: season.seasonNumber,
                    status: season.complete ? MEDIA_STATUS_AVAILABLE : MEDIA_STATUS_PARTIAL,
                })),
        };
        if (sonarrStatus.hasActiveDownloads) {
            mediaInfo.downloadStatus = [{ status: 'downloading', seriesId: sonarrStatus.seriesId }];
        }

        return {
            mediaType: 'tv',
            tmdbId: Number(tmdbId),
            inLibrary: status === MEDIA_STATUS_AVAILABLE || status === MEDIA_STATUS_PARTIAL,
            partial: status === MEDIA_STATUS_PARTIAL,
            downloading: !!sonarrStatus.hasActiveDownloads,
            status,
            statusLabel: statusLabelFor(status),
            mediaInfo,
            sonarrLibraryStatus: sonarrStatus,
        };
    };

    /**
     * Enrich discover list items with mediaInfo.
     * @param {object[]} items
     * @param {object} [opts]
     * @param {boolean} [opts.blockForCatalog=false] When false (default), skip enrich if *arr
     *   catalogs are cold and warm them in the background — keeps Discover browse fast.
     * @param {boolean} [opts.networkLookups=true] When false, Map/peek only (no Sonarr/TMDB HTTP).
     */
    const enrichItems = async (items = [], opts = {}) => {
        if (!Array.isArray(items) || items.length === 0) return items;

        const blockForCatalog = opts.blockForCatalog === true;
        const networkLookups = opts.networkLookups !== false;
        const needsMovies = items.some((item) => resolveMediaType(item) === 'movie');
        const needsTv = items.some((item) => resolveMediaType(item) === 'tv');

        let movieIndex = needsMovies ? peekMovieCatalogIndex(config) : new Map();
        let seriesIndex = needsTv ? peekSeriesCatalogIndex(config) : new Map();
        // Prefer fresh catalogs; fall back to stale so Available badges don't blank mid-refresh.
        if (needsMovies && movieIndex == null) {
            movieIndex = peekMovieCatalogIndex(config, { allowStale: true });
        }
        if (needsTv && seriesIndex == null) {
            seriesIndex = peekSeriesCatalogIndex(config, { allowStale: true });
        }
        const catalogsCold = (needsMovies && movieIndex == null) || (needsTv && seriesIndex == null);

        if (catalogsCold) {
            warmCatalogsInBackground(config, fetchOpts);
            if (!blockForCatalog) {
                // Return TMDB payload immediately; next requests will enrich from cache.
                return items;
            }
            if (needsMovies) movieIndex = await loadMovieCatalogIndex(config, fetchOpts);
            if (needsTv) seriesIndex = await loadSeriesCatalogIndex(config, fetchOpts);
        }

        // Use fast path once catalogs are warm (Map lookups only).
        const enriched = await Promise.all(items.map(async (item) => {
            const mediaType = resolveMediaType(item);
            const tmdbId = resolveTmdbId(item);
            if (!mediaType || !tmdbId || mediaType === 'person') return item;

            try {
                const yearRaw = String(item?.firstAirDate || item?.releaseDate || '').slice(0, 4);
                const year = Number(yearRaw);
                const availability = mediaType === 'movie'
                    ? await getMovieStatus(tmdbId, { networkLookups })
                    : await getTvListStatus(tmdbId, {
                        title: item?.title || item?.name || '',
                        year: Number.isFinite(year) && year > 1900 ? year : null,
                        tvdbId: Number(item?.tvdbId ?? item?.externalIds?.tvdbId) || null,
                        networkLookups,
                    });

                if (!availability?.mediaInfo) return item;

                const displayTags = Array.isArray(availability.displayTags)
                    ? availability.displayTags
                    : (Array.isArray(availability.mediaInfo?.displayTags)
                        ? availability.mediaInfo.displayTags
                        : []);

                const priorInfo = item.mediaInfo && typeof item.mediaInfo === 'object'
                    ? { ...item.mediaInfo }
                    : {};
                // Drop stale quality tags when the title is no longer on disk.
                if (!displayTags.length) delete priorInfo.displayTags;

                const { displayTags: _priorTags, ...itemRest } = item;

                return {
                    ...itemRest,
                    mediaInfo: {
                        ...priorInfo,
                        ...availability.mediaInfo,
                        ...(displayTags.length ? { displayTags } : {}),
                    },
                    ...(displayTags.length ? { displayTags } : {}),
                    ...(availability.sonarrLibraryStatus
                        ? { sonarrLibraryStatus: availability.sonarrLibraryStatus }
                        : {}),
                    ...(availability.radarrLibraryStatus
                        ? { radarrLibraryStatus: availability.radarrLibraryStatus }
                        : {}),
                };
            } catch {
                return item;
            }
        }));

        return enriched;
    };

    const enrichDetails = async (details = {}) => {
        if (!details || typeof details !== 'object' || Array.isArray(details)) return details;
        const mediaType = resolveMediaType(details);
        const tmdbId = resolveTmdbId(details);
        if (!mediaType || !tmdbId) return details;

        if (mediaType === 'movie') {
            const availability = await getMovieStatus(tmdbId);
            if (!availability?.mediaInfo) return details;
            const displayTags = Array.isArray(availability.displayTags)
                ? availability.displayTags
                : (Array.isArray(availability.mediaInfo?.displayTags)
                    ? availability.mediaInfo.displayTags
                    : []);
            return {
                ...details,
                mediaInfo: {
                    ...(details.mediaInfo || {}),
                    ...availability.mediaInfo,
                    ...(displayTags.length ? { displayTags } : {}),
                },
                ...(displayTags.length ? { displayTags } : {}),
                radarrLibraryStatus: availability.radarrLibraryStatus,
            };
        }

        const enriched = await enrichTvDetailsWithSonarrLibraryStatus(config, details, {
            ...fetchOpts,
            upgraderItems,
        });
        if (enriched?.sonarrLibraryStatus?.matched && enriched.mediaInfo && !enriched.mediaInfo.id) {
            return {
                ...enriched,
                mediaInfo: {
                    ...enriched.mediaInfo,
                    id: Number(enriched.sonarrLibraryStatus.seriesId) || tmdbId,
                },
            };
        }
        // Ensure mediaInfo.id even when applySonarr already set status.
        if (enriched?.sonarrLibraryStatus?.matched) {
            return applySonarrLibraryStatusToTvDetails(
                {
                    ...enriched,
                    mediaInfo: {
                        ...(enriched.mediaInfo || {}),
                        id: Number(enriched.sonarrLibraryStatus.seriesId) || tmdbId,
                    },
                },
                enriched.sonarrLibraryStatus,
            );
        }
        return enriched;
    };

    const filterAvailable = async (items, opts = {}) => {
        const list = Array.isArray(items) ? items : [];
        const enriched = opts.enrich === false ? list : await enrichItems(list);
        if (opts.hideAvailable) return filterAvailableMedia(enriched);
        return enriched.filter((item) => !shouldHideAvailableMediaItem(item));
    };

    /** Snapshot every catalog title for the on-disk discovery availability cache. */
    const snapshotLibraryStatuses = async () => {
        // Stamp directly from each *arr catalog row. Looking up by TMDB id after the fact
        // dropped Sonarr shows with missing/zero tmdbId (e.g. Rick and Morty).
        const radarrInstances = getArrInstances(config, { type: 'radarr', enabledOnly: true })
            .filter(isArrInstanceReady);
        const sonarrInstances = getArrInstances(config, { type: 'sonarr', enabledOnly: true })
            .filter(isArrInstanceReady);

        if (!radarrInstances.length && !sonarrInstances.length) {
            throw new Error('No ready Sonarr/Radarr instances configured');
        }

        // Always re-download catalogs for the 12h badge snapshot — never reuse a
        // short-timeout empty cache from Discover browse.
        const snapshotFetchOpts = { ...fetchOpts, forceRefresh: true };
        const movieCatalogs = await Promise.all(
            radarrInstances.map((instance) => loadInstanceMovieCatalog(instance, snapshotFetchOpts)),
        );
        const seriesCatalogs = await Promise.all(
            sonarrInstances.map((instance) => loadInstanceSeriesCatalog(instance, snapshotFetchOpts)),
        );

        const movieRows = movieCatalogs.reduce((sum, catalog) => sum + (catalog?.list?.length || 0), 0);
        const seriesRowsLoaded = seriesCatalogs.reduce((sum, catalog) => sum + (catalog?.list?.length || 0), 0);
        if (movieRows + seriesRowsLoaded <= 0) {
            throw new Error('Sonarr/Radarr catalogs returned 0 titles (check URL/API key or increase timeout)');
        }

        const byKey = {};
        let movieCount = 0;
        let tvCount = 0;
        const yieldEventLoop = () => new Promise((resolve) => setImmediate(resolve));

        for (const catalog of movieCatalogs) {
            const list = Array.isArray(catalog?.list) ? catalog.list : [];
            for (let i = 0; i < list.length; i += 1) {
                const movie = list[i];
                const tmdbId = Number(movie?.tmdbId);
                const hasFile = movieHasFile(movie);
                const status = hasFile ? MEDIA_STATUS_AVAILABLE : MEDIA_STATUS_PROCESSING;
                const mediaInfo = {
                    id: Number(movie?.id) || (Number.isFinite(tmdbId) ? tmdbId : 0),
                    tmdbId: Number.isFinite(tmdbId) && tmdbId > 0 ? tmdbId : null,
                    status,
                    mediaType: 'movie',
                };
                const displayTags = hasFile ? extractArrMovieDisplayTags(movie) : [];
                if (displayTags.length) mediaInfo.displayTags = displayTags;
                const entry = {
                    mediaInfo,
                    displayTags,
                    radarrLibraryStatus: {
                        matched: true,
                        movieId: movie?.id,
                        hasFile,
                        downloading: false,
                        displayTags,
                    },
                    sonarrLibraryStatus: null,
                };
                if (Number.isFinite(tmdbId) && tmdbId > 0) {
                    byKey[`movie:${tmdbId}`] = entry;
                    movieCount += 1;
                }
                const title = movie?.title || movie?.originalTitle || '';
                const year = Number(movie?.year) || Number(String(movie?.releaseDate || '').slice(0, 4)) || null;
                const titleKey = normalizeSeriesTitleKey(title, year);
                if (titleKey) byKey[`movieTitle:${titleKey}`] = entry;
                if (i > 0 && i % 50 === 0) await yieldEventLoop();
            }
        }

        const seriesRows = [];
        for (let i = 0; i < sonarrInstances.length; i += 1) {
            const instance = sonarrInstances[i];
            const catalog = seriesCatalogs[i];
            const list = Array.isArray(catalog?.list) ? catalog.list : [];
            for (const series of list) {
                const existingTmdb = Number(series?.tmdbId);
                seriesRows.push({
                    series,
                    instance,
                    tmdbId: (Number.isFinite(existingTmdb) && existingTmdb > 0) ? existingTmdb : null,
                });
            }
        }

        const needsResolve = seriesRows.filter((row) => !row.tmdbId && Number(row.series?.tvdbId) > 0);
        const resolveConcurrency = 3;
        for (let i = 0; i < needsResolve.length; i += resolveConcurrency) {
            const slice = needsResolve.slice(i, i + resolveConcurrency);
            await Promise.all(slice.map(async (row) => {
                row.tmdbId = await resolveTmdbIdFromTvdb(config, Number(row.series.tvdbId), {
                    fetchImpl: fetchOpts.fetchImpl || fetch,
                });
            }));
            await yieldEventLoop();
        }

        for (let i = 0; i < seriesRows.length; i += 1) {
            const { series, instance, tmdbId } = seriesRows[i];
            const status = seriesStatsStatus(series);
            const mediaInfo = {
                id: Number(series?.id) || (Number.isFinite(Number(tmdbId)) ? Number(tmdbId) : 0),
                tmdbId: Number.isFinite(Number(tmdbId)) && Number(tmdbId) > 0 ? Number(tmdbId) : null,
                status,
                mediaType: 'tv',
            };
            const seasons = Array.isArray(series?.seasons)
                ? series.seasons
                    .map((season) => {
                        const seasonNumber = Number(season?.seasonNumber);
                        if (!Number.isFinite(seasonNumber) || seasonNumber <= 0) return null;
                        const stats = season?.statistics || {};
                        const episodeFileCount = Number(stats.episodeFileCount) || 0;
                        if (episodeFileCount <= 0) return null;
                        const expected = seasonExpectedFileCount(stats);
                        return {
                            seasonNumber,
                            status: expected > 0 && episodeFileCount >= expected
                                ? MEDIA_STATUS_AVAILABLE
                                : MEDIA_STATUS_PARTIAL,
                        };
                    })
                    .filter(Boolean)
                : [];
            if (seasons.length) mediaInfo.seasons = seasons;

            const entry = {
                mediaInfo,
                sonarrLibraryStatus: {
                    matched: true,
                    seriesId: series?.id,
                    instanceId: instance?.id,
                    instanceName: instance?.name || 'Sonarr',
                    // showComplete only when truly finished — continuing/nextAiring stays Partial.
                    showComplete: status === MEDIA_STATUS_AVAILABLE,
                    hasActiveDownloads: false,
                    source: 'catalog',
                    nextAiring: series?.nextAiring || series?.nextAiringUtc || null,
                    seriesStatus: series?.status || null,
                },
                radarrLibraryStatus: null,
            };

            if (Number.isFinite(Number(tmdbId)) && Number(tmdbId) > 0) {
                byKey[`tv:${Number(tmdbId)}`] = entry;
                tvCount += 1;
            }
            const title = series?.title || series?.seriesTitle || series?.sortTitle || '';
            const year = seriesYearFromSonarr(series);
            const titleKey = normalizeSeriesTitleKey(title, year);
            if (titleKey) byKey[`tvTitle:${titleKey}`] = entry;
            const titleNoYear = normalizeSeriesTitleKey(title, null);
            if (titleNoYear && titleNoYear !== titleKey) byKey[`tvTitle:${titleNoYear}`] = entry;

            if (i > 0 && i % 50 === 0) await yieldEventLoop();
        }

        return {
            movieCount,
            tvCount,
            itemCount: Object.keys(byKey).length,
            byKey,
        };
    };

    return {
        getMediaStatus,
        getTvListStatus,
        getMovieStatus,
        enrichItems,
        enrichDetails,
        filterAvailable,
        snapshotLibraryStatuses,
        /** Test / ops helpers */
        _caches: {
            movieCatalogCache,
            seriesCatalogCache,
            queueCache,
            movieStatusCache,
        },
    };
};

export default createLibraryAvailability;
