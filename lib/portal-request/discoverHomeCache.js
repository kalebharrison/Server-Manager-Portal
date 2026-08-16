/**
 * Shared Discover Home / first-page browse cache.
 * Prewarmed on boot and every ~5 minutes; per-user request/notify stamps applied on read.
 */

import { cacheRefreshMs, startAdaptiveCacheWarmer } from '../cache/cache-refresh.js';
import { createTmdbDiscoverRouter } from './tmdbDiscover.js';
import { createLibraryAvailability } from './libraryAvailability.js';
import {
    applyDiscoveryAvailabilityCacheToItems,
    normalizeDiscoveryAvailabilityCache,
} from './discoveryAvailabilityCache.js';

const CACHE_VERSION = 4;

const emptyPage = () => ({
    page: 1,
    totalPages: 1,
    totalResults: 0,
    results: [],
});

const emptyRails = () => ({
    trending: emptyPage(),
    upcomingMovies: emptyPage(),
    popularSeries: emptyPage(),
    upcomingSeries: emptyPage(),
    popularMoviesPage1: emptyPage(),
    popularTvPage1: emptyPage(),
});

const clonePage = (payload) => {
    if (!payload || typeof payload !== 'object') return emptyPage();
    return {
        page: Number(payload.page) || 1,
        totalPages: Number(payload.totalPages) || 1,
        totalResults: Number(payload.totalResults) || 0,
        results: Array.isArray(payload.results)
            ? payload.results.map((item) => (item && typeof item === 'object' ? { ...item } : item))
            : [],
    };
};

const resolveLocale = (config = {}) => ({
    language: String(config.tmdbLanguage || config.requestDiscoverLanguage || 'en'),
    region: String(config.requestDiscoverRegion || ''),
    originalLanguage: String(config.requestDiscoverLanguage || ''),
});

/** @type {ReturnType<typeof createDiscoverHomeCache> | null} */
let sharedInstance = null;

export const createDiscoverHomeCache = ({
    configPath,
    cachePath,
    availabilityCachePath = null,
    loadFile,
    saveFile,
    resolveUrl = (url) => url,
    log = () => {},
}) => {
    let snapshot = null;
    let inFlight = null;
    let stopRefresh = null;
    /** In-memory disk availability fallback (shared library badges). */
    let availabilityDisk = null;

    const loadSnapshot = async () => {
        if (snapshot?.version === CACHE_VERSION && snapshot?.rails) return snapshot;
        const stored = await loadFile(cachePath, null);
        if (stored?.version === CACHE_VERSION && stored?.rails) {
            snapshot = stored;
            return snapshot;
        }
        return null;
    };

    const loadAvailabilityDisk = async () => {
        if (!availabilityCachePath) return null;
        if (availabilityDisk?.byKey) return availabilityDisk;
        const raw = await loadFile(availabilityCachePath, null);
        availabilityDisk = normalizeDiscoveryAvailabilityCache(raw);
        return availabilityDisk?.byKey && Object.keys(availabilityDisk.byKey).length
            ? availabilityDisk
            : null;
    };

    const stampLibraryOnly = async (config, results) => {
        const availability = createLibraryAvailability(config, {
            resolveUrl,
            warmOnCreate: true,
        });
        let stamped = await availability.enrichItems(results, {
            networkLookups: false,
            blockForCatalog: false,
        });
        const disk = await loadAvailabilityDisk();
        if (disk?.byKey) {
            stamped = stamped.map((item) => {
                if (item?.mediaInfo?.status) return item;
                return applyDiscoveryAvailabilityCacheToItems([item], disk)[0];
            });
        }
        return stamped;
    };

    const stampPage = async (config, payload) => {
        const page = clonePage(payload);
        page.results = await stampLibraryOnly(config, page.results);
        return page;
    };

    const buildRails = async (config) => {
        const locale = resolveLocale(config);
        const router = createTmdbDiscoverRouter(config, locale);
        const [
            trending,
            upcomingMovies,
            popularTv,
            upcomingSeries,
            popularMoviesPage1,
        ] = await Promise.all([
            router.fetchPath('/discover/trending', { page: 1 }),
            router.fetchPath('/discover/movies/upcoming', { page: 1 }),
            router.fetchPath('/discover/tv', { page: 1, sortBy: 'popularity.desc' }),
            router.fetchPath('/discover/tv/upcoming', { page: 1 }),
            router.fetchPath('/discover/movies', { page: 1, sortBy: 'popularity.desc' }),
        ]);

        const [
            trendingStamped,
            upcomingMoviesStamped,
            popularTvStamped,
            upcomingSeriesStamped,
            popularMoviesStamped,
        ] = await Promise.all([
            stampPage(config, trending),
            stampPage(config, upcomingMovies),
            stampPage(config, popularTv),
            stampPage(config, upcomingSeries),
            stampPage(config, popularMoviesPage1),
        ]);

        return {
            trending: trendingStamped,
            upcomingMovies: upcomingMoviesStamped,
            popularSeries: popularTvStamped,
            upcomingSeries: upcomingSeriesStamped,
            popularMoviesPage1: popularMoviesStamped,
            popularTvPage1: clonePage(popularTvStamped),
        };
    };

    const refresh = async ({ force = false } = {}) => {
        if (inFlight) return inFlight;
        inFlight = (async () => {
            const config = await loadFile(configPath, {});
            const current = await loadSnapshot();
            const age = Date.now() - Number(current?.generatedAt || 0);
            const locale = resolveLocale(config);
            const localeMatch = current?.language === locale.language && current?.region === locale.region;
            if (!force && current?.rails && localeMatch && age < cacheRefreshMs(config)) {
                return current;
            }
            const rails = await buildRails(config);
            snapshot = {
                version: CACHE_VERSION,
                generatedAt: Date.now(),
                language: locale.language,
                region: locale.region,
                rails,
            };
            await saveFile(cachePath, snapshot);
            return snapshot;
        })().catch((error) => {
            log(`[DiscoverHomeCache] Refresh failed: ${error?.message || error}`);
            return snapshot;
        }).finally(() => {
            inFlight = null;
        });
        return inFlight;
    };

    const getSnapshot = async ({ allowRefresh = true } = {}) => {
        const current = await loadSnapshot();
        if (current?.rails) {
            if (allowRefresh && Date.now() - Number(current.generatedAt || 0) >= cacheRefreshMs(await loadFile(configPath, {}))) {
                void refresh({ force: true });
            }
            return current;
        }
        if (!allowRefresh) return null;
        return refresh({ force: true });
    };

    /** Return a cloned page from the shared snapshot for proxy page-1 short-circuit. */
    const getCachedPage = async (railKey) => {
        const current = await getSnapshot({ allowRefresh: true });
        const page = current?.rails?.[railKey];
        return page ? clonePage(page) : null;
    };

    const getHomeRails = async () => {
        const current = await getSnapshot({ allowRefresh: true });
        if (!current?.rails) {
            return {
                generatedAt: null,
                ...emptyRails(),
            };
        }
        return {
            generatedAt: current.generatedAt,
            language: current.language,
            region: current.region,
            trending: clonePage(current.rails.trending),
            upcomingMovies: clonePage(current.rails.upcomingMovies),
            popularSeries: clonePage(current.rails.popularSeries),
            upcomingSeries: clonePage(current.rails.upcomingSeries),
            popularMovies: clonePage(current.rails.popularMoviesPage1),
            popularTv: clonePage(current.rails.popularTvPage1 || current.rails.popularSeries),
        };
    };

    const setAvailabilityDiskCache = (raw) => {
        availabilityDisk = normalizeDiscoveryAvailabilityCache(raw);
    };

    const start = async () => {
        await loadSnapshot();
        await loadAvailabilityDisk();
        void refresh({ force: true });
        if (!stopRefresh) {
            stopRefresh = startAdaptiveCacheWarmer({
                loadConfig: () => loadFile(configPath, {}),
                warm: async () => {
                    await refresh({ force: true });
                },
                log: (message) => log(`[DiscoverHomeCache] ${message}`),
            });
        }
    };

    const stop = () => {
        if (stopRefresh) stopRefresh();
        stopRefresh = null;
    };

    return {
        refresh,
        getSnapshot,
        getHomeRails,
        getCachedPage,
        setAvailabilityDiskCache,
        loadAvailabilityDisk,
        start,
        stop,
        CACHE_VERSION,
    };
};

export const getDiscoverHomeCache = () => sharedInstance;

/** Create (or return) the process-wide Discover home cache instance. */
export const ensureDiscoverHomeCache = (deps) => {
    if (!sharedInstance) {
        sharedInstance = createDiscoverHomeCache(deps);
    }
    return sharedInstance;
};

export const startDiscoverHomeCacheWarmer = async (deps) => {
    const instance = ensureDiscoverHomeCache(deps);
    await instance.start();
    return instance;
};

export default {
    createDiscoverHomeCache,
    getDiscoverHomeCache,
    startDiscoverHomeCacheWarmer,
};
