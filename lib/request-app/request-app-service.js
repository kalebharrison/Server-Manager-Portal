import { cacheRefreshMs, startAdaptiveCacheWarmer } from '../cache/cache-refresh.js';
import {
    filterMediaItems,
    normalizeDiscoverMediaType,
    normalizeGenreId,
    normalizeIssueType,
    isAdultMediaItem,
    normalizeMediaItem,
    normalizeMediaType,
    normalizeRequestItem,
    safePage,
} from './request-app-media.js';
import { createRequestImageCache } from './request-image-cache.js';

const SEERR_TYPES = new Set(['seerr', 'overseerr', 'jellyseerr']);
const DISCOVER_PAGE_SIZE = 20;
const ANIME_SOURCE_PAGE_BATCH = 5;

export const isSeerrFamilyRequestApp = (type) => SEERR_TYPES.has(String(type || '').toLowerCase());

export const isRequestAppConfigured = (config = {}) => {
    const type = String(config.requestAppType || 'none').toLowerCase();
    return type !== 'none' && !!config.requestAppUrl && !!config.requestAppApiKey;
};

export const getRequestAppGate = (config = {}) => {
    if (!isRequestAppConfigured(config)) {
        return {
            configured: false,
            supported: false,
            ready: false,
            error: 'Set Request App Type, URL, and API key under Settings > Integrations.',
        };
    }
    if (!isSeerrFamilyRequestApp(config.requestAppType)) {
        return {
            configured: true,
            supported: false,
            ready: false,
            error: 'Embedded requests currently support Seerr, Overseerr, and Jellyseerr.',
        };
    }
    return { configured: true, supported: true, ready: true, error: null };
};

/** Portal↔Seerr user lifecycle sync (import on activate, delete on revoke). Default on. */
export const isRequestAppMembershipSyncEnabled = (config = {}) => (
    getRequestAppGate(config).ready && config.requestAppMembershipSync !== false
);

const createMemoryCache = ({ maxEntries = 250 } = {}) => {
    const entries = new Map();
    const pending = new Map();
    let generation = 0;

    const prune = () => {
        const now = Date.now();
        for (const [key, value] of entries) {
            if (value.staleUntil <= now) entries.delete(key);
        }
        while (entries.size > maxEntries) {
            const oldest = entries.keys().next().value;
            if (!oldest) break;
            entries.delete(oldest);
        }
    };

    return {
        getOrSet: async (key, ttlMs, loader, { staleIfErrorMs = 0 } = {}) => {
            const now = Date.now();
            const cached = entries.get(key);
            if (cached && cached.expiresAt > now) {
                entries.delete(key);
                entries.set(key, cached);
                return cached.value;
            }
            if (pending.has(key)) return pending.get(key);
            const stale = cached && cached.staleUntil > now ? cached : null;
            const loadGeneration = generation;
            let promise;
            promise = Promise.resolve()
                .then(loader)
                .then((value) => {
                    if (loadGeneration === generation) {
                        entries.set(key, {
                            value,
                            expiresAt: Date.now() + ttlMs,
                            staleUntil: Date.now() + ttlMs + Math.max(0, staleIfErrorMs),
                        });
                        prune();
                    }
                    return value;
                })
                .catch((error) => {
                    if (stale) return stale.value;
                    throw error;
                })
                .finally(() => {
                    if (pending.get(key) === promise) pending.delete(key);
                });
            pending.set(key, promise);
            return promise;
        },
        clear: () => {
            generation++;
            entries.clear();
            pending.clear();
        },
        /** Drop matching keys without invalidating unrelated discover/search entries. */
        invalidateMatching: (predicate) => {
            for (const key of [...entries.keys()]) {
                if (predicate(key)) entries.delete(key);
            }
        },
    };
};

export const createRequestAppService = ({
    fetchWithTimeout,
    resolveIntegrationUrlForFetch,
    tvdbService = null,
    getActiveAcquisitionKeys = async () => new Set(),
    withBasePath = (value) => value,
    requestAppInternalUrl = '',
    log = () => {},
}) => {
    const cache = createMemoryCache();
    const imageCache = createRequestImageCache({ fetchWithTimeout });
    const proxyPoster = (remoteUrl) => {
        try {
            const url = new URL(remoteUrl);
            if (url.protocol !== 'https:' || url.hostname !== 'image.tmdb.org') return remoteUrl;
            return `${withBasePath('/api/request-app/image')}?url=${encodeURIComponent(url.toString())}`;
        } catch {
            return remoteUrl;
        }
    };

    const applyAcquisitionState = async (config, items) => {
        const keys = await getActiveAcquisitionKeys(config).catch(() => new Set());
        if (!keys?.size) return items;
        return items.map((item) => {
            const titleKey = String(item.title || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
            const processing = (item.mediaType === 'movie' && item.tmdbId && keys.has(`tmdb:${item.tmdbId}`))
                || (item.mediaType === 'tv' && item.tvdbId && keys.has(`tvdb:${item.tvdbId}`))
                || (titleKey && keys.has(`title:${titleKey}`));
            return processing ? { ...item, processing: true, requested: false, canRequest: false } : item;
        });
    };

    const getCredentials = (config = {}) => {
        const gate = getRequestAppGate(config);
        if (!gate.ready) throw new Error(gate.error || 'Request app is not ready');
        const publicBaseUrl = resolveIntegrationUrlForFetch(config.requestAppUrl);
        const fetchUrlOverride = config.requestAppFetchUrl || requestAppInternalUrl;
        return {
            type: String(config.requestAppType || '').toLowerCase(),
            baseUrl: fetchUrlOverride ? resolveIntegrationUrlForFetch(fetchUrlOverride) : publicBaseUrl,
            publicBaseUrl,
            apiKey: config.requestAppApiKey,
        };
    };

    const fetchSeerrJson = async (config, path, { method = 'GET', body = null } = {}) => {
        const { baseUrl, apiKey } = getCredentials(config);
        let response;
        try {
            response = await fetchWithTimeout(`${baseUrl}${path}`, {
                method,
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    'X-Api-Key': apiKey,
                },
                ...(body ? { body: JSON.stringify(body) } : {}),
            }, 15000);
        } catch (err) {
            const code = err?.cause?.code || err?.code || err?.message || 'network error';
            const dockerHint = /localhost|127\.0\.0\.1/i.test(baseUrl)
                ? ' If the portal runs in Docker, use your server LAN IP or Docker service name instead of localhost.'
                : '';
            throw new Error(`Cannot reach request app at ${baseUrl}.${dockerHint} (${code})`);
        }

        const data = response.status === 204 ? null : await response.json().catch(() => null);
        if (!response.ok) {
            const message = data?.message || data?.error || `Request app returned HTTP ${response.status}`;
            if (response.status === 401 || response.status === 403) {
                throw new Error(`${message} - check the request app API key permissions.`);
            }
            throw new Error(message);
        }
        return data || { success: true };
    };

    const cachedSeerrJson = (config, path, ttlMs, staleIfErrorMs = 0) => {
        const { baseUrl, type } = getCredentials(config);
        return cache.getOrSet(`${type}:${baseUrl}:${path}`, ttlMs, () => fetchSeerrJson(config, path), { staleIfErrorMs });
    };

    const invalidateUserLists = () => cache.invalidateMatching((key) => key.includes('/api/v1/user'));
    const invalidateRequestLists = () => cache.invalidateMatching((key) => (
        key.includes('/api/v1/request') || key.includes('/api/v1/issue')
    ));

    const pageInfoWithNext = (payload, requestedPage, sourceResultCount) => {
        const reported = payload?.pageInfo || {};
        const currentPage = Math.max(1, Number(reported.page) || safePage(requestedPage));
        const pages = Number(reported.pages);
        return {
            ...reported,
            page: currentPage,
            ...(Number.isFinite(pages) && pages > 0 ? { pages } : {}),
            hasNextPage: Number.isFinite(pages) && pages > 0
                ? currentPage < pages
                : sourceResultCount >= DISCOVER_PAGE_SIZE && currentPage < 50,
        };
    };

    const search = async (config, { query, mediaType = 'all', anime = false, foreign = false, genreId = null, page = 1 } = {}) => {
        const q = String(query || '').trim();
        if (q.length < 2) return { results: [], pageInfo: { page: 1, results: 0 } };
        const params = new URLSearchParams({ query: q, page: String(safePage(page)) });
        const { publicBaseUrl } = getCredentials(config);
        const payload = await cachedSeerrJson(config, `/api/v1/search?${params.toString()}`, 15_000, 120_000);
        const results = Array.isArray(payload?.results) ? payload.results : [];
        const normalized = filterMediaItems(results
                .filter((item) => ['movie', 'tv'].includes(String(item.mediaType || item.type || '').toLowerCase()))
                .map((item) => normalizeMediaItem(item, publicBaseUrl, proxyPoster)), normalizeDiscoverMediaType(mediaType), anime, foreign, normalizeGenreId(genreId));
        return {
            results: await applyAcquisitionState(config, normalized),
            pageInfo: pageInfoWithNext(payload, page, results.length),
        };
    };

    const normalizeDiscoverPayload = (payload, page, publicBaseUrl, mediaType = 'all', anime = false, foreign = false, genreId = null) => {
        const results = Array.isArray(payload?.results) ? payload.results : Array.isArray(payload) ? payload : [];
        return {
            results: filterMediaItems(results
                .filter((item) => ['movie', 'tv'].includes(String(item.mediaType || item.type || '').toLowerCase()))
                .map((item) => normalizeMediaItem(item, publicBaseUrl, proxyPoster)), mediaType, anime, foreign, genreId),
            sourceResultCount: results.length,
            pageInfo: pageInfoWithNext(payload, page, results.length),
        };
    };

    const discover = async (config, { category = 'trending', mediaType = 'all', anime = false, foreign = false, genreId = null, page = 1 } = {}) => {
        const safeCategory = ['trending', 'popular', 'upcoming', 'movies', 'tv'].includes(category) ? category : 'trending';
        const requestedType = normalizeDiscoverMediaType(mediaType);
        const requestedGenreId = normalizeGenreId(genreId);
        const effectiveType = safeCategory === 'movies' ? 'movie' : safeCategory === 'tv' ? 'tv' : requestedType;
        const endpointMap = {
            trending: {
                all: ['/api/v1/discover/trending'],
                movie: ['/api/v1/discover/trending'],
                tv: ['/api/v1/discover/trending'],
            },
            popular: {
                all: ['/api/v1/discover/movies', '/api/v1/discover/tv'],
                movie: ['/api/v1/discover/movies'],
                tv: ['/api/v1/discover/tv'],
            },
            upcoming: {
                all: ['/api/v1/discover/movies/upcoming', '/api/v1/discover/tv/upcoming'],
                movie: ['/api/v1/discover/movies/upcoming'],
                tv: ['/api/v1/discover/tv/upcoming'],
            },
            movies: {
                all: ['/api/v1/discover/movies'],
                movie: ['/api/v1/discover/movies'],
                tv: ['/api/v1/discover/movies'],
            },
            tv: {
                all: ['/api/v1/discover/tv'],
                movie: ['/api/v1/discover/tv'],
                tv: ['/api/v1/discover/tv'],
            },
        };
        const { publicBaseUrl } = getCredentials(config);
        const canUseMovieGenreQuery = !!requestedGenreId && effectiveType === 'movie' && ['popular', 'movies'].includes(safeCategory);
        const sourcePageBatch = anime || foreign || (requestedGenreId && !canUseMovieGenreQuery) ? ANIME_SOURCE_PAGE_BATCH : 1;
        const firstSourcePage = ((safePage(page) - 1) * sourcePageBatch) + 1;
        const sourcePages = Array.from({ length: sourcePageBatch }, (_, index) => firstSourcePage + index);
        const payloadGroups = await Promise.all(sourcePages.map((sourcePage) => {
            const params = new URLSearchParams({ page: String(sourcePage) });
            if (canUseMovieGenreQuery) params.set('genre', String(requestedGenreId));
            return Promise.all(endpointMap[safeCategory][effectiveType].map((endpoint) => (
                cachedSeerrJson(config, `${endpoint}?${params.toString()}`, cacheRefreshMs(config), 10 * 60_000)
            )));
        }));
        const normalizedPayloads = payloadGroups.flatMap((payloads, index) => payloads.map((payload) => (
            normalizeDiscoverPayload(payload, sourcePages[index], publicBaseUrl, effectiveType, anime, foreign, requestedGenreId)
        )));
        if (!normalizedPayloads.length) return { results: [], pageInfo: { page: safePage(page), hasNextPage: false } };
        const normalized = normalizedPayloads.flatMap((payload) => payload.results);
        const reportedSourcePages = Math.max(...normalizedPayloads.map((payload) => Number(payload.pageInfo?.pages) || 0));
        const lastSourcePage = sourcePages[sourcePages.length - 1];
        const hasNextPage = reportedSourcePages > 0
            ? reportedSourcePages > lastSourcePage
            : normalizedPayloads.some((payload) => payload.pageInfo?.hasNextPage);
        return {
            results: await applyAcquisitionState(config, normalized),
            pageInfo: {
                page: safePage(page),
                ...(reportedSourcePages > 0 ? { pages: Math.ceil(reportedSourcePages / sourcePageBatch) } : {}),
                results: normalized.length,
                hasNextPage,
            },
        };
    };

    const getMediaDetails = async (config, { mediaType, tmdbId }) => {
        const type = normalizeMediaType(mediaType);
        const id = Number(tmdbId);
        if (!Number.isFinite(id) || id <= 0) throw new Error('Invalid media id');
        const { publicBaseUrl } = getCredentials(config);
        const payload = await cachedSeerrJson(config, `/api/v1/${type}/${encodeURIComponent(id)}`, 30_000, 5 * 60_000);
        if (isAdultMediaItem(payload)) throw new Error('This title is not available in the portal');
        const item = normalizeMediaItem({ ...payload, mediaType: type, id }, publicBaseUrl, proxyPoster);
        const enriched = tvdbService ? await tvdbService.enrichSeries(config, item) : item;
        return (await applyAcquisitionState(config, [enriched]))[0];
    };

    const listRequestUsers = async (config, { bypassCache = false } = {}) => {
        const loader = () => fetchSeerrJson(config, '/api/v1/user?take=1000&sort=displayname');
        const payload = bypassCache
            ? await loader()
            : await cachedSeerrJson(config, '/api/v1/user?take=1000&sort=displayname', 300_000, 30 * 60_000);
        const results = Array.isArray(payload?.results) ? payload.results : [];
        return results.map((user) => ({
            id: Number(user.id) || null,
            displayName: user.displayName || user.username || user.email || `User #${user.id}`,
            email: user.email || null,
            username: user.username || user.plexUsername || null,
            plexId: user.plexId != null ? String(user.plexId) : null,
            jellyfinUserId: user.jellyfinUserId ? String(user.jellyfinUserId) : null,
        })).filter((user) => user.id);
    };

    const portalPlexId = (portalUser = {}) => {
        const plexId = portalUser.plexId || portalUser.id;
        if (plexId == null || plexId === '') return '';
        const raw = String(plexId);
        if (raw.startsWith('jellyfin:')) return '';
        return raw;
    };

    const portalJellyfinId = (portalUser = {}) => {
        if (portalUser.jellyfinId) return String(portalUser.jellyfinId);
        const raw = String(portalUser.id || '');
        return raw.startsWith('jellyfin:') ? raw.slice('jellyfin:'.length) : '';
    };

    const findRequestAppUser = (users, portalUser = {}) => {
        const email = String(portalUser.email || '').trim().toLowerCase();
        const username = String(portalUser.username || '').trim().toLowerCase();
        const plexId = portalPlexId(portalUser);
        const jellyfinId = portalJellyfinId(portalUser).replace(/-/g, '').toLowerCase();
        return users.find((user) => {
            if (plexId && String(user.plexId || '') === plexId) return true;
            if (jellyfinId) {
                const candidate = String(user.jellyfinUserId || '').replace(/-/g, '').toLowerCase();
                if (candidate && candidate === jellyfinId) return true;
            }
            if (email && String(user.email || '').toLowerCase() === email) return true;
            if (username && String(user.username || user.displayName || '').toLowerCase() === username) return true;
            return false;
        }) || null;
    };

    const resolveRequestUserId = async (config, sessionUser = {}) => {
        const email = String(sessionUser.email || '').trim().toLowerCase();
        const username = String(sessionUser.username || '').trim().toLowerCase();
        const plexId = portalPlexId(sessionUser);
        const jellyfinId = portalJellyfinId(sessionUser);
        if (!email && !username && !plexId && !jellyfinId) return null;
        try {
            const users = await listRequestUsers(config);
            return findRequestAppUser(users, sessionUser)?.id || null;
        } catch (err) {
            log(`Request app user mapping skipped: ${err.message}`);
            return null;
        }
    };

    /**
     * Ensure a Seerr-family user exists for request attribution (members never open Seerr).
     * Import only succeeds once the user has active media-server access.
     */
    const ensureRequestAppUser = async (config, portalUser = {}) => {
        if (!isRequestAppMembershipSyncEnabled(config)) return { ok: false, reason: 'disabled' };
        try {
            let users = await listRequestUsers(config, { bypassCache: true });
            let match = findRequestAppUser(users, portalUser);
            if (match?.id) return { ok: true, userId: match.id, created: false };

            const mediaServerType = String(config.mediaServerType || 'plex').toLowerCase();
            const plexId = portalPlexId(portalUser);
            const jellyfinId = portalJellyfinId(portalUser);
            if (mediaServerType === 'jellyfin' && jellyfinId) {
                await fetchSeerrJson(config, '/api/v1/user/import-from-jellyfin', {
                    method: 'POST',
                    body: { jellyfinUserIds: [jellyfinId] },
                });
            } else if (plexId) {
                await fetchSeerrJson(config, '/api/v1/user/import-from-plex', {
                    method: 'POST',
                    body: { plexIds: [String(plexId)] },
                });
            } else {
                return { ok: false, reason: 'missing_media_id' };
            }

            invalidateUserLists();
            users = await listRequestUsers(config, { bypassCache: true });
            match = findRequestAppUser(users, portalUser);
            if (match?.id) {
                log(`Request app user ensured for ${portalUser.username || portalUser.email || plexId || jellyfinId} (id=${match.id})`);
                return { ok: true, userId: match.id, created: true };
            }
            return { ok: false, reason: 'not_imported' };
        } catch (err) {
            log(`Request app user ensure failed for ${portalUser.username || portalUser.email || 'user'}: ${err.message}`);
            return { ok: false, reason: 'error', error: err.message };
        }
    };

    /** Backfill/import missing Seerr users for a list of active portal members (batched imports). */
    const ensureRequestAppUsers = async (config, portalUsers = []) => {
        if (!isRequestAppMembershipSyncEnabled(config)) return { ok: false, reason: 'disabled', created: 0, existing: 0, failed: 0 };
        const candidates = (Array.isArray(portalUsers) ? portalUsers : [])
            .filter((user) => user && String(user.plexAccessStatus || '') === 'active');
        if (!candidates.length) return { ok: true, created: 0, existing: 0, failed: 0 };

        try {
            let users = await listRequestUsers(config, { bypassCache: true });
            let existing = 0;
            let failed = 0;
            const mediaServerType = String(config.mediaServerType || 'plex').toLowerCase();
            const missingPlexIds = [];
            const missingJellyfinIds = [];
            const missingUsers = [];

            for (const portalUser of candidates) {
                if (findRequestAppUser(users, portalUser)?.id) {
                    existing += 1;
                    continue;
                }
                const plexId = portalPlexId(portalUser);
                const jellyfinId = portalJellyfinId(portalUser);
                if (mediaServerType === 'jellyfin' && jellyfinId) {
                    missingJellyfinIds.push(jellyfinId);
                    missingUsers.push(portalUser);
                } else if (plexId) {
                    missingPlexIds.push(String(plexId));
                    missingUsers.push(portalUser);
                } else {
                    failed += 1;
                }
            }

            if (missingJellyfinIds.length) {
                await fetchSeerrJson(config, '/api/v1/user/import-from-jellyfin', {
                    method: 'POST',
                    body: { jellyfinUserIds: missingJellyfinIds },
                });
            }
            if (missingPlexIds.length) {
                await fetchSeerrJson(config, '/api/v1/user/import-from-plex', {
                    method: 'POST',
                    body: { plexIds: missingPlexIds },
                });
            }

            let created = 0;
            if (missingUsers.length) {
                invalidateUserLists();
                users = await listRequestUsers(config, { bypassCache: true });
                for (const portalUser of missingUsers) {
                    if (findRequestAppUser(users, portalUser)?.id) {
                        created += 1;
                        log(`Request app user backfilled for ${portalUser.username || portalUser.email || portalPlexId(portalUser) || portalJellyfinId(portalUser)}`);
                    } else {
                        failed += 1;
                    }
                }
            }
            return { ok: true, created, existing, failed };
        } catch (err) {
            log(`Request app membership backfill failed: ${err.message}`);
            return { ok: false, reason: 'error', error: err.message, created: 0, existing: 0, failed: candidates.length };
        }
    };

    /** Remove Seerr-family user when portal membership ends (no disable API). */
    const removeRequestAppUser = async (config, portalUser = {}) => {
        if (!isRequestAppMembershipSyncEnabled(config)) return { ok: false, reason: 'disabled' };
        try {
            const users = await listRequestUsers(config, { bypassCache: true });
            const match = findRequestAppUser(users, portalUser);
            if (!match?.id) return { ok: true, removed: false, reason: 'not_found' };
            if (Number(match.id) === 1) return { ok: false, reason: 'protected_admin' };

            await fetchSeerrJson(config, `/api/v1/user/${encodeURIComponent(match.id)}`, { method: 'DELETE' });
            invalidateUserLists();
            log(`Request app user removed for ${portalUser.username || portalUser.email || match.id} (id=${match.id})`);
            return { ok: true, removed: true, userId: match.id };
        } catch (err) {
            log(`Request app user remove failed for ${portalUser.username || portalUser.email || 'user'}: ${err.message}`);
            return { ok: false, reason: 'error', error: err.message };
        }
    };

    const requestMedia = async (config, { mediaType, tmdbId, seasons = [], is4k = false, sessionUser = null } = {}) => {
        const type = normalizeMediaType(mediaType);
        const id = Number(tmdbId);
        if (!Number.isFinite(id) || id <= 0) throw new Error('Invalid media id');
        // Cached details call also enforces adult filtering before we submit.
        await getMediaDetails(config, { mediaType: type, tmdbId: id });
        const body = {
            mediaType: type,
            mediaId: id,
            is4k: !!is4k,
        };
        if (type === 'tv') {
            const selectedSeasons = Array.isArray(seasons)
                ? seasons.map((season) => Number(season)).filter((season) => Number.isFinite(season) && season >= 0)
                : [];
            if (!selectedSeasons.length) throw new Error('Select at least one season');
            body.seasons = selectedSeasons;
        }
        let requestUserId = await resolveRequestUserId(config, sessionUser || {});
        if (!requestUserId && sessionUser) {
            const ensured = await ensureRequestAppUser(config, sessionUser);
            requestUserId = ensured.userId || null;
        }
        if (requestUserId) body.userId = requestUserId;

        const result = await fetchSeerrJson(config, '/api/v1/request', { method: 'POST', body });
        invalidateRequestLists();
        return result;
    };

    const reportIssue = async (config, { mediaId, issueType = 'other', message = '', problemSeason = 0, problemEpisode = 0, sessionUser = null } = {}) => {
        const id = Number(mediaId);
        if (!Number.isFinite(id) || id <= 0) throw new Error('Issue reporting is only available for media tracked by the request app');
        const cleanMessage = String(message || '').trim();
        if (cleanMessage.length < 3) throw new Error('Describe the issue before submitting');
        const reporter = String(sessionUser?.email || sessionUser?.username || '').trim();
        const body = {
            mediaId: id,
            issueType: normalizeIssueType(issueType),
            message: reporter ? `Reported from Server Manager Portal by ${reporter}\n\n${cleanMessage}` : cleanMessage,
            problemSeason: Math.max(0, Number(problemSeason) || 0),
            problemEpisode: Math.max(0, Number(problemEpisode) || 0),
        };
        const result = await fetchSeerrJson(config, '/api/v1/issue', { method: 'POST', body });
        invalidateRequestLists();
        return result;
    };

    const listRequests = async (config, { filter = 'pending', take = 30, skip = 0 } = {}) => {
        const { publicBaseUrl } = getCredentials(config);
        const params = new URLSearchParams({
            filter: String(filter || 'pending'),
            take: String(Math.min(100, Math.max(1, Number(take) || 30))),
            skip: String(Math.max(0, Number(skip) || 0)),
            sort: 'modified',
        });
        const payload = await fetchSeerrJson(config, `/api/v1/request?${params.toString()}`);
        const results = Array.isArray(payload?.results) ? payload.results : [];
        return {
            results: results
                .filter((item) => !isAdultMediaItem(item))
                .map((item) => normalizeRequestItem(item, publicBaseUrl, proxyPoster)),
            pageInfo: payload?.pageInfo || { page: 1, results: results.length },
        };
    };

    const getRequestCounts = async (config) => {
        const payload = await cachedSeerrJson(config, '/api/v1/request/count', 30_000, 5 * 60_000);
        const source = payload?.requests && typeof payload.requests === 'object' ? payload.requests : payload;
        return {
            pending: Number(source?.pending) || 0,
            approved: Number(source?.approved) || 0,
            declined: Number(source?.declined) || 0,
            processing: Number(source?.processing) || 0,
            available: Number(source?.available) || 0,
            failed: Number(source?.failed) || 0,
            total: Number(source?.total) || 0,
        };
    };

    const listIssues = async (config, { filter = 'open', take = 100, skip = 0 } = {}) => {
        const params = new URLSearchParams({
            filter: ['all', 'open', 'resolved'].includes(String(filter)) ? String(filter) : 'open',
            take: String(Math.min(100, Math.max(1, Number(take) || 100))),
            skip: String(Math.max(0, Number(skip) || 0)),
            sort: 'modified',
        });
        return fetchSeerrJson(config, `/api/v1/issue?${params.toString()}`);
    };

    const updateIssueStatus = async (config, issueId, status) => {
        const normalizedStatus = status === 'resolved' ? 'resolved' : 'open';
        const result = await fetchSeerrJson(config, `/api/v1/issue/${encodeURIComponent(issueId)}/${normalizedStatus}`, { method: 'POST' });
        invalidateRequestLists();
        return result;
    };

    const getIssue = (config, issueId) => fetchSeerrJson(config, `/api/v1/issue/${encodeURIComponent(issueId)}`);

    const commentOnIssue = async (config, issueId, message) => {
        const result = await fetchSeerrJson(config, `/api/v1/issue/${encodeURIComponent(issueId)}/comment`, {
            method: 'POST',
            body: { message: String(message || '').trim() },
        });
        invalidateRequestLists();
        return result;
    };

    const mutateRequest = async (config, requestId, action, body = null) => {
        const id = encodeURIComponent(requestId);
        const suffix = action ? `/${action}` : '';
        const result = await fetchSeerrJson(config, `/api/v1/request/${id}${suffix}`, {
            method: action ? 'POST' : 'DELETE',
            body,
        });
        invalidateRequestLists();
        return result;
    };

    const startCacheWarmer = (loadConfig) => {
        const warm = async (config) => {
            if (!getRequestAppGate(config).ready) return;
            const pages = await Promise.all(['trending', 'popular', 'upcoming'].map((category) => (
                discover(config, { category, mediaType: 'all', page: 1 })
            )));
            const remotePosters = pages.flatMap((page) => page.results).map((item) => {
                try {
                    return new URL(item.posterUrl, 'http://portal').searchParams.get('url');
                } catch {
                    return null;
                }
            }).filter(Boolean);
            await imageCache.warm(remotePosters);
        };
        return startAdaptiveCacheWarmer({ loadConfig, warm, log: (message) => log(`Request discovery ${message}`) });
    };

    return {
        getRequestAppGate,
        search,
        discover,
        getMediaDetails,
        requestMedia,
        reportIssue,
        listRequests,
        getRequestCounts,
        listIssues,
        updateIssueStatus,
        getIssue,
        commentOnIssue,
        ensureRequestAppUser,
        ensureRequestAppUsers,
        removeRequestAppUser,
        approveRequest: (config, requestId) => mutateRequest(config, requestId, 'approve'),
        declineRequest: (config, requestId, reason = '') => mutateRequest(config, requestId, 'decline', reason ? { reason } : {}),
        deleteRequest: (config, requestId) => mutateRequest(config, requestId, ''),
        retryRequest: (config, requestId) => mutateRequest(config, requestId, 'retry'),
        getCachedPosterImage: (remoteUrl) => imageCache.peek(remoteUrl),
        warmPosterImage: (remoteUrl) => imageCache.load(remoteUrl).catch(() => null),
        startCacheWarmer,
    };
};
