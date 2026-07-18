import { useCallback, useRef, useState } from 'react';

import { DEFAULT_DASHBOARD_LAYOUT, type DashboardLayoutConfig } from '../shared/dashboardLayout';
import type { ArrInstance, PlexServer } from '../shared/types';
import { getDefaultSettingsNavOrder } from './settingsNavOrder';
import { buildSettingsSavePayload } from './settingsSavePayload';

export type SettingsFormValues = {
    token: string;
    mediaServerType: 'plex' | 'jellyfin';
    plexServerUrl: string;
    jellyfinUrl: string;
    jellyfinApiKey: string;
    servers: PlexServer[];
    selectedServer: string;
    checkInterval: number;
    hideStreamUsers: string;
    useTrendingSlideshowOnLogin: boolean;
    showLoginServerStats: boolean;
    publicStatusEnabled: boolean;
    defaultLibraryIds: string[];
    smtpHost: string;
    smtpPort: number;
    smtpUser: string;
    smtpPass: string;
    smtpFrom: string;
    smtpSecure: boolean;
    emailDaysBefore: number;
    testRecipient: string;
    newsletterFrequency: string;
    newsletterDay: number;
    publicDomain: string;
    contactUrl: string;
    contactWhatsApp: string;
    contactEmail: string;
    inactiveCleanupEnabled: boolean;
    inactiveCleanupDays: number;
    arrInstances: ArrInstance[];
    tautulliUrl: string;
    tautulliApiKey: string;
    jellystatUrl: string;
    jellystatApiKey: string;
    requestAppType: string;
    requestAppUrl: string;
    requestAppApiKey: string;
    ombiUrl: string;
    ombiApiKey: string;
    dashboardLayout: DashboardLayoutConfig;
    customLogoUrl: string;
    backgroundImageUrl: string;
    useScrollRevealAnimations: boolean;
    useCinematicLoading: boolean;
    useBrandedSkeleton: boolean;
    useTrendingSlideshow: boolean;
    trendingSlideshowInterval: number;
    tmdbApiKey: string;
    tvdbApiKey: string;
    tvdbPin: string;
    cacheRefreshMinutes: number;
    brandingTheme: string;
    referralEnabled: boolean;
    referralTrialDays: number;
    referralRewardDays: number;
    announcement: string;
    use24HourClock: boolean;
    showPosterQualityBadges: boolean;
    allowTemporaryAccess: boolean;
    navOrder: string[];
    logoFile: File | null;
};

type SaveAdminValues = {
    customLogoUrl: string;
    autoBackupEnabled: boolean;
    autoBackupIntervalDays: number;
    autoBackupRetentionCount: number;
};

const createInitialValues = (): SettingsFormValues => ({
    token: '',
    mediaServerType: 'plex',
    plexServerUrl: '',
    jellyfinUrl: '',
    jellyfinApiKey: '',
    servers: [],
    selectedServer: '',
    checkInterval: 60,
    hideStreamUsers: 'anonymous',
    useTrendingSlideshowOnLogin: false,
    showLoginServerStats: false,
    publicStatusEnabled: false,
    defaultLibraryIds: [],
    smtpHost: '',
    smtpPort: 587,
    smtpUser: '',
    smtpPass: '',
    smtpFrom: '',
    smtpSecure: false,
    emailDaysBefore: 7,
    testRecipient: '',
    newsletterFrequency: 'disabled',
    newsletterDay: 0,
    publicDomain: 'https://yourdomain.com',
    contactUrl: '',
    contactWhatsApp: '',
    contactEmail: '',
    inactiveCleanupEnabled: false,
    inactiveCleanupDays: 90,
    arrInstances: [],
    tautulliUrl: '',
    tautulliApiKey: '',
    jellystatUrl: '',
    jellystatApiKey: '',
    requestAppType: 'none',
    requestAppUrl: '',
    requestAppApiKey: '',
    ombiUrl: '',
    ombiApiKey: '',
    dashboardLayout: DEFAULT_DASHBOARD_LAYOUT,
    customLogoUrl: '',
    backgroundImageUrl: '',
    useScrollRevealAnimations: false,
    useCinematicLoading: false,
    useBrandedSkeleton: true,
    useTrendingSlideshow: false,
    trendingSlideshowInterval: 30,
    tmdbApiKey: '',
    tvdbApiKey: '',
    tvdbPin: '',
    cacheRefreshMinutes: 5,
    brandingTheme: 'plex',
    referralEnabled: false,
    referralTrialDays: 3,
    referralRewardDays: 7,
    announcement: '',
    use24HourClock: false,
    showPosterQualityBadges: true,
    allowTemporaryAccess: false,
    navOrder: getDefaultSettingsNavOrder(),
    logoFile: null,
});

export const useSettingsFormState = () => {
    const [values, setValues] = useState<SettingsFormValues>(createInitialValues);
    const dashboardLayoutRef = useRef<DashboardLayoutConfig>(DEFAULT_DASHBOARD_LAYOUT);

    const setField = useCallback(<K extends keyof SettingsFormValues>(key: K, value: SettingsFormValues[K]) => {
        setValues(current => ({ ...current, [key]: value }));
    }, []);

    const updateDashboardLayout = useCallback((next: DashboardLayoutConfig) => {
        dashboardLayoutRef.current = next;
        setField('dashboardLayout', next);
    }, [setField]);

    const createSavePayload = useCallback((adminValues: SaveAdminValues) => buildSettingsSavePayload({
        token: values.token,
        mediaServerType: values.mediaServerType,
        selectedServer: values.selectedServer,
        plexServerUrl: values.plexServerUrl,
        jellyfinUrl: values.jellyfinUrl,
        jellyfinApiKey: values.jellyfinApiKey,
        checkInterval: values.checkInterval,
        smtpHost: values.smtpHost,
        smtpPort: values.smtpPort,
        smtpUser: values.smtpUser,
        smtpPass: values.smtpPass,
        smtpFrom: values.smtpFrom,
        smtpSecure: values.smtpSecure,
        emailDaysBefore: values.emailDaysBefore,
        newsletterFrequency: values.newsletterFrequency,
        newsletterDay: values.newsletterDay,
        inactiveCleanupEnabled: values.inactiveCleanupEnabled,
        inactiveCleanupDays: values.inactiveCleanupDays,
        publicDomain: values.publicDomain,
        contactUrl: values.contactUrl,
        contactWhatsApp: values.contactWhatsApp,
        contactEmail: values.contactEmail,
        arrInstances: values.arrInstances,
        tautulliUrl: values.tautulliUrl,
        tautulliApiKey: values.tautulliApiKey,
        jellystatUrl: values.jellystatUrl,
        jellystatApiKey: values.jellystatApiKey,
        requestAppType: values.requestAppType,
        requestAppUrl: values.requestAppUrl,
        requestAppApiKey: values.requestAppApiKey,
        ombiUrl: values.ombiUrl,
        ombiApiKey: values.ombiApiKey,
        customLogoUrl: adminValues.customLogoUrl,
        brandingTheme: values.brandingTheme,
        backgroundImageUrl: values.backgroundImageUrl,
        useScrollRevealAnimations: values.useScrollRevealAnimations,
        useCinematicLoading: values.useCinematicLoading,
        useBrandedSkeleton: values.useBrandedSkeleton,
        useTrendingSlideshow: values.useTrendingSlideshow,
        trendingSlideshowInterval: values.trendingSlideshowInterval,
        tmdbApiKey: values.tmdbApiKey,
        tvdbApiKey: values.tvdbApiKey,
        tvdbPin: values.tvdbPin,
        cacheRefreshMinutes: values.cacheRefreshMinutes,
        referralEnabled: values.referralEnabled,
        referralTrialDays: values.referralTrialDays,
        referralRewardDays: values.referralRewardDays,
        announcement: values.announcement,
        navOrder: values.navOrder,
        hideStreamUsers: values.hideStreamUsers,
        useTrendingSlideshowOnLogin: values.useTrendingSlideshowOnLogin,
        showLoginServerStats: values.showLoginServerStats,
        publicStatusEnabled: values.publicStatusEnabled,
        defaultLibraryIds: values.defaultLibraryIds,
        use24HourClock: values.use24HourClock,
        allowTemporaryAccess: values.allowTemporaryAccess,
        showPosterQualityBadges: values.showPosterQualityBadges,
        autoBackupEnabled: adminValues.autoBackupEnabled,
        autoBackupIntervalDays: adminValues.autoBackupIntervalDays,
        autoBackupRetentionCount: adminValues.autoBackupRetentionCount,
        dashboardLayout: dashboardLayoutRef.current,
    }), [values]);

    return {
        values,
        setField,
        dashboardLayoutRef,
        updateDashboardLayout,
        createSavePayload,
    };
};

export type SettingsFormState = ReturnType<typeof useSettingsFormState>;
