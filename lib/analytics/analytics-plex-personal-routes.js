
import {
    createAnalyticsHistoryStore,
} from './analytics-plex-history-service.js';
import { createPersonalAnalyticsCache } from './personal-analytics-cache.js';
import { buildPersonalAnalytics } from './personal-analytics-builder.js';
import {
    buildPrivateLeaderboardNeighbourhood,
    buildRecentHistory,
    emptyPersonalAnalytics,
    normalizeAnalyticsPeriod,
} from './personal-analytics-helpers.js';

export { buildPrivateLeaderboardNeighbourhood, buildRecentHistory };

export const registerPlexPersonalAnalyticsRoutes = ({
    app,
    requireAuth,
    requireMember,
    configPath,
    usersPath,
    trendingCachePath,
    personalAnalyticsCachePath,
    analyticsHistoryCachePath = null,
    loadFile,
    saveFile,
    getPlexConnectionUri,
    fetchPlexServerAccounts,
    resolveLocalPlexAccountId,
    resolveCurrentAdmin,
    plexImageUrl,
    getCachedPlexMetadata,
    setCachedPlexMetadata,
    tautulli,
    plexImageService = null,
    log,
}) => {
    const CONFIG_PATH = configPath;
    const USERS_PATH = usersPath;
    const TRENDING_CACHE_PATH = trendingCachePath;

    const personalCache = createPersonalAnalyticsCache({
        cachePath: personalAnalyticsCachePath,
        loadFile,
        saveFile,
        log,
    });
    const historyStore = analyticsHistoryCachePath
        ? createAnalyticsHistoryStore({
            historyCachePath: analyticsHistoryCachePath,
            loadFile,
            saveFile,
            log,
        })
        : null;

    app.get('/api/plex/analytics/me', requireAuth, requireMember, async (req, res) => {
        try {
            const config = await loadFile(CONFIG_PATH, null);
            if (!config || !config.plexToken || !config.serverIdentifier) return res.status(503).json({ error: 'Plex not configured' });

            const uri = await getPlexConnectionUri(config);
            if (!uri) return res.status(503).json({ error: 'Cannot connect to Plex' });

            const sessionUser = { ...req.user, isAdmin: await resolveCurrentAdmin(req.user, config) };
            const accountID = await resolveLocalPlexAccountId(config, uri, sessionUser);
            if (!accountID) return res.json(emptyPersonalAnalytics());

            const period = normalizeAnalyticsPeriod(req.query.days);
            // Cache key includes period + primary account; builder expands aliases (owner=1, etc.).
            const identity = { serverIdentifier: config.serverIdentifier, accountId: `${accountID}:aliases`, period };
            const data = await personalCache.get(identity, () => buildPersonalAnalytics({
                config,
                uri,
                accountID,
                sessionUser,
                period,
                historyStore,
                loadFile,
                usersPath: USERS_PATH,
                trendingCachePath: TRENDING_CACHE_PATH,
                fetchPlexServerAccounts,
                plexImageUrl,
                getCachedPlexMetadata,
                setCachedPlexMetadata,
                tautulli,
                log,
            }));
            if (plexImageService?.warmPersonalAnalytics) {
                void plexImageService.warmPersonalAnalytics(config, uri, data);
            }
            res.json(data);
        } catch (e) {
            log(`Error fetching personal analytics: ${e.message}`);
            res.status(500).json({ error: 'Analytics error' });
        }
    });

    return { startPersonalAnalyticsCacheWarmer: personalCache.start };
};
