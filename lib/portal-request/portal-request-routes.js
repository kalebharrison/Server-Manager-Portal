import path from 'path';
import { isPortalRequestEngineEnabled, getDiscoverySource } from '../discovery-settings.js';
import { createPortalRequestService } from './portalRequestService.js';
import { createTmdbDiscoverRouter } from './tmdbDiscover.js';

const asPositiveInt = (value, fallback) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

/**
 * Portal-native request endpoints. They are registered alongside the Seerr
 * endpoints, but only answer when requestEngine=portal so the default path is
 * completely unchanged.
 */
export const registerPortalRequestRoutes = ({
    app,
    requireAuth,
    requireMember,
    requireAdmin,
    memberApiRateLimit = null,
    configPath,
    configDir,
    usersPath,
    loadFile,
    resolveIntegrationUrlForFetch = (url) => url,
    log = () => {},
}) => {
    const memberGate = memberApiRateLimit || ((req, res, next) => next());
    const loadPortalService = async () => {
        const config = await loadFile(configPath, {});
        if (!isPortalRequestEngineEnabled(config)) {
            const error = new Error('Portal requests are disabled. Select Portal as the request engine first.');
            error.status = 404;
            throw error;
        }
        const users = await loadFile(usersPath, []);
        return {
            config,
            service: createPortalRequestService({
                dataDir: path.join(configDir, 'requests'),
                config,
                resolveUrl: resolveIntegrationUrlForFetch,
                resolveUser: async (id) => (Array.isArray(users)
                    ? users.find((user) => String(user?.id) === String(id) || String(user?.plexId) === String(id))
                    : null),
                listUsers: async () => Array.isArray(users) ? users : [],
            }),
        };
    };

    const run = async (res, action) => {
        try {
            return await action();
        } catch (error) {
            const status = Number(error?.status) || 500;
            if (status >= 500) log(`[portal-request] ${error?.message || 'operation failed'}`);
            return res.status(status).json({ error: error?.message || 'Portal request operation failed' });
        }
    };

    app.get('/api/portal-request/status', requireAuth, requireMember, memberGate, (req, res) => run(res, async () => {
        const config = await loadFile(configPath, {});
        res.json({
            engine: isPortalRequestEngineEnabled(config) ? 'portal' : 'seerr',
            enabled: isPortalRequestEngineEnabled(config),
            discoverySource: getDiscoverySource(config),
        });
    }));

    app.get('/api/portal-request/discovery', requireAuth, requireMember, memberGate, (req, res) => run(res, async () => {
        const { config } = await loadPortalService();
        if (getDiscoverySource(config) !== 'tmdb') {
            return res.status(409).json({ error: 'Portal discovery is configured to use Seerr.' });
        }
        const router = createTmdbDiscoverRouter(config, {
            language: String(req.query.language || 'en'),
            region: String(req.query.region || ''),
            originalLanguage: String(req.query.originalLanguage || ''),
        });
        const data = await router.fetchPath(String(req.query.path || '/discover/trending'), req.query);
        return res.json({ connected: true, engine: 'portal', data });
    }));

    app.get('/api/portal-request/requests', requireAuth, requireMember, memberGate, (req, res) => run(res, async () => {
        const { service } = await loadPortalService();
        res.json(await service.listMemberRequests(req.user, {
            filter: req.query.filter,
            take: asPositiveInt(req.query.take, 20),
            skip: asPositiveInt(req.query.skip, 0),
        }));
    }));

    app.post('/api/portal-request/media/:type/:tmdbId/request', requireAuth, requireMember, memberGate, (req, res) => run(res, async () => {
        const { service } = await loadPortalService();
        const request = await service.createMemberRequest(req.user, {
            ...req.body,
            mediaType: req.params.type,
            tmdbId: req.params.tmdbId,
        });
        res.status(201).json({ success: true, request });
    }));

    app.delete('/api/portal-request/requests/:id', requireAuth, requireMember, memberGate, (req, res) => run(res, async () => {
        const { service } = await loadPortalService();
        await service.cancelMemberRequest(req.user, req.params.id);
        res.json({ success: true });
    }));

    app.get('/api/requests', requireAuth, requireAdmin, (req, res) => run(res, async () => {
        const { service } = await loadPortalService();
        res.json(await service.listAdminRequests({
            filter: req.query.filter,
            take: asPositiveInt(req.query.take, 20),
            skip: asPositiveInt(req.query.skip, 0),
        }));
    }));

    app.get('/api/requests/:id', requireAuth, requireAdmin, (req, res) => run(res, async () => {
        const { service } = await loadPortalService();
        res.json({ request: await service.getAdminRequest(req.params.id) });
    }));

    app.post('/api/requests/:id/approve', requireAuth, requireAdmin, (req, res) => run(res, async () => {
        const { service } = await loadPortalService();
        res.json({ request: await service.approveAdminRequest(req.params.id, req.body, req.user) });
    }));

    app.post('/api/requests/:id/decline', requireAuth, requireAdmin, (req, res) => run(res, async () => {
        const { service } = await loadPortalService();
        res.json({ request: await service.declineAdminRequest(req.params.id, req.body?.reason, req.user) });
    }));

    app.post('/api/requests/:id/retry', requireAuth, requireAdmin, (req, res) => run(res, async () => {
        const { service } = await loadPortalService();
        res.json({ request: await service.retryAdminRequest(req.params.id, req.user) });
    }));

    app.delete('/api/requests/:id', requireAuth, requireAdmin, (req, res) => run(res, async () => {
        const { service } = await loadPortalService();
        await service.deleteAdminRequest(req.params.id);
        res.json({ success: true });
    }));
};
