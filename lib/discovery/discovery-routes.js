import path from 'path';
import { getDiscoverySource, isPortalRequestEngineEnabled } from '../discovery-settings.js';
import { createPortalRequestService } from '../portal-request/portalRequestService.js';
import { createTmdbDiscoverRouter } from '../portal-request/tmdbDiscover.js';
import { createLibraryAvailability } from '../portal-request/libraryAvailability.js';

const asPositiveInt = (value, fallback) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const discoveryPreferences = (config = {}) => ({
    discoverRegion: String(config.requestDiscoverRegion || ''),
    discoverLanguage: String(config.requestDiscoverLanguage || ''),
    hideAvailableMedia: config.requestHideAvailableMedia === true,
    tmdbLanguage: String(config.tmdbLanguage || config.requestDiscoverLanguage || 'en'),
    showRecentlyAdded: config.showRecentlyAdded !== false,
    // Plex watchlist sync is unused — keep Discover focused on requests.
    showWatchlist: false,
    discoverySource: getDiscoverySource(config),
    requestEngine: isPortalRequestEngineEnabled(config) ? 'portal' : 'seerr',
});

/**
 * Portal-native Discover API. The client retains its Seerr-shaped /api/discovery
 * contract while TMDB and the local request store supply the data.
 */
export const registerDiscoveryRoutes = ({
    app,
    requireAuth,
    requireMember,
    memberApiRateLimit = null,
    configPath,
    configDir,
    usersPath,
    loadFile,
    resolveIntegrationUrlForFetch = (url) => url,
    log = () => {},
}) => {
    const memberGate = memberApiRateLimit || ((req, res, next) => next());
    const run = async (res, action) => {
        try {
            return await action();
        } catch (error) {
            const status = Number(error?.status) || 500;
            if (status >= 500) log(`[discovery] ${error?.message || 'operation failed'}`);
            return res.status(status).json({ error: error?.message || 'Discovery operation failed' });
        }
    };
    const loadPortal = async () => {
        const config = await loadFile(configPath, {});
        if (!isPortalRequestEngineEnabled(config)) {
            const error = new Error('Portal discovery is disabled.');
            error.status = 404;
            throw error;
        }
        const users = await loadFile(usersPath, []);
        const resolveUser = async (id) => (Array.isArray(users)
            ? users.find((user) => String(user?.id) === String(id) || String(user?.plexId) === String(id))
            : null);
        return {
            config,
            service: createPortalRequestService({
                dataDir: path.join(configDir, 'requests'),
                config,
                resolveUrl: resolveIntegrationUrlForFetch,
                resolveUser,
                listUsers: async () => Array.isArray(users) ? users : [],
            }),
        };
    };
    const requireTmdb = async () => {
        const loaded = await loadPortal();
        if (getDiscoverySource(loaded.config) !== 'tmdb') {
            const error = new Error('Portal discovery is configured to use Seerr.');
            error.status = 409;
            throw error;
        }
        return loaded;
    };

    app.get('/api/discovery/preferences', requireAuth, requireMember, memberGate, (req, res) => run(res, async () => {
        res.json(discoveryPreferences(await loadFile(configPath, {})));
    }));

    app.get('/api/discovery/me', requireAuth, requireMember, memberGate, (req, res) => run(res, async () => {
        const { service } = await loadPortal();
        const movie = await service.getMemberRequestOptions(req.user, { mediaType: 'movie', mediaId: 1 })
            .catch(() => null);
        res.json({
            configured: true,
            userMapped: true,
            seerrUserId: null,
            displayName: req.user?.username || req.user?.email || null,
            permissions: movie?.permissions || { request: true, request4k: true, createIssues: true },
            quota: movie?.quota || { movie: {}, tv: {} },
            engine: 'portal',
        });
    }));

    app.get('/api/discovery/request-options', requireAuth, requireMember, memberGate, (req, res) => run(res, async () => {
        const { service } = await loadPortal();
        res.json(await service.getMemberRequestOptions(req.user, {
            mediaType: req.query.mediaType || req.query.type,
            mediaId: req.query.mediaId || req.query.id,
        }));
    }));

    app.post('/api/discovery/request', requireAuth, requireMember, memberGate, (req, res) => run(res, async () => {
        const { service } = await loadPortal();
        const request = await service.createMemberRequest(req.user, req.body || {});
        res.status(201).json(request);
    }));

    app.get('/api/discovery/my-requests/count', requireAuth, requireMember, memberGate, (req, res) => run(res, async () => {
        const { service } = await loadPortal();
        res.json(await service.getMemberRequestCounts(req.user));
    }));
    app.get('/api/discovery/my-requests', requireAuth, requireMember, memberGate, (req, res) => run(res, async () => {
        const { service } = await loadPortal();
        res.json(await service.listMemberRequests(req.user, {
            filter: req.query.filter,
            take: asPositiveInt(req.query.take, 20),
            skip: asPositiveInt(req.query.skip, 0),
        }));
    }));
    app.delete('/api/discovery/my-requests/:id', requireAuth, requireMember, memberGate, (req, res) => run(res, async () => {
        const { service } = await loadPortal();
        await service.cancelMemberRequest(req.user, req.params.id);
        res.json({ success: true });
    }));
    app.post('/api/discovery/my-requests/:id/retry', requireAuth, requireMember, memberGate, (req, res) => run(res, async () => {
        const { service } = await loadPortal();
        res.json(await service.retryMemberRequest(req.user, req.params.id));
    }));

    app.get('/api/discovery/request-services/:type/:serverId', requireAuth, requireMember, memberGate, (req, res) => run(res, async () => {
        const { service } = await loadPortal();
        const mediaType = req.params.type === 'sonarr' || req.params.type === 'tv' ? 'tv' : 'movie';
        res.json(await service.getPortalArrServiceOptions(mediaType, req.params.serverId));
    }));
    app.post('/api/discovery/request-tags', requireAuth, requireMember, memberGate, (req, res) => run(res, async () => {
        const { service } = await loadPortal();
        res.status(201).json(await service.createPortalTag(req.body || {}));
    }));
    app.post('/api/discovery/request-override-defaults', requireAuth, requireMember, memberGate, (req, res) => run(res, async () => {
        const { service } = await loadPortal();
        const mediaType = req.body?.mediaType === 'tv' ? 'tv' : 'movie';
        res.json({ servers: service.listPortalArrServers(mediaType) });
    }));

    app.post('/api/discovery/availability-batch', requireAuth, requireMember, memberGate, (req, res) => run(res, async () => {
        const { config } = await loadPortal();
        const availability = createLibraryAvailability(config, { resolveUrl: resolveIntegrationUrlForFetch });
        const results = await Promise.all((Array.isArray(req.body?.items) ? req.body.items : []).map(async (item) => {
            const mediaType = item?.mediaType === 'tv' ? 'tv' : 'movie';
            const status = mediaType === 'tv'
                ? await availability.getTvListStatus(item.tmdbId, item).catch(() => null)
                : await availability.getMediaStatus(mediaType, item.tmdbId).catch(() => null);
            return { mediaType, tmdbId: Number(item.tmdbId), mediaInfo: status?.mediaInfo || status || { status: 1 } };
        }));
        res.json({ results });
    }));

    app.get('/api/discovery/search', requireAuth, requireMember, memberGate, (req, res) => run(res, async () => {
        const { config } = await requireTmdb();
        const router = createTmdbDiscoverRouter(config, { language: req.query.language || 'en', region: req.query.region || '' });
        res.json(await router.fetchPath('/search', req.query));
    }));
    app.get('/api/discovery/trending', requireAuth, requireMember, memberGate, (req, res) => run(res, async () => {
        const { config } = await requireTmdb();
        const router = createTmdbDiscoverRouter(config, { language: req.query.language || 'en', region: req.query.region || '' });
        res.json(await router.fetchPath('/discover/trending', req.query));
    }));
    app.get('/api/discovery/hero-backdrops', requireAuth, requireMember, memberGate, (req, res) => run(res, async () => {
        const { config } = await requireTmdb();
        const router = createTmdbDiscoverRouter(config, { language: req.query.language || 'en', region: req.query.region || '' });
        const trending = await router.fetchPath('/discover/trending', { page: 1 });
        res.json({ results: (trending?.results || []).filter((item) => item?.backdropPath).slice(0, 12) });
    }));
    // Express 5 / path-to-regexp require a named splat (`{*}), not bare `/*`.
    app.get('/api/discovery/proxy/{*path}', requireAuth, requireMember, memberGate, (req, res) => run(res, async () => {
        const { config } = await requireTmdb();
        const router = createTmdbDiscoverRouter(config, {
            language: req.query.language || config.tmdbLanguage || 'en',
            region: req.query.region || config.requestDiscoverRegion || '',
            originalLanguage: config.requestDiscoverLanguage || '',
        });
        const rest = Array.isArray(req.params.path)
            ? req.params.path.join('/')
            : String(req.params.path || '');
        res.json(await router.fetchPath(`/${rest}`, req.query));
    }));

    // Issues and watchlists have no portal persistence UI yet; preserve client contracts.
    app.get('/api/discovery/my-issues/count', requireAuth, requireMember, memberGate, (req, res) => res.json({ total: 0 }));
    app.get('/api/discovery/my-issues', requireAuth, requireMember, memberGate, (req, res) => res.json({ results: [], pageInfo: { total: 0 } }));
    app.get('/api/discovery/watchlist', requireAuth, requireMember, memberGate, (req, res) => res.json({ results: [] }));
};

export default registerDiscoveryRoutes;
