import {
    fetchPlexAccountHistory,
    historyFetchLimitForPeriod,
    resolveHistoryCutoff,
} from './analytics-plex-history-service.js';
import { buildAdminUserAnalytics } from './analytics-plex-admin-builder.js';
import { registerPlexAdminUserHistoryRoute } from './analytics-plex-admin-history-routes.js';

export { buildAdminUserAnalytics } from './analytics-plex-admin-builder.js';

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
    const {
        getHourInTimezone,
        getWeekdayInTimezone,
        fetchTautulliTimezone,
    } = tautulli;

    registerPlexAdminUserHistoryRoute({
        app,
        requireAdmin,
        configPath: CONFIG_PATH,
        usersPath,
        loadFile,
        getPlexConnectionUri,
        resolveIntegrationUrlForFetch,
        fetchPlexServerAccounts,
        plexImageUrl,
        tautulli,
        log,
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
