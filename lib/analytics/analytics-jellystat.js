import {
    obfuscateAnalyticsTopUser,
    shouldObfuscateAnalyticsViewers,
    sumLibraryPlays,
    toNumber,
} from './analytics-shared.js';
import {
    buildJellystatLibraryHealth,
    createJellystatClient,
    mapJellystatContent,
    normalizeAnalyticsDaysForJellystat,
    sumJellystatRowCounts,
} from './analytics-jellystat-client.js';

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
    const { fetchJellystatJson } = createJellystatClient({
        resolveIntegrationUrlForFetch,
        fetchWithTimeout,
    });

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

            const shouldObfuscateUsernames = shouldObfuscateAnalyticsViewers(req.user);
            const topUsers = (Array.isArray(mostActiveUsers) ? mostActiveUsers : []).map((user, index) => obfuscateAnalyticsTopUser({
                id: user.UserId || user.Id || user.Name || `user-${index}`,
                username: user.Name || user.UserName || `User ${index + 1}`,
                thumb: user.UserId ? withBasePath(`/api/jellyfin/user-image?userId=${encodeURIComponent(user.UserId)}`) : null,
                plays: toNumber(user.Plays ?? user.TotalPlays, 0),
            }, index, shouldObfuscateUsernames));

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
            const contentMapper = (items, type) => mapJellystatContent(config, items, type, { withBasePath, jellyfinItemUrl });

            res.json({
                topUsers,
                topLibraries,
                topMovies: contentMapper(mostViewedMovies, 'movie'),
                topShows: contentMapper(mostViewedShows, 'show'),
                topMusic: contentMapper(mostViewedMusic, 'track'),
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
