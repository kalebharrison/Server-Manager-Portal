import {
    fetchPlexAccountHistory,
    fetchPlexAccountHistoryPage,
} from './analytics-plex-history-service.js';

export const registerPlexAdminUserHistoryRoute = ({
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
                const tUrl = await resolveIntegrationUrlForFetch(config.tautulliUrl);
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
};
