import React from 'react';

import { BrandingSettingsLogoSection } from './BrandingSettingsLogoSection';
import { BrandingSettingsPreviewSection } from './BrandingSettingsPreviewSection';
import { BrandingSettingsThemeSection } from './BrandingSettingsThemeSection';
import type { BrandingSettingsTabProps } from './brandingSettingsTabTypes';

type BrandingSettingsTabContentProps = Pick<
    BrandingSettingsTabProps,
    | 'mediaServerType'
    | 'customLogoUrl'
    | 'brandingTheme'
    | 'backgroundImageUrl'
    | 'useScrollRevealAnimations'
    | 'useCinematicLoading'
    | 'useBrandedSkeleton'
    | 'useTrendingSlideshow'
    | 'trendingSlideshowInterval'
    | 'use24HourClock'
    | 'showPosterQualityBadges'
    | 'onCustomLogoUrlChange'
    | 'onLogoFileChange'
    | 'onBrandingThemeChange'
    | 'onBackgroundImageUrlChange'
    | 'onUseScrollRevealAnimationsChange'
    | 'onUseCinematicLoadingChange'
    | 'onUseBrandedSkeletonChange'
    | 'onUseTrendingSlideshowChange'
    | 'onTrendingSlideshowIntervalChange'
    | 'onUse24HourClockChange'
    | 'onShowPosterQualityBadgesChange'
    | 'addToast'
>;

export const BrandingSettingsTabContent: React.FC<BrandingSettingsTabContentProps> = (props) => (
    <div className="mb-8 animate-fade-in">
        <h3 className="text-xl font-bold text-plex mb-4 border-b border-border pb-2">Branding & UI</h3>

        <BrandingSettingsLogoSection
            mediaServerType={props.mediaServerType}
            customLogoUrl={props.customLogoUrl}
            onCustomLogoUrlChange={props.onCustomLogoUrlChange}
            onBackgroundImageUrlChange={props.onBackgroundImageUrlChange}
            onLogoFileChange={props.onLogoFileChange}
            addToast={props.addToast}
        />

        <BrandingSettingsThemeSection
            brandingTheme={props.brandingTheme}
            useScrollRevealAnimations={props.useScrollRevealAnimations}
            useCinematicLoading={props.useCinematicLoading}
            useBrandedSkeleton={props.useBrandedSkeleton}
            useTrendingSlideshow={props.useTrendingSlideshow}
            trendingSlideshowInterval={props.trendingSlideshowInterval}
            onBrandingThemeChange={props.onBrandingThemeChange}
            onUseScrollRevealAnimationsChange={props.onUseScrollRevealAnimationsChange}
            onUseCinematicLoadingChange={props.onUseCinematicLoadingChange}
            onUseBrandedSkeletonChange={props.onUseBrandedSkeletonChange}
            onUseTrendingSlideshowChange={props.onUseTrendingSlideshowChange}
            onTrendingSlideshowIntervalChange={props.onTrendingSlideshowIntervalChange}
        />

        <BrandingSettingsPreviewSection
            customLogoUrl={props.customLogoUrl}
            backgroundImageUrl={props.backgroundImageUrl}
            useTrendingSlideshow={props.useTrendingSlideshow}
            use24HourClock={props.use24HourClock}
            showPosterQualityBadges={props.showPosterQualityBadges}
            onBackgroundImageUrlChange={props.onBackgroundImageUrlChange}
            onUse24HourClockChange={props.onUse24HourClockChange}
            onShowPosterQualityBadgesChange={props.onShowPosterQualityBadgesChange}
        />
    </div>
);
