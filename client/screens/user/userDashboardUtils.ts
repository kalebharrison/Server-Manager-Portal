import { logoUrl, portalUrl, resolvePortalAssetUrl } from '../../shared/basePath';

const HERO_MOVIE_SOURCE_LIMIT = 10;

export const wrapUpDaysOptions = [
    { value: 7, label: 'Last 7 Days' },
    { value: 30, label: 'Last 30 Days' },
    { value: 60, label: 'Last 60 Days' },
    { value: 90, label: 'Last 90 Days' },
    { value: 180, label: 'Last 180 Days' },
    { value: 'all', label: 'All Time' },
];

export const resolveHomeImage = (thumbUrl: string | null | undefined, fallback = logoUrl()) => {
    if (!thumbUrl) return fallback;
    if (thumbUrl.startsWith('http://') || thumbUrl.startsWith('https://') || thumbUrl.startsWith('/api/')) {
        return resolvePortalAssetUrl(thumbUrl);
    }
    return portalUrl(`/api/plex/image?path=${encodeURIComponent(thumbUrl)}&width=256&height=256`);
};

export const resolveHomePosterImage = (
    item: { thumbUrl?: string | null; thumb?: string | null } | null | undefined,
    width = 300,
    height = 450,
) => {
    const thumbUrl = item?.thumbUrl || null;
    if (thumbUrl) {
        if (thumbUrl.startsWith('http://') || thumbUrl.startsWith('https://') || thumbUrl.startsWith('/api/')) {
            return resolvePortalAssetUrl(thumbUrl);
        }
        return portalUrl(`/api/plex/image?path=${encodeURIComponent(thumbUrl)}&width=${width}&height=${height}`);
    }
    if (item?.thumb) {
        return portalUrl(`/api/plex/image?path=${encodeURIComponent(item.thumb)}&width=${width}&height=${height}`);
    }
    return '';
};

export const buildJellyfinHomeAnalytics = (data: any) => {
    const topMovies = Array.isArray(data?.topMovies) ? data.topMovies : [];
    const topShows = Array.isArray(data?.topShows) ? data.topShows : [];
    const topMusic = Array.isArray(data?.topMusic) ? data.topMusic : [];
    const topWatched = [...topShows, ...topMovies, ...topMusic].sort((a: any, b: any) => (b.plays || 0) - (a.plays || 0));
    const peakHours = Array.isArray(data?.peakHours) ? data.peakHours : [];
    const peakHour = peakHours.reduce((best: number, value: number, hour: number) => value > (peakHours[best] || 0) ? hour : best, 0);
    const moviesCount = data?.jellystatInsights?.moviePlays || topMovies.reduce((sum: number, item: any) => sum + (item.plays || 0), 0);
    const showsCount = data?.jellystatInsights?.tvPlays || topShows.reduce((sum: number, item: any) => sum + (item.plays || 0), 0);
    const musicCount = data?.jellystatInsights?.musicPlays || topMusic.reduce((sum: number, item: any) => sum + (item.plays || 0), 0);
    const topMovie = topMovies[0] || null;
    const topBinge = topShows[0] || null;
    const topLibraries = Array.isArray(data?.topLibraries) ? data.topLibraries : [];

    return {
        totalPlays: data?.totalPlaybacks || data?.jellystatInsights?.totalPlays || 0,
        moviesCount,
        showsCount,
        musicCount,
        topWatched,
        recentHistory: [],
        topMovie: topMovie ? { ...topMovie, artUrl: topMovie.thumbUrl } : null,
        topBinge: topBinge ? { ...topBinge, artUrl: topBinge.thumbUrl } : null,
        peakHour,
        avgHour: peakHour,
        timeOfDay: peakHour >= 5 && peakHour < 12 ? 'Early Bird' : peakHour >= 12 && peakHour < 18 ? 'Afternoon Watcher' : peakHour >= 18 ? 'Evening Streamer' : 'Night Owl',
        popularDay: 'Recent Activity',
        dayOfWeekCounts: {},
        favoriteLibrary: topLibraries[0]?.title || 'None',
        topLibraries,
        mediaPreference: moviesCount > showsCount ? 'Movie Fan' : 'TV Binger',
        watchStyle: topWatched.length >= 10 ? 'Explorer' : 'Focused',
        uniqueTitles: topWatched.length,
        streamingHabit: 'Jellyfin Viewer',
        weekdayPlays: data?.totalPlaybacks || 0,
        weekendPlays: 0,
        libraryHealth: data?.libraryHealth || null,
    };
};

export const buildHeroMovieColumns = (recentMovies: any[] | undefined) => {
    const movies = Array.isArray(recentMovies)
        ? recentMovies.filter((movie: any) => movie.thumb || movie.thumbUrl).slice(0, HERO_MOVIE_SOURCE_LIMIT)
        : [];
    if (movies.length === 0) return [];
    return Array.from({ length: 4 }, (_, colIdx) => {
        const shift = (colIdx * Math.max(1, Math.ceil(movies.length / 3))) % movies.length;
        const ordered = [...movies.slice(shift), ...movies.slice(0, shift)];
        return [...ordered, ...ordered];
    });
};
