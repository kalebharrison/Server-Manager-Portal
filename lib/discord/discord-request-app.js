import path from 'path';
import { createPortalRequestService } from '../portal-request/portalRequestService.js';
import { createTmdbDiscoverRouter } from '../portal-request/tmdbDiscover.js';

const yearFromDate = (value) => {
    const match = String(value || '').match(/^(\d{4})/);
    return match ? Number(match[1]) : null;
};

const mediaTypeOf = (item = {}) => {
    const raw = String(item.mediaType || item.type || '').toLowerCase();
    if (raw === 'tv' || raw === 'series' || raw === 'show') return 'tv';
    if (raw === 'movie') return 'movie';
    if (raw === 'person') return 'person';
    return '';
};

/** Shape TMDB / portal rows into the Discord bot media card contract. */
export const toDiscordMediaItem = (item = {}) => {
    const mediaType = mediaTypeOf(item);
    const tmdbId = Number(item.tmdbId ?? item.id);
    const title = String(item.title || item.name || '').trim();
    const year = item.year ?? yearFromDate(item.releaseDate || item.firstAirDate);
    return {
        ...item,
        tmdbId: Number.isFinite(tmdbId) && tmdbId > 0 ? tmdbId : null,
        mediaType,
        title: title || String(tmdbId || 'Untitled'),
        year: year || null,
        overview: item.overview || '',
        posterPath: item.posterPath || item.poster_path || null,
        rating: item.rating ?? item.voteAverage ?? null,
        canRequest: item.canRequest !== false,
        available: !!item.available,
        processing: !!item.processing,
        pending: !!item.pending || !!item.requested,
    };
};

export const toDiscordPersonItem = (item = {}) => ({
    personId: Number(item.personId ?? item.id) || null,
    name: String(item.name || '').trim() || 'Unknown',
    knownFor: Array.isArray(item.knownFor)
        ? item.knownFor.map((entry) => String(entry?.title || entry?.name || '').trim()).filter(Boolean)
        : [],
    profilePath: item.profilePath || item.profile_path || null,
});

export const toDiscordRequestItem = (dto = {}) => {
    const mediaType = mediaTypeOf(dto) || 'movie';
    const status = Number(dto.status);
    const mediaStatus = Number(dto.mediaStatus);
    const available = dto.available === true
        || mediaStatus === 5
        || mediaStatus === 4;
    const pending = dto.pending === true || status === 1;
    const processing = dto.processing === true
        || (!!dto.isDownloading && !available)
        || (status === 2 && !available && !pending);
    const requestedBy = dto.requestedBy?.displayName
        || dto.requestedBy?.username
        || dto.requestedBy
        || dto.userName
        || '';
    return toDiscordMediaItem({
        ...dto,
        mediaType,
        tmdbId: dto.tmdbId,
        requested: pending || processing || available,
        pending,
        processing,
        available,
        canRequest: false,
        requestedBy: typeof requestedBy === 'string' ? requestedBy : '',
        userName: dto.requestedBy?.username || dto.userName || '',
        requestStatusLabel: dto.statusLabel || dto.requestStatusLabel || '',
    });
};

const discoverPathFor = (category) => {
    if (category === 'upcoming') return ['/discover/movies/upcoming', '/discover/tv/upcoming'];
    if (category === 'movies') return ['/discover/movies'];
    if (category === 'tv') return ['/discover/tv'];
    if (category === 'popular') return ['/discover/movies', '/discover/tv'];
    return ['/discover/trending'];
};

/**
 * Late-bound Discord facade over portal TMDB discover + native requests.
 * Bot handlers expect search / discover / requestMedia — not the portal store API.
 */
export const createDiscordRequestApp = ({
    loadFile,
    configPath,
    usersPath,
    configDir,
    resolveUrl = (url) => url,
    createRouter = createTmdbDiscoverRouter,
    createService = createPortalRequestService,
    fetchImpl,
    onRequestStatusChange = null,
} = {}) => {
    const loadUsers = async () => {
        const users = await loadFile(usersPath, []);
        return Array.isArray(users) ? users : [];
    };

    const loadContext = async (configOverride) => {
        const config = configOverride && typeof configOverride === 'object'
            ? configOverride
            : await loadFile(configPath, {});
        const users = await loadUsers();
        const resolveUser = async (id) => users.find((user) => (
            String(user?.id) === String(id)
            || String(user?.plexId) === String(id)
            || String(user?.jellyfinId) === String(id)
        )) || null;
        const service = createService({
            dataDir: path.join(configDir, 'requests'),
            config,
            resolveUrl,
            resolveUser,
            listUsers: async () => users,
            fetchImpl,
            onRequestStatusChange,
        });
        const router = createRouter(config, { fetchImpl });
        return { config, service, router };
    };

    const mapPage = (payload = {}, mediaFilter = 'all') => {
        const results = (Array.isArray(payload.results) ? payload.results : [])
            .map((item) => toDiscordMediaItem(item))
            .filter((item) => item.tmdbId && (item.mediaType === 'movie' || item.mediaType === 'tv'))
            .filter((item) => mediaFilter === 'all' || item.mediaType === mediaFilter);
        const page = Number(payload.page) || 1;
        const totalPages = Number(payload.totalPages || payload.total_pages) || 1;
        return {
            results,
            pageInfo: {
                page,
                totalPages,
                hasNextPage: page < totalPages,
            },
        };
    };

    const search = async (config, { query, mediaType = 'all', page = 1 } = {}) => {
        const { router } = await loadContext(config);
        const payload = await router.fetchPath('/search', {
            query: String(query || '').trim(),
            page,
        });
        return mapPage(payload, mediaType === 'tv' || mediaType === 'movie' ? mediaType : 'all');
    };

    const searchPeople = async (config, { query, page = 1 } = {}) => {
        const { router } = await loadContext(config);
        const payload = await router.fetchPath('/search', {
            query: String(query || '').trim(),
            page,
        });
        const results = (Array.isArray(payload.results) ? payload.results : [])
            .filter((item) => mediaTypeOf(item) === 'person' || item.name)
            .filter((item) => mediaTypeOf(item) !== 'movie' && mediaTypeOf(item) !== 'tv')
            .map((item) => toDiscordPersonItem(item))
            .filter((item) => item.personId);
        return { results };
    };

    const getPersonFilmography = async (config, {
        personId, mediaType = 'all', creditType = 'cast', limit = 5,
    } = {}) => {
        const { router } = await loadContext(config);
        const [person, credits] = await Promise.all([
            router.fetchPath(`/person/${Number(personId)}`),
            router.fetchPath(`/person/${Number(personId)}/combined_credits`),
        ]);
        const pool = creditType === 'crew'
            ? (Array.isArray(credits?.crew) ? credits.crew : [])
            : (Array.isArray(credits?.cast) ? credits.cast : []);
        const results = pool
            .map((item) => toDiscordMediaItem(item))
            .filter((item) => item.tmdbId && (item.mediaType === 'movie' || item.mediaType === 'tv'))
            .filter((item) => mediaType === 'all' || item.mediaType === mediaType)
            .sort((a, b) => String(b.releaseDate || b.firstAirDate || b.year || '')
                .localeCompare(String(a.releaseDate || a.firstAirDate || a.year || '')))
            .slice(0, Math.max(1, Number(limit) || 5));
        return {
            person: { personId: Number(personId), name: person?.name || 'Unknown' },
            results,
        };
    };

    const getMediaDetails = async (config, { mediaType, tmdbId, sessionUser } = {}) => {
        const { router, service } = await loadContext(config);
        const type = mediaType === 'tv' ? 'tv' : 'movie';
        const path = type === 'tv' ? `/tv/${Number(tmdbId)}` : `/movie/${Number(tmdbId)}`;
        const details = await router.fetchPath(path);
        const base = toDiscordMediaItem({
            ...details,
            mediaType: type,
            tmdbId: Number(tmdbId),
            title: details?.title || details?.name,
        });
        if (sessionUser && typeof service.getMemberRequestOptions === 'function') {
            try {
                const options = await service.getMemberRequestOptions(sessionUser, {
                    mediaType: type,
                    mediaId: Number(tmdbId),
                });
                const mediaStatus = Number(options?.mediaStatus);
                return {
                    ...base,
                    ...options,
                    tmdbId: Number(tmdbId),
                    mediaType: type,
                    title: options?.title || base.title,
                    overview: options?.overview || base.overview,
                    posterPath: options?.posterPath || base.posterPath,
                    seasons: options?.seasons || details?.seasons || [],
                    canRequest: options?.canRequest !== false,
                    available: mediaStatus === 5 || mediaStatus === 4,
                    processing: mediaStatus === 3 || mediaStatus === 2,
                    pending: mediaStatus === 2,
                };
            } catch {
                // Fall through to TMDB-only details.
            }
        }
        return {
            ...base,
            seasons: Array.isArray(details?.seasons) ? details.seasons : [],
            canRequest: true,
        };
    };

    const requestMedia = async (config, {
        mediaType, tmdbId, seasons, sessionUser,
    } = {}) => {
        const { service } = await loadContext(config);
        const type = mediaType === 'tv' ? 'tv' : 'movie';
        const body = {
            mediaType: type,
            tmdbId: Number(tmdbId),
        };
        if (type === 'tv') {
            if (seasons === 'all' || seasons == null || seasons === '') body.seasons = 'all';
            else body.seasons = [].concat(seasons).map(Number).filter((n) => Number.isFinite(n) && n > 0);
        }
        return service.createMemberRequest(sessionUser, body);
    };

    const listRequests = async (config, { filter = 'all', take = 20, skip = 0 } = {}) => {
        const { service } = await loadContext(config);
        const page = await service.listAdminRequests({ filter, take, skip });
        return {
            ...page,
            results: (Array.isArray(page?.results) ? page.results : []).map(toDiscordRequestItem),
        };
    };

    const getRequestCounts = async (config) => {
        const { service } = await loadContext(config);
        return service.getAdminRequestCounts();
    };

    const discover = async (config, { category = 'trending', mediaType = 'all', page = 1 } = {}) => {
        const { router } = await loadContext(config);
        const paths = discoverPathFor(category);
        const pages = await Promise.all(paths.map((discoverPath) => router.fetchPath(discoverPath, { page })));
        const seen = new Set();
        const merged = [];
        let hasNextPage = false;
        let totalPages = 1;
        for (const payload of pages) {
            const mapped = mapPage(payload, mediaType === 'tv' || mediaType === 'movie' ? mediaType : 'all');
            hasNextPage = hasNextPage || mapped.pageInfo.hasNextPage;
            totalPages = Math.max(totalPages, mapped.pageInfo.totalPages);
            for (const item of mapped.results) {
                const key = `${item.mediaType}:${item.tmdbId}`;
                if (seen.has(key)) continue;
                seen.add(key);
                merged.push(item);
            }
        }
        return {
            results: merged,
            pageInfo: {
                page: Number(page) || 1,
                totalPages,
                hasNextPage,
            },
        };
    };

    const discoverByTheme = async (config, {
        theme, mediaType = 'movie', recent = true, limit = 5,
    } = {}) => {
        const type = mediaType === 'tv' ? 'tv' : (mediaType === 'all' ? 'all' : 'movie');
        const page = await search(config, { query: theme, mediaType: type, page: 1 });
        let results = Array.isArray(page.results) ? [...page.results] : [];
        if (recent) {
            results.sort((a, b) => String(b.releaseDate || b.firstAirDate || b.year || '')
                .localeCompare(String(a.releaseDate || a.firstAirDate || a.year || '')));
        }
        return {
            theme: String(theme || '').trim(),
            results: results.slice(0, Math.max(1, Number(limit) || 5)),
        };
    };

    return {
        search,
        searchPeople,
        getPersonFilmography,
        getMediaDetails,
        requestMedia,
        listRequests,
        getRequestCounts,
        discover,
        discoverByTheme,
    };
};

export default createDiscordRequestApp;
