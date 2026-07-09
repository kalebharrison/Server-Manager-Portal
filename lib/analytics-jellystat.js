import { sumLibraryPlays, toNumber } from './analytics-shared.js';

export const registerJellystatAnalyticsRoutes = ({
    app,
    requireAuth,
    requireMember,
    configPath,
    loadFile,
    resolveIntegrationUrlForFetch,
    fetchWithTimeout,
    withBasePath,
    jellyfinItemUrl,
    isJellyfinConfigured,
    log,
}) => {
    const CONFIG_PATH = configPath;

    const normalizeAnalyticsDaysForJellystat = (days) => {
        if (String(days) === 'all') return 36500;
        return Math.min(Math.max(parseInt(days, 10) || 30, 1), 36500);
    };
    
    const jellystatHeaders = (apiKey) => ({
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-API-Token': apiKey,
    });
    
    const fetchJellystatJson = async (config, endpoint, { method = 'GET', body = null, query = null } = {}) => {
        if (!config?.jellystatUrl || !config?.jellystatApiKey) {
            throw new Error('Jellystat is not configured');
        }
        const baseUrl = resolveIntegrationUrlForFetch(config.jellystatUrl);
        const params = query ? `?${new URLSearchParams(query).toString()}` : '';
        const response = await fetchWithTimeout(`${baseUrl}${endpoint}${params}`, {
            method,
            headers: jellystatHeaders(config.jellystatApiKey),
            ...(body ? { body: JSON.stringify(body) } : {}),
        }, 15000);
        if (!response.ok) throw new Error(`Jellystat returned HTTP ${response.status} for ${endpoint}`);
        return response.json().catch(() => null);
    };
    
    const sumJellystatRowCounts = (row = {}) => Object.entries(row)
        .filter(([key]) => key !== 'Key')
        .reduce((sum, [, value]) => sum + toNumber(value?.count, 0), 0);
    
    const buildJellystatLibraryHealth = (topLibraries = [], overview = [], metadata = [], libraryTypeTotals = {}) => {
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
        const libraryPlays = sumLibraryPlays(topLibraries);
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
    
    const mapJellystatContent = (config, items = [], type = 'movie') => (Array.isArray(items) ? items : []).slice(0, 10).map((item) => ({
        key: item.Id || item.Name,
        title: item.Name || 'Untitled',
        type,
        thumb: item.Id || null,
        thumbUrl: item.Id ? withBasePath(`/api/jellyfin/image?itemId=${encodeURIComponent(item.Id)}&width=300&height=450`) : '',
        plays: toNumber(item.Plays ?? item.times_played ?? item.unique_viewers, 0),
        plexUrl: jellyfinItemUrl(config, item.Id),
    }));

    app.get('/api/jellystat/analytics', requireAuth, requireMember, async (req, res) => {
        try {
            const config = await loadFile(CONFIG_PATH, {});
            if (!isJellyfinConfigured(config)) {
                return res.status(503).json({ error: 'Jellyfin not configured' });
            }
            if (!config.jellystatUrl || !config.jellystatApiKey) {
                return res.status(503).json({ error: 'Jellystat is not configured' });
            }
    
            const requestedDays = req.query.days || 30;
            const days = normalizeAnalyticsDaysForJellystat(requestedDays);
            const postBody = { days };
            const [
                libraryTypeTotals,
                viewsByHour,
                libraryOverview,
                libraryMetadata,
                mostViewedLibraries,
                mostActiveUsers,
                mostUsedClients,
                mostViewedMovies,
                mostViewedShows,
                mostViewedMusic,
                playbackMethods,
            ] = await Promise.all([
                fetchJellystatJson(config, '/stats/getViewsByLibraryType', { query: { days } }).catch((e) => { log(e.message); return {}; }),
                fetchJellystatJson(config, '/stats/getViewsByHour', { query: { days } }).catch((e) => { log(e.message); return {}; }),
                fetchJellystatJson(config, '/stats/getLibraryOverview', { query: { days } }).catch((e) => { log(e.message); return []; }),
                fetchJellystatJson(config, '/stats/getLibraryMetadata').catch((e) => { log(e.message); return []; }),
                fetchJellystatJson(config, '/stats/getMostViewedLibraries', { method: 'POST', body: postBody }).catch((e) => { log(e.message); return []; }),
                fetchJellystatJson(config, '/stats/getMostActiveUsers', { method: 'POST', body: postBody }).catch((e) => { log(e.message); return []; }),
                fetchJellystatJson(config, '/stats/getMostUsedClient', { method: 'POST', body: postBody }).catch((e) => { log(e.message); return []; }),
                fetchJellystatJson(config, '/stats/getMostViewedByType', { method: 'POST', body: { ...postBody, type: 'Movie' } }).catch((e) => { log(e.message); return []; }),
                fetchJellystatJson(config, '/stats/getMostViewedByType', { method: 'POST', body: { ...postBody, type: 'Series' } }).catch((e) => { log(e.message); return []; }),
                fetchJellystatJson(config, '/stats/getMostViewedByType', { method: 'POST', body: { ...postBody, type: 'Audio' } }).catch((e) => { log(e.message); return []; }),
                fetchJellystatJson(config, '/stats/getPlaybackMethodStats', { method: 'POST', body: postBody }).catch((e) => { log(e.message); return []; }),
            ]);
    
            const peakHours = new Array(24).fill(0);
            if (Array.isArray(viewsByHour?.stats)) {
                viewsByHour.stats.forEach((row) => {
                    const hour = parseInt(row.Key, 10);
                    if (hour >= 0 && hour < 24) peakHours[hour] = sumJellystatRowCounts(row);
                });
            }
    
            const shouldObfuscateUsernames = !req.user?.isAdmin;
            const topUsers = (Array.isArray(mostActiveUsers) ? mostActiveUsers : []).map((user, index) => ({
                id: user.UserId || user.Id || user.Name || `user-${index}`,
                username: shouldObfuscateUsernames ? `Viewer ${index + 1}` : (user.Name || user.UserName || `User ${index + 1}`),
                thumb: user.UserId ? withBasePath(`/api/jellyfin/user-image?userId=${encodeURIComponent(user.UserId)}`) : null,
                plays: toNumber(user.Plays ?? user.TotalPlays, 0),
            }));
    
            const topLibraries = (Array.isArray(mostViewedLibraries) ? mostViewedLibraries : []).map((library, index) => ({
                id: library.Id || library.Name || `library-${index}`,
                title: library.Name || `Library ${index + 1}`,
                plays: toNumber(library.Plays ?? library.Count, 0),
            })).sort((a, b) => b.plays - a.plays).slice(0, 10);
    
            const topDevices = (Array.isArray(mostUsedClients) ? mostUsedClients : []).map((device, index) => ({
                name: device.Client || device.Name || `Client ${index + 1}`,
                plays: toNumber(device.Plays ?? device.Count, 0),
            })).sort((a, b) => b.plays - a.plays).slice(0, 10);
    
            const playbackCounts = {};
            (Array.isArray(playbackMethods) ? playbackMethods : []).forEach((method) => {
                playbackCounts[String(method.Name || '').toLowerCase()] = Math.max(playbackCounts[String(method.Name || '').toLowerCase()] || 0, toNumber(method.Count, 0));
            });
    
            const totalPlaybacks = sumLibraryPlays(topLibraries) || Object.values(libraryTypeTotals || {}).reduce((sum, value) => sum + toNumber(value, 0), 0);
            const libraryHealth = buildJellystatLibraryHealth(topLibraries, libraryOverview, libraryMetadata, libraryTypeTotals);
    
            res.json({
                topUsers,
                topLibraries,
                topMovies: mapJellystatContent(config, mostViewedMovies, 'movie'),
                topShows: mapJellystatContent(config, mostViewedShows, 'show'),
                topMusic: mapJellystatContent(config, mostViewedMusic, 'track'),
                topDevices,
                peakHours,
                totalPlaybacks,
                maxConcurrentStreams: 0,
                maxDirectPlays: toNumber(playbackCounts.directplay, 0),
                maxTranscodes: toNumber(playbackCounts.transcode, 0),
                compare: null,
                libraryHealth,
                requestedPeriodDays: requestedDays,
                cachePeriodDays: requestedDays,
                cacheFallback: false,
                source: 'jellystat',
                jellystatInsights: {
                    streamsRecord: 0,
                    transcodeRecord: toNumber(playbackCounts.transcode, 0),
                    directPlayRecord: toNumber(playbackCounts.directplay, 0),
                    directStreamRecord: toNumber(playbackCounts.directstream, 0),
                    totalPlays: totalPlaybacks,
                    tvPlays: toNumber(libraryTypeTotals.Series, 0),
                    moviePlays: toNumber(libraryTypeTotals.Movie, 0),
                    musicPlays: toNumber(libraryTypeTotals.Audio, 0),
                    totalTimeStr: '',
                },
            });
        } catch (e) {
            log(`Jellystat analytics error: ${e.message}`);
            res.status(500).json({ error: 'Failed to fetch Jellystat analytics' });
        }
    });
};
