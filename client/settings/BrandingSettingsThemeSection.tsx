import React from 'react';

import { CustomSelect } from '../shared/ui';
import { SettingHint } from './SettingHint';
import { ToggleRow } from './BrandingSettingsTabShared';

export const BrandingSettingsThemeSection: React.FC<{
    brandingTheme: string;
    useScrollRevealAnimations: boolean;
    useCinematicLoading: boolean;
    useBrandedSkeleton: boolean;
    useTrendingSlideshow: boolean;
    trendingSlideshowInterval: number;
    onBrandingThemeChange: (value: string) => void;
    onUseScrollRevealAnimationsChange: (value: boolean) => void;
    onUseCinematicLoadingChange: (value: boolean) => void;
    onUseBrandedSkeletonChange: (value: boolean) => void;
    onUseTrendingSlideshowChange: (value: boolean) => void;
    onTrendingSlideshowIntervalChange: (value: number) => void;
}> = ({
    brandingTheme,
    useScrollRevealAnimations,
    useCinematicLoading,
    useBrandedSkeleton,
    useTrendingSlideshow,
    trendingSlideshowInterval,
    onBrandingThemeChange,
    onUseScrollRevealAnimationsChange,
    onUseCinematicLoadingChange,
    onUseBrandedSkeletonChange,
    onUseTrendingSlideshowChange,
    onTrendingSlideshowIntervalChange,
}) => (
    <>
        <div className="mb-8 relative z-[50]">
            <label>Portal Theme</label>
            <CustomSelect
                value={brandingTheme}
                onChange={onBrandingThemeChange}
                options={[
                    { label: 'Plex Dark', value: 'plex' },
                    { label: 'Sleek Slate', value: 'slate' },
                    { label: 'Nordic Frost', value: 'nordic' },
                    { label: 'Jellyfin Purple', value: 'jellyfin' },
                    { label: 'Emerald Green', value: 'emerald' },
                    { label: 'Neon Midnight', value: 'midnight' },
                ]}
            />
            <div className="mt-2">
                <SettingHint>The default theme applied to new visitors and users. Users can still customize their local theme preference in the navigation menu.</SettingHint>
            </div>
        </div>

        <ToggleRow title="Enable Scroll Reveal Animations" checked={useScrollRevealAnimations} onChange={onUseScrollRevealAnimationsChange}>
            <SettingHint>Smoothly slide elements into place as you scroll down the dashboard.</SettingHint>
        </ToggleRow>

        <ToggleRow title="Enable Cinematic Loading Sequences" checked={useCinematicLoading} onChange={onUseCinematicLoadingChange}>
            <SettingHint>Replaces the standard loading spinner with a beautiful SVG line-drawing animation.</SettingHint>
        </ToggleRow>

        <ToggleRow title="Enable Branded Skeleton Loading" checked={useBrandedSkeleton} onChange={onUseBrandedSkeletonChange}>
            <SettingHint>Use a branded, animated shimmer effect for skeleton loaders instead of the default pulse.</SettingHint>
        </ToggleRow>

        <div className="py-4 border-b border-border/40 mb-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div>
                    <h4 className="font-bold text-text">Enable TMDB Trending Slideshow</h4>
                    <SettingHint>Replaces the static splash background with a fading slideshow of currently trending movies and shows from TMDB. Requires a TMDB API key in Integrations.</SettingHint>
                </div>
                <label className="relative inline-flex items-center cursor-pointer ml-4 flex-shrink-0">
                    <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={useTrendingSlideshow}
                        onChange={e => onUseTrendingSlideshowChange(e.target.checked)}
                    />
                    <div className="w-11 h-6 bg-background peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-text after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-plex"></div>
                </label>
            </div>
            <div className={`transition-all overflow-hidden ${useTrendingSlideshow ? 'max-h-[100px] opacity-100 mt-2' : 'max-h-0 opacity-0'}`}>
                <label>Slideshow Interval (Seconds)</label>
                <select
                    className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex transition-all mt-1"
                    value={trendingSlideshowInterval}
                    onChange={e => onTrendingSlideshowIntervalChange(parseInt(e.target.value, 10))}
                >
                    <option value={10}>10 Seconds</option>
                    <option value={20}>20 Seconds</option>
                    <option value={30}>30 Seconds</option>
                    <option value={40}>40 Seconds</option>
                    <option value={50}>50 Seconds</option>
                    <option value={60}>60 Seconds</option>
                </select>
            </div>
        </div>
    </>
);
