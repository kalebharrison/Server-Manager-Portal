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

const cleanBaseUrl = (baseUrl) => String(baseUrl || '').replace(/\/+$/, '');

export const tmdbImageUrl = (path, size) => {
    if (!path) return '';
    const raw = String(path);
    if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
    return `https://image.tmdb.org/t/p/${size}${raw.startsWith('/') ? raw : `/${raw}`}`;
};

export const seerrImageUrl = (baseUrl, path, size) => {
    if (!path) return '';
    const raw = String(path);
    if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
    return `${cleanBaseUrl(baseUrl)}/imageproxy/tmdb/t/p/${size}${raw.startsWith('/') ? raw : `/${raw}`}`;
};

const posterUrl = (path, baseUrl, proxy = (value) => value) => {
    const remoteUrl = tmdbImageUrl(path, POSTER_SIZE) || seerrImageUrl(baseUrl, path, POSTER_SIZE);
    return remoteUrl ? proxy(remoteUrl) : '';
};
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

export const requestStatusLabel = (status) => {
    const value = Number(status);
    if (value === 1) return 'pending';
    if (value === 2) return 'approved';
    if (value === 3) return 'declined';
    if (value === 4) return 'failed';
    return 'unknown';
};

export const mediaStatusLabel = (status) => {
    const value = Number(status);
    if (value === 2) return 'pending';
    if (value === 3) return 'processing';
    if (value === 4) return 'partially_available';
    if (value === 5) return 'available';
    return 'unknown';
};

export const normalizeMediaType = (value) => {
    const type = String(value || '').toLowerCase();
    if (type === 'tv' || type === 'show') return 'tv';
    return 'movie';
};

export const findRequestState = (item = {}) => {
    const mediaInfo = item.mediaInfo || item.media || {};
    const request = item.request || mediaInfo.request || (Array.isArray(mediaInfo.requests) ? mediaInfo.requests[0] : null);
    const requestStatus = request?.status ?? item.requestStatus ?? null;
    const mediaStatus = mediaInfo.status ?? item.mediaStatus ?? null;
    const requestLabel = requestStatusLabel(requestStatus);
    const mediaLabel = mediaStatusLabel(mediaStatus);
    const available = mediaLabel === 'available' || mediaLabel === 'partially_available';
    const pending = requestLabel === 'pending' || mediaLabel === 'pending';
    const approved = requestLabel === 'approved';
    const requested = mediaLabel === 'processing' || pending || approved;

    return {
        requestId: request?.id ?? null,
        requestStatus: Number(requestStatus) || null,
        requestStatusLabel: requestStatus ? requestLabel : null,
        mediaStatus: Number(mediaStatus) || null,
        mediaStatusLabel: mediaStatus ? mediaLabel : null,
        available,
        processing: false,
        requested,
        pending,
        approved,
        canRequest: !(available || requested),
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

export const normalizeMediaItem = (item = {}, publicBaseUrl = '', proxyPoster = (value) => value) => {
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
        posterUrl: posterUrl(posterPath, publicBaseUrl, proxyPoster),
        backdropUrl: backdropUrl(backdropPath, publicBaseUrl),
        rating: Number(item.voteAverage ?? item.vote_average) || null,
        releaseDate,
        firstAirDate,
        runtime: numberOrNull(runtime),
        status: item.status || null,
        originalLanguage: item.originalLanguage || item.original_language || null,
        homepage: item.homepage || null,
        imdbId: item.imdbId || item.imdb_id || externalIds.imdbId || externalIds.imdb_id || null,
        tvdbId: Number(item.tvdbId || item.tvdb_id || externalIds.tvdbId || externalIds.tvdb_id) || null,
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

export const normalizeRequestItem = (request = {}, publicBaseUrl = '', proxyPoster = (value) => value) => {
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
        posterUrl: posterUrl(media.posterPath || media.poster, publicBaseUrl, proxyPoster),
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

export const safePage = (value) => {
    const page = Math.max(1, Number(value) || 1);
    return Math.min(page, 50);
};

export const normalizeIssueType = (value) => ISSUE_TYPES[String(value || '').toLowerCase()] || ISSUE_TYPES.other;

export const normalizeDiscoverMediaType = (value) => {
    const type = String(value || '').toLowerCase();
    if (type === 'movie' || type === 'movies') return 'movie';
    if (type === 'tv' || type === 'show' || type === 'shows') return 'tv';
    return 'all';
};

export const isAnimeItem = (item) => {
    const language = String(item?.originalLanguage || '').toLowerCase();
    const isAnimation = Array.isArray(item?.genres) && item.genres.some((genre) => Number(genre?.id) === 16 || String(genre?.name || '').toLowerCase() === 'animation');
    return language === 'ja' && (!item.genres?.length || isAnimation);
};

export const isForeignLanguageItem = (item) => {
    const language = String(item?.originalLanguage || '').toLowerCase();
    return !!language && language !== 'en' && !isAnimeItem(item);
};

export const normalizeGenreId = (value) => {
    const id = Number(value);
    return Number.isFinite(id) && id > 0 ? id : null;
};

export const filterMediaItems = (items, mediaType, anime, foreign, genreId = null) => items
    .filter((item) => mediaType === 'all' || item.mediaType === mediaType)
    .filter((item) => {
        const isAnime = isAnimeItem(item);
        const isForeign = isForeignLanguageItem(item);
        if (anime || foreign) return (anime && isAnime) || (foreign && isForeign);
        return !isAnime && !isForeign;
    })
    .filter((item) => !genreId || item.genres?.some((genre) => Number(genre?.id) === genreId));
