import { toNumber } from './analytics-shared.js';

export const normalizeAnalyticsDaysForJellystat = (days) => {
    if (String(days) === 'all') return 36500;
    return Math.min(Math.max(parseInt(days, 10) || 30, 1), 36500);
};

export const jellystatHeaders = (apiKey) => ({
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'X-API-Token': apiKey,
});

export const createJellystatClient = ({
    resolveIntegrationUrlForFetch,
    fetchWithTimeout,
}) => {
    const fetchJellystatJson = async (config, endpoint, { method = 'GET', body = null, query = null } = {}) => {
        if (!config?.jellystatUrl || !config?.jellystatApiKey) {
            throw new Error('Jellystat is not configured');
        }
        const baseUrl = await resolveIntegrationUrlForFetch(config.jellystatUrl);
        const params = query ? `?${new URLSearchParams(query).toString()}` : '';
        const response = await fetchWithTimeout(`${baseUrl}${endpoint}${params}`, {
            method,
            headers: jellystatHeaders(config.jellystatApiKey),
            ...(body ? { body: JSON.stringify(body) } : {}),
        }, 15000);
        if (!response.ok) throw new Error(`Jellystat returned HTTP ${response.status} for ${endpoint}`);
        return response.json().catch(() => null);
    };

    return { fetchJellystatJson };
};

export const sumJellystatRowCounts = (row = {}) => Object.entries(row)
    .filter(([key]) => key !== 'Key')
    .reduce((sum, [, value]) => sum + toNumber(value?.count, 0), 0);

export const buildJellystatLibraryHealth = (topLibraries = [], overview = [], metadata = [], libraryTypeTotals = {}) => {
    const metadataById = new Map((Array.isArray(metadata) ? metadata : []).map((item) => [String(item.Id), item]));
    const libraries = Array.isArray(overview) ? overview : [];
    const totalCatalogBytes = libraries.reduce((sum, lib) => sum + toNumber(metadataById.get(String(lib.Id))?.Size, 0), 0);
    const movies = libraries
        .filter((lib) => String(lib.CollectionType || '').toLowerCase() === 'movies')
        .reduce((sum, lib) => sum + toNumber(lib.Library_Count, 0), 0);
    const shows = libraries
        .filter((lib) => String(lib.CollectionType || '').toLowerCase() === 'tvshows')
        .reduce((sum, lib) => sum + toNumber(lib.Library_Count, 0), 0);
    const episodes = libraries.reduce((sum, lib) => sum + toNumber(lib.Episode_Count, 0), 0);
    const libraryPlays = topLibraries.reduce((sum, lib) => sum + toNumber(lib.plays, 0), 0);
    const leadingLibraryPlays = toNumber(topLibraries?.[0]?.plays, 0);
    const concentrationPct = libraryPlays > 0 ? Number(((leadingLibraryPlays / libraryPlays) * 100).toFixed(1)) : 0;
    const activeLibraries = topLibraries.filter((lib) => toNumber(lib.plays, 0) > 0).length;
    const watchedItemsEstimate = toNumber(libraryTypeTotals.Movie, 0) + toNumber(libraryTypeTotals.Series, 0) + toNumber(libraryTypeTotals.Audio, 0);
    const totalPlayableItems = movies + episodes;
    const catalogWatchedPct = totalPlayableItems > 0 ? Number(((watchedItemsEstimate / totalPlayableItems) * 100).toFixed(1)) : 0;
    let healthLabel = 'Concentrated';
    if (activeLibraries >= 5 && concentrationPct <= 55) healthLabel = 'Balanced';
    if (activeLibraries >= 8 && concentrationPct <= 40) healthLabel = 'Excellent';

    return {
        activeLibraries,
        concentrationPct,
        totalCatalogItems: movies + shows,
        totalCatalogBytes,
        sizeGB: Number((totalCatalogBytes / (1024 * 1024 * 1024)).toFixed(1)),
        fourKPercent: 0,
        healthLabel,
        catalogWatchedPct,
        movies,
        shows,
        episodes,
        artists: 0,
        albums: 0,
        tracks: 0,
    };
};

export const mapJellystatContent = (config, items = [], type = 'movie', { withBasePath, jellyfinItemUrl }) => (Array.isArray(items) ? items : []).slice(0, 10).map((item) => ({
    key: item.Id || item.Name,
    title: item.Name || 'Untitled',
    type,
    thumb: item.Id || null,
    thumbUrl: item.Id ? withBasePath(`/api/jellyfin/image?itemId=${encodeURIComponent(item.Id)}&width=300&height=450`) : '',
    plays: toNumber(item.Plays ?? item.times_played ?? item.unique_viewers, 0),
    plexUrl: jellyfinItemUrl(config, item.Id),
}));
