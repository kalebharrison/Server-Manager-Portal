import { PROFILE_SIZE } from './request-app-media-constants.js';
import { tmdbImageUrl } from './request-app-media-images.js';
import {
    filterMediaItems,
    normalizeDiscoverMediaType,
    normalizeMediaItem,
    safePage,
} from './request-app-media.js';

const profileUrl = (path) => tmdbImageUrl(path, PROFILE_SIZE);

const normalizePersonResult = (item = {}, publicBaseUrl = '', proxyPoster = (value) => value) => {
    const profilePath = item.profilePath || item.profile_path || '';
    const remoteProfile = profilePath ? profileUrl(profilePath) : '';
    const knownFor = (Array.isArray(item.knownFor) ? item.knownFor : [])
        .slice(0, 3)
        .map((entry) => entry.title || entry.name || '')
        .filter(Boolean);
    return {
        personId: Number(item.id),
        name: item.name || 'Unknown',
        profileUrl: remoteProfile ? proxyPoster(remoteProfile) : '',
        knownFor,
    };
};

const creditMediaType = (item = {}) => String(item.mediaType || item.media_type || '').toLowerCase();

export const sortFilmographyByDate = (items = [], { descending = true } = {}) => {
    const sorted = [...items].sort((a, b) => {
        const dateA = a.releaseDate || a.firstAirDate || '';
        const dateB = b.releaseDate || b.firstAirDate || '';
        return descending ? dateB.localeCompare(dateA) : dateA.localeCompare(dateB);
    });
    return sorted;
};

export const dedupeFilmographyCredits = (credits = []) => {
    const seen = new Set();
    return credits.filter((item) => {
        const type = creditMediaType(item);
        const id = Number(item.id ?? item.tmdbId);
        if (!['movie', 'tv'].includes(type) || !Number.isFinite(id) || id <= 0) return false;
        const key = `${type}:${id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};

export const createCatalogPerson = ({
    getCredentials,
    cachedSeerrJson,
    proxyPoster,
    applyAcquisitionState,
}) => {
    const searchPeople = async (config, { query, page = 1 } = {}) => {
        const q = String(query || '').trim();
        if (q.length < 2) return { results: [], pageInfo: { page: 1, results: 0 } };
        const params = new URLSearchParams({ query: q, page: String(safePage(page)) });
        const { publicBaseUrl } = await getCredentials(config);
        const payload = await cachedSeerrJson(config, `/api/v1/search?${params.toString()}`, 15_000, 120_000);
        const results = (Array.isArray(payload?.results) ? payload.results : [])
            .filter((item) => creditMediaType(item) === 'person')
            .map((item) => normalizePersonResult(item, publicBaseUrl, proxyPoster))
            .filter((item) => Number.isFinite(item.personId) && item.personId > 0);
        return {
            results,
            pageInfo: payload?.pageInfo || { page: safePage(page), results: results.length },
        };
    };

    const getPerson = async (config, personId) => {
        const id = Number(personId);
        if (!Number.isFinite(id) || id <= 0) throw new Error('Invalid person id');
        const { publicBaseUrl } = await getCredentials(config);
        const payload = await cachedSeerrJson(config, `/api/v1/person/${encodeURIComponent(id)}`, 30_000, 5 * 60_000);
        return normalizePersonResult({ ...payload, id }, publicBaseUrl, proxyPoster);
    };

    const getPersonFilmography = async (config, {
        personId,
        mediaType = 'all',
        creditType = 'cast',
        limit = 10,
        anime = false,
        foreign = false,
    } = {}) => {
        const id = Number(personId);
        if (!Number.isFinite(id) || id <= 0) throw new Error('Invalid person id');
        const normalizedType = normalizeDiscoverMediaType(mediaType);
        const normalizedCreditType = ['cast', 'crew', 'all'].includes(String(creditType || '').toLowerCase())
            ? String(creditType).toLowerCase()
            : 'cast';
        const { publicBaseUrl } = await getCredentials(config);
        const payload = await cachedSeerrJson(
            config,
            `/api/v1/person/${encodeURIComponent(id)}/combined_credits`,
            30_000,
            5 * 60_000,
        );

        let credits = [];
        if (normalizedCreditType === 'crew') credits = Array.isArray(payload?.crew) ? payload.crew : [];
        else if (normalizedCreditType === 'all') {
            credits = [
                ...(Array.isArray(payload?.cast) ? payload.cast : []),
                ...(Array.isArray(payload?.crew) ? payload.crew : []),
            ];
        } else {
            credits = Array.isArray(payload?.cast) ? payload.cast : [];
        }

        const normalized = dedupeFilmographyCredits(credits)
            .map((item) => normalizeMediaItem({
                ...item,
                mediaType: creditMediaType(item),
                id: item.id,
            }, publicBaseUrl, proxyPoster));

        const filtered = filterMediaItems(normalized, normalizedType, anime, foreign);
        const sorted = sortFilmographyByDate(filtered, { descending: true }).slice(0, Math.max(1, Number(limit) || 10));
        const person = await getPerson(config, id).catch(() => ({ personId: id, name: 'Unknown' }));

        return {
            person,
            results: await applyAcquisitionState(config, sorted),
        };
    };

    return {
        searchPeople,
        getPerson,
        getPersonFilmography,
    };
};
