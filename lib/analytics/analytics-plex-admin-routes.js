import {
    fetchPlexAccountHistory,
    historyFetchLimitForPeriod,
    resolveHistoryCutoff,
} from './analytics-plex-history-service.js';

export const buildAdminUserAnalytics = async ({
    historyItems,
    cutoffDate,
    config,
    uri,
    plexImageUrl,
    getHourInTimezone,
    getWeekdayInTimezone,
    fetchTautulliTimezone,
}) => {
    const sectionsRes = await fetch(`${uri}/library/sections?X-Plex-Token=${config.plexToken}`, { headers: { 'Accept': 'application/json' } }).then(r => r.json()).catch(() => null);

    if (!historyItems.length) {
        return { totalPlays: 0, topLibraries: [], topWatched: [], topMusic: [], recentHistory: [] };
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

    return {
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
    };
};

export const registerPlexAdminAnalyticsRoutes = ({
    app,
    requireAdmin,
    configPath,
    usersPath,
    loadFile,
    getPlexConnectionUri,
    resolveIntegrationUrlForFetch,
    fetchPlexServerAccounts,
    plexImageUrl,
    tautulli,
    log,
}) => {
    const CONFIG_PATH = configPath;
    const USERS_PATH = usersPath;
    const {
        getHourInTimezone,
        getWeekdayInTimezone,
        fetchTautulliTimezone,
        fetchTautulliUsers,
        resolveTautulliUserId,
    } = tautulli;

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

            const data = await buildAdminUserAnalytics({
                historyItems,
                cutoffDate,
                config,
                uri,
                plexImageUrl,
                getHourInTimezone,
                getWeekdayInTimezone,
                fetchTautulliTimezone,
            });
            res.json(data);
        } catch (e) {
            log(`Error fetching user analytics: ${e.message}`);
            res.status(500).json({ error: 'Analytics error' });
        }
    });
};
