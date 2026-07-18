import { createPlexRouteHelpers, registerPlexStatsRoutes } from './plex-route-helpers.js';

export const registerPlexRoutes = ({
    app,
    requireAuth,
    requireMember,
    requireAdmin,
    configPath,
    loadFile,
    getPlexConnectionUri,
    fetch,
    fetchWithTimeout,
    plexSessionsSnapshot = null,
    plexImageService,
    plexDashboardService,
    plexStatsService,
    loadPlexStatsFromDisk,
    buildPlexStatsCache,
    withBasePath = (value) => value,
    log,
}) => {
    const {
        CONFIG_PATH,
        loadPlexContext,
        loadActiveSessions,
        readLimit,
        explicitPlexMedia,
        tmdbIdFromPlex,
    } = createPlexRouteHelpers({
        configPath,
        loadFile,
        getPlexConnectionUri,
        plexSessionsSnapshot,
        fetch,
    });

    registerPlexStatsRoutes({
        app,
        requireAuth,
        requireMember,
        requireAdmin,
        plexStatsService,
        loadPlexStatsFromDisk,
        buildPlexStatsCache,
    });

    app.get('/api/plex/image', requireAuth, requireMember, async (req, res) => {
        const { path: thumbPath, width, height } = req.query;
        if (!thumbPath) return res.status(400).send('path required');
        try {
            const { config, uri } = await loadPlexContext();
            const image = await plexImageService.request({ config, uri, path: thumbPath, width, height });
            res.setHeader('Content-Type', image.contentType);
            res.setHeader('Cache-Control', 'private, max-age=604800, stale-while-revalidate=86400');
            res.send(image.body);
        } catch (e) {
            res.status(e.message === 'Invalid Plex image path' ? 400 : 502).send('');
        }
    });

    app.get('/api/plex/libraries', requireAdmin, async (req, res) => {
        try {
            const config = await loadFile(CONFIG_PATH, null);
            if (!config?.plexToken || !config?.serverIdentifier) {
                return res.status(503).json({ error: 'Plex not configured' });
            }
            const uri = await getPlexConnectionUri(config);
            if (!uri) return res.status(503).json({ error: 'Cannot connect to Plex' });

            const sectionsRes = await fetchWithTimeout(`${uri}/library/sections?X-Plex-Token=${config.plexToken}`, { headers: { Accept: 'application/json' } }, 15000).then((r) => r.json()).catch(() => null);

            let libraries = [];
            if (sectionsRes?.MediaContainer?.Directory) {
                libraries = sectionsRes.MediaContainer.Directory.map((s) => ({
                    id: s.key,
                    title: s.title,
                    type: s.type,
                }));
            }
            res.json(libraries);
        } catch (e) {
            log(`Error fetching Plex libraries: ${e.message}`);
            res.status(500).json({ error: 'Failed to fetch libraries' });
        }
    });

    app.get('/api/plex/library', requireAuth, requireMember, async (req, res) => {
        try {
            const { config, uri } = await loadPlexContext();
            res.json(await plexDashboardService.getRecentData(config, uri, readLimit(req)));
        } catch (error) {
            res.status(503).json({ error: error.message || 'Failed to fetch library data' });
        }
    });

    app.get('/api/plex/search', requireAuth, requireMember, async (req, res) => {
        const query = String(req.query.query || '').trim();
        if (query.length < 2) return res.json({ results: [] });
        try {
            const { config, uri } = await loadPlexContext();
            const sectionsResponse = await fetchWithTimeout(`${uri}/library/sections?X-Plex-Token=${config.plexToken}`, { headers: { Accept: 'application/json' } }, 15000);
            const sectionsPayload = sectionsResponse.ok ? await sectionsResponse.json() : null;
            const sections = (sectionsPayload?.MediaContainer?.Directory || []).filter((section) => ['movie', 'show'].includes(section.type));
            const payloads = await Promise.all(sections.map(async (section) => {
                const params = new URLSearchParams({
                    title: query,
                    includeGuids: '1',
                    'X-Plex-Container-Start': '0',
                    'X-Plex-Container-Size': '30',
                    'X-Plex-Token': config.plexToken,
                });
                const response = await fetchWithTimeout(`${uri}/library/sections/${encodeURIComponent(section.key)}/all?${params}`, { headers: { Accept: 'application/json' } }, 15000);
                return response.ok ? await response.json() : null;
            }));
            const seen = new Set();
            const results = payloads.flatMap((payload) => payload?.MediaContainer?.Metadata || []).flatMap((media) => {
                const ratingKey = String(media.ratingKey || '');
                if (!ratingKey || seen.has(ratingKey) || explicitPlexMedia(media)) return [];
                seen.add(ratingKey);
                const type = media.type === 'show' ? 'tv' : 'movie';
                const tmdbId = tmdbIdFromPlex(media);
                return [{
                    id: tmdbId || Number(ratingKey) || 0,
                    tmdbId,
                    ratingKey,
                    mediaType: type,
                    title: media.title || 'Unknown title',
                    year: media.year ? String(media.year) : null,
                    overview: media.summary || '',
                    posterUrl: media.thumb ? withBasePath(`/api/plex/image?path=${encodeURIComponent(media.thumb)}&width=342&height=513`) : '',
                    plexUrl: `https://app.plex.tv/desktop/#!/server/${config.serverIdentifier}/details?key=${encodeURIComponent(media.key || `/library/metadata/${ratingKey}`)}`,
                    available: true,
                    canRequest: false,
                    source: 'plex',
                }];
            });
            res.setHeader('Cache-Control', 'private, max-age=30, stale-while-revalidate=120');
            res.json({ results });
        } catch (error) {
            res.status(503).json({ error: error.message || 'Failed to search Plex library' });
        }
    });

    app.get('/api/plex/sessions', requireAuth, requireMember, async (req, res) => {
        try {
            const { config, uri } = await loadPlexContext();
            res.json({ activeSessions: await loadActiveSessions(config, uri, req.user) });
        } catch (error) {
            res.status(503).json({ error: error.message || 'Failed to fetch active streams' });
        }
    });

    app.get('/api/plex/dashboard', requireAuth, requireMember, async (req, res) => {
        try {
            const { config, uri } = await loadPlexContext();
            const [activeSessions, recentData] = await Promise.all([
                loadActiveSessions(config, uri, req.user),
                plexDashboardService.getRecentData(config, uri, readLimit(req)),
            ]);
            res.json({ activeSessions, ...recentData });
        } catch (error) {
            log(`Error fetching Plex dashboard: ${error.message}`);
            res.status(503).json({ error: error.message || 'Failed to fetch dashboard data' });
        }
    });

    app.post('/api/streams/kill', requireAdmin, async (req, res) => {
        const { sessionId, reason } = req.body;
        try {
            const config = await loadFile(CONFIG_PATH, {});
            const uri = await getPlexConnectionUri(config);
            if (!uri) return res.status(503).json({ error: 'Cannot connect to Plex' });

            const response = await fetch(`${uri}/status/sessions/terminate?sessionId=${encodeURIComponent(sessionId)}&reason=${encodeURIComponent(reason || 'Admin terminated session')}&X-Plex-Token=${config.plexToken}`, {
                method: 'GET',
                headers: { Accept: 'application/json' },
            });

            if (response.ok) {
                res.json({ success: true });
            } else {
                res.status(500).json({ error: 'Failed to terminate session' });
            }
        } catch (e) {
            console.error('Error terminating stream:', e);
            res.status(500).json({ error: 'Failed to communicate with Plex' });
        }
    });
};
