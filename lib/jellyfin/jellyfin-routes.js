import { scopedCacheKey } from '../cache/cache-key.js';
import { cacheRefreshMs } from '../cache/cache-refresh.js';
import { createJellyfinRouteHelpers } from './jellyfin-route-helpers.js';

export const registerJellyfinRoutes = ({
    app,
    requireAuth,
    requireMember,
    publicReadRateLimit,
    configPath,
    loadFile,
    isJellyfinConfigured,
    resolveIntegrationUrlForFetch,
    fetchWithTimeout,
    withCache,
    jellyfinHeaders,
    withBasePath,
    jellyfinItemUrl,
    log,
}) => {
    const {
        CONFIG_PATH,
        loadJellyfinImage,
        warmJellyfinPosters,
        mapJellyfinItemForDiscover,
        fetchJellyfinItems,
        loadActiveSessions,
        proxyJellyfinBrandingAsset,
    } = createJellyfinRouteHelpers({
        configPath,
        loadFile,
        isJellyfinConfigured,
        resolveIntegrationUrlForFetch,
        fetchWithTimeout,
        withCache,
        jellyfinHeaders,
        withBasePath,
        jellyfinItemUrl,
    });

    app.get('/api/jellyfin/image', requireAuth, requireMember, async (req, res) => {
        const itemId = String(req.query.itemId || '').trim();
        const width = Math.min(Math.max(parseInt(req.query.width, 10) || 300, 64), 1200);
        const height = Math.min(Math.max(parseInt(req.query.height, 10) || 450, 64), 1600);
        if (!itemId || !/^[A-Za-z0-9_-]+$/.test(itemId)) return res.status(400).send('Invalid itemId');
        try {
            const config = await loadFile(CONFIG_PATH, {});
            if (!isJellyfinConfigured(config)) return res.status(503).send('');
            const baseUrl = resolveIntegrationUrlForFetch(config.jellyfinUrl);
            const relativePath = `/Items/${encodeURIComponent(itemId)}/Images/Primary?fillWidth=${width}&fillHeight=${height}&quality=90`;
            const image = await loadJellyfinImage(config, relativePath, `${baseUrl}:${relativePath}`, 'image/jpeg');
            res.setHeader('Content-Type', image.contentType);
            res.setHeader('Cache-Control', 'private, max-age=86400');
            res.send(image.body);
        } catch (e) {
            res.status(500).send('');
        }
    });

    app.get('/api/jellyfin/user-image', requireAuth, requireMember, async (req, res) => {
        const userId = String(req.query.userId || '').trim();
        if (!userId || !/^[A-Za-z0-9_-]+$/.test(userId)) return res.status(400).send('Invalid userId');
        try {
            const config = await loadFile(CONFIG_PATH, {});
            if (!isJellyfinConfigured(config)) return res.status(503).send('');
            const baseUrl = resolveIntegrationUrlForFetch(config.jellyfinUrl);
            const relativePath = `/Users/${encodeURIComponent(userId)}/Images/Primary?fillWidth=128&fillHeight=128&quality=90`;
            const image = await loadJellyfinImage(config, relativePath, `${baseUrl}:${relativePath}`, 'image/jpeg');
            res.setHeader('Content-Type', image.contentType);
            res.setHeader('Cache-Control', 'private, max-age=86400');
            res.send(image.body);
        } catch (e) {
            res.status(500).send('');
        }
    });

    app.get('/api/jellyfin/branding/splash', publicReadRateLimit, async (req, res) => {
        try {
            await proxyJellyfinBrandingAsset(res, ['/Branding/Splashscreen'], 'image/jpeg');
        } catch (e) {
            res.status(500).send('');
        }
    });

    app.get('/api/jellyfin/branding/icon', publicReadRateLimit, async (req, res) => {
        try {
            await proxyJellyfinBrandingAsset(res, ['/web/icon-transparent.png', '/web/assets/img/icon-transparent.png', '/web/favicon.ico'], 'image/png');
        } catch (e) {
            res.status(500).send('');
        }
    });

    app.get('/api/jellyfin/branding/favicon', publicReadRateLimit, async (req, res) => {
        try {
            await proxyJellyfinBrandingAsset(res, ['/web/favicon.ico', '/web/icon-transparent.png', '/web/assets/img/icon-transparent.png'], 'image/x-icon');
        } catch (e) {
            res.status(500).send('');
        }
    });

    app.get('/api/jellyfin/sessions', requireAuth, requireMember, async (req, res) => {
        try {
            const config = await loadFile(CONFIG_PATH, {});
            if (!isJellyfinConfigured(config)) return res.status(503).json({ error: 'Jellyfin not configured' });
            res.json({ activeSessions: await loadActiveSessions(config, req.user) });
        } catch (e) {
            log(`Error fetching Jellyfin sessions: ${e.message}`);
            res.status(503).json({ error: 'Failed to fetch active streams' });
        }
    });

    app.get('/api/jellyfin/dashboard', requireAuth, requireMember, async (req, res) => {
        try {
            const config = await loadFile(CONFIG_PATH, {});
            if (!isJellyfinConfigured(config)) {
                return res.status(503).json({ error: 'Jellyfin not configured' });
            }

            const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 250);
            const baseUrl = resolveIntegrationUrlForFetch(config.jellyfinUrl);
            const cacheKey = scopedCacheKey('jellyfin_dashboard_data', [baseUrl, config.jellyfinApiKey, limit]);
            const [activeSessions, { movies, episodes, music }] = await Promise.all([
                loadActiveSessions(config, req.user),
                withCache(cacheKey, cacheRefreshMs(config), async () => {
                    const [movies, episodes, music] = await Promise.all([
                        fetchJellyfinItems(config, 'Movie', limit).catch((e) => { log(`Jellyfin movies fetch failed: ${e.message}`); return []; }),
                        fetchJellyfinItems(config, 'Episode', limit).catch((e) => { log(`Jellyfin episodes fetch failed: ${e.message}`); return []; }),
                        fetchJellyfinItems(config, 'MusicAlbum,Audio', limit).catch((e) => { log(`Jellyfin music fetch failed: ${e.message}`); return []; }),
                    ]);
                    return { movies, episodes, music };
                }),
            ]);

            const recent = {
                activeSessions,
                recentMovies: movies.map((item) => mapJellyfinItemForDiscover(config, item, 'movie')),
                recentShows: episodes.map((item) => mapJellyfinItemForDiscover(config, item, 'episode')),
                recentMusic: music.map((item) => mapJellyfinItemForDiscover(config, item, 'music')),
            };
            void warmJellyfinPosters(config, baseUrl, [...recent.recentMovies.slice(0, 16), ...recent.recentShows.slice(0, 10), ...recent.recentMusic.slice(0, 6)]);
            res.json(recent);
        } catch (e) {
            log(`Error fetching Jellyfin dashboard: ${e.message}`);
            res.status(500).json({ error: 'Failed to fetch Jellyfin dashboard data' });
        }
    });
};
