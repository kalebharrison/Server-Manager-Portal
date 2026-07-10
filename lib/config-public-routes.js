import fetch from 'node-fetch';

export const registerPublicConfigRoutes = ({
    app,
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

    let tmdbCache = { data: null, lastFetch: 0, inFlight: null };
    async function fetchTmdbTrendingBackgrounds(apiKey) {
        if (!apiKey) return [];
        if (tmdbCache.data && Date.now() - tmdbCache.lastFetch < 12 * 60 * 60 * 1000) {
            return tmdbCache.data;
        }
        if (tmdbCache.inFlight) return tmdbCache.inFlight;
        tmdbCache.inFlight = (async () => {
            try {
                const pages = await Promise.all(Array.from({ length: 10 }, async (_, index) => {
                    const page = index + 1;
                    const res = await fetch(`https://api.themoviedb.org/3/trending/all/week?api_key=${apiKey}&page=${page}`);
                    if (!res.ok) return [];
                    const json = await res.json();
                    return Array.isArray(json?.results) ? json.results : [];
                }));
                const allResults = pages.flat();
                if (allResults.length > 0) {
                    const bgs = allResults
                        .filter(i => i.backdrop_path)
                        .map(i => `https://image.tmdb.org/t/p/original${i.backdrop_path}`);
                    tmdbCache.data = [...new Set(bgs)].slice(0, 100);
                    tmdbCache.lastFetch = Date.now();
                    return tmdbCache.data;
                }
            } catch (e) {
                log(`Failed to fetch TMDB trending: ${e.message}`);
            } finally {
                tmdbCache.inFlight = null;
            }
            return tmdbCache.data || [];
        })();
        return tmdbCache.inFlight;
    }

    app.get('/api/config/public', async (req, res) => {
        try {
            const config = (await loadFile(CONFIG_PATH, {})) || {};
            res.json({
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
                trendingBackgrounds: (!!config.useTrendingSlideshow || config.useTrendingSlideshowOnLogin !== false) ? await fetchTmdbTrendingBackgrounds(config.tmdbApiKey) : [],
                announcement: config.announcement || '',
                referralEnabled: !!config.referralEnabled,
                appVersion,
                use24HourClock: !!config.use24HourClock,
                allowTemporaryAccess: !!config.allowTemporaryAccess,
                publicStatusEnabled: config.publicStatusEnabled !== false,
                showPosterQualityBadges: config.showPosterQualityBadges !== false,
                dashboardLayout: normalizeSectionLayout(config.dashboardLayout),
                basePath: BASE_PATH,
            });
        } catch (error) {
            res.json({
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
                publicStatusEnabled: true,
                showPosterQualityBadges: true,
                dashboardLayout: DEFAULT_DASHBOARD_LAYOUT,
                basePath: BASE_PATH,
            });
        }
    });
};
