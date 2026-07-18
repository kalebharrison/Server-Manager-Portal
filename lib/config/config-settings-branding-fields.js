import { sanitizeAssetUrl } from '../http/public-url.js';

export const buildBrandingFields = ({
    primaryColor,
    customLogoUrl,
    brandingTheme,
    backgroundImageUrl,
    useScrollRevealAnimations,
    useCinematicLoading,
    useBrandedSkeleton,
    useTrendingSlideshow,
    trendingSlideshowInterval,
    useTrendingSlideshowOnLogin,
    existingConfig,
}) => {
    try {
        return {
            primaryColor: primaryColor || '#F7C600',
            customLogoUrl: sanitizeAssetUrl(customLogoUrl, { field: 'customLogoUrl' }),
            brandingTheme: ['plex', 'slate', 'nordic', 'jellyfin', 'emerald', 'midnight'].includes(String(brandingTheme || '').toLowerCase())
                ? String(brandingTheme).toLowerCase()
                : (existingConfig.brandingTheme || 'plex'),
            backgroundImageUrl: sanitizeAssetUrl(backgroundImageUrl, { field: 'backgroundImageUrl' }),
            useScrollRevealAnimations: !!useScrollRevealAnimations,
            useCinematicLoading: !!useCinematicLoading,
            useBrandedSkeleton: useBrandedSkeleton !== false,
            useTrendingSlideshow: !!useTrendingSlideshow,
            trendingSlideshowInterval: parseInt(trendingSlideshowInterval, 10) || 30,
            useTrendingSlideshowOnLogin: useTrendingSlideshowOnLogin !== undefined
                ? !!useTrendingSlideshowOnLogin
                : (existingConfig.useTrendingSlideshowOnLogin !== false),
        };
    } catch (e) {
        throw new Error(`Invalid settings URL: ${e.message}`);
    }
};
