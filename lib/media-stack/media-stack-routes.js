import { getReadyArrInstances } from './arr-instances.js';
import { scopedCacheKey } from '../cache/cache-key.js';
import { cacheRefreshMs, startAdaptiveCacheWarmer } from '../cache/cache-refresh.js';
import { mapWithConcurrency } from '../core/concurrency.js';

const recordsOf = (payload) => Array.isArray(payload?.records) ? payload.records : Array.isArray(payload) ? payload : [];

export const registerMediaStackRoutes = ({
    app,
    requireAuth,
    requireMember,
    configPath,
    loadFile,
    withCache,
    fetch,
    normalizeExternalBaseUrl,
}) => {
    const fetchArr = async (instance, endpoint) => {
        if (!instance?.url || !instance?.apiKey) return null;
        try {
            const safeBaseUrl = normalizeExternalBaseUrl(instance.url, { allowPrivate: true, allowHttp: true });
            const response = await fetch(new URL(endpoint, safeBaseUrl).toString(), { headers: { 'X-Api-Key': instance.apiKey } });
            return response.ok ? await response.json() : null;
        } catch {
            return null;
        }
    };

    const toLocalYmd = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    // Fingerprint instances without putting API keys into the hash input.
    const instanceIdentity = (config, types) => types.flatMap((type) => (
        getReadyArrInstances(config, type).flatMap((instance) => [
            instance.id,
            instance.url,
            String(instance.apiKey || '').length,
            String(instance.apiKey || '').slice(0, 4),
            String(instance.apiKey || '').slice(-4),
        ])
    ));

    const annotate = (records, instance) => records.map((record) => ({
        ...record,
        arrInstanceId: instance.id,
        arrInstanceName: instance.name,
    }));

    const mergePayloads = (bundles, key) => {
        const records = bundles.flatMap((bundle) => annotate(recordsOf(bundle[key]), bundle.instance));
        return { records, totalRecords: records.length };
    };

    const hydrateQueue = async (queue, type, instance) => {
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

    const loadWeekCalendar = async (weekOffset = 0, horizon = 'week') => {
        const safeOffset = Math.max(-4, Math.min(Number(weekOffset) || 0, 12));
        const config = await loadFile(configPath, {});
        const startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        startDate.setDate(startDate.getDate() + (safeOffset * 7));
        if (horizon === 'quarter') startDate.setDate(startDate.getDate() - startDate.getDay());
        const endDate = new Date(startDate);
        if (horizon === 'quarter') endDate.setMonth(endDate.getMonth() + 3);
        else endDate.setDate(endDate.getDate() + 7);
        const start = toLocalYmd(startDate);
        const end = toLocalYmd(endDate);
        const cacheKey = scopedCacheKey('media-stack-week-calendar', [...instanceIdentity(config, ['sonarr', 'radarr']), start, end]);
        return withCache(cacheKey, cacheRefreshMs(config), async () => {
            const sonarrInstances = getReadyArrInstances(config, 'sonarr');
            const radarrInstances = getReadyArrInstances(config, 'radarr');
            const [sonarr, radarr] = await Promise.all([
                Promise.all(sonarrInstances.map(async (instance) => annotate(recordsOf(await fetchArr(instance, `/api/v3/calendar?start=${start}&end=${end}&includeSeries=true&includeEpisode=true&unmonitored=true`)), instance))),
                Promise.all(radarrInstances.map(async (instance) => annotate(recordsOf(await fetchArr(instance, `/api/v3/calendar?start=${start}&end=${end}&unmonitored=true`)), instance))),
            ]);
            return {
                start,
                end,
                sonarr: { configured: sonarrInstances.length > 0, calendar: sonarr.flat() },
                radarr: { configured: radarrInstances.length > 0, calendar: radarr.flat() },
            };
        });
    };

    const pickImages = (images = []) => (Array.isArray(images) ? images : [])
        .filter((image) => image && (image.remoteUrl || image.url))
        .map((image) => ({
            coverType: image.coverType || null,
            remoteUrl: image.remoteUrl || null,
            url: image.url || null,
        }));

    const memberMedia = (media) => {
        if (!media || typeof media !== 'object') return null;
        return {
            title: media.title || media.artistName || media.name || '',
            year: media.year || null,
            hasFile: typeof media.hasFile === 'boolean' ? media.hasFile : undefined,
            network: media.network || media.studio || '',
            images: pickImages(media.images),
            statistics: media.statistics && typeof media.statistics.trackFileCount === 'number'
                ? { trackFileCount: media.statistics.trackFileCount }
                : undefined,
            artist: media.artist ? {
                artistName: media.artist.artistName || media.artist.name || '',
                images: pickImages(media.artist.images),
            } : undefined,
        };
    };

    const sanitizeQueueForMembers = (queue) => {
        const records = recordsOf(queue).map((record) => ({
            id: record.id,
            status: record.status || null,
            size: Number(record.size) || 0,
            sizeleft: Number(record.sizeleft) || 0,
            timeleft: record.timeleft || '',
            trackedDownloadStatus: record.trackedDownloadStatus || null,
            trackedDownloadState: record.trackedDownloadState || null,
            // Keep only phase keywords — never forward path-bearing status payloads.
            statusMessages: Array.isArray(record.statusMessages)
                ? record.statusMessages.map((entry) => ({
                    title: String(entry?.title || '').slice(0, 80),
                }))
                : undefined,
            errorMessage: record.errorMessage ? 'Download error' : undefined,
            series: memberMedia(record.series),
            movie: memberMedia(record.movie),
            album: memberMedia(record.album),
            artist: memberMedia(record.artist),
            episode: record.episode ? {
                title: record.episode.title || '',
                seasonNumber: record.episode.seasonNumber,
                episodeNumber: record.episode.episodeNumber,
                hasFile: typeof record.episode.hasFile === 'boolean' ? record.episode.hasFile : undefined,
            } : undefined,
        }));
        return { records, totalRecords: records.length };
    };

    const sanitizeCalendarForMembers = (calendar = []) => recordsOf(calendar).map((item) => ({
        id: item.id,
        title: item.title || '',
        airDateUtc: item.airDateUtc || null,
        airDate: item.airDate || null,
        monitored: item.monitored,
        hasFile: item.hasFile,
        seasonNumber: item.seasonNumber,
        episodeNumber: item.episodeNumber,
        digitalRelease: item.digitalRelease || null,
        physicalRelease: item.physicalRelease || null,
        inCinemas: item.inCinemas || null,
        added: item.added || null,
        _releaseDate: item._releaseDate || null,
        studio: item.studio || '',
        network: item.network || '',
        images: pickImages(item.images),
        series: memberMedia(item.series),
        arrInstanceId: item.arrInstanceId,
        arrInstanceName: item.arrInstanceName,
    }));

    const loadInstanceSummary = async (instance, start, end, inRange, { includeOps = false } = {}) => {
        const type = instance.type;
        const version = type === 'lidarr' ? 'v1' : 'v3';
        const queueQuery = type === 'sonarr'
            ? 'includeSeries=true&includeEpisode=true'
            : type === 'radarr' ? 'includeMovie=true' : 'includeArtist=true&includeAlbum=true';
        const historyQuery = queueQuery;
        const calendarEndpoint = type === 'sonarr'
            ? `/api/v3/calendar?start=${start}&end=${end}&includeSeries=true&includeEpisode=true&unmonitored=true`
            : type === 'radarr' ? `/api/v3/calendar?start=${start}&end=${end}&unmonitored=true` : null;
        const [status, queueRaw, history, disk, calendarRaw] = await Promise.all([
            includeOps ? fetchArr(instance, `/api/${version}/system/status`) : null,
            fetchArr(instance, `/api/${version}/queue?page=1&pageSize=100&${queueQuery}`),
            includeOps ? fetchArr(instance, `/api/${version}/history?page=1&pageSize=10&${historyQuery}`) : null,
            includeOps ? fetchArr(instance, `/api/${version}/diskspace`) : null,
            calendarEndpoint ? fetchArr(instance, calendarEndpoint) : null,
        ]);
        const queue = await hydrateQueue(queueRaw, type, instance);
        let calendar = recordsOf(calendarRaw);

        if (calendar.length === 0 && type === 'sonarr') {
            const series = await fetchArr(instance, '/api/v3/series');
            calendar = recordsOf(series).filter((item) => inRange(item?.nextAiring)).map((item) => ({
                id: `fallback-sonarr-${instance.id}-${item.id}`,
                title: 'Upcoming Episode',
                airDateUtc: item.nextAiring,
                airDate: item.nextAiring,
                monitored: item.monitored !== false,
                hasFile: false,
                seasonNumber: 0,
                episodeNumber: 0,
                series: { title: item.title || 'Unknown Series', network: item.network || '', images: item.images || [] },
            }));
        }
        if (calendar.length === 0 && type === 'radarr') {
            const movies = await fetchArr(instance, '/api/v3/movie');
            calendar = recordsOf(movies).map((movie) => ({
                ...movie,
                _releaseDate: movie.digitalRelease || movie.physicalRelease || movie.inCinemas || movie.added || null,
            })).filter((movie) => inRange(movie._releaseDate));
        }

        return { instance, status, queue, history, disk, calendar };
    };

    app.get('/api/media-stack/calendar', requireAuth, requireMember, async (req, res) => {
        try {
            res.json(await loadWeekCalendar(req.query.weekOffset, req.query.horizon === 'quarter' ? 'quarter' : 'week'));
        } catch {
            res.status(500).json({ error: 'Failed to fetch release calendar' });
        }
    });

    app.get('/api/media-stack/summary', requireAuth, requireMember, async (req, res) => {
        try {
            const isAdmin = req.user?.isAdmin === true;
            const monthOffset = Math.max(-24, Math.min(parseInt(req.query.monthOffset, 10) || 0, 24));
            const config = await loadFile(configPath, {});
            const cacheKey = scopedCacheKey(
                isAdmin ? 'media-stack-summary-admin' : 'media-stack-summary-member',
                [...instanceIdentity(config, ['sonarr', 'radarr', 'lidarr']), monthOffset],
            );
            const data = await withCache(cacheKey, cacheRefreshMs(config), async () => {
                const targetDate = new Date();
                targetDate.setMonth(targetDate.getMonth() + monthOffset);
                const firstDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
                const lastDay = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0);
                const start = toLocalYmd(firstDay);
                const end = toLocalYmd(lastDay);
                const inRange = (value) => {
                    const date = value ? new Date(value) : null;
                    return !!date && !Number.isNaN(date.getTime()) && date >= firstDay && date <= new Date(lastDay.getFullYear(), lastDay.getMonth(), lastDay.getDate(), 23, 59, 59, 999);
                };
                const instances = ['sonarr', 'radarr', 'lidarr'].flatMap((type) => getReadyArrInstances(config, type));
                const bundles = await Promise.all(instances.map((instance) => loadInstanceSummary(instance, start, end, inRange, { includeOps: isAdmin })));
                const summarize = (type) => {
                    const typed = bundles.filter((bundle) => bundle.instance.type === type);
                    const calendar = typed.flatMap((bundle) => annotate(recordsOf(bundle.calendar), bundle.instance));
                    if (!isAdmin) {
                        return {
                            configured: typed.length > 0,
                            queue: sanitizeQueueForMembers(mergePayloads(typed, 'queue')),
                            calendar: sanitizeCalendarForMembers(calendar),
                        };
                    }
                    return {
                        configured: typed.length > 0,
                        instances: typed.map((bundle) => ({ id: bundle.instance.id, name: bundle.instance.name, status: bundle.status })),
                        status: typed[0]?.status || null,
                        queue: mergePayloads(typed, 'queue'),
                        history: mergePayloads(typed, 'history'),
                        disk: typed.flatMap((bundle) => annotate(recordsOf(bundle.disk), bundle.instance)),
                        calendar,
                    };
                };
                return { sonarr: summarize('sonarr'), radarr: summarize('radarr'), lidarr: summarize('lidarr') };
            });
            res.json(data);
        } catch {
            res.status(500).json({ error: 'Failed to fetch media stack summary' });
        }
    });

    const normalizedTitleKey = (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

    const getActiveAcquisitionKeys = async (providedConfig = null) => {
        const config = providedConfig || await loadFile(configPath, {});
        const instances = ['sonarr', 'radarr'].flatMap((type) => getReadyArrInstances(config, type));
        const cacheKey = scopedCacheKey('media-stack-active-acquisitions', instanceIdentity(config, ['sonarr', 'radarr']));
        const keys = await withCache(cacheKey, Math.min(cacheRefreshMs(config), 60_000), async () => {
            const bundles = await Promise.all(instances.map(async (instance) => {
                const type = instance.type;
                const query = type === 'sonarr' ? 'includeSeries=true&includeEpisode=true' : 'includeMovie=true';
                const raw = await fetchArr(instance, `/api/v3/queue?page=1&pageSize=100&${query}`);
                // Prefer embedded includes; skip expensive hasFile hydration for acquisition keys.
                const records = recordsOf(raw).filter((record) => String(record?.status || '').toLowerCase() === 'downloading');
                return records.map((record) => {
                    const media = type === 'sonarr' ? record.series : record.movie;
                    return {
                        tmdbId: Number(media?.tmdbId) || null,
                        tvdbId: Number(media?.tvdbId) || null,
                        title: normalizedTitleKey(media?.title || record?.title),
                    };
                });
            }));
            return bundles.flat().flatMap((item) => [
                item.tmdbId ? `tmdb:${item.tmdbId}` : null,
                item.tvdbId ? `tvdb:${item.tvdbId}` : null,
                item.title ? `title:${item.title}` : null,
            ]).filter(Boolean);
        });
        return new Set(keys);
    };

    const startCacheWarmer = () => {
        const loadConfig = () => loadFile(configPath, {});
        const warm = (config) => Promise.all([
            ...[0, 1].map((offset) => loadWeekCalendar(offset)),
            getActiveAcquisitionKeys(config),
        ]);
        return startAdaptiveCacheWarmer({ loadConfig, warm });
    };

    return { startCacheWarmer, getActiveAcquisitionKeys };
};
