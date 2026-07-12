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

    app.get('/api/media-stack/summary', requireAuth, requireMember, async (req, res) => {
        try {
            const rawMonthOffset = parseInt(req.query.monthOffset, 10) || 0;
            const monthOffset = Math.max(-24, Math.min(rawMonthOffset, 24));
            const config = await loadFile(CONFIG_PATH, {});
            const cacheKey = scopedCacheKey('media-stack-summary', [config.sonarrUrl, config.sonarrApiKey, config.radarrUrl, config.radarrApiKey, monthOffset]);
            const data = await withCache(cacheKey, 60000, async () => {
                const fetchArr = async (url, key, endpoint) => {
                    if (!url || !key) return null;
                    try {
                        // Media Stack integrations are admin-configured server-to-server URLs.
                        // Allow private network hosts here so local Sonarr/Radarr instances work.
                        const safeBaseUrl = normalizeExternalBaseUrl(url, { allowPrivate: true, allowHttp: true });
                        const u = new URL(endpoint, safeBaseUrl);
                        const response = await fetch(u.toString(), {
                            headers: { 'X-Api-Key': key }
                        });
                        if (!response.ok) return null;
                        return await response.json();
                    } catch (e) {
                        return null;
                    }
                };

                const targetDate = new Date();
                targetDate.setMonth(targetDate.getMonth() + monthOffset);

                const firstDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
                const lastDay = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0);
                const toLocalYmd = (date) => {
                    const y = date.getFullYear();
                    const m = String(date.getMonth() + 1).padStart(2, '0');
                    const d = String(date.getDate()).padStart(2, '0');
                    return `${y}-${m}-${d}`;
                };
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

                const [sonarrStatus, sonarrQueueRaw, sonarrHistory, sonarrDisk, sonarrCalendarRaw, radarrStatus, radarrQueueRaw, radarrHistory, radarrDisk, radarrCalendarRaw] = await Promise.all([
                    fetchArr(config.sonarrUrl, config.sonarrApiKey, '/api/v3/system/status'),
                    fetchArr(config.sonarrUrl, config.sonarrApiKey, '/api/v3/queue?page=1&pageSize=100&includeSeries=true&includeEpisode=true'),
                    fetchArr(config.sonarrUrl, config.sonarrApiKey, '/api/v3/history?page=1&pageSize=10&includeSeries=true&includeEpisode=true'),
                    fetchArr(config.sonarrUrl, config.sonarrApiKey, '/api/v3/diskspace'),
                    fetchArr(config.sonarrUrl, config.sonarrApiKey, `/api/v3/calendar?start=${start}&end=${end}&includeSeries=true&includeEpisode=true&unmonitored=true`),
                    fetchArr(config.radarrUrl, config.radarrApiKey, '/api/v3/system/status'),
                    fetchArr(config.radarrUrl, config.radarrApiKey, '/api/v3/queue?page=1&pageSize=100&includeMovie=true'),
                    fetchArr(config.radarrUrl, config.radarrApiKey, '/api/v3/history?page=1&pageSize=10&includeMovie=true'),
                    fetchArr(config.radarrUrl, config.radarrApiKey, '/api/v3/diskspace'),
                    fetchArr(config.radarrUrl, config.radarrApiKey, `/api/v3/calendar?start=${start}&end=${end}&unmonitored=true`)
                ]);

                // Arr queue payloads vary by version. Hydrate incomplete media records so the UI
                // can classify upgrades from the authoritative movie/episode hasFile state.
                const hydrateQueue = async (queue, service) => {
                    const records = Array.isArray(queue?.records) ? queue.records : Array.isArray(queue) ? queue : [];
                    const mediaKey = service === 'sonarr' ? 'series' : 'movie';
                    const idKey = service === 'sonarr' ? 'seriesId' : 'movieId';
                    const endpointPrefix = service === 'sonarr' ? '/api/v3/series/' : '/api/v3/movie/';
                    const baseUrl = service === 'sonarr' ? config.sonarrUrl : config.radarrUrl;
                    const apiKey = service === 'sonarr' ? config.sonarrApiKey : config.radarrApiKey;
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
                        const needsMedia = !currentMedia?.title || (service === 'radarr' && typeof currentMedia?.hasFile !== 'boolean');
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
                const [sonarrQueue, radarrQueue] = await Promise.all([
                    hydrateQueue(sonarrQueueRaw, 'sonarr'),
                    hydrateQueue(radarrQueueRaw, 'radarr'),
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
                    }
                };
            });
            res.json(data);
        } catch (e) {
            res.status(500).json({ error: 'Failed to fetch media stack summary' });
        }
    });

};
