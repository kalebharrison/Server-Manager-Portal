import { useCallback, useRef, useState } from 'react';

import { DEFAULT_DASHBOARD_LAYOUT, type DashboardLayoutConfig } from '../shared/dashboardLayout';
import { createInitialSettingsFormValues } from './settingsFormInitialValues';
import type { SaveAdminValues, SettingsFormValues } from './settingsFormTypes';
import { buildSettingsSavePayload } from './settingsSavePayload';

export type { SaveAdminValues, SettingsFormValues } from './settingsFormTypes';

export const useSettingsFormState = () => {
    const [values, setValues] = useState<SettingsFormValues>(createInitialSettingsFormValues);
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
        discordEnabled: values.discordEnabled,
        discordInviteUrl: values.discordInviteUrl,
        discordChatChannelLabel: values.discordChatChannelLabel,
        discordMediaChannelLabel: values.discordMediaChannelLabel,
        discordGuildId: values.discordGuildId,
        discordBotToken: values.discordBotToken,
        discordBotEnabled: values.discordBotEnabled,
        discordWebhookUrl: values.discordWebhookUrl,
        discordNotifyRequestUpdates: values.discordNotifyRequestUpdates,
        discordNotifyIssueReplies: values.discordNotifyIssueReplies,
        discordNotifyWatchlistAvailable: values.discordNotifyWatchlistAvailable,
        discordLlmEnabled: values.discordLlmEnabled,
        discordLlmUrl: values.discordLlmUrl,
        discordLlmApiKey: values.discordLlmApiKey,
        discordLlmModel: values.discordLlmModel,
        discordAgentEnabled: values.discordAgentEnabled,
        discordSearxngUrl: values.discordSearxngUrl,
        discordBraveSearchApiKey: values.discordBraveSearchApiKey,
        discordTavilyApiKey: values.discordTavilyApiKey,
        discordMentionNl: values.discordMentionNl,
        arrInstances: values.arrInstances,
        tautulliUrl: values.tautulliUrl,
        tautulliApiKey: values.tautulliApiKey,
        jellystatUrl: values.jellystatUrl,
        jellystatApiKey: values.jellystatApiKey,
        requestAppType: values.requestAppType,
        requestAppUrl: values.requestAppUrl,
        requestAppApiKey: values.requestAppApiKey,
        requestAppMembershipSync: values.requestAppMembershipSync,
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
