/** Pure rail browse path + URL builders (shared with client + tests). */

export const parseRailMediaFilter = (value) => {
    if (value === 'movie' || value === 'tv') return value;
    return 'all';
};

export const buildRailBrowsePath = (basePath, railId, media = 'all') => {
    const normalized = String(basePath || '').replace(/\/$/, '');
    if (media === 'all') return `${normalized}/browse/${railId}`;
    return `${normalized}/browse/${railId}?media=${media}`;
};

export const buildPaginatedRailUrlBuilders = (railId, media) => {
    if (railId === 'trending') {
        return [(page) => `/api/discovery/trending?page=${page}`];
    }

    if (railId === 'upcoming') {
        if (media === 'movie') {
            return [(page) => `/api/discovery/proxy/discover/movies/upcoming?page=${page}`];
        }
        if (media === 'tv') {
            return [(page) => `/api/discovery/proxy/discover/tv/upcoming?page=${page}`];
        }
        return [
            (page) => `/api/discovery/proxy/discover/movies/upcoming?page=${page}`,
            (page) => `/api/discovery/proxy/discover/tv/upcoming?page=${page}`,
        ];
    }

    if (railId === 'popular') {
        if (media === 'movie') {
            return [(page) => `/api/discovery/proxy/discover/movies?page=${page}&sortBy=popularity.desc`];
        }
        if (media === 'tv') {
            return [(page) => `/api/discovery/proxy/discover/tv?page=${page}&sortBy=popularity.desc`];
        }
        return [
            (page) => `/api/discovery/proxy/discover/movies?page=${page}&sortBy=popularity.desc`,
            (page) => `/api/discovery/proxy/discover/tv?page=${page}&sortBy=popularity.desc`,
        ];
    }

    if (railId === 'anime-popular-movies') {
        return [(page) => `/api/discovery/proxy/discover/movies?page=${page}&sortBy=popularity.desc&anime=1`];
    }
    if (railId === 'anime-popular-series') {
        return [(page) => `/api/discovery/proxy/discover/tv?page=${page}&sortBy=popularity.desc&anime=1`];
    }
    if (railId === 'anime-upcoming-movies') {
        return [(page) => `/api/discovery/proxy/discover/movies/upcoming?page=${page}&anime=1`];
    }
    if (railId === 'anime-upcoming-series') {
        return [(page) => `/api/discovery/proxy/discover/tv/upcoming?page=${page}&anime=1`];
    }

    return [];
};
