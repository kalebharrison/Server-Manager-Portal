import { getReadyArrInstances } from './arr-instances.js';
import { scopedCacheKey } from './cache-key.js';
import { cacheRefreshMs, startAdaptiveCacheWarmer } from './cache-refresh.js';

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

    const instanceIdentity = (config, types) => types.flatMap((type) => (
        getReadyArrInstances(config, type).flatMap((instance) => [instance.id, instance.url, instance.apiKey])
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
        const hydrated = await Promise.all(records.map(async (record) => {
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
        }));
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

    const loadInstanceSummary = async (instance, start, end, inRange) => {
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
            fetchArr(instance, `/api/${version}/system/status`),
            fetchArr(instance, `/api/${version}/queue?page=1&pageSize=100&${queueQuery}`),
            fetchArr(instance, `/api/${version}/history?page=1&pageSize=10&${historyQuery}`),
            fetchArr(instance, `/api/${version}/diskspace`),
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
            const monthOffset = Math.max(-24, Math.min(parseInt(req.query.monthOffset, 10) || 0, 24));
            const config = await loadFile(configPath, {});
            const cacheKey = scopedCacheKey('media-stack-summary', [...instanceIdentity(config, ['sonarr', 'radarr', 'lidarr']), monthOffset]);
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
                const bundles = await Promise.all(instances.map((instance) => loadInstanceSummary(instance, start, end, inRange)));
                const summarize = (type) => {
                    const typed = bundles.filter((bundle) => bundle.instance.type === type);
                    return {
                        configured: typed.length > 0,
                        instances: typed.map((bundle) => ({ id: bundle.instance.id, name: bundle.instance.name, status: bundle.status })),
                        status: typed[0]?.status || null,
                        queue: mergePayloads(typed, 'queue'),
                        history: mergePayloads(typed, 'history'),
                        disk: typed.flatMap((bundle) => annotate(recordsOf(bundle.disk), bundle.instance)),
                        calendar: typed.flatMap((bundle) => annotate(recordsOf(bundle.calendar), bundle.instance)),
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
                const queue = await hydrateQueue(raw, type, instance);
                return queue.records.filter((record) => String(record?.status || '').toLowerCase() === 'downloading').map((record) => {
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
