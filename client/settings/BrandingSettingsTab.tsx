import React from 'react';
import { resolvePortalAssetUrl } from '../shared/basePath';
import { CustomSelect } from '../shared/ui';
import { SettingHint } from './SettingHint';

const JELLYFIN_BRAND_LOGO_URL = '/api/jellyfin/branding/icon';
const JELLYFIN_BRAND_BACKGROUND_URL = '/api/jellyfin/branding/splash';

type BrandingSettingsTabProps = {
    mediaServerType: 'plex' | 'jellyfin';
    customLogoUrl: string;
    brandingTheme: string;
    backgroundImageUrl: string;
    useScrollRevealAnimations: boolean;
    useCinematicLoading: boolean;
    useBrandedSkeleton: boolean;
    useTrendingSlideshow: boolean;
    trendingSlideshowInterval: number;
    useTrendingSlideshowOnLogin: boolean;
    use24HourClock: boolean;
    showPosterQualityBadges: boolean;
    allowTemporaryAccess: boolean;
    announcement: string;
    isPushingAnnouncement: boolean;
    referralEnabled: boolean;
    referralTrialDays: number;
    referralRewardDays: number;
    onCustomLogoUrlChange: (value: string) => void;
    onLogoFileChange: (value: File | null) => void;
    onBrandingThemeChange: (value: string) => void;
    onBackgroundImageUrlChange: (value: string) => void;
    onUseScrollRevealAnimationsChange: (value: boolean) => void;
    onUseCinematicLoadingChange: (value: boolean) => void;
    onUseBrandedSkeletonChange: (value: boolean) => void;
    onUseTrendingSlideshowChange: (value: boolean) => void;
    onTrendingSlideshowIntervalChange: (value: number) => void;
    onUseTrendingSlideshowOnLoginChange: (value: boolean) => void;
    onUse24HourClockChange: (value: boolean) => void;
    onShowPosterQualityBadgesChange: (value: boolean) => void;
    onAllowTemporaryAccessChange: (value: boolean) => void;
    onAnnouncementChange: (value: string) => void;
    onPushAnnouncement: () => void;
    onReferralEnabledChange: (value: boolean) => void;
    onReferralTrialDaysChange: (value: number) => void;
    onReferralRewardDaysChange: (value: number) => void;
    addToast: (message: string, type?: 'success' | 'error') => void;
};

const ToggleRow: React.FC<{
    title: string;
    checked: boolean;
    onChange: (value: boolean) => void;
    children: React.ReactNode;
}> = ({ title, checked, onChange, children }) => (
    <div className="mb-4 mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-4 border-b border-border/40">
        <div>
            <h4 className="font-bold text-text">{title}</h4>
            {children}
        </div>
        <label className="relative inline-flex items-center cursor-pointer ml-4 flex-shrink-0">
            <input
                type="checkbox"
                className="sr-only peer"
                checked={checked}
                onChange={e => onChange(e.target.checked)}
            />
            <div className="w-11 h-6 bg-background peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-text after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-plex"></div>
        </label>
    </div>
);

const InlineSwitch: React.FC<{
    label: string;
    checked: boolean;
    onChange: (value: boolean) => void;
}> = ({ label, checked, onChange }) => (
    <div className="flex items-center gap-2 mt-2">
        <button type="button" onClick={() => onChange(!checked)} className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors flex-shrink-0 cursor-pointer ${checked ? 'bg-plex' : 'bg-border'}`}>
            <span className={`inline-block w-4 h-4 transform bg-white rounded-full shadow-sm transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
        <span className="text-sm font-medium cursor-pointer select-none hover:text-plex transition-colors" onClick={() => onChange(!checked)}>{label}</span>
    </div>
);

export const BrandingSettingsTab: React.FC<BrandingSettingsTabProps> = ({
    mediaServerType,
    customLogoUrl,
    brandingTheme,
    backgroundImageUrl,
    useScrollRevealAnimations,
    useCinematicLoading,
    useBrandedSkeleton,
    useTrendingSlideshow,
    trendingSlideshowInterval,
    useTrendingSlideshowOnLogin,
    use24HourClock,
    showPosterQualityBadges,
    allowTemporaryAccess,
    announcement,
    isPushingAnnouncement,
    referralEnabled,
    referralTrialDays,
    referralRewardDays,
    onCustomLogoUrlChange,
    onLogoFileChange,
    onBrandingThemeChange,
    onBackgroundImageUrlChange,
    onUseScrollRevealAnimationsChange,
    onUseCinematicLoadingChange,
    onUseBrandedSkeletonChange,
    onUseTrendingSlideshowChange,
    onTrendingSlideshowIntervalChange,
    onUseTrendingSlideshowOnLoginChange,
    onUse24HourClockChange,
    onShowPosterQualityBadgesChange,
    onAllowTemporaryAccessChange,
    onAnnouncementChange,
    onPushAnnouncement,
    onReferralEnabledChange,
    onReferralTrialDaysChange,
    onReferralRewardDaysChange,
    addToast,
}) => {
    const applyJellyfinBranding = () => {
        onCustomLogoUrlChange(JELLYFIN_BRAND_LOGO_URL);
        onBackgroundImageUrlChange(JELLYFIN_BRAND_BACKGROUND_URL);
        onLogoFileChange(null);
        addToast('Jellyfin server icon and splash background applied. Save settings to publish.');
    };

    return (
        <div className="mb-8 animate-fade-in">
            <h3 className="text-xl font-bold text-plex mb-4 border-b border-border pb-2">Branding & UI</h3>

            {mediaServerType === 'jellyfin' && (
                <div className="mb-4 rounded-lg border border-plex/30 bg-plex/10 p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                            <span className="w-11 h-11 rounded-lg bg-background border border-plex/30 flex items-center justify-center overflow-hidden flex-shrink-0">
                                <img src={JELLYFIN_BRAND_LOGO_URL} alt="" className="w-8 h-8 object-contain" />
                            </span>
                            <div className="min-w-0">
                                <h4 className="font-bold text-text">Jellyfin branding</h4>
                                <p className="text-xs text-muted mt-1">Use the Jellyfin server icon and splash background across the portal.</p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={applyJellyfinBranding}
                            className="px-4 py-2 bg-plex hover:bg-plex-hover text-background rounded-md font-bold transition-colors whitespace-nowrap"
                        >
                            Use Jellyfin icon & splash
                        </button>
                    </div>
                </div>
            )}

            <div className="mb-4">
                <label>Custom Logo</label>
                <div className="flex flex-col gap-2">
                    <input type="url" className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex transition-all" value={customLogoUrl} onChange={e => onCustomLogoUrlChange(e.target.value)} placeholder="https://example.com/logo.png" />
                    <span className="text-center text-muted font-bold text-sm">OR</span>
                    <input type="file" accept="image/*" className="w-full p-2 rounded-lg border border-border bg-background text-muted text-sm outline-none focus:border-plex transition-all file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-xs file:font-bold file:bg-white/10 file:text-text hover:file:bg-white/20 file:cursor-pointer cursor-pointer" onChange={e => onLogoFileChange(e.target.files?.[0] || null)} />
                </div>
                <div className="mt-2">
                    <SettingHint>Provide a URL or upload a file. (Max 5MB)</SettingHint>
                </div>
            </div>
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

            <ToggleRow title="Enable Slideshow on Login Page" checked={useTrendingSlideshowOnLogin} onChange={onUseTrendingSlideshowOnLoginChange}>
                <SettingHint>Display the TMDB trending slideshow background on the login and landing pages.</SettingHint>
            </ToggleRow>

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
                <InlineSwitch label="Show quality badges on recently added and discover posters (4K, HDR, codec, Atmos)" checked={showPosterQualityBadges} onChange={onShowPosterQualityBadgesChange} />
                <SettingHint>Applies to Home and Discover poster cards for all users.</SettingHint>
            </div>

            <div className="mb-4">
                <label>Public Access</label>
                <InlineSwitch label="Allow Temporary Access (Public Sign-ups)" checked={allowTemporaryAccess} onChange={onAllowTemporaryAccessChange} />
            </div>

            <h3 className="text-xl font-bold text-plex mb-4 border-b border-border pb-2 mt-8">Announcements</h3>
            <div className="mb-4">
                <label>Portal Announcement Banner</label>
                <textarea className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex transition-all" value={announcement} onChange={e => onAnnouncementChange(e.target.value)} placeholder="E.g. Server maintenance scheduled for Friday..." rows={3}></textarea>
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 mt-2">
                    <SettingHint>If provided, this announcement will be prominently displayed to all users.</SettingHint>
                    <button
                        onClick={onPushAnnouncement}
                        disabled={isPushingAnnouncement || !announcement}
                        className="bg-plex hover:bg-plex-hover disabled:opacity-50 text-background font-bold py-1.5 px-4 rounded-lg transition-colors text-sm whitespace-nowrap"
                    >
                        {isPushingAnnouncement ? 'Pushing...' : 'Save & Send Email Blast'}
                    </button>
                </div>
            </div>

            <h3 className="text-xl font-bold text-plex mb-4 border-b border-border pb-2 mt-8">Referral System</h3>
            <div className="mb-6 flex items-center justify-between py-4 border-b border-border/40">
                <div>
                    <label className="font-bold block mb-1">Enable Referrals</label>
                    <span className="text-xs text-muted block">Allow users to generate a referral link</span>
                </div>
                <button onClick={() => onReferralEnabledChange(!referralEnabled)} className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors ${referralEnabled ? 'bg-plex' : 'bg-border'}`}>
                    <span className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform ${referralEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
            </div>
            <div className={`transition-all ${!referralEnabled ? 'opacity-50 pointer-events-none' : ''}`}>
                <div className="flex gap-4">
                    <div className="flex-1">
                        <label>Referred User Temporary Access Days</label>
                        <input type="number" min="0" className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex transition-all" value={referralTrialDays} onChange={e => onReferralTrialDaysChange(Number(e.target.value))} />
                    </div>
                    <div className="flex-1">
                        <label>Referrer Reward Days</label>
                        <input type="number" min="0" className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex transition-all" value={referralRewardDays} onChange={e => onReferralRewardDaysChange(Number(e.target.value))} />
                    </div>
                </div>
            </div>
        </div>
    );
};
