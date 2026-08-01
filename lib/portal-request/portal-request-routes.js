import path from 'path';
import { isPortalRequestEngineEnabled, getDiscoverySource } from '../discovery-settings.js';
import { createRequestAppClient } from '../request-app/request-app-client.js';
import { importSeerrHistoryToPortal } from './seerrHistoryImport.js';
import { importArrTagOwnershipToPortal } from './arrTagOwnershipImport.js';

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
    fetchWithTimeout = null,
    withBasePath = (value) => value,
    requestAppInternalUrl = '',
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
        const { createPortalRequestService } = await import('./portalRequestService.js');
        return {
            config,
            users: Array.isArray(users) ? users : [],
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
    const adminDto = (request) => ({
        ...request,
        mediaType: request?.type === 'tv' ? 'tv' : 'movie',
        genres: (request?.genres || []).map((genre) => (
            typeof genre === 'string' ? { name: genre } : genre
        )),
    });

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
        const router = (await import('./tmdbDiscover.js')).createTmdbDiscoverRouter(config, {
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

    // Namespaced under /api/portal-request/* so Seerr /api/requests* routes stay untouched.
    app.get('/api/portal-request/admin/requests', requireAuth, requireAdmin, (req, res) => run(res, async () => {
        const { service } = await loadPortalService();
        const result = await service.listAdminRequests({
            filter: req.query.filter,
            take: asPositiveInt(req.query.take, 20),
            skip: asPositiveInt(req.query.skip, 0),
        });
        res.json({ ...result, results: result.results.map(adminDto) });
    }));

    app.get('/api/portal-request/admin/requests/:id', requireAuth, requireAdmin, (req, res) => run(res, async () => {
        const { service } = await loadPortalService();
        res.json({ request: adminDto(await service.getAdminRequest(req.params.id)) });
    }));

    app.post('/api/portal-request/admin/requests/:id/approve', requireAuth, requireAdmin, (req, res) => run(res, async () => {
        const { service } = await loadPortalService();
        res.json({ request: adminDto(await service.approveAdminRequest(req.params.id, req.body, req.user)) });
    }));

    app.post('/api/portal-request/admin/requests/:id/decline', requireAuth, requireAdmin, (req, res) => run(res, async () => {
        const { service } = await loadPortalService();
        res.json({ request: adminDto(await service.declineAdminRequest(req.params.id, req.body?.reason, req.user)) });
    }));

    app.post('/api/portal-request/admin/requests/:id/retry', requireAuth, requireAdmin, (req, res) => run(res, async () => {
        const { service } = await loadPortalService();
        res.json({ request: adminDto(await service.retryAdminRequest(req.params.id, req.user)) });
    }));

    app.delete('/api/portal-request/admin/requests/:id', requireAuth, requireAdmin, (req, res) => run(res, async () => {
        const { service } = await loadPortalService();
        await service.deleteAdminRequest(req.params.id);
        res.json({ success: true });
    }));

    /**
     * Scan Radarr/Sonarr requester tags → portal “available” request rows.
     * Idempotent; does not re-push media to Arr.
     */
    app.post('/api/portal-request/admin/import/arr-tags', requireAuth, requireAdmin, (req, res) => run(res, async () => {
        const { config, users } = await loadPortalService();
        const summary = await importArrTagOwnershipToPortal({
            config,
            requestsDir: path.join(configDir, 'requests'),
            portalUsers: users,
            resolveUrl: resolveIntegrationUrlForFetch,
            includeMovies: req.body?.includeMovies !== false,
            includeTv: req.body?.includeTv !== false,
        });
        res.json({ success: true, summary });
    }));

    /**
     * Import Seerr request/issue/blocklist history into the portal JSON store.
     * Prefer for open/pending Seerr rows; Arr tags cover library ownership gaps.
     */
    app.post('/api/portal-request/admin/import/seerr-history', requireAuth, requireAdmin, (req, res) => run(res, async () => {
        const { config, users } = await loadPortalService();
        if (!fetchWithTimeout) {
            const err = new Error('Seerr import is unavailable (fetch helper missing).');
            err.status = 500;
            throw err;
        }
        const client = createRequestAppClient({
            fetchWithTimeout,
            resolveIntegrationUrlForFetch,
            withBasePath,
            requestAppInternalUrl,
        });
        const summary = await importSeerrHistoryToPortal({
            config,
            fetchSeerrJson: client.fetchSeerrJson,
            requestsDir: path.join(configDir, 'requests'),
            issuesDir: path.join(configDir, 'issues'),
            blocklistDir: path.join(configDir, 'blocklist'),
            portalUsers: users,
            includeIssues: req.body?.includeIssues !== false,
            includeBlocklist: req.body?.includeBlocklist !== false,
            fallbackUserId: req.body?.fallbackUserId
                || req.user?.id
                || null,
            maxRequests: asPositiveInt(req.body?.maxRequests, 5000),
            maxIssues: asPositiveInt(req.body?.maxIssues, 2000),
            maxBlocklist: asPositiveInt(req.body?.maxBlocklist, 5000),
        });
        res.json({ success: true, summary });
    }));
};
