import {
    BACKDROP_SIZE,
    LOGO_SIZE,
    POSTER_SIZE,
    PROFILE_SIZE,
    TMDB_GENRES,
} from './request-app-media-constants.js';
import { seerrImageUrl, tmdbImageUrl } from './request-app-media-images.js';
import {
    findRequestState,
    isAdultMediaItem,
    normalizeMediaType,
    requestStatusLabel,
} from './request-app-media-status.js';

const posterUrl = (path, baseUrl, proxy = (value) => value) => {
    const remoteUrl = tmdbImageUrl(path, POSTER_SIZE) || seerrImageUrl(baseUrl, path, POSTER_SIZE);
    return remoteUrl ? proxy(remoteUrl) : '';
};
const backdropUrl = (path, baseUrl) => tmdbImageUrl(path, BACKDROP_SIZE) || seerrImageUrl(baseUrl, path, BACKDROP_SIZE);
const profileUrl = (path) => tmdbImageUrl(path, PROFILE_SIZE);
const logoUrl = (path) => tmdbImageUrl(path, LOGO_SIZE);

const cleanBaseUrl = (baseUrl) => String(baseUrl || '').replace(/\/+$/, '');

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
        adult: isAdultMediaItem(item),
        title,
        year: date ? String(date).slice(0, 4) : null,
        overview: item.overview || '',
        tagline: item.tagline || '',
        posterPath: posterPath || null,
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
        adult: isAdultMediaItem(request),
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
