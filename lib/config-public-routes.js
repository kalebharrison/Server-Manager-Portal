import fetch from 'node-fetch';

export const registerPublicConfigRoutes = ({
    app,
    publicReadRateLimit,
    configPath,
    basePath,
    appVersion,
    defaultDashboardLayout,
    loadFile,
    normalizeSectionLayout,
    log,
}) => {
    const CONFIG_PATH = configPath;
    const BASE_PATH = basePath;
    const DEFAULT_DASHBOARD_LAYOUT = defaultDashboardLayout;

    const waitWithTimeout = (promise, timeoutMs, fallback) => {
        let timeout;
        return Promise.race([
            promise,
            new Promise((resolve) => {
                timeout = setTimeout(() => resolve(fallback()), timeoutMs);
            }),
        ]).finally(() => clearTimeout(timeout));
    };

    const readTmdbCache = (cache) => cache.data || [];
    const waitForTmdbCache = (cache, maxWaitMs) => maxWaitMs <= 0
        ? readTmdbCache(cache)
        : waitWithTimeout(cache.inFlight, maxWaitMs, () => readTmdbCache(cache));

    let tmdbCache = { apiKey: '', data: null, lastFetch: 0, failedAt: 0, inFlight: null };
    async function fetchTmdbTrendingBackgrounds(apiKey, { maxWaitMs = 700 } = {}) {
        const normalizedApiKey = String(apiKey || '').trim();
        if (!normalizedApiKey) return [];
        if (tmdbCache.apiKey !== normalizedApiKey) {
            tmdbCache = { apiKey: normalizedApiKey, data: null, lastFetch: 0, failedAt: 0, inFlight: null };
        }
        if (tmdbCache.data && Date.now() - tmdbCache.lastFetch < 12 * 60 * 60 * 1000) {
            return tmdbCache.data;
        }
        if (tmdbCache.failedAt && Date.now() - tmdbCache.failedAt < 5 * 60 * 1000) {
            return readTmdbCache(tmdbCache);
        }
        if (tmdbCache.inFlight) {
            return waitForTmdbCache(tmdbCache, maxWaitMs);
        }
        tmdbCache.inFlight = (async () => {
            try {
                const pages = await Promise.all(Array.from({ length: 10 }, async (_, index) => {
                    const page = index + 1;
                    const res = await fetch(`https://api.themoviedb.org/3/trending/all/week?api_key=${normalizedApiKey}&page=${page}`);
                    if (!res.ok) return [];
                    const json = await res.json();
                    return Array.isArray(json?.results) ? json.results : [];
                }));
                const allResults = pages.flat();
                if (allResults.length > 0) {
                    const bgs = allResults
                        .filter(i => i.backdrop_path)
                        .map(i => `https://image.tmdb.org/t/p/w1280${i.backdrop_path}`);
                    tmdbCache.data = [...new Set(bgs)].slice(0, 40);
                    tmdbCache.lastFetch = Date.now();
                    tmdbCache.failedAt = 0;
                    return tmdbCache.data;
                }
            } catch (e) {
                tmdbCache.failedAt = Date.now();
                log(`Failed to fetch TMDB trending: ${e.message}`);
            } finally {
                tmdbCache.inFlight = null;
            }
            return readTmdbCache(tmdbCache);
        })();
        return waitForTmdbCache(tmdbCache, maxWaitMs);
    }

    const defaultPublicConfig = () => ({
        mediaServerType: 'plex',
        primaryColor: '#F7C600',
        customLogoUrl: '',
        brandingTheme: 'plex',
        backgroundImageUrl: '',
        useScrollRevealAnimations: false,
        useCinematicLoading: false,
        useBrandedSkeleton: true,
        useTrendingSlideshow: false,
        trendingSlideshowInterval: 30,
        trendingBackgrounds: [],
        announcement: '',
        referralEnabled: false,
        appVersion,
        use24HourClock: false,
        allowTemporaryAccess: false,
        publicStatusEnabled: false,
        showLoginServerStats: false,
        showPosterQualityBadges: true,
        cacheRefreshMinutes: 5,
        dashboardLayout: DEFAULT_DASHBOARD_LAYOUT,
        basePath: BASE_PATH,
    });

    const buildPublicConfig = async () => {
        const config = (await loadFile(CONFIG_PATH, {})) || {};
        const shouldLoadTrending = !!config.useTrendingSlideshow || config.useTrendingSlideshowOnLogin !== false;
        return {
            mediaServerType: config.mediaServerType || 'plex',
            primaryColor: config.primaryColor || '#F7C600',
            customLogoUrl: config.customLogoUrl || '',
            brandingTheme: config.brandingTheme || 'plex',
            backgroundImageUrl: config.backgroundImageUrl || '',
            useScrollRevealAnimations: !!config.useScrollRevealAnimations,
            useCinematicLoading: !!config.useCinematicLoading,
            useBrandedSkeleton: config.useBrandedSkeleton !== false,
            useTrendingSlideshow: !!config.useTrendingSlideshow,
            useTrendingSlideshowOnLogin: config.useTrendingSlideshowOnLogin !== false,
            trendingSlideshowInterval: parseInt(config.trendingSlideshowInterval, 10) || 30,
            trendingBackgrounds: shouldLoadTrending ? await fetchTmdbTrendingBackgrounds(config.tmdbApiKey) : [],
            announcement: config.announcement || '',
            referralEnabled: !!config.referralEnabled,
            appVersion,
            use24HourClock: !!config.use24HourClock,
            allowTemporaryAccess: !!config.allowTemporaryAccess,
            publicStatusEnabled: config.publicStatusEnabled === true && config.publicStatusExplicitlyConfigured === true,
            showLoginServerStats: config.showLoginServerStats === true,
            showPosterQualityBadges: config.showPosterQualityBadges !== false,
            cacheRefreshMinutes: Math.min(60, Math.max(1, Number.parseInt(config.cacheRefreshMinutes, 10) || 5)),
            dashboardLayout: normalizeSectionLayout(config.dashboardLayout),
            basePath: BASE_PATH,
        };
    };

    let publicConfigCache = { data: null, expiresAt: 0, inFlight: null };

    app.get('/api/config/public', publicReadRateLimit, async (req, res) => {
        try {
            const forceRefresh = req.query?.refresh === '1' || req.query?.force === '1';
            if (!forceRefresh && publicConfigCache.data && publicConfigCache.expiresAt > Date.now()) {
                res.setHeader('Cache-Control', 'private, max-age=5');
                return res.json(publicConfigCache.data);
            }

            if (!forceRefresh && publicConfigCache.inFlight) {
                res.setHeader('Cache-Control', 'private, max-age=5');
                return res.json(await publicConfigCache.inFlight);
            }

            publicConfigCache.inFlight = buildPublicConfig();
            const data = await publicConfigCache.inFlight;
            publicConfigCache = { data, expiresAt: Date.now() + 5000, inFlight: null };
            res.setHeader('Cache-Control', 'private, max-age=5');
            res.json(data);
        } catch (error) {
            publicConfigCache.inFlight = null;
            res.json(defaultPublicConfig());
        }
    });
};
