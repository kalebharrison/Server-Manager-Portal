const SEERR_TYPES = new Set(['seerr', 'overseerr', 'jellyseerr']);
const POSTER_SIZE = 'w342';
const BACKDROP_SIZE = 'w1280';
const PROFILE_SIZE = 'w185';
const LOGO_SIZE = 'w154';
const ISSUE_TYPES = {
    video: 1,
    audio: 2,
    subtitles: 3,
    other: 4,
};
const TMDB_GENRES = {
    12: 'Adventure',
    14: 'Fantasy',
    16: 'Animation',
    18: 'Drama',
    27: 'Horror',
    28: 'Action',
    35: 'Comedy',
    36: 'History',
    37: 'Western',
    53: 'Thriller',
    80: 'Crime',
    99: 'Documentary',
    878: 'Science Fiction',
    9648: 'Mystery',
    10402: 'Music',
    10749: 'Romance',
    10751: 'Family',
    10752: 'War',
    10759: 'Action & Adventure',
    10762: 'Kids',
    10763: 'News',
    10764: 'Reality',
    10765: 'Sci-Fi & Fantasy',
    10766: 'Soap',
    10767: 'Talk',
    10768: 'War & Politics',
    10770: 'TV Movie',
};

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

const createMemoryCache = ({ maxEntries = 250 } = {}) => {
    const entries = new Map();
    const pending = new Map();

    const prune = () => {
        const now = Date.now();
        for (const [key, value] of entries) {
            if (value.expiresAt <= now) entries.delete(key);
        }
        while (entries.size > maxEntries) {
            const oldest = entries.keys().next().value;
            if (!oldest) break;
            entries.delete(oldest);
        }
    };

    return {
        getOrSet: async (key, ttlMs, loader) => {
            const now = Date.now();
            const cached = entries.get(key);
            if (cached && cached.expiresAt > now) {
                entries.delete(key);
                entries.set(key, cached);
                return cached.value;
            }
            if (pending.has(key)) return pending.get(key);
            const promise = Promise.resolve()
                .then(loader)
                .then((value) => {
                    entries.set(key, { value, expiresAt: Date.now() + ttlMs });
                    prune();
                    return value;
                })
                .finally(() => pending.delete(key));
            pending.set(key, promise);
            return promise;
        },
        clear: () => {
            entries.clear();
            pending.clear();
        },
    };
};

const cleanBaseUrl = (baseUrl) => String(baseUrl || '').replace(/\/+$/, '');

const tmdbImageUrl = (path, size) => {
    if (!path) return '';
    const raw = String(path);
    if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
    return `https://image.tmdb.org/t/p/${size}${raw.startsWith('/') ? raw : `/${raw}`}`;
};

const seerrImageUrl = (baseUrl, path, size) => {
    if (!path) return '';
    const raw = String(path);
    if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
    return `${cleanBaseUrl(baseUrl)}/imageproxy/tmdb/t/p/${size}${raw.startsWith('/') ? raw : `/${raw}`}`;
};

const posterUrl = (path, baseUrl) => tmdbImageUrl(path, POSTER_SIZE) || seerrImageUrl(baseUrl, path, POSTER_SIZE);
const backdropUrl = (path, baseUrl) => tmdbImageUrl(path, BACKDROP_SIZE) || seerrImageUrl(baseUrl, path, BACKDROP_SIZE);
const profileUrl = (path) => tmdbImageUrl(path, PROFILE_SIZE);
const logoUrl = (path) => tmdbImageUrl(path, LOGO_SIZE);

const numberOrNull = (value) => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
};

const normalizeNamedValue = (item = {}, { includeLogo = false } = {}) => {
    if (typeof item === 'string') {
        const name = item.trim();
        return name ? { name } : null;
    }
    const name = item.name || item.displayName || item.englishName || '';
    if (!name) return null;
    const logoPath = item.logoPath || item.logo_path || '';
    return {
        id: item.id ?? null,
        name,
        ...(includeLogo && logoPath ? { logoUrl: logoUrl(logoPath) } : {}),
    };
};

const normalizeGenre = (item = {}) => {
    const id = Number(typeof item === 'object' ? item.id : item);
    if (Number.isFinite(id) && TMDB_GENRES[id]) return { id, name: TMDB_GENRES[id] };
    return normalizeNamedValue(item);
};

const normalizeCredit = (item = {}) => {
    const name = item.name || item.originalName || item.original_name || '';
    if (!name) return null;
    const profilePath = item.profilePath || item.profile_path || '';
    const role = item.character || item.job || item.roles?.[0]?.character || item.roles?.[0]?.job || item.knownForDepartment || item.known_for_department || '';
    return {
        id: item.id ?? null,
        name,
        role,
        ...(profilePath ? { profileUrl: profileUrl(profilePath) } : {}),
    };
};

const normalizeArray = (items, mapper, limit = 24) => {
    const source = Array.isArray(items) ? items : items ? [items] : [];
    const seen = new Set();
    const normalized = [];
    for (const item of source) {
        const next = mapper(item);
        if (!next?.name) continue;
        const key = `${String(next.name).toLowerCase()}:${String(next.role || '')}`;
        if (seen.has(key)) continue;
        seen.add(key);
        normalized.push(next);
        if (normalized.length >= limit) break;
    }
    return normalized;
};

const firstName = (items) => {
    const match = normalizeArray(items, normalizeNamedValue, 1)[0];
    return match?.name || null;
};

const requestStatusLabel = (status) => {
    const value = Number(status);
    if (value === 1) return 'pending';
    if (value === 2) return 'approved';
    if (value === 3) return 'declined';
    if (value === 4) return 'failed';
    return 'unknown';
};

const mediaStatusLabel = (status) => {
    const value = Number(status);
    if (value === 2) return 'pending';
    if (value === 3) return 'processing';
    if (value === 4) return 'partially_available';
    if (value === 5) return 'available';
    return 'unknown';
};

const normalizeMediaType = (value) => {
    const type = String(value || '').toLowerCase();
    if (type === 'tv' || type === 'show') return 'tv';
    return 'movie';
};

const findRequestState = (item = {}) => {
    const mediaInfo = item.mediaInfo || item.media || {};
    const request = item.request || mediaInfo.request || (Array.isArray(mediaInfo.requests) ? mediaInfo.requests[0] : null);
    const requestStatus = request?.status ?? item.requestStatus ?? null;
    const mediaStatus = mediaInfo.status ?? item.mediaStatus ?? null;
    const requestLabel = requestStatusLabel(requestStatus);
    const mediaLabel = mediaStatusLabel(mediaStatus);
    const available = mediaLabel === 'available' || mediaLabel === 'partially_available';
    const processing = mediaLabel === 'processing';
    const pending = requestLabel === 'pending' || mediaLabel === 'pending';
    const approved = requestLabel === 'approved';

    return {
        requestId: request?.id ?? null,
        requestStatus: Number(requestStatus) || null,
        requestStatusLabel: requestStatus ? requestLabel : null,
        mediaStatus: Number(mediaStatus) || null,
        mediaStatusLabel: mediaStatus ? mediaLabel : null,
        available,
        processing,
        pending,
        approved,
        canRequest: !(available || processing || pending || approved),
    };
};

const mapSeason = (season = {}) => {
    const seasonNumber = Number(season.seasonNumber ?? season.season_number);
    if (!Number.isFinite(seasonNumber)) return null;
    return {
        seasonNumber,
        name: season.name || (seasonNumber === 0 ? 'Specials' : `Season ${seasonNumber}`),
        episodeCount: Number(season.episodeCount ?? season.episode_count) || 0,
        status: Number(season.status) || null,
        statusLabel: season.status ? requestStatusLabel(season.status) : null,
    };
};

const normalizeMediaItem = (item = {}, publicBaseUrl = '') => {
    const mediaInfo = item.mediaInfo || {};
    const mediaType = normalizeMediaType(item.mediaType || item.type || mediaInfo.mediaType);
    const tmdbId = Number(item.tmdbId ?? mediaInfo.tmdbId ?? item.id);
    const title = item.title || item.name || item.originalTitle || item.original_title || item.originalName || item.original_name || 'Unknown title';
    const releaseDate = item.releaseDate || item.release_date || null;
    const firstAirDate = item.firstAirDate || item.first_air_date || null;
    const date = releaseDate || firstAirDate || '';
    const posterPath = item.posterPath || item.poster_path || mediaInfo.posterPath || mediaInfo.poster_path || item.poster || '';
    const backdropPath = item.backdropPath || item.backdrop_path || mediaInfo.backdropPath || mediaInfo.backdrop_path || item.backdrop || '';
    const credits = item.credits || item.combinedCredits || item.combined_credits || {};
    const castSource = Array.isArray(credits.cast) ? credits.cast : item.cast;
    const crewSource = Array.isArray(credits.crew) ? credits.crew : item.crew;
    const genreSource = item.genres || item.genre || item.genreIds || item.genre_ids || [];
    const companySource = item.productionCompanies || item.production_companies || [];
    const networkSource = item.networks || item.network || [];
    const creatorSource = item.createdBy || item.created_by || [];
    const episodeRunTime = item.episodeRunTime || item.episode_run_time;
    const runtime = item.runtime || (Array.isArray(episodeRunTime) ? episodeRunTime[0] : episodeRunTime);
    const externalIds = item.externalIds || item.external_ids || {};
    const lastEpisode = item.lastEpisodeToAir || item.last_episode_to_air || {};
    const nextEpisode = item.nextEpisodeToAir || item.next_episode_to_air || {};
    const seasons = Array.isArray(item.seasons) ? item.seasons.map(mapSeason).filter(Boolean) : [];
    const productionCompanies = normalizeArray(companySource, (company) => normalizeNamedValue(company, { includeLogo: true }), 8);
    const networks = normalizeArray(networkSource, (network) => normalizeNamedValue(network, { includeLogo: true }), 4);

    return {
        id: tmdbId,
        tmdbId,
        mediaId: Number(mediaInfo.id ?? item.mediaId) || null,
        mediaType,
        title,
        year: date ? String(date).slice(0, 4) : null,
        overview: item.overview || '',
        tagline: item.tagline || '',
        posterUrl: posterUrl(posterPath, publicBaseUrl),
        backdropUrl: backdropUrl(backdropPath, publicBaseUrl),
        rating: Number(item.voteAverage ?? item.vote_average) || null,
        releaseDate,
        firstAirDate,
        runtime: numberOrNull(runtime),
        status: item.status || null,
        originalLanguage: item.originalLanguage || item.original_language || null,
        homepage: item.homepage || null,
        imdbId: item.imdbId || item.imdb_id || externalIds.imdbId || externalIds.imdb_id || null,
        budget: numberOrNull(item.budget),
        revenue: numberOrNull(item.revenue),
        network: firstName(networks),
        studio: firstName(productionCompanies),
        numberOfSeasons: numberOrNull(item.numberOfSeasons || item.number_of_seasons),
        numberOfEpisodes: numberOrNull(item.numberOfEpisodes || item.number_of_episodes),
        lastAirDate: item.lastAirDate || item.last_air_date || lastEpisode.airDate || lastEpisode.air_date || null,
        nextAirDate: nextEpisode.airDate || nextEpisode.air_date || null,
        genres: normalizeArray(genreSource, normalizeGenre, 12),
        productionCompanies,
        cast: normalizeArray(castSource, normalizeCredit, 16),
        crew: normalizeArray(crewSource, normalizeCredit, 12),
        creators: normalizeArray(creatorSource, normalizeCredit, 8),
        seasons,
        ...findRequestState(item),
    };
};

const normalizeRequestItem = (request = {}, publicBaseUrl = '') => {
    const media = request.media || {};
    const mediaType = normalizeMediaType(request.type ?? media.mediaType ?? media.type);
    const title = media.title || media.name || request.title || request.name || 'Unknown title';
    const date = media.releaseDate || media.firstAirDate || '';
    const requestedBy = request.requestedBy || {};

    return {
        id: Number(request.id) || 0,
        status: Number(request.status) || null,
        statusLabel: requestStatusLabel(request.status),
        mediaType,
        type: mediaType,
        title,
        year: date ? String(date).slice(0, 4) : null,
        overview: media.overview || '',
        posterUrl: posterUrl(media.posterPath || media.poster, publicBaseUrl),
        backdropUrl: backdropUrl(media.backdropPath || media.backdrop, publicBaseUrl),
        requestedBy: {
            id: requestedBy.id || null,
            displayName: requestedBy.displayName || requestedBy.username || requestedBy.email || 'Unknown',
            email: requestedBy.email || null,
            avatar: requestedBy.avatar
                ? (String(requestedBy.avatar).startsWith('http') ? requestedBy.avatar : `${cleanBaseUrl(publicBaseUrl)}${String(requestedBy.avatar).startsWith('/') ? requestedBy.avatar : `/${requestedBy.avatar}`}`)
                : '',
        },
        createdAt: request.createdAt || null,
        updatedAt: request.updatedAt || null,
        tmdbId: Number(media.tmdbId) || null,
        is4k: !!request.is4k,
        seerrUrl: `${cleanBaseUrl(publicBaseUrl)}/requests`,
    };
};

const safePage = (value) => {
    const page = Math.max(1, Number(value) || 1);
    return Math.min(page, 50);
};

const normalizeIssueType = (value) => ISSUE_TYPES[String(value || '').toLowerCase()] || ISSUE_TYPES.other;

export const createRequestAppService = ({ fetchWithTimeout, resolveIntegrationUrlForFetch, requestAppInternalUrl = '', log = () => {} }) => {
    const cache = createMemoryCache();

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

    const cachedSeerrJson = (config, path, ttlMs) => {
        const { baseUrl, type } = getCredentials(config);
        return cache.getOrSet(`${type}:${baseUrl}:${path}`, ttlMs, () => fetchSeerrJson(config, path));
    };

    const search = async (config, { query, page = 1 } = {}) => {
        const q = String(query || '').trim();
        if (q.length < 2) return { results: [], pageInfo: { page: 1, results: 0 } };
        const params = new URLSearchParams({ query: q, page: String(safePage(page)) });
        const { publicBaseUrl } = getCredentials(config);
        const payload = await cachedSeerrJson(config, `/api/v1/search?${params.toString()}`, 15_000);
        const results = Array.isArray(payload?.results) ? payload.results : [];
        return {
            results: results
                .filter((item) => ['movie', 'tv'].includes(String(item.mediaType || item.type || '').toLowerCase()))
                .map((item) => normalizeMediaItem(item, publicBaseUrl)),
            pageInfo: payload?.pageInfo || { page: safePage(page), results: results.length },
        };
    };

    const normalizeDiscoverPayload = (payload, page, publicBaseUrl) => {
        const results = Array.isArray(payload?.results) ? payload.results : Array.isArray(payload) ? payload : [];
        return {
            results: results
                .filter((item) => ['movie', 'tv'].includes(String(item.mediaType || item.type || '').toLowerCase()))
                .map((item) => normalizeMediaItem(item, publicBaseUrl)),
            pageInfo: payload?.pageInfo || { page: safePage(page), results: results.length },
        };
    };

    const discover = async (config, { category = 'trending', page = 1 } = {}) => {
        const safeCategory = ['trending', 'popular', 'upcoming', 'movies', 'tv'].includes(category) ? category : 'trending';
        const endpointMap = {
            trending: ['/api/v1/discover/trending'],
            popular: ['/api/v1/discover/movies', '/api/v1/discover/tv'],
            upcoming: ['/api/v1/discover/movies/upcoming', '/api/v1/discover/tv/upcoming'],
            movies: ['/api/v1/discover/movies'],
            tv: ['/api/v1/discover/tv'],
        };
        const params = new URLSearchParams({ page: String(safePage(page)) });
        const { publicBaseUrl } = getCredentials(config);
        const payloads = await Promise.all(endpointMap[safeCategory].map((endpoint) => (
            cachedSeerrJson(config, `${endpoint}?${params.toString()}`, 60_000)
        )));
        if (payloads.length === 1) return normalizeDiscoverPayload(payloads[0], page, publicBaseUrl);
        const normalized = payloads.flatMap((payload) => normalizeDiscoverPayload(payload, page, publicBaseUrl).results);
        return {
            results: normalized,
            pageInfo: { page: safePage(page), results: normalized.length },
        };
    };

    const getMediaDetails = async (config, { mediaType, tmdbId }) => {
        const type = normalizeMediaType(mediaType);
        const id = Number(tmdbId);
        if (!Number.isFinite(id) || id <= 0) throw new Error('Invalid media id');
        const { publicBaseUrl } = getCredentials(config);
        const payload = await cachedSeerrJson(config, `/api/v1/${type}/${encodeURIComponent(id)}`, 30_000);
        return normalizeMediaItem({ ...payload, mediaType: type, id }, publicBaseUrl);
    };

    const listRequestUsers = async (config) => {
        const payload = await cachedSeerrJson(config, '/api/v1/user?take=1000&sort=displayname', 300_000);
        const results = Array.isArray(payload?.results) ? payload.results : [];
        return results.map((user) => ({
            id: Number(user.id) || null,
            displayName: user.displayName || user.username || user.email || `User #${user.id}`,
            email: user.email || null,
            username: user.username || null,
        })).filter((user) => user.id);
    };

    const resolveRequestUserId = async (config, sessionUser = {}) => {
        const email = String(sessionUser.email || '').trim().toLowerCase();
        const username = String(sessionUser.username || '').trim().toLowerCase();
        if (!email && !username) return null;
        try {
            const users = await listRequestUsers(config);
            const match = users.find((user) => (
                (email && String(user.email || '').toLowerCase() === email)
                || (username && String(user.username || user.displayName || '').toLowerCase() === username)
            ));
            return match?.id || null;
        } catch (err) {
            log(`Request app user mapping skipped: ${err.message}`);
            return null;
        }
    };

    const requestMedia = async (config, { mediaType, tmdbId, seasons = [], is4k = false, sessionUser = null } = {}) => {
        const type = normalizeMediaType(mediaType);
        const id = Number(tmdbId);
        if (!Number.isFinite(id) || id <= 0) throw new Error('Invalid media id');
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
        const requestUserId = await resolveRequestUserId(config, sessionUser || {});
        if (requestUserId) body.userId = requestUserId;

        const result = await fetchSeerrJson(config, '/api/v1/request', { method: 'POST', body });
        cache.clear();
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
        cache.clear();
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
            results: results.map((item) => normalizeRequestItem(item, publicBaseUrl)),
            pageInfo: payload?.pageInfo || { page: 1, results: results.length },
        };
    };

    const getRequestCounts = async (config) => {
        const payload = await cachedSeerrJson(config, '/api/v1/request/count', 30_000);
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

    const mutateRequest = async (config, requestId, action, body = null) => {
        const id = encodeURIComponent(requestId);
        const suffix = action ? `/${action}` : '';
        const result = await fetchSeerrJson(config, `/api/v1/request/${id}${suffix}`, {
            method: action ? 'POST' : 'DELETE',
            body,
        });
        cache.clear();
        return result;
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
        approveRequest: (config, requestId) => mutateRequest(config, requestId, 'approve'),
        declineRequest: (config, requestId, reason = '') => mutateRequest(config, requestId, 'decline', reason ? { reason } : {}),
        deleteRequest: (config, requestId) => mutateRequest(config, requestId, ''),
        retryRequest: (config, requestId) => mutateRequest(config, requestId, 'retry'),
    };
};
