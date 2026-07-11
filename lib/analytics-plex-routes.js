import fetch from 'node-fetch';

import {
    calculateDelta,
    getUniqueActiveViewers,
    obfuscateAnalyticsTopUser,
    summarizeLibraryHealth,
    shouldObfuscateAnalyticsViewers,
    sumLibraryPlays,
    toNumber,
} from './analytics-shared.js';
import {
    fetchPlexAccountHistory,
    fetchPlexAccountHistoryPage,
    historyFetchLimitForPeriod,
    resolveHistoryCutoff,
} from './analytics-plex-history-service.js';
import { registerPlexPersonalAnalyticsRoutes } from './analytics-plex-personal-routes.js';

export const registerPlexAnalyticsRoutes = ({
    app,
    requireAuth,
    requireMember,
    requireAdmin,
    configPath,
    usersPath,
    analyticsCachePath,
    trendingCachePath,
    plexStatsCachePath,
    loadFile,
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
    const {
        getHourInTimezone,
        getWeekdayInTimezone,
        fetchTautulliTimezone,
        fetchTautulliUsers,
        resolveTautulliUserId,
    } = tautulli;

    app.get('/api/plex/analytics', requireAuth, requireMember, async (req, res) => {
        try {
            const statsData = await loadFile(ANALYTICS_CACHE_PATH, {});
            const reqDays = req.query.days || 30;
            const hasRequestedPeriod = statsData[reqDays] != null;
            const cachedPeriod = hasRequestedPeriod ? reqDays : (statsData[30] != null ? 30 : null);
            const cachedData = statsData[reqDays] || statsData[30] || { topUsers: [], topLibraries: [], topMovies: [], topShows: [], topMusic: [], topDevices: [], peakHours: new Array(24).fill(0), totalPlaybacks: 0 };
            
            const config = await loadFile(CONFIG_PATH, {});
            const shouldObfuscateUsernames = shouldObfuscateAnalyticsViewers(req.user, config);
            const topUsers = (cachedData.topUsers || []).map((user, index) => obfuscateAnalyticsTopUser({
                ...user,
                username: user.username || `User ${index + 1}`,
            }, index, shouldObfuscateUsernames));
            const data = {
                ...cachedData,
                topUsers,
                requestedPeriodDays: reqDays,
                cachePeriodDays: cachedPeriod,
                cacheFallback: cachedPeriod != null && String(cachedPeriod) !== String(reqDays),
            };
            
            // attach max stats dynamically
            const stats = await loadFile(PLEX_STATS_CACHE_PATH, {});
            if (stats.episodes === undefined || stats.resolutions === undefined) {
                buildPlexStatsCache().catch(() => {});
            }
            data.maxConcurrentStreams = stats.maxConcurrentStreams || 0;
            data.maxDirectPlays = stats.maxDirectPlays || 0;
            data.maxTranscodes = stats.maxTranscodes || 0;
            data.libraryHealth = summarizeLibraryHealth(data.topLibraries || [], stats, cachedData);
    
            const priorPeriod = cachedData.priorPeriod;
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
            } else {
                data.compare = null;
            }
    
            res.json(data);
        } catch (e) {
            log(`Error fetching analytics: ${e.message}`);
            res.status(500).json({ error: 'Analytics error' });
        }
    });
    
    registerPlexPersonalAnalyticsRoutes({
        app,
        requireAuth,
        requireMember,
        configPath: CONFIG_PATH,
        usersPath: USERS_PATH,
        trendingCachePath: TRENDING_CACHE_PATH,
        loadFile,
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
    
    app.get('/api/plex/analytics/user/:id/history', requireAdmin, async (req, res) => {
        try {
            const config = await loadFile(CONFIG_PATH, null);
            if (!config || !config.plexToken || !config.serverIdentifier) return res.status(503).json({ error: 'Plex not configured' });
    
            const uri = await getPlexConnectionUri(config);
            if (!uri) return res.status(503).json({ error: 'Cannot connect to Plex' });
    
            const accountID = req.params.id;
            const page = Math.max(1, parseInt(req.query.page, 10) || 1);
            const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 15));
            const search = (req.query.search || '').trim().toLowerCase();
    
            let historyData = [];
            let totalRecords = 0;
    
            let usedTautulli = false;
            if (config.tautulliUrl && config.tautulliApiKey) {
                const tUrl = resolveIntegrationUrlForFetch(config.tautulliUrl);
                const { list: plexAccounts } = await fetchPlexServerAccounts(uri, config);
                const plexAccountName = plexAccounts.find((a) => String(a.id) === String(accountID))?.name || null;
                
                const users = await loadFile(USERS_PATH, []);
                const targetUser = users.find(u => String(u.plexAccountId) === String(accountID));
                const tUsers = await fetchTautulliUsers(config);
                const tautulliUserId = resolveTautulliUserId(tUsers, { username: targetUser?.username, email: targetUser?.email, plexAccountName });
    
                if (tautulliUserId) {
                    const params = new URLSearchParams({
                        apikey: config.tautulliApiKey,
                        cmd: 'get_history',
                        order_column: 'date',
                        order_dir: 'desc',
                        start: String((page - 1) * limit),
                        length: String(limit),
                        user_id: String(tautulliUserId),
                        search: search
                    });
                    const tRes = await fetch(`${tUrl}/api/v2?${params.toString()}`, { headers: { Accept: 'application/json' } })
                        .then(r => r.json()).catch(() => null);
                    
                    if (tRes && tRes.response && tRes.response.data && tRes.response.data.data) {
                        totalRecords = tRes.response.data.recordsFiltered;
                        historyData = tRes.response.data.data.map(item => ({
                            title: item.title,
                            parentTitle: item.grandparent_title || item.parent_title,
                            type: item.media_type,
                            viewedAt: item.date,
                            thumbUrl: item.thumb ? plexImageUrl(item.thumb) : null,
                            duration: item.duration,
                            percentComplete: item.percent_complete
                        }));
                        usedTautulli = true;
                    }
                }
            }
    
            if (!usedTautulli) {
                const mapHistoryToRecent = (item) => ({
                    title: item.type === 'episode' ? (item.grandparentTitle || item.parentTitle || item.title) : item.type === 'track' ? (item.parentTitle || item.grandparentTitle || item.title) : item.title,
                    episodeTitle: item.type === 'episode' || item.type === 'track' ? item.title : null,
                    viewedAt: item.viewedAt,
                    type: item.type,
                    thumbUrl: item.thumb ? plexImageUrl(item.thumb) : null
                });

                if (!search) {
                    const pageData = await fetchPlexAccountHistoryPage(uri, config, accountID, {
                        start: (page - 1) * limit,
                        limit,
                    });
                    totalRecords = pageData.total;
                    historyData = pageData.items.map(mapHistoryToRecent);
                } else {
                    const allHistory = await fetchPlexAccountHistory(uri, config, accountID, { maxItems: 10000, log });
                    const filtered = allHistory.map(mapHistoryToRecent).filter(item =>
                        (item.title && item.title.toLowerCase().includes(search)) || 
                        (item.episodeTitle && item.episodeTitle.toLowerCase().includes(search))
                    );
                    totalRecords = filtered.length;
                    historyData = filtered.slice((page - 1) * limit, page * limit);
                }
            }
    
            res.json({
                data: historyData,
                total: totalRecords,
                page,
                limit,
                source: usedTautulli ? 'tautulli' : 'plex'
            });
        } catch (e) {
            log(`Error fetching user history API: ${e.message}`);
            res.status(500).json({ error: 'Failed to fetch history' });
        }
    });
    
    app.post('/api/plex/report-issue', requireAuth, requireMember, async (req, res) => {
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
    
    app.get('/api/plex/analytics/user/:id', requireAdmin, async (req, res) => {
        try {
            const config = await loadFile(CONFIG_PATH, null);
            if (!config || !config.plexToken || !config.serverIdentifier) return res.status(503).json({ error: 'Plex not configured' });
    
            const uri = await getPlexConnectionUri(config);
            if (!uri) return res.status(503).json({ error: 'Cannot connect to Plex' });
    
            const accountID = req.params.id;
            const cutoffDate = resolveHistoryCutoff(req.query.days, 30);
            const historyItems = await fetchPlexAccountHistory(uri, config, accountID, {
                maxItems: historyFetchLimitForPeriod(req.query.days, 30),
                stopBeforeTs: cutoffDate,
                log,
            });
            const sectionsRes = await fetch(`${uri}/library/sections?X-Plex-Token=${config.plexToken}`, { headers: { 'Accept': 'application/json' } }).then(r => r.json()).catch(() => null);
    
            if (!historyItems.length) {
                return res.json({ totalPlays: 0, topLibraries: [], topWatched: [], topMusic: [], recentHistory: [] });
            }
    
            const sectionsMap = {};
            if (sectionsRes && sectionsRes.MediaContainer && sectionsRes.MediaContainer.Directory) {
                sectionsRes.MediaContainer.Directory.forEach(s => sectionsMap[s.key] = s.title);
            }
    
            let totalPlays = 0;
            const libraryCounts = {};
            const contentCounts = {};
            const recentHistory = [];
    
            const dayOfWeekCounts = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
            const hourDistribution = new Array(24).fill(0);
            const statsTimezone = await fetchTautulliTimezone(config);
    
            historyItems.forEach(item => {
                if (cutoffDate > 0 && item.viewedAt < cutoffDate) return;
                totalPlays++;
    
                const hour = getHourInTimezone(item.viewedAt, statsTimezone);
                hourDistribution[hour]++;
    
                const day = getWeekdayInTimezone(item.viewedAt, statsTimezone);
                if (day >= 0 && day <= 6) dayOfWeekCounts[day]++;
    
                // Recent history
                if (recentHistory.length < 50) {
                    recentHistory.push({
                        title: item.type === 'episode' ? (item.grandparentTitle || item.parentTitle || item.title) : item.type === 'track' ? (item.parentTitle || item.grandparentTitle || item.title) : item.title,
                        episodeTitle: item.type === 'episode' || item.type === 'track' ? item.title : null,
                        viewedAt: item.viewedAt,
                        thumb: item.type === 'episode' ? (item.grandparentThumb || item.parentThumb || item.thumb) : item.type === 'track' ? (item.parentThumb || item.grandparentThumb || item.thumb) : item.thumb,
                        type: item.type,
                        plexUrl: `https://app.plex.tv/desktop/#!/server/${config.serverIdentifier}/details?key=${encodeURIComponent(item.key)}`
                    });
                }
    
                // Library aggregation
                if (item.librarySectionID) {
                    const libTitle = sectionsMap[item.librarySectionID] || `Library ${item.librarySectionID}`;
                    if (!libraryCounts[item.librarySectionID]) libraryCounts[item.librarySectionID] = { id: item.librarySectionID, title: libTitle, plays: 0 };
                    libraryCounts[item.librarySectionID].plays++;
                }
    
                // Content aggregation
                const contentKey = item.type === 'episode' ? (item.grandparentKey || item.parentKey || item.ratingKey) : item.type === 'track' ? (item.parentKey || item.grandparentKey || item.ratingKey) : item.ratingKey;
                    const contentTitle = item.type === 'episode' ? (item.grandparentTitle || item.parentTitle || item.title) : item.type === 'track' ? (item.parentTitle || item.grandparentTitle || item.title) : item.title;
                    const contentThumb = item.type === 'episode' ? (item.grandparentThumb || item.parentThumb || item.thumb) : item.type === 'track' ? (item.parentThumb || item.grandparentThumb || item.thumb) : item.thumb;
                    const contentArt = item.type === 'episode' ? (item.grandparentArt || item.parentArt || item.art) : item.type === 'track' ? (item.parentArt || item.grandparentArt || item.art) : item.art;
    
                if (contentKey) {
                    if (!contentCounts[contentKey]) {
                        contentCounts[contentKey] = {
                            key: contentKey,
                            title: contentTitle,
                            type: item.type === 'episode' ? 'show' : item.type === 'track' ? 'track' : item.type,
                            thumb: contentThumb,
                            art: contentArt,
                            plays: 0,
                            plexUrl: `https://app.plex.tv/desktop/#!/server/${config.serverIdentifier}/details?key=${encodeURIComponent('/library/metadata/' + contentKey.split('/').pop())}`
                        };
                    }
                    contentCounts[contentKey].plays++;
                }
            });
    
            const topLibraries = Object.values(libraryCounts).sort((a, b) => b.plays - a.plays).slice(0, 5);
            const topMovies = Object.values(contentCounts).filter(c => c.type === 'movie').sort((a, b) => b.plays - a.plays).slice(0, 6).map(c => {
                if (c.thumb) c.thumbUrl = plexImageUrl(c.thumb);
                if (c.art) c.artUrl = plexImageUrl(c.art);
                return c;
            });
            const topShows = Object.values(contentCounts).filter(c => c.type === 'show').sort((a, b) => b.plays - a.plays).slice(0, 6).map(c => {
                if (c.thumb) c.thumbUrl = plexImageUrl(c.thumb);
                if (c.art) c.artUrl = plexImageUrl(c.art);
                return c;
            });
            const topMusic = Object.values(contentCounts).filter(c => c.type === 'track').sort((a, b) => b.plays - a.plays).slice(0, 6).map(c => {
                if (c.thumb) c.thumbUrl = plexImageUrl(c.thumb);
                if (c.art) c.artUrl = plexImageUrl(c.art);
                return c;
            });
    
            res.json({
                totalPlays,
                topLibraries,
                topMovies,
                topShows,
                topMusic,
                dayOfWeekCounts,
                hourDistribution,
                recentHistory: recentHistory.map(h => {
                    if (h.thumb) h.thumbUrl = plexImageUrl(h.thumb);
                    return h;
                })
            });
        } catch (e) {
            log(`Error fetching user analytics: ${e.message}`);
            res.status(500).json({ error: 'Analytics error' });
        }
    });
};
