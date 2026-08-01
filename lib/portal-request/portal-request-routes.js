import path from 'path';
import {
    importArrTagOwnershipToPortal,
    normalizeArrRequesterTagsOnArr,
    pruneAvailablePortalOwnershipRows,
} from './arrTagOwnershipImport.js';

const asPositiveInt = (value, fallback) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

/** Portal-native request endpoints, namespaced under /api/portal-request/*. */
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
                    ? users.find((user) => (
                        String(user?.id) === String(id)
                        || String(user?.plexId) === String(id)
                        || String(user?.jellyfinId) === String(id)
                    ))
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
        res.json({ engine: 'portal', enabled: true, discoverySource: 'tmdb' });
    }));

    app.get('/api/portal-request/discovery', requireAuth, requireMember, memberGate, (req, res) => run(res, async () => {
        const { config } = await loadPortalService();
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
     * Scan Radarr/Sonarr: ensure stable portal `{user.id}` / `n-{user.id}` tags exist
     * alongside legacy Seerr tags (additive only — never removes Seerr/legacy labels).
     * Also migrates portal notifyUserIds → Arr notify tags. Does not dump ownership into JSON.
     */
    app.post('/api/portal-request/admin/import/arr-tags', requireAuth, requireAdmin, (req, res) => run(res, async () => {
        const { config, users, service } = await loadPortalService();
        const summary = await normalizeArrRequesterTagsOnArr({
            config,
            portalUsers: users,
            resolveUrl: resolveIntegrationUrlForFetch,
            includeMovies: req.body?.includeMovies !== false,
            includeTv: req.body?.includeTv !== false,
        });
        const notifyMigrate = await service.migratePortalNotifyIdsToArrTags?.().catch(() => ({ migrated: 0 }));
        const pruned = await pruneAvailablePortalOwnershipRows({
            requestsDir: path.join(configDir, 'requests'),
            onlyImported: true,
        }).catch(() => ({ pruned: 0 }));
        res.json({
            success: true,
            summary: {
                ...summary,
                notifyTagsMigrated: notifyMigrate?.migrated || 0,
                prunedPortalRows: pruned?.pruned || 0,
            },
        });
    }));

    /**
     * Legacy alias: normalize Arr tags + prune imported available portal rows.
     * No longer upserts available ownership into portal JSON.
     */
    app.post('/api/portal-request/admin/import/arr-tags-to-portal', requireAuth, requireAdmin, (req, res) => run(res, async () => {
        const { config, users, service } = await loadPortalService();
        const summary = await importArrTagOwnershipToPortal({
            config,
            requestsDir: path.join(configDir, 'requests'),
            portalUsers: users,
            resolveUrl: resolveIntegrationUrlForFetch,
            includeMovies: req.body?.includeMovies !== false,
            includeTv: req.body?.includeTv !== false,
        });
        const notifyMigrate = await service.migratePortalNotifyIdsToArrTags?.().catch(() => ({ migrated: 0 }));
        res.json({
            success: true,
            summary: {
                ...summary,
                notifyTagsMigrated: notifyMigrate?.migrated || 0,
            },
        });
    }));

};
