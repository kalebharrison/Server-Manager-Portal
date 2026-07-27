import path from 'path';
import { getDiscoverySource, isPortalRequestEngineEnabled } from '../discovery-settings.js';
import { createPortalRequestService } from '../portal-request/portalRequestService.js';
import { createTmdbDiscoverRouter } from '../portal-request/tmdbDiscover.js';
import { createLibraryAvailability } from '../portal-request/libraryAvailability.js';

const asPositiveInt = (value, fallback) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

/** Seerr-shaped media status values used by Discover badges. */
const MEDIA_STATUS_UNKNOWN = 1;
const MEDIA_STATUS_PENDING = 2;
const MEDIA_STATUS_PROCESSING = 3;
const REQUEST_STATUS_PENDING = 1;
const REQUEST_STATUS_APPROVED = 2;
const REQUEST_STATUS_DECLINED = 3;

const resolveBrowseMediaType = (item = {}) => {
    const raw = item?.mediaType ?? item?.media?.mediaType ?? item?.type ?? item?.media_type;
    if (raw === 'movie' || raw === 1 || raw === '1') return 'movie';
    if (raw === 'tv' || raw === 2 || raw === '2') return 'tv';
    if (item?.firstAirDate || item?.first_air_date) return 'tv';
    if (item?.releaseDate || item?.release_date) return 'movie';
    return null;
};

const resolveBrowseTmdbId = (item = {}) => {
    const id = Number(item?.tmdbId ?? item?.id);
    return Number.isFinite(id) && id > 0 ? id : null;
};

const MEMBER_REQUEST_STAMP_TTL_MS = 30 * 1000;
/** @type {Map<string, { at: number, byKey: Map<string, object[]> }>} */
const memberRequestStampCache = new Map();

const memberStampCacheKey = (user) => String(
    user?.id || user?.plexId || user?.jellyfinId || user?.username || '',
);

const loadMemberRequestStampIndex = async (service, user) => {
    const cacheKey = memberStampCacheKey(user);
    const cached = cacheKey ? memberRequestStampCache.get(cacheKey) : null;
    if (cached && Date.now() - cached.at < MEMBER_REQUEST_STAMP_TTL_MS) {
        return cached.byKey;
    }

    const listed = await service.listMemberRequests(user, { filter: 'all', take: 500, skip: 0 })
        .catch(() => null);
    const rows = Array.isArray(listed?.results) ? listed.results : [];
    const byKey = new Map();
    for (const dto of rows) {
        if (Number(dto?.status) === REQUEST_STATUS_DECLINED) continue;
        const mediaType = dto?.type === 'tv' ? 'tv' : 'movie';
        const tmdbId = Number(dto?.tmdbId);
        if (!Number.isFinite(tmdbId) || tmdbId <= 0) continue;
        const key = `${mediaType}:${tmdbId}`;
        const bucket = byKey.get(key) || [];
        bucket.push({
            id: dto.id,
            status: Number(dto.status) || REQUEST_STATUS_PENDING,
            is4k: !!dto.is4k,
            seasons: Array.isArray(dto.seasons) ? dto.seasons : [],
        });
        byKey.set(key, bucket);
    }
    if (cacheKey) {
        memberRequestStampCache.set(cacheKey, { at: Date.now(), byKey });
    }
    return byKey;
};

/**
 * Overlay the member's open requests onto browse cards so Requested/Pending badges show
 * without a second client round-trip.
 */
const stampMemberRequestsOntoItems = async (service, user, items) => {
    if (!Array.isArray(items) || !items.length) return items;
    const byKey = await loadMemberRequestStampIndex(service, user);
    if (!byKey.size) return items;

    return items.map((item) => {
        const mediaType = resolveBrowseMediaType(item);
        const tmdbId = resolveBrowseTmdbId(item);
        if (!mediaType || !tmdbId) return item;
        const requests = byKey.get(`${mediaType}:${tmdbId}`);
        if (!requests?.length) return item;

        const mediaInfo = { ...(item.mediaInfo || {}) };
        mediaInfo.requests = [
            ...(Array.isArray(mediaInfo.requests) ? mediaInfo.requests : []),
            ...requests,
        ];
        const current = Number(mediaInfo.status);
        if (!Number.isFinite(current) || current <= MEDIA_STATUS_UNKNOWN) {
            if (requests.some((row) => Number(row.status) === REQUEST_STATUS_PENDING)) {
                mediaInfo.status = MEDIA_STATUS_PENDING;
            } else if (requests.some((row) => Number(row.status) === REQUEST_STATUS_APPROVED)) {
                mediaInfo.status = MEDIA_STATUS_PROCESSING;
            }
        }
        return { ...item, mediaInfo };
    });
};

/** Stamp library availability (warm Arr catalogs) + member request state onto list payloads. */
const stampDiscoverBrowsePayload = async ({ config, service, user, payload, resolveUrl }) => {
    if (!payload || typeof payload !== 'object' || !Array.isArray(payload.results)) return payload;
    const availability = createLibraryAvailability(config, {
        resolveUrl,
        warmOnCreate: true,
    });
    // Await first catalog warm so Home/browse never paint every title as "Request".
    const withLibrary = await availability.enrichItems(payload.results, {
        networkLookups: false,
        blockForCatalog: true,
    });
    const withRequests = await stampMemberRequestsOntoItems(service, user, withLibrary);
    const withNotify = typeof service.stampNotifyOntoItems === 'function'
        ? await service.stampNotifyOntoItems(user, withRequests)
        : withRequests;
    return { ...payload, results: withNotify };
};

/** Stamp library + request state onto a single movie/TV detail payload. */
const stampDiscoverDetailPayload = async ({ config, service, user, payload, resolveUrl }) => {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
    if (Array.isArray(payload.results)) return payload;

    const mediaType = resolveBrowseMediaType(payload);
    const tmdbId = resolveBrowseTmdbId(payload);
    if (!mediaType || !tmdbId) return payload;

    const availability = createLibraryAvailability(config, {
        resolveUrl,
        warmOnCreate: true,
    });
    const enriched = await availability.enrichDetails({
        ...payload,
        mediaType,
        tmdbId,
        id: tmdbId,
    });
    const [withRequests] = await stampMemberRequestsOntoItems(service, user, [enriched]);
    if (typeof service.stampNotifyOntoItems === 'function') {
        const [withNotify] = await service.stampNotifyOntoItems(user, [withRequests]);
        return withNotify || withRequests;
    }
    return withRequests;
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
        // Bust request-badge stamp cache so the next browse page shows Requested.
        const stampKey = memberStampCacheKey(req.user);
        if (stampKey) memberRequestStampCache.delete(stampKey);
        res.status(201).json(request);
    }));

    app.post('/api/discovery/notify', requireAuth, requireMember, memberGate, (req, res) => run(res, async () => {
        const { service } = await loadPortal();
        const result = await service.subscribeNotify(req.user, req.body || {});
        const stampKey = memberStampCacheKey(req.user);
        if (stampKey) memberRequestStampCache.delete(stampKey);
        res.json(result);
    }));
    app.delete('/api/discovery/notify', requireAuth, requireMember, memberGate, (req, res) => run(res, async () => {
        const { service } = await loadPortal();
        const body = {
            ...(req.body || {}),
            mediaType: req.body?.mediaType || req.query?.mediaType,
            mediaId: req.body?.mediaId ?? req.body?.tmdbId ?? req.query?.mediaId ?? req.query?.tmdbId,
        };
        const result = await service.unsubscribeNotify(req.user, body);
        const stampKey = memberStampCacheKey(req.user);
        if (stampKey) memberRequestStampCache.delete(stampKey);
        res.json(result);
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
        const { config, service } = await requireTmdb();
        const router = createTmdbDiscoverRouter(config, { language: req.query.language || 'en', region: req.query.region || '' });
        const payload = await router.fetchPath('/search', req.query);
        res.json(await stampDiscoverBrowsePayload({
            config,
            service,
            user: req.user,
            payload,
            resolveUrl: resolveIntegrationUrlForFetch,
        }));
    }));
    app.get('/api/discovery/trending', requireAuth, requireMember, memberGate, (req, res) => run(res, async () => {
        const { config, service } = await requireTmdb();
        const router = createTmdbDiscoverRouter(config, { language: req.query.language || 'en', region: req.query.region || '' });
        const payload = await router.fetchPath('/discover/trending', req.query);
        res.json(await stampDiscoverBrowsePayload({
            config,
            service,
            user: req.user,
            payload,
            resolveUrl: resolveIntegrationUrlForFetch,
        }));
    }));
    app.get('/api/discovery/hero-backdrops', requireAuth, requireMember, memberGate, (req, res) => run(res, async () => {
        const { config } = await requireTmdb();
        const router = createTmdbDiscoverRouter(config, { language: req.query.language || 'en', region: req.query.region || '' });
        const trending = await router.fetchPath('/discover/trending', { page: 1 });
        res.json({ results: (trending?.results || []).filter((item) => item?.backdropPath).slice(0, 12) });
    }));
    // Express 5 / path-to-regexp require a named splat (`{*}), not bare `/*`.
    app.get('/api/discovery/proxy/{*path}', requireAuth, requireMember, memberGate, (req, res) => run(res, async () => {
        const { config, service } = await requireTmdb();
        const router = createTmdbDiscoverRouter(config, {
            language: req.query.language || config.tmdbLanguage || 'en',
            region: req.query.region || config.requestDiscoverRegion || '',
            originalLanguage: config.requestDiscoverLanguage || '',
        });
        const rest = Array.isArray(req.params.path)
            ? req.params.path.join('/')
            : String(req.params.path || '');
        const payload = await router.fetchPath(`/${rest}`, req.query);
        const restPath = String(rest || '').replace(/^\/+/, '');
        const isMediaDetail = /^(movie|tv)\/\d+$/.test(restPath);

        // List pages get library + request badges; bare movie/tv detail gets the same stamps
        // so the detail CTA matches Discover cards (Available vs Request).
        if (!payload || typeof payload !== 'object') {
            res.json(payload);
            return;
        }
        if (Array.isArray(payload.results)) {
            res.json(await stampDiscoverBrowsePayload({
                config,
                service,
                user: req.user,
                payload,
                resolveUrl: resolveIntegrationUrlForFetch,
            }));
            return;
        }
        if (isMediaDetail) {
            res.json(await stampDiscoverDetailPayload({
                config,
                service,
                user: req.user,
                payload,
                resolveUrl: resolveIntegrationUrlForFetch,
            }));
            return;
        }
        res.json(payload);
    }));

    // Issues and watchlists have no portal persistence UI yet; preserve client contracts.
    app.get('/api/discovery/my-issues/count', requireAuth, requireMember, memberGate, (req, res) => res.json({ total: 0 }));
    app.get('/api/discovery/my-issues', requireAuth, requireMember, memberGate, (req, res) => res.json({ results: [], pageInfo: { total: 0 } }));
    app.get('/api/discovery/watchlist', requireAuth, requireMember, memberGate, (req, res) => res.json({ results: [] }));
};

export default registerDiscoveryRoutes;
