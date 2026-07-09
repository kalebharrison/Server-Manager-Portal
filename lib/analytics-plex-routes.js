import fetch from 'node-fetch';

import {
    calculateDelta,
    getUniqueActiveViewers,
    summarizeLibraryHealth,
    sumLibraryPlays,
    toNumber,
} from './analytics-shared.js';

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
        resolvePeakHour,
        resolveTimeOfDayPersona,
        fetchTautulliTimezone,
        fetchTautulliUsers,
        resolveTautulliUserId,
        resolveTautulliHourStats,
    } = tautulli;

    const fetchPlexAccountHistory = async (uri, config, accountID, { maxItems = 250000 } = {}) => {
        const pageSize = 5000;
        let historyItems = [];
        let start = 0;
    
        while (start < maxItems) {
            const pageRes = await fetch(
                `${uri}/status/sessions/history/all?accountID=${accountID}&X-Plex-Token=${config.plexToken}&sort=viewedAt:desc&X-Plex-Container-Start=${start}&X-Plex-Container-Size=${pageSize}`,
                { headers: { Accept: 'application/json' } },
            ).then((r) => r.json()).catch(() => null);
    
            const pageContainer = pageRes?.MediaContainer;
            const pageItems = Array.isArray(pageContainer?.Metadata) ? pageContainer.Metadata : [];
            if (pageItems.length === 0) break;
    
            historyItems = historyItems.concat(pageItems);
            start += pageItems.length;
    
            const totalSize = Number(pageContainer.totalSize || 0);
            if ((totalSize > 0 && start >= totalSize) || pageItems.length < pageSize) break;
        }
    
        if (historyItems.length >= maxItems) {
            log(`Personal analytics history fetch reached safety cap (${maxItems}) for account ${accountID}.`);
        }
    
        return historyItems;
    };
    
    app.get('/api/plex/analytics', requireAuth, requireMember, async (req, res) => {
        try {
            const statsData = await loadFile(ANALYTICS_CACHE_PATH, {});
            const reqDays = req.query.days || 30;
            const hasRequestedPeriod = statsData[reqDays] != null;
            const cachedPeriod = hasRequestedPeriod ? reqDays : (statsData[30] != null ? 30 : null);
            const cachedData = statsData[reqDays] || statsData[30] || { topUsers: [], topLibraries: [], topMovies: [], topShows: [], topMusic: [], topDevices: [], peakHours: new Array(24).fill(0), totalPlaybacks: 0 };
            
            const config = await loadFile(CONFIG_PATH, {});
            const showUsernames = !!config.showUsernamesInAnalytics;
            const shouldObfuscateUsernames = !req.user?.isAdmin && !showUsernames;
            const topUsers = (cachedData.topUsers || []).map((user, index) => ({
                ...user,
                username: shouldObfuscateUsernames ? `Viewer ${index + 1}` : (user.username || `User ${index + 1}`)
            }));
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
    
    app.get('/api/plex/analytics/me', requireAuth, requireMember, async (req, res) => {
        try {
            const config = await loadFile(CONFIG_PATH, null);
            if (!config || !config.plexToken || !config.serverIdentifier) return res.status(503).json({ error: 'Plex not configured' });
    
            const uri = await getPlexConnectionUri(config);
            if (!uri) return res.status(503).json({ error: 'Cannot connect to Plex' });
    
            req.user.isAdmin = await resolveCurrentAdmin(req.user, config);
            const accountID = await resolveLocalPlexAccountId(config, uri, req.user);
    
            if (!accountID) {
                return res.json({ totalPlays: 0, topLibraries: [], topWatched: [], topMusic: [], recentHistory: [] });
            }
    
            const historyItems = await fetchPlexAccountHistory(uri, config, accountID);
            const sectionsRes = await fetch(`${uri}/library/sections?X-Plex-Token=${config.plexToken}`, { headers: { 'Accept': 'application/json' } }).then(r => r.json()).catch(() => null);
    
            if (!historyItems.length) {
                return res.json({ totalPlays: 0, topLibraries: [], topWatched: [], topMusic: [], recentHistory: [] });
            }
    
            const sectionsMap = {};
            if (sectionsRes && sectionsRes.MediaContainer && sectionsRes.MediaContainer.Directory) {
                sectionsRes.MediaContainer.Directory.forEach(s => sectionsMap[s.key] = s.title);
            }
    
            let cutoffDate = 0;
            if (req.query.days && req.query.days !== 'all') {
                const days = parseInt(req.query.days, 10) || 30;
                cutoffDate = Math.floor(Date.now() / 1000) - (days * 24 * 60 * 60);
            } else if (!req.query.days) {
                cutoffDate = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);
            }
    
            let totalPlays = 0;
            const libraryCounts = {};
            const contentCounts = {};
    
            const mapHistoryToRecent = (item) => ({
                title: item.type === 'episode' ? (item.grandparentTitle || item.parentTitle || item.title) : item.type === 'track' ? (item.parentTitle || item.grandparentTitle || item.title) : item.title,
                episodeTitle: item.type === 'episode' || item.type === 'track' ? item.title : null,
                viewedAt: item.viewedAt,
                thumb: item.type === 'episode' ? (item.grandparentThumb || item.parentThumb || item.thumb) : item.type === 'track' ? (item.parentThumb || item.grandparentThumb || item.thumb) : item.thumb,
                type: item.type,
                plexUrl: `https://app.plex.tv/desktop/#!/server/${config.serverIdentifier}/details?key=${encodeURIComponent(item.key)}`
            });
            const recentHistory = historyItems.slice(0, 50).map(mapHistoryToRecent);
    
            let plexTotalHourOfDay = 0;
            let plexHourCount = 0;
            const plexHourDistribution = new Array(24).fill(0);
            let totalHourOfDay = 0;
            let hourCount = 0;
            const hourDistribution = new Array(24).fill(0);
    
            const dayOfWeekCounts = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
            let moviesCount = 0;
            let showsCount = 0;
            let musicCount = 0;
    
            const statsTimezone = await fetchTautulliTimezone(config);
            const { list: plexAccounts } = await fetchPlexServerAccounts(uri, config);
            const plexAccountName = plexAccounts.find((a) => String(a.id) === String(accountID))?.name || null;
    
            historyItems.forEach(item => {
                if (cutoffDate > 0 && item.viewedAt < cutoffDate) return;
                totalPlays++;
    
                const hour = getHourInTimezone(item.viewedAt, statsTimezone);
                plexTotalHourOfDay += hour;
                plexHourCount++;
                plexHourDistribution[hour]++;
                dayOfWeekCounts[getWeekdayInTimezone(item.viewedAt, statsTimezone)]++;
    
                if (item.type === 'movie') moviesCount++;
                else if (item.type === 'episode') showsCount++;
                else if (item.type === 'track') musicCount++;
    
                if (item.librarySectionID) {
                    const libTitle = sectionsMap[item.librarySectionID] || `Library ${item.librarySectionID}`;
                    if (!libraryCounts[item.librarySectionID]) libraryCounts[item.librarySectionID] = { id: item.librarySectionID, title: libTitle, plays: 0 };
                    libraryCounts[item.librarySectionID].plays++;
                }
    
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
    
            const allUsersMap = await loadFile(USERS_PATH, []);
            const targetDbUser = allUsersMap.find(u => String(u.plexAccountId) === String(accountID));
    
            const tautulliHourStats = await resolveTautulliHourStats(config, {
                username: targetDbUser?.username,
                email: targetDbUser?.email,
                plexAccountName,
                days: req.query.days || 30,
                afterUnixSec: cutoffDate,
                maxItems: historyItems.length,
                plexPlayCount: totalPlays,
            });
            if (tautulliHourStats?.hourCount > 0) {
                totalHourOfDay = tautulliHourStats.totalHourOfDay;
                hourCount = tautulliHourStats.hourCount;
                hourDistribution.splice(0, 24, ...tautulliHourStats.hourDistribution);
            } else {
                totalHourOfDay = plexTotalHourOfDay;
                hourCount = plexHourCount;
                hourDistribution.splice(0, 24, ...plexHourDistribution);
            }
    
            const allLibraries = Object.values(libraryCounts).sort((a, b) => b.plays - a.plays);
            const topLibraries = allLibraries.slice(0, 5);
            const topWatched = Object.values(contentCounts).filter(c => c.type !== 'track').sort((a, b) => b.plays - a.plays).slice(0, 30).map(c => {
                if (c.thumb) c.thumbUrl = plexImageUrl(c.thumb);
                return c;
            });
            const topMusic = Object.values(contentCounts).filter(c => c.type === 'track').sort((a, b) => b.plays - a.plays).slice(0, 30).map(c => {
                if (c.thumb) c.thumbUrl = plexImageUrl(c.thumb);
                return c;
            });
    
            const avgHour = hourCount > 0 ? (totalHourOfDay / hourCount) : null;
            const peakHour = resolvePeakHour(hourDistribution);
            const timeOfDay = resolveTimeOfDayPersona(peakHour);
    
            const allShowsList = Object.values(contentCounts).filter(c => c.type === 'show').sort((a, b) => b.plays - a.plays);
            let topShowsRaw = allShowsList.slice(0, 5);
            await Promise.all(topShowsRaw.map(async (s, i) => {
                if (!s.art || i === 0) {
                    const metaPath = s.key.startsWith('/library/metadata/') ? s.key : `/library/metadata/${s.key}`;
    
                    let data = getCachedPlexMetadata(metaPath);
                    if (!data) {
                        const metaRes = await fetch(`${uri}${metaPath}?X-Plex-Token=${config.plexToken}`, { headers: { 'Accept': 'application/json' } }).then(r => r.json()).catch(() => null);
                        if (metaRes && metaRes.MediaContainer && metaRes.MediaContainer.Metadata && metaRes.MediaContainer.Metadata[0]) {
                            data = metaRes.MediaContainer.Metadata[0];
                            setCachedPlexMetadata(metaPath, data);
                        }
                    }
    
                    if (data) {
                        s.art = data.art || data.grandparentArt || data.parentArt || s.art;
                        if (i === 0) {
                            s.summary = data.summary || data.parentSummary || data.grandparentSummary;
                            s.year = data.year || data.parentYear || data.grandparentYear;
                        }
                    }
                }
            }));
            const topShows = topShowsRaw.map(s => ({ ...s, artUrl: s.art ? plexImageUrl(s.art) : null, thumbUrl: s.thumb ? plexImageUrl(s.thumb) : null }));
            const topBinge = topShows.length > 0 ? topShows[0] : null;
    
            const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            let maxDayIndex = 0;
            let maxDayCount = 0;
            for (let i = 0; i < 7; i++) {
                if (dayOfWeekCounts[i] > maxDayCount) {
                    maxDayCount = dayOfWeekCounts[i];
                    maxDayIndex = i;
                }
            }
            const popularDay = maxDayCount > 0 ? daysOfWeek[maxDayIndex] : 'Unknown';
    
            const favoriteLibrary = topLibraries.length > 0 ? topLibraries[0].title : 'None';
    
            let mediaPreference = 'Mixed Bag';
            const totalPrefCount = moviesCount + showsCount + musicCount;
            if (totalPrefCount > 0) {
                if (moviesCount / totalPrefCount >= 0.6) mediaPreference = 'Movie Buff';
                else if (showsCount / totalPrefCount >= 0.6) mediaPreference = 'TV Show Binger';
                else if (musicCount / totalPrefCount >= 0.6) mediaPreference = 'Music Lover';
            }
    
            const allMoviesList = Object.values(contentCounts).filter(c => c.type === 'movie').sort((a, b) => b.plays - a.plays);
            let topMoviesRaw = allMoviesList.slice(0, 5);
            await Promise.all(topMoviesRaw.map(async (m, i) => {
                if (!m.art || i === 0) {
                    const metaPath = m.key.startsWith('/library/metadata/') ? m.key : `/library/metadata/${m.key}`;
    
                    let data = getCachedPlexMetadata(metaPath);
                    if (!data) {
                        const metaRes = await fetch(`${uri}${metaPath}?X-Plex-Token=${config.plexToken}`, { headers: { 'Accept': 'application/json' } }).then(r => r.json()).catch(() => null);
                        if (metaRes && metaRes.MediaContainer && metaRes.MediaContainer.Metadata && metaRes.MediaContainer.Metadata[0]) {
                            data = metaRes.MediaContainer.Metadata[0];
                            setCachedPlexMetadata(metaPath, data);
                        }
                    }
    
                    if (data) {
                        m.art = data.art || data.grandparentArt || data.parentArt || m.art;
                        if (i === 0) {
                            m.summary = data.summary;
                            m.year = data.year;
                            m.tagline = data.tagline;
                        }
                    }
                }
            }));
            const topMovies = topMoviesRaw.map(m => ({ ...m, artUrl: m.art ? plexImageUrl(m.art) : null, thumbUrl: m.thumb ? plexImageUrl(m.thumb) : null }));
            const topMovie = topMovies.length > 0 ? topMovies[0] : null;
    
            let watchStyle = 'Explorer';
            const uniqueTitles = Object.keys(contentCounts).length;
            if (totalPlays > 0) {
                if (totalPlays / uniqueTitles > 3) watchStyle = 'Comfort Binger';
                else if (totalPlays / uniqueTitles > 1.5) watchStyle = 'Loyal Fan';
            }
    
            let streamingHabit = 'Balanced Streamer';
            const weekendPlays = dayOfWeekCounts[0] + dayOfWeekCounts[6];
            const weekdayPlays = totalPlays - weekendPlays;
            if (totalPlays > 0) {
                if (weekendPlays / totalPlays >= 0.5) streamingHabit = 'Weekend Warrior';
                else if (weekdayPlays / totalPlays >= 0.8) streamingHabit = 'Weekday Streamer';
            }
    
            const trendingStats = await loadFile(TRENDING_CACHE_PATH, {});
    
            let periodKey = '30';
            if (req.query.days === 'all') periodKey = 'all';
            else if (req.query.days) periodKey = req.query.days;
    
            const userEntry = trendingStats.leaderboards && trendingStats.leaderboards[periodKey] && accountID
                ? trendingStats.leaderboards[periodKey][accountID]
                : null;
            const leaderboardRank = userEntry ? (typeof userEntry === 'object' ? userEntry.rank : userEntry) : null;
            const myPlaysOnLeaderboard = userEntry ? (typeof userEntry === 'object' ? userEntry.plays : null) : null;
            const totalActiveUsers = trendingStats.totalActiveUsers && trendingStats.totalActiveUsers[periodKey]
                ? trendingStats.totalActiveUsers[periodKey]
                : 0;
    
            // Build a neighbourhood snapshot: the 2 users above and 2 below
            const users = await loadFile(USERS_PATH, []);
            const usernameMap = {};
            users.forEach(u => { if (u.plexAccountId) usernameMap[u.plexAccountId] = u.username || u.email || 'Unknown'; });
    
            let leaderboardNeighbourhood = [];
            const sortedBoard = trendingStats.leaderboardsSorted && trendingStats.leaderboardsSorted[periodKey] ? trendingStats.leaderboardsSorted[periodKey] : [];
            if (leaderboardRank && sortedBoard.length > 0) {
                const myIdx = leaderboardRank - 1;
                const start = Math.max(0, myIdx - 2);
                const end = Math.min(sortedBoard.length - 1, myIdx + 2);
                leaderboardNeighbourhood = sortedBoard.slice(start, end + 1).map(entry => ({
                    rank: entry.rank,
                    plays: entry.plays,
                    isMe: entry.accountId === String(accountID),
                    username: usernameMap[entry.accountId] || `User ${entry.rank}`
                }));
            }
    
            res.json({
                totalPlays,
                topLibraries,
                topWatched,
                topMusic,
                topBinge,
                topMovie,
                topShows,
                topMovies,
                timeOfDay,
                popularDay,
                favoriteLibrary,
                mediaPreference,
                watchStyle,
                streamingHabit,
                leaderboardRank,
                totalActiveUsers,
                myPlaysOnLeaderboard,
                leaderboardNeighbourhood,
                moviesCount,
                showsCount,
                musicCount,
                weekendPlays,
                weekdayPlays,
                uniqueTitles,
                avgHour,
                peakHour,
                dayOfWeekCounts,
                hourDistribution,
                allLibraries,
                topShows,
                topMovies,
                recentHistory: recentHistory.map(h => {
                    if (h.thumb) h.thumbUrl = plexImageUrl(h.thumb);
                    return h;
                })
            });
        } catch (e) {
            log(`Error fetching personal analytics: ${e.message}`);
            res.status(500).json({ error: 'Analytics error' });
        }
    });
    
    app.get('/api/plex/analytics/user/:id/history', requireAdmin, async (req, res) => {
        try {
            const config = await loadFile(CONFIG_PATH, null);
            if (!config || !config.plexToken || !config.serverIdentifier) return res.status(503).json({ error: 'Plex not configured' });
    
            const uri = await getPlexConnectionUri(config);
            if (!uri) return res.status(503).json({ error: 'Cannot connect to Plex' });
    
            const accountID = req.params.id;
            const page = parseInt(req.query.page, 10) || 1;
            const limit = parseInt(req.query.limit, 10) || 15;
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
                const allHistory = await fetchPlexAccountHistory(uri, config, accountID, { maxItems: 10000 });
                
                const mapHistoryToRecent = (item) => ({
                    title: item.type === 'episode' ? (item.grandparentTitle || item.parentTitle || item.title) : item.type === 'track' ? (item.parentTitle || item.grandparentTitle || item.title) : item.title,
                    episodeTitle: item.type === 'episode' || item.type === 'track' ? item.title : null,
                    viewedAt: item.viewedAt,
                    type: item.type,
                    thumbUrl: item.thumb ? plexImageUrl(item.thumb) : null
                });
    
                let filtered = allHistory.map(mapHistoryToRecent);
                if (search) {
                    filtered = filtered.filter(item => 
                        (item.title && item.title.toLowerCase().includes(search)) || 
                        (item.episodeTitle && item.episodeTitle.toLowerCase().includes(search))
                    );
                }
                
                totalRecords = filtered.length;
                historyData = filtered.slice((page - 1) * limit, page * limit);
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
            const limit = req.query.days === 'all' ? 999999 : 5000;
    
            const historyRes = await fetch(`${uri}/status/sessions/history/all?accountID=${accountID}&X-Plex-Token=${config.plexToken}&sort=viewedAt:desc&limit=${limit}`, { headers: { 'Accept': 'application/json' } }).then(r => r.json()).catch(() => null);
            const sectionsRes = await fetch(`${uri}/library/sections?X-Plex-Token=${config.plexToken}`, { headers: { 'Accept': 'application/json' } }).then(r => r.json()).catch(() => null);
    
            if (!historyRes || !historyRes.MediaContainer || !historyRes.MediaContainer.Metadata) {
                return res.json({ totalPlays: 0, topLibraries: [], topWatched: [], topMusic: [], recentHistory: [] });
            }
    
            const sectionsMap = {};
            if (sectionsRes && sectionsRes.MediaContainer && sectionsRes.MediaContainer.Directory) {
                sectionsRes.MediaContainer.Directory.forEach(s => sectionsMap[s.key] = s.title);
            }
    
            let cutoffDate = 0;
            if (req.query.days && req.query.days !== 'all') {
                const days = parseInt(req.query.days, 10) || 30;
                cutoffDate = Math.floor(Date.now() / 1000) - (days * 24 * 60 * 60);
            } else if (!req.query.days) {
                cutoffDate = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);
            }
    
            let totalPlays = 0;
            const libraryCounts = {};
            const contentCounts = {};
            const recentHistory = [];
    
            const dayOfWeekCounts = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
            const hourDistribution = new Array(24).fill(0);
            const statsTimezone = await fetchTautulliTimezone(config);
    
            historyRes.MediaContainer.Metadata.forEach(item => {
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
