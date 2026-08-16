import path from 'path';
import { createPortalRequestService } from '../portal-request/portalRequestService.js';
import { createTmdbDiscoverRouter } from '../portal-request/tmdbDiscover.js';
import { createLibraryAvailability } from '../portal-request/libraryAvailability.js';
import { getDiscoverHomeCache } from '../portal-request/discoverHomeCache.js';
import {
    lookupDiscoveryAvailabilityForItem,
    mergeAvailabilityEntryOntoItem,
    normalizeDiscoveryAvailabilityCache,
} from '../portal-request/discoveryAvailabilityCache.js';
import { DISCOVERY_AVAILABILITY_CACHE_PATH } from '../config/data-paths.js';

const asPositiveInt = (value, fallback) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

/** Media status values used by Discover badges. */
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
/** @type {Map<string, Promise<Map<string, object[]>>>} */
const memberRequestStampInflight = new Map();

const memberStampCacheKey = (user) => String(
    user?.id || user?.plexId || user?.jellyfinId || user?.username || '',
);

const loadMemberRequestStampIndex = async (service, user) => {
    const cacheKey = memberStampCacheKey(user);
    const cached = cacheKey ? memberRequestStampCache.get(cacheKey) : null;
    if (cached && Date.now() - cached.at < MEMBER_REQUEST_STAMP_TTL_MS) {
        return cached.byKey;
    }
    if (cacheKey && memberRequestStampInflight.has(cacheKey)) {
        return memberRequestStampInflight.get(cacheKey);
    }

    const pending = (async () => {
        const listed = await service.listMemberRequests(user, {
            filter: 'all',
            take: 500,
            skip: 0,
            backfillPosters: false,
        }).catch(() => null);
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
    })();

    if (cacheKey) memberRequestStampInflight.set(cacheKey, pending);
    try {
        return await pending;
    } finally {
        if (cacheKey && memberRequestStampInflight.get(cacheKey) === pending) {
            memberRequestStampInflight.delete(cacheKey);
        }
    }
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
const stampDiscoverBrowsePayload = async ({
    config,
    service,
    user,
    payload,
    resolveUrl,
    loadFile = null,
}) => {
    if (!payload || typeof payload !== 'object' || !Array.isArray(payload.results)) return payload;
    const availability = createLibraryAvailability(config, {
        resolveUrl,
        warmOnCreate: true,
    });
    // Never block the TMDB response on a cold Arr catalog warm (that left Discover
    // on skeletons for many seconds after deploy/restart). Warm in the background;
    // stale/fresh peeks still stamp Available when memory already has catalogs.
    let withLibrary = await availability.enrichItems(payload.results, {
        networkLookups: false,
        blockForCatalog: false,
    });

    // Disk availability fallback when Arr memory catalogs are still cold.
    const homeCache = getDiscoverHomeCache();
    let disk = homeCache ? await homeCache.loadAvailabilityDisk?.() : null;
    if (!disk?.byKey && typeof loadFile === 'function') {
        disk = normalizeDiscoveryAvailabilityCache(await loadFile(DISCOVERY_AVAILABILITY_CACHE_PATH, null));
    }
    if (disk?.byKey && Object.keys(disk.byKey).length) {
        withLibrary = withLibrary.map((item) => {
            if (item?.mediaInfo?.status) return item;
            const entry = lookupDiscoveryAvailabilityForItem(disk, item);
            return entry ? mergeAvailabilityEntryOntoItem(item, entry) : item;
        });
    }

    const withRequests = await stampMemberRequestsOntoItems(service, user, withLibrary);
    const withNotify = typeof service.stampNotifyOntoItems === 'function'
        ? await service.stampNotifyOntoItems(user, withRequests)
        : withRequests;
    return { ...payload, results: withNotify };
};

/** Overlay per-user request/notify onto an already library-stamped page (shared cache). */
const stampUserOntoPage = async (service, user, page) => {
    if (!page || typeof page !== 'object') return page;
    const results = Array.isArray(page.results) ? page.results : [];
    const withRequests = await stampMemberRequestsOntoItems(service, user, results);
    const withNotify = typeof service.stampNotifyOntoItems === 'function'
        ? await service.stampNotifyOntoItems(user, withRequests)
        : withRequests;
    return { ...page, results: withNotify };
};

/** Map proxy rest path + query to a Discover home cache rail key (page 1 only). */
const resolveHomeCacheRailKey = (restPath, query = {}) => {
    const page = Number(query.page || 1);
    if (page !== 1) return null;
    const path = String(restPath || '').replace(/^\/+/, '');
    const sortBy = String(query.sortBy || '');
    if (path === 'discover/trending') return 'trending';
    if (path === 'discover/movies/upcoming') return 'upcomingMovies';
    if (path === 'discover/tv/upcoming') return 'upcomingSeries';
    if (path === 'discover/movies' && (!sortBy || sortBy === 'popularity.desc')) {
        // Genre/date filters must hit live TMDB.
        if (query.genre || query.genres || query.dateGte || query.primaryReleaseDateGte) return null;
        return 'popularMoviesPage1';
    }
    if (path === 'discover/tv' && (!sortBy || sortBy === 'popularity.desc')) {
        if (query.genre || query.genres || query.dateGte || query.firstAirDateGte) return null;
        return 'popularTvPage1';
    }
    return null;
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
});

/** Portal-native Discover API backed by TMDB and the local request store. */
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
    onRequestStatusChange = null,
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
                onRequestStatusChange,
            }),
        };
    };
    const requireTmdb = async () => {
        const loaded = await loadPortal();
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

    app.get('/api/discovery/request-users', requireAuth, requireMember, memberGate, (req, res) => run(res, async () => {
        if (!req.user?.isAdmin) {
            const error = new Error('Admin only.');
            error.status = 403;
            throw error;
        }
        const { service } = await loadPortal();
        const results = await service.listPortalRequestUsers();
        const selfKeys = new Set(
            [req.user?.id, req.user?.plexId, req.user?.username, req.user?.email]
                .map((value) => String(value || '').trim().toLowerCase())
                .filter(Boolean),
        );
        const me = (Array.isArray(results) ? results : []).find((user) => (
            selfKeys.has(String(user?.id || '').trim().toLowerCase())
            || selfKeys.has(String(user?.plexId || '').trim().toLowerCase())
            || selfKeys.has(String(user?.username || '').trim().toLowerCase())
            || selfKeys.has(String(user?.email || '').trim().toLowerCase())
        )) || null;
        const sorted = me
            ? [me, ...(results || []).filter((user) => String(user?.id) !== String(me.id))]
            : (results || []);
        res.json({
            results: sorted,
            currentUserId: me?.id != null ? String(me.id) : (req.user?.id != null ? String(req.user.id) : null),
        });
    }));

    app.post('/api/discovery/request', requireAuth, requireMember, memberGate, (req, res) => run(res, async () => {
        const { service } = await loadPortal();
        const request = await service.createMemberRequest(req.user, req.body || {});
        // Bust request-badge stamp cache so the next browse page shows Requested.
        const stampKey = memberStampCacheKey(req.user);
        if (stampKey) memberRequestStampCache.delete(stampKey);
        // Also bust the Request As target's stamp cache when admin files for them.
        const asId = String(req.body?.requestAsUserId || req.body?.userId || '').trim();
        if (asId && asId !== stampKey) memberRequestStampCache.delete(asId);
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
    app.get('/api/discovery/recent-requests', requireAuth, requireMember, memberGate, (req, res) => run(res, async () => {
        const { service } = await loadPortal();
        let results = await service.listRecentCommunityRequests(req.user, {
            take: asPositiveInt(req.query.take, 40),
        });
        if (typeof service.stampNotifyOntoItems === 'function') {
            results = await service.stampNotifyOntoItems(req.user, results);
        }
        res.json({ results: Array.isArray(results) ? results : [] });
    }));
    app.get('/api/discovery/recent-upgrades', requireAuth, requireMember, memberGate, (req, res) => run(res, async () => {
        const { config } = await loadPortal();
        const { listRecentUpgradedDiscoverItems } = await import('./discover-recent-upgrades.js');
        const mediaType = req.query.mediaType === 'tv'
            ? 'tv'
            : req.query.mediaType === 'movie'
                ? 'movie'
                : 'all';
        res.json(await listRecentUpgradedDiscoverItems(config, {
            mediaType,
            take: asPositiveInt(req.query.take, 40),
            resolveUrl: resolveIntegrationUrlForFetch,
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
        const availability = createLibraryAvailability(config, {
            resolveUrl: resolveIntegrationUrlForFetch,
            warmOnCreate: true,
        });
        const input = (Array.isArray(req.body?.items) ? req.body.items : [])
            .map((item) => {
                const mediaType = item?.mediaType === 'tv' ? 'tv' : 'movie';
                const tmdbId = Number(item?.tmdbId);
                if (!Number.isFinite(tmdbId) || tmdbId <= 0) return null;
                return {
                    ...item,
                    mediaType,
                    tmdbId,
                    id: tmdbId,
                    type: mediaType,
                };
            })
            .filter(Boolean);

        // Warm Arr catalogs + disk cache only — never N live Arr lookups per poster rail.
        let stamped = await availability.enrichItems(input, {
            networkLookups: false,
            blockForCatalog: false,
        });
        const homeCache = getDiscoverHomeCache();
        let disk = homeCache ? await homeCache.loadAvailabilityDisk?.() : null;
        if (!disk?.byKey && typeof loadFile === 'function') {
            disk = normalizeDiscoveryAvailabilityCache(await loadFile(DISCOVERY_AVAILABILITY_CACHE_PATH, null));
        }
        if (disk?.byKey && Object.keys(disk.byKey).length) {
            stamped = stamped.map((item) => {
                if (item?.mediaInfo?.status) return item;
                const entry = lookupDiscoveryAvailabilityForItem(disk, item);
                return entry ? mergeAvailabilityEntryOntoItem(item, entry) : item;
            });
        }

        res.json({
            results: stamped.map((item) => ({
                mediaType: item?.mediaType === 'tv' ? 'tv' : 'movie',
                tmdbId: Number(item?.tmdbId || item?.id),
                mediaInfo: item?.mediaInfo || { status: 1 },
                ...(item?.sonarrLibraryStatus ? { sonarrLibraryStatus: item.sonarrLibraryStatus } : {}),
                ...(item?.radarrLibraryStatus ? { radarrLibraryStatus: item.radarrLibraryStatus } : {}),
            })),
        });
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
            loadFile,
        }));
    }));
    app.get('/api/discovery/home', requireAuth, requireMember, memberGate, (req, res) => run(res, async () => {
        const { service } = await requireTmdb();
        const homeCache = getDiscoverHomeCache();
        if (!homeCache) {
            const error = new Error('Discover home cache is not ready.');
            error.status = 503;
            throw error;
        }
        const rails = await homeCache.getHomeRails();
        const stampBudgetMs = 2000;
        const stamped = await Promise.race([
            Promise.all([
                stampUserOntoPage(service, req.user, rails.trending),
                stampUserOntoPage(service, req.user, rails.upcomingMovies),
                stampUserOntoPage(service, req.user, rails.popularSeries),
                stampUserOntoPage(service, req.user, rails.upcomingSeries),
                stampUserOntoPage(service, req.user, rails.popularMovies),
                stampUserOntoPage(service, req.user, rails.popularTv),
            ]),
            new Promise((resolve) => {
                setTimeout(() => resolve(null), stampBudgetMs);
            }),
        ]);
        const [
            trending,
            upcomingMovies,
            popularSeries,
            upcomingSeries,
            popularMovies,
            popularTv,
        ] = stamped || [
            rails.trending,
            rails.upcomingMovies,
            rails.popularSeries,
            rails.upcomingSeries,
            rails.popularMovies,
            rails.popularTv,
        ];
        res.json({
            generatedAt: rails.generatedAt,
            language: rails.language,
            region: rails.region,
            trending,
            upcomingMovies,
            popularSeries,
            upcomingSeries,
            popularMovies,
            popularTv,
        });
    }));
    app.get('/api/discovery/trending', requireAuth, requireMember, memberGate, (req, res) => run(res, async () => {
        const { config, service } = await requireTmdb();
        const homeCache = getDiscoverHomeCache();
        const pageNum = Number(req.query.page || 1);
        if (pageNum === 1 && homeCache) {
            const cached = await homeCache.getCachedPage('trending');
            if (cached?.results?.length) {
                res.json(await stampUserOntoPage(service, req.user, cached));
                return;
            }
        }
        const router = createTmdbDiscoverRouter(config, { language: req.query.language || 'en', region: req.query.region || '' });
        const payload = await router.fetchPath('/discover/trending', req.query);
        res.json(await stampDiscoverBrowsePayload({
            config,
            service,
            user: req.user,
            payload,
            resolveUrl: resolveIntegrationUrlForFetch,
            loadFile,
        }));
    }));
    app.get('/api/discovery/hero-backdrops', requireAuth, requireMember, memberGate, (req, res) => run(res, async () => {
        const { config } = await requireTmdb();
        const homeCache = getDiscoverHomeCache();
        const cached = homeCache ? await homeCache.getCachedPage('trending') : null;
        if (cached?.results?.length) {
            res.json({ results: cached.results.filter((item) => item?.backdropPath).slice(0, 12) });
            return;
        }
        const router = createTmdbDiscoverRouter(config, { language: req.query.language || 'en', region: req.query.region || '' });
        const trending = await router.fetchPath('/discover/trending', { page: 1 });
        res.json({ results: (trending?.results || []).filter((item) => item?.backdropPath).slice(0, 12) });
    }));
    // Express 5 / path-to-regexp require a named splat (`{*}), not bare `/*`.
    app.get('/api/discovery/proxy/{*path}', requireAuth, requireMember, memberGate, (req, res) => run(res, async () => {
        const { config, service } = await requireTmdb();
        const rest = Array.isArray(req.params.path)
            ? req.params.path.join('/')
            : String(req.params.path || '');
        const restPath = String(rest || '').replace(/^\/+/, '');
        const isMediaDetail = /^(movie|tv)\/\d+$/.test(restPath);

        const defaultLanguage = String(config.tmdbLanguage || 'en');
        const defaultRegion = String(config.requestDiscoverRegion || '');
        const reqLanguage = String(req.query.language || defaultLanguage);
        const reqRegion = String(req.query.region || defaultRegion);
        const localeMatchesDefaults = reqLanguage === defaultLanguage && reqRegion === defaultRegion;

        const railKey = localeMatchesDefaults ? resolveHomeCacheRailKey(restPath, req.query) : null;
        const homeCache = getDiscoverHomeCache();
        if (railKey && homeCache) {
            const cached = await homeCache.getCachedPage(railKey);
            if (cached?.results?.length) {
                res.json(await stampUserOntoPage(service, req.user, cached));
                return;
            }
        }

        const router = createTmdbDiscoverRouter(config, {
            language: req.query.language || config.tmdbLanguage || 'en',
            region: req.query.region || config.requestDiscoverRegion || '',
            originalLanguage: config.requestDiscoverLanguage || '',
        });
        const payload = await router.fetchPath(`/${rest}`, req.query);

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
                loadFile,
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
