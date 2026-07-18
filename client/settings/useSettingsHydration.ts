import { useEffect } from 'react';

import { hydrateSettingsFromConfig } from './settingsInitializers';
import type { SettingsFormState, SettingsFormValues } from './useSettingsFormState';

type SettingsAdminHydration = {
    setAutoBackupEnabled: (value: boolean) => void;
    setAutoBackupIntervalDays: (value: number) => void;
    setAutoBackupRetentionCount: (value: number) => void;
};

type UseSettingsHydrationOptions = {
    initialSettings: any;
    isConfigLoaded: boolean;
    form: SettingsFormState;
    admin: SettingsAdminHydration;
};

export const useSettingsHydration = ({
    initialSettings,
    isConfigLoaded,
    form,
    admin,
}: UseSettingsHydrationOptions) => {
    useEffect(() => {
        if (!isConfigLoaded) return;

        const set = <K extends keyof SettingsFormValues>(key: K) => (value: SettingsFormValues[K]) => {
            form.setField(key, value);
        };

        hydrateSettingsFromConfig(initialSettings, {
            setToken: set('token'),
            setMediaServerType: set('mediaServerType'),
            setPlexServerUrl: set('plexServerUrl'),
            setJellyfinUrl: set('jellyfinUrl'),
            setJellyfinApiKey: set('jellyfinApiKey'),
            setSelectedServer: set('selectedServer'),
            setCheckInterval: set('checkInterval'),
            setSmtpHost: set('smtpHost'),
            setSmtpPort: set('smtpPort'),
            setSmtpUser: set('smtpUser'),
            setSmtpPass: set('smtpPass'),
            setSmtpFrom: set('smtpFrom'),
            setSmtpSecure: set('smtpSecure'),
            setEmailDaysBefore: set('emailDaysBefore'),
            setNewsletterFrequency: set('newsletterFrequency'),
            setNewsletterDay: set('newsletterDay'),
            setInactiveCleanupEnabled: set('inactiveCleanupEnabled'),
            setInactiveCleanupDays: set('inactiveCleanupDays'),
            setPublicDomain: set('publicDomain'),
            setContactUrl: set('contactUrl'),
            setContactWhatsApp: set('contactWhatsApp'),
            setContactEmail: set('contactEmail'),
            setArrInstances: set('arrInstances'),
            setTautulliUrl: set('tautulliUrl'),
            setTautulliApiKey: set('tautulliApiKey'),
            setJellystatUrl: set('jellystatUrl'),
            setJellystatApiKey: set('jellystatApiKey'),
            setRequestAppType: set('requestAppType'),
            setRequestAppUrl: set('requestAppUrl'),
            setRequestAppApiKey: set('requestAppApiKey'),
            setRequestAppMembershipSync: set('requestAppMembershipSync'),
            setOmbiUrl: set('ombiUrl'),
            setOmbiApiKey: set('ombiApiKey'),
            setBrandingTheme: set('brandingTheme'),
            setCustomLogoUrl: set('customLogoUrl'),
            setBackgroundImageUrl: set('backgroundImageUrl'),
            setUseScrollRevealAnimations: set('useScrollRevealAnimations'),
            setUseCinematicLoading: set('useCinematicLoading'),
            setUseBrandedSkeleton: set('useBrandedSkeleton'),
            setUseTrendingSlideshow: set('useTrendingSlideshow'),
            setTrendingSlideshowInterval: set('trendingSlideshowInterval'),
            setTmdbApiKey: set('tmdbApiKey'),
            setTvdbApiKey: set('tvdbApiKey'),
            setTvdbPin: set('tvdbPin'),
            setCacheRefreshMinutes: set('cacheRefreshMinutes'),
            setReferralEnabled: set('referralEnabled'),
            setReferralTrialDays: set('referralTrialDays'),
            setReferralRewardDays: set('referralRewardDays'),
            setAnnouncement: set('announcement'),
            setNavOrder: set('navOrder'),
            setHideStreamUsers: set('hideStreamUsers'),
            setUseTrendingSlideshowOnLogin: set('useTrendingSlideshowOnLogin'),
            setShowLoginServerStats: set('showLoginServerStats'),
            setPublicStatusEnabled: set('publicStatusEnabled'),
            setDefaultLibraryIds: set('defaultLibraryIds'),
            setUse24HourClock: set('use24HourClock'),
            setShowPosterQualityBadges: set('showPosterQualityBadges'),
            setAllowTemporaryAccess: set('allowTemporaryAccess'),
            setAutoBackupEnabled: admin.setAutoBackupEnabled,
            setAutoBackupIntervalDays: admin.setAutoBackupIntervalDays,
            setAutoBackupRetentionCount: admin.setAutoBackupRetentionCount,
            setDashboardLayout: set('dashboardLayout'),
            setTestRecipient: set('testRecipient'),
            setServers: set('servers'),
            dashboardLayoutRef: form.dashboardLayoutRef,
        });
    }, [initialSettings, isConfigLoaded]);
};
