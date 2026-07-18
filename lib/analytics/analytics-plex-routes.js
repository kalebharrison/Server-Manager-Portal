import { blockIfImpersonating } from '../auth/impersonation.js';

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
    
    app.post('/api/plex/report-issue', requireAuth, requireMember, async (req, res) => {
        if (blockIfImpersonating(req, res)) return;
        try {
            const config = await loadFile(CONFIG_PATH, null);
            if (!config || !config.smtpUser) return res.status(503).json({ error: 'SMTP not configured' });

            const { title, key, issue } = req.body;
            if (!title || !issue) return res.status(400).json({ error: 'Missing title or issue' });

            const safeTitle = escapeHtmlAttr(String(title || ''));
            const safeKey = key ? escapeHtmlAttr(String(key)) : '';
            const safeUsername = escapeHtmlAttr(String(req.user.username || 'Unknown'));
            const safeIssue = escapeHtmlAttr(String(issue || '')).replace(/\n/g, '<br/>');
            const subject = `Plex Issue Report: ${String(title || '').slice(0, 120)}`;
            const html = `
                <h2>Issue Reported by ${safeUsername}</h2>
                <p><strong>Media:</strong> ${safeTitle}</p>
                ${safeKey ? `<p><strong>Key:</strong> ${safeKey}</p>` : ''}
                <p><strong>User's Note:</strong></p>
                <blockquote style="background: #f9f9f9; padding: 10px; border-left: 5px solid #E5A00D;">
                    ${safeIssue}
                </blockquote>
            `;

            await sendEmail(config, config.smtpUser, subject, html);
            res.json({ success: true });
        } catch (e) {
            log(`Error reporting issue: ${e.message}`);
            res.status(500).json({ error: 'Failed to report issue' });
        }
    });

    return personalAnalyticsCache;
};
