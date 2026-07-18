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
import { getRequestAppGate } from './request-app-gate.js';

const DISCOVER_PAGE_SIZE = 20;
const ANIME_SOURCE_PAGE_BATCH = 5;

export const createRequestAppCatalog = ({
    client,
    users,
    tvdbService = null,
    getActiveAcquisitionKeys = async () => new Set(),
    log = () => {},
}) => {
    const {
        imageCache,
        proxyPoster,
        getCredentials,
        fetchSeerrJson,
        cachedSeerrJson,
        invalidateRequestLists,
    } = client;
    const { resolveRequestUserId, ensureRequestAppUser } = users;

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

    const requestMedia = async (config, { mediaType, tmdbId, seasons = [], is4k = false, sessionUser = null } = {}) => {
        const type = normalizeMediaType(mediaType);
        const id = Number(tmdbId);
        if (!Number.isFinite(id) || id <= 0) throw new Error('Invalid media id');
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
        mutateRequest,
        startCacheWarmer,
    };
};
