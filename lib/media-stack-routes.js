import { scopedCacheKey } from './cache-key.js';

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
    const CONFIG_PATH = configPath;
    const fetchArr = async (url, key, endpoint) => {
        if (!url || !key) return null;
        try {
            const safeBaseUrl = normalizeExternalBaseUrl(url, { allowPrivate: true, allowHttp: true });
            const target = new URL(endpoint, safeBaseUrl);
            const response = await fetch(target.toString(), { headers: { 'X-Api-Key': key } });
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

    const loadWeekCalendar = async (weekOffset = 0) => {
        const safeOffset = Math.max(-4, Math.min(Number(weekOffset) || 0, 12));
        const config = await loadFile(CONFIG_PATH, {});
        const startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        startDate.setDate(startDate.getDate() + (safeOffset * 7));
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 7);
        const start = toLocalYmd(startDate);
        const end = toLocalYmd(endDate);
        const cacheKey = scopedCacheKey('media-stack-week-calendar', [config.sonarrUrl, config.sonarrApiKey, config.radarrUrl, config.radarrApiKey, start, end]);
        return withCache(cacheKey, 5 * 60 * 1000, async () => {
            const [sonarr, radarr] = await Promise.all([
                fetchArr(config.sonarrUrl, config.sonarrApiKey, `/api/v3/calendar?start=${start}&end=${end}&includeSeries=true&includeEpisode=true&unmonitored=true`),
                fetchArr(config.radarrUrl, config.radarrApiKey, `/api/v3/calendar?start=${start}&end=${end}&unmonitored=true`),
            ]);
            return {
                start,
                end,
                sonarr: { configured: !!(config.sonarrUrl && config.sonarrApiKey), calendar: Array.isArray(sonarr) ? sonarr : (sonarr?.records || []) },
                radarr: { configured: !!(config.radarrUrl && config.radarrApiKey), calendar: Array.isArray(radarr) ? radarr : (radarr?.records || []) },
            };
        });
    };

    app.get('/api/media-stack/calendar', requireAuth, requireMember, async (req, res) => {
        try {
            res.json(await loadWeekCalendar(req.query.weekOffset));
        } catch {
            res.status(500).json({ error: 'Failed to fetch release calendar' });
        }
    });

    app.get('/api/media-stack/summary', requireAuth, requireMember, async (req, res) => {
        try {
            const rawMonthOffset = parseInt(req.query.monthOffset, 10) || 0;
            const monthOffset = Math.max(-24, Math.min(rawMonthOffset, 24));
            const config = await loadFile(CONFIG_PATH, {});
            const cacheKey = scopedCacheKey('media-stack-summary', [config.sonarrUrl, config.sonarrApiKey, config.radarrUrl, config.radarrApiKey, config.lidarrUrl, config.lidarrApiKey, monthOffset]);
            const data = await withCache(cacheKey, 60000, async () => {
                const targetDate = new Date();
                targetDate.setMonth(targetDate.getMonth() + monthOffset);

                const firstDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
                const lastDay = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0);
                const start = toLocalYmd(firstDay);
                const end = toLocalYmd(lastDay);

                const inTargetMonthRange = (dateValue) => {
                    if (!dateValue) return false;
                    const parsed = new Date(dateValue);
                    if (Number.isNaN(parsed.getTime())) return false;
                    const monthStart = new Date(firstDay);
                    monthStart.setHours(0, 0, 0, 0);
                    const monthEnd = new Date(lastDay);
                    monthEnd.setHours(23, 59, 59, 999);
                    return parsed >= monthStart && parsed <= monthEnd;
                };

                const [sonarrStatus, sonarrQueueRaw, sonarrHistory, sonarrDisk, sonarrCalendarRaw, radarrStatus, radarrQueueRaw, radarrHistory, radarrDisk, radarrCalendarRaw, lidarrStatus, lidarrQueueRaw, lidarrHistory, lidarrDisk] = await Promise.all([
                    fetchArr(config.sonarrUrl, config.sonarrApiKey, '/api/v3/system/status'),
                    fetchArr(config.sonarrUrl, config.sonarrApiKey, '/api/v3/queue?page=1&pageSize=100&includeSeries=true&includeEpisode=true'),
                    fetchArr(config.sonarrUrl, config.sonarrApiKey, '/api/v3/history?page=1&pageSize=10&includeSeries=true&includeEpisode=true'),
                    fetchArr(config.sonarrUrl, config.sonarrApiKey, '/api/v3/diskspace'),
                    fetchArr(config.sonarrUrl, config.sonarrApiKey, `/api/v3/calendar?start=${start}&end=${end}&includeSeries=true&includeEpisode=true&unmonitored=true`),
                    fetchArr(config.radarrUrl, config.radarrApiKey, '/api/v3/system/status'),
                    fetchArr(config.radarrUrl, config.radarrApiKey, '/api/v3/queue?page=1&pageSize=100&includeMovie=true'),
                    fetchArr(config.radarrUrl, config.radarrApiKey, '/api/v3/history?page=1&pageSize=10&includeMovie=true'),
                    fetchArr(config.radarrUrl, config.radarrApiKey, '/api/v3/diskspace'),
                    fetchArr(config.radarrUrl, config.radarrApiKey, `/api/v3/calendar?start=${start}&end=${end}&unmonitored=true`),
                    fetchArr(config.lidarrUrl, config.lidarrApiKey, '/api/v1/system/status'),
                    fetchArr(config.lidarrUrl, config.lidarrApiKey, '/api/v1/queue?page=1&pageSize=100&includeArtist=true&includeAlbum=true'),
                    fetchArr(config.lidarrUrl, config.lidarrApiKey, '/api/v1/history?page=1&pageSize=10&includeArtist=true&includeAlbum=true'),
                    fetchArr(config.lidarrUrl, config.lidarrApiKey, '/api/v1/diskspace')
                ]);

                // Arr queue payloads vary by version. Hydrate incomplete media records so the UI
                // can classify upgrades from the authoritative movie/episode hasFile state.
                const hydrateQueue = async (queue, service) => {
                    const records = Array.isArray(queue?.records) ? queue.records : Array.isArray(queue) ? queue : [];
                    const mediaKey = service === 'sonarr' ? 'series' : service === 'radarr' ? 'movie' : 'album';
                    const idKey = service === 'sonarr' ? 'seriesId' : service === 'radarr' ? 'movieId' : 'albumId';
                    const endpointPrefix = service === 'sonarr' ? '/api/v3/series/' : service === 'radarr' ? '/api/v3/movie/' : '/api/v1/album/';
                    const baseUrl = service === 'sonarr' ? config.sonarrUrl : service === 'radarr' ? config.radarrUrl : config.lidarrUrl;
                    const apiKey = service === 'sonarr' ? config.sonarrApiKey : service === 'radarr' ? config.radarrApiKey : config.lidarrApiKey;
                    const resolved = new Map();
                    const readMedia = async (id) => {
                        if (!id) return null;
                        if (!resolved.has(id)) resolved.set(id, fetchArr(baseUrl, apiKey, `${endpointPrefix}${encodeURIComponent(id)}`));
                        return resolved.get(id);
                    };
                    const episodeById = new Map();
                    const readEpisode = async (id) => {
                        if (!id || service !== 'sonarr') return null;
                        if (!episodeById.has(id)) {
                            episodeById.set(id, fetchArr(baseUrl, apiKey, `/api/v3/episode/${encodeURIComponent(id)}`));
                        }
                        return episodeById.get(id);
                    };
                    const hydrated = await Promise.all(records.map(async (record) => {
                        const currentMedia = record?.[mediaKey];
                        const needsMedia = !currentMedia?.title
                            || (service === 'radarr' && typeof currentMedia?.hasFile !== 'boolean')
                            || (service === 'lidarr' && currentMedia?.statistics?.trackFileCount === undefined);
                        const needsEpisode = service === 'sonarr' && typeof record?.episode?.hasFile !== 'boolean';
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
                    return Array.isArray(queue) ? hydrated : { ...(queue || {}), records: hydrated };
                };
                const [sonarrQueue, radarrQueue, lidarrQueue] = await Promise.all([
                    hydrateQueue(sonarrQueueRaw, 'sonarr'),
                    hydrateQueue(radarrQueueRaw, 'radarr'),
                    hydrateQueue(lidarrQueueRaw, 'lidarr'),
                ]);

                let sonarrCalendar = Array.isArray(sonarrCalendarRaw)
                    ? sonarrCalendarRaw
                    : (Array.isArray(sonarrCalendarRaw?.records) ? sonarrCalendarRaw.records : []);
                let radarrCalendar = Array.isArray(radarrCalendarRaw)
                    ? radarrCalendarRaw
                    : (Array.isArray(radarrCalendarRaw?.records) ? radarrCalendarRaw.records : []);

                if (sonarrCalendar.length === 0 && config.sonarrUrl && config.sonarrApiKey) {
                    const sonarrSeries = await fetchArr(config.sonarrUrl, config.sonarrApiKey, '/api/v3/series');
                    if (Array.isArray(sonarrSeries)) {
                        sonarrCalendar = sonarrSeries
                            .filter((series) => inTargetMonthRange(series?.nextAiring))
                            .map((series) => ({
                                id: `fallback-sonarr-${series.id}`,
                                title: 'Upcoming Episode',
                                airDateUtc: series.nextAiring,
                                airDate: series.nextAiring,
                                monitored: series.monitored !== false,
                                hasFile: false,
                                seasonNumber: 0,
                                episodeNumber: 0,
                                series: {
                                    title: series.title || 'Unknown Series',
                                    network: series.network || '',
                                    images: Array.isArray(series.images) ? series.images : []
                                }
                            }));
                    }
                }

                if (radarrCalendar.length === 0 && config.radarrUrl && config.radarrApiKey) {
                    const radarrMovies = await fetchArr(config.radarrUrl, config.radarrApiKey, '/api/v3/movie');
                    if (Array.isArray(radarrMovies)) {
                        radarrCalendar = radarrMovies
                            .map((movie) => {
                                const releaseDate = movie.digitalRelease || movie.physicalRelease || movie.inCinemas || movie.added || null;
                                return {
                                    ...movie,
                                    _releaseDate: releaseDate
                                };
                            })
                            .filter((movie) => inTargetMonthRange(movie._releaseDate));
                    }
                }

                return {
                    sonarr: {
                        configured: !!(config.sonarrUrl && config.sonarrApiKey),
                        status: sonarrStatus,
                        queue: sonarrQueue,
                        history: sonarrHistory,
                        disk: sonarrDisk,
                        calendar: sonarrCalendar
                    },
                    radarr: {
                        configured: !!(config.radarrUrl && config.radarrApiKey),
                        status: radarrStatus,
                        queue: radarrQueue,
                        history: radarrHistory,
                        disk: radarrDisk,
                        calendar: radarrCalendar
                    },
                    lidarr: {
                        configured: !!(config.lidarrUrl && config.lidarrApiKey),
                        status: lidarrStatus,
                        queue: lidarrQueue,
                        history: lidarrHistory,
                        disk: lidarrDisk
                    }
                };
            });
            res.json(data);
        } catch (e) {
            res.status(500).json({ error: 'Failed to fetch media stack summary' });
        }
    });

    const startCacheWarmer = () => {
        const warm = () => Promise.all([0, 1].map((offset) => loadWeekCalendar(offset))).catch(() => null);
        void warm();
        return setInterval(() => void warm(), 5 * 60 * 1000);
    };

    return { startCacheWarmer };
};
