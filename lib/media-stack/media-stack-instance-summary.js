import { annotate, hydrateQueue, recordsOf } from './media-stack-arr-helpers.js';

export const loadInstanceSummary = async (instance, start, end, inRange, fetchArr, { includeOps = false } = {}) => {
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
    const queue = await hydrateQueue(queueRaw, type, instance, fetchArr);
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
