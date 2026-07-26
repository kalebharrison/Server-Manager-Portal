import {
    isAdultMediaItem,
    normalizeIssueType,
    normalizeMediaType,
    normalizeRequestItem,
} from './request-app-media.js';

export const createCatalogOperations = ({
    getCredentials,
    fetchSeerrJson,
    cachedSeerrJson,
    proxyPoster,
    invalidateRequestLists,
    resolveRequestUserId,
    ensureRequestAppUser,
    getMediaDetails,
}) => {
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
            // Seerr/Overseerr accept "all" for every requestable season.
            if (seasons === 'all') {
                body.seasons = 'all';
            } else {
                const selectedSeasons = Array.isArray(seasons)
                    ? seasons.map((season) => Number(season)).filter((season) => Number.isFinite(season) && season >= 0)
                    : [];
                if (!selectedSeasons.length) throw new Error('Select at least one season');
                body.seasons = selectedSeasons;
            }
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
        const { publicBaseUrl } = await getCredentials(config);
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

    const getRequest = async (config, requestId) => {
        const id = Number(requestId);
        if (!Number.isFinite(id) || id <= 0) throw new Error('Invalid request id');
        const { publicBaseUrl } = await getCredentials(config);
        const request = await fetchSeerrJson(config, `/api/v1/request/${encodeURIComponent(id)}`);
        return normalizeRequestItem(request, publicBaseUrl, proxyPoster);
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

    return {
        requestMedia,
        reportIssue,
        listRequests,
        getRequest,
        getRequestCounts,
        listIssues,
        updateIssueStatus,
        getIssue,
        commentOnIssue,
        mutateRequest,
    };
};
