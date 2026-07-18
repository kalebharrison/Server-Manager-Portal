import {
    calculateDelta,
    getUniqueActiveViewers,
    obfuscateAnalyticsTopUser,
    summarizeLibraryHealth,
    shouldObfuscateAnalyticsViewers,
    sumLibraryPlays,
    toNumber,
} from './analytics-shared.js';
import { registerPlexPersonalAnalyticsRoutes } from './analytics-plex-personal-routes.js';
import { registerPlexAdminAnalyticsRoutes } from './analytics-plex-admin-routes.js';
import { registerPlexReportIssueRoute } from './analytics-plex-report-issue-route.js';

export const registerPlexAnalyticsRoutes = ({
    app,
    requireAuth,
    requireMember,
    requireAdmin,
    configPath,
    usersPath,
    analyticsCachePath,
    personalAnalyticsCachePath,
    analyticsHistoryCachePath = null,
    trendingCachePath,
    plexStatsCachePath,
    loadFile,
    saveFile,
    getPlexConnectionUri,
    resolveIntegrationUrlForFetch,
    fetchPlexServerAccounts,
    resolveLocalPlexAccountId,
    resolveCurrentAdmin,
    plexImageUrl,
    getCachedPlexMetadata,
    setCachedPlexMetadata,
    buildPlexStatsCache,
    sendEmail,
    escapeHtmlAttr,
    tautulli,
    log,
}) => {
    const CONFIG_PATH = configPath;
    const USERS_PATH = usersPath;
    const ANALYTICS_CACHE_PATH = analyticsCachePath;
    const TRENDING_CACHE_PATH = trendingCachePath;
    const PLEX_STATS_CACHE_PATH = plexStatsCachePath;

    app.get('/api/plex/analytics', requireAuth, requireMember, async (req, res) => {
        try {
            const statsData = await loadFile(ANALYTICS_CACHE_PATH, {});
            const reqDays = req.query.days || 30;
            const hasRequestedPeriod = statsData[reqDays] != null;
            const cachedPeriod = hasRequestedPeriod ? reqDays : (statsData[30] != null ? 30 : null);
            const cachedData = statsData[reqDays] || statsData[30] || { topUsers: [], topLibraries: [], topMovies: [], topShows: [], topMusic: [], topDevices: [], peakHours: new Array(24).fill(0), totalPlaybacks: 0 };
            
            const shouldObfuscateUsernames = shouldObfuscateAnalyticsViewers(req.user);
            const users = shouldObfuscateUsernames ? await loadFile(USERS_PATH, []) : [];
            const hiddenIds = shouldObfuscateUsernames
                ? new Set(users.filter((user) => user?.hideFromLeaderboards === true).flatMap((user) => [String(user.id || ''), String(user.plexId || '')].filter(Boolean)))
                : null;
            const visibleTopUsers = (cachedData.topUsers || []).filter((user) => (
                !hiddenIds || !hiddenIds.has(String(user.id || ''))
            ));
            const topUsers = visibleTopUsers.map((user, index) => obfuscateAnalyticsTopUser({
                ...user,
                username: user.username || `User ${index + 1}`,
            }, index, shouldObfuscateUsernames));
            const { priorPeriod, ...publicCachedData } = cachedData;
            const data = {
                ...publicCachedData,
                topUsers,
                requestedPeriodDays: reqDays,
                cachePeriodDays: cachedPeriod,
                cacheFallback: cachedPeriod != null && String(cachedPeriod) !== String(reqDays),
            };
            
            const stats = await loadFile(PLEX_STATS_CACHE_PATH, {});
            if (stats.episodes === undefined || stats.resolutions === undefined) {
                buildPlexStatsCache().catch(() => {});
            }
            data.maxConcurrentStreams = stats.maxConcurrentStreams || 0;
            data.maxDirectPlays = stats.maxDirectPlays || 0;
            data.maxTranscodes = stats.maxTranscodes || 0;
            data.libraryHealth = summarizeLibraryHealth(data.topLibraries || [], stats, cachedData);
    
            if (priorPeriod && reqDays !== 'all') {
                const currentUniqueViewers = getUniqueActiveViewers(cachedData.topUsers || []);
                const priorUniqueViewers = getUniqueActiveViewers(priorPeriod.topUsers || []);
                const currentLibraryPlays = sumLibraryPlays(cachedData.topLibraries);
                const priorLibraryPlays = sumLibraryPlays(priorPeriod.topLibraries);
    
                data.compare = {
                    previousPeriodDays: String(reqDays),
                    totalPlaybacks: calculateDelta(toNumber(data.totalPlaybacks, 0), priorPeriod.totalPlaybacks),
                    uniqueViewers: calculateDelta(currentUniqueViewers, priorUniqueViewers),
                    libraryPlays: calculateDelta(currentLibraryPlays, priorLibraryPlays)
                };
                if (!shouldObfuscateUsernames) data.priorPeriod = priorPeriod;
            } else {
                data.compare = null;
            }
    
            res.json(data);
        } catch (e) {
            log(`Error fetching analytics: ${e.message}`);
            res.status(500).json({ error: 'Analytics error' });
        }
    });
    
    const personalAnalyticsCache = registerPlexPersonalAnalyticsRoutes({
        app,
        requireAuth,
        requireMember,
        configPath: CONFIG_PATH,
        usersPath: USERS_PATH,
        trendingCachePath: TRENDING_CACHE_PATH,
        personalAnalyticsCachePath,
        analyticsHistoryCachePath,
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
        log,
    });

    registerPlexAdminAnalyticsRoutes({
        app,
        requireAdmin,
        configPath: CONFIG_PATH,
        usersPath: USERS_PATH,
        loadFile,
        getPlexConnectionUri,
        resolveIntegrationUrlForFetch,
        fetchPlexServerAccounts,
        plexImageUrl,
        tautulli,
        log,
    });

    registerPlexReportIssueRoute({
        app,
        requireAuth,
        requireMember,
        configPath: CONFIG_PATH,
        loadFile,
        sendEmail,
        escapeHtmlAttr,
        log,
    });

    return personalAnalyticsCache;
};
