/**
 * Route Seerr-shaped Discover proxy paths through the direct TMDB client.
 */

import { createTmdbClient } from './tmdbClient.js';
import { isAdultMediaItem } from '../request-app/request-app-media-status.js';

const emptyPage = () => ({
    page: 1,
    totalPages: 1,
    totalResults: 0,
    results: [],
});

const stripAdultPayload = (payload) => {
    if (!payload || typeof payload !== 'object') return payload;
    if (!Array.isArray(payload.results)) return payload;
    return {
        ...payload,
        results: payload.results.filter((item) => !isAdultMediaItem(item)),
    };
};

/**
 * @param {object} config Portal config
 * @param {object} [options]
 * @param {string} [options.language] Metadata language (TMDB locale)
 * @param {string} [options.region] Discover region
 * @param {string} [options.originalLanguage] Prefs original-language filter (discover lists)
 */
export const createTmdbDiscoverRouter = (config = {}, options = {}) => {
    const client = createTmdbClient({
        tmdbApiKey: config.tmdbApiKey,
        language: options.language || 'en',
        region: options.region || '',
        discoverRegion: options.region || '',
        tmdbLanguage: options.language || 'en',
        fetchImpl: options.fetchImpl,
    });

    const metadataLanguage = options.language || 'en';
    const originalLanguagePref = options.originalLanguage || '';

    /**
     * @param {string} path Normalized path (e.g. /discover/movies)
     * @param {URLSearchParams|object|string} query
     */
    const fetchPath = async (path, query = {}) => {
        const params = query instanceof URLSearchParams
            ? Object.fromEntries(query.entries())
            : { ...(query || {}) };

        // International browse: unlock English-original filter + keep a popularity floor.
        const international = params.international === '1'
            || params.international === 'true'
            || params.international === true;
        if (international) {
            delete params.language;
            if (!params.voteCountGte && !params.vote_count_gte) {
                params.voteCountGte = '100';
            }
        }

        const listOpts = {
            ...params,
            metadataLanguage,
            region: options.region || '',
            // Mirror Seerr: on discover movie/TV lists, `language` query = original-language filter.
            // International mode skips the server/client original-language lock.
            originalLanguageFromLanguageQuery: !international,
            originalLanguage: international
                ? undefined
                : (params.language || originalLanguagePref || undefined),
        };

        const respond = async (promise) => stripAdultPayload(await promise);

        if (path === '/discover/trending') {
            // TMDB trending has no with_original_language — proxy post-filters by Discover Language.
            return respond(client.trending({
                page: params.page || 1,
                language: metadataLanguage,
            }));
        }

        if (path === '/discover/movies/upcoming') {
            return respond(client.upcomingMovies({
                page: params.page || 1,
                language: metadataLanguage,
                region: options.region || '',
                sortBy: params.sortBy,
                originalLanguage: params.language || originalLanguagePref || undefined,
            }));
        }

        if (path === '/discover/tv/upcoming') {
            return respond(client.upcomingTv({
                page: params.page || 1,
                language: metadataLanguage,
                sortBy: params.sortBy,
                originalLanguage: params.language || originalLanguagePref || undefined,
            }));
        }

        const movieStudioMatch = path.match(/^\/discover\/movies\/studio\/(\d+)$/i);
        if (movieStudioMatch) {
            return respond(client.discoverMovies({
                ...listOpts,
                studio: movieStudioMatch[1],
                originalLanguageFromLanguageQuery: Boolean(params.language || originalLanguagePref),
            }));
        }

        const tvNetworkMatch = path.match(/^\/discover\/tv\/network\/(\d+)$/i);
        if (tvNetworkMatch) {
            return respond(client.discoverTv({
                ...listOpts,
                network: tvNetworkMatch[1],
                originalLanguageFromLanguageQuery: Boolean(params.language || originalLanguagePref),
            }));
        }

        if (path === '/discover/movies' || /^\/discover\/movies\//i.test(path)) {
            // language/* and other nested routes fall through to discover with filters.
            if (/^\/discover\/movies\/language\//i.test(path)) {
                const lang = path.split('/').pop();
                return respond(client.discoverMovies({
                    ...listOpts,
                    language: lang,
                    originalLanguageFromLanguageQuery: true,
                    metadataLanguage,
                }));
            }
            return respond(client.discoverMovies(listOpts));
        }

        if (path === '/discover/tv' || /^\/discover\/tv\//i.test(path)) {
            if (/^\/discover\/tv\/language\//i.test(path)) {
                const lang = path.split('/').pop();
                return respond(client.discoverTv({
                    ...listOpts,
                    language: lang,
                    originalLanguageFromLanguageQuery: true,
                    metadataLanguage,
                }));
            }
            return respond(client.discoverTv(listOpts));
        }

        if (path === '/discover/genreslider/movie') {
            return client.genreSlider('movie', { language: metadataLanguage });
        }
        if (path === '/discover/genreslider/tv') {
            return client.genreSlider('tv', { language: metadataLanguage });
        }

        const movieMatch = path.match(/^\/movie\/(\d+)$/i);
        if (movieMatch) {
            return client.movie(movieMatch[1], { language: metadataLanguage });
        }
        const movieRecMatch = path.match(/^\/movie\/(\d+)\/recommendations$/i);
        if (movieRecMatch) {
            return respond(client.movieRecommendations(movieRecMatch[1], {
                language: metadataLanguage,
                page: params.page || 1,
            }));
        }

        const tvMatch = path.match(/^\/tv\/(\d+)$/i);
        if (tvMatch) {
            return client.tv(tvMatch[1], { language: metadataLanguage });
        }
        const tvRecMatch = path.match(/^\/tv\/(\d+)\/recommendations$/i);
        if (tvRecMatch) {
            return respond(client.tvRecommendations(tvRecMatch[1], {
                language: metadataLanguage,
                page: params.page || 1,
            }));
        }
        const tvSeasonMatch = path.match(/^\/tv\/(\d+)\/season\/(\d+)$/i);
        if (tvSeasonMatch) {
            return client.tvSeason(tvSeasonMatch[1], tvSeasonMatch[2], {
                language: metadataLanguage,
            });
        }

        const personMatch = path.match(/^\/person\/(\d+)$/i);
        if (personMatch) {
            return client.person(personMatch[1], { language: metadataLanguage });
        }
        const personCreditsMatch = path.match(/^\/person\/(\d+)\/combined_credits$/i);
        if (personCreditsMatch) {
            return client.personCombinedCredits(personCreditsMatch[1], {
                language: metadataLanguage,
            });
        }

        if (path === '/search') {
            return respond(client.search(params.query || '', {
                page: params.page || 1,
                language: metadataLanguage,
            }));
        }
        if (path === '/search/keyword') {
            return client.searchKeyword(params.query || '', { page: params.page || 1 });
        }
        if (path === '/search/company') {
            return client.searchCompany(params.query || '', { page: params.page || 1 });
        }

        if (path === '/watchproviders/movies') {
            return client.watchProviders('movie', {
                language: metadataLanguage,
                watchRegion: params.watchRegion || options.region || '',
            });
        }
        if (path === '/watchproviders/tv') {
            return client.watchProviders('tv', {
                language: metadataLanguage,
                watchRegion: params.watchRegion || options.region || '',
            });
        }

        // Library shelf is Seerr/Plex-backed — empty until Phase 3.
        if (path === '/media' || /^\/media\//i.test(path)) {
            return emptyPage();
        }

        const err = new Error(`TMDB discover router does not support path: ${path}`);
        err.code = 'TMDB_PATH_UNSUPPORTED';
        err.status = 404;
        throw err;
    };

    return { client, fetchPath };
};

export default createTmdbDiscoverRouter;
