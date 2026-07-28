import React from 'react';

import { resolvePortalAssetUrl } from '../shared/basePath';
import { SettingHint } from './SettingHint';
import { InlineSwitch } from './BrandingSettingsTabShared';

export const BrandingSettingsPreviewSection: React.FC<{
    customLogoUrl: string;
    backgroundImageUrl: string;
    useTrendingSlideshow: boolean;
    use24HourClock: boolean;
    showPosterQualityBadges: boolean;
    onBackgroundImageUrlChange: (value: string) => void;
    onUse24HourClockChange: (value: boolean) => void;
    onShowPosterQualityBadgesChange: (value: boolean) => void;
}> = ({
    customLogoUrl,
    backgroundImageUrl,
    useTrendingSlideshow,
    use24HourClock,
    showPosterQualityBadges,
    onBackgroundImageUrlChange,
    onUse24HourClockChange,
    onShowPosterQualityBadgesChange,
}) => (
    <>
        <div className={`mb-4 transition-opacity ${useTrendingSlideshow ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
            <label>Static Splash Background Image</label>
            <input
                type="url"
                className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex transition-all"
                value={backgroundImageUrl}
                onChange={e => onBackgroundImageUrlChange(e.target.value)}
                placeholder="https://example.com/background.png"
            />
            <div className="mt-2">
                <SettingHint>Shown as a subtle splash image on the login screen and portal background.</SettingHint>
            </div>
        </div>

        <div className="mb-6 rounded-lg border border-border overflow-hidden bg-background/70">
            <div
                className="relative min-h-[220px] flex items-center justify-center p-6 bg-card"
                style={backgroundImageUrl ? {
                    backgroundImage: `linear-gradient(rgba(10,15,20,0.42), rgba(10,15,20,0.56)), url("${resolvePortalAssetUrl(backgroundImageUrl).replace(/"/g, '%22')}")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'center',
                    backgroundSize: 'cover',
                } : undefined}
            >
                <div className="text-center">
                    {customLogoUrl ? (
                        <img
                            src={resolvePortalAssetUrl(customLogoUrl)}
                            alt="Server icon preview"
                            className="max-w-28 max-h-24 object-contain mx-auto mb-4 drop-shadow-[0_0_24px_rgba(0,0,0,0.75)]"
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                    ) : (
                        <div className="w-24 h-24 rounded-full border-2 border-plex/50 bg-background/80 mx-auto mb-4 p-3 shadow-[0_0_36px_rgba(0,164,220,0.28)]">
                            <span className="w-full h-full flex items-center justify-center text-3xl font-black text-plex">S</span>
                        </div>
                    )}
                    <p className="text-sm font-bold text-text">Portal splash preview</p>
                    <p className="text-xs text-muted mt-1">This is the server icon and background users will see.</p>
                </div>
            </div>
        </div>

        <div className="mb-4">
            <label>Time Format</label>
            <InlineSwitch label="Use 24-Hour Clock across the Portal" checked={use24HourClock} onChange={onUse24HourClockChange} />
        </div>

        <div className="mb-4">
            <label>Poster Quality Badges</label>
            <InlineSwitch label="Show portal quality chips on posters (4K, HDR, codec, Atmos). Leave off if posters already have Kometa/Plex overlays." checked={showPosterQualityBadges} onChange={onShowPosterQualityBadgesChange} />
            <SettingHint>Applies to Home and Discover poster cards for all users.</SettingHint>
        </div>
    </>
);
