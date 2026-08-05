import type React from 'react';

import type { SettingsTabPanelProps } from './SettingsTabPanel';
import type { SettingsFormState, SettingsFormValues } from './useSettingsFormState';
import type { useSettingsResources } from './useSettingsResources';
import type { SettingsTabPanelOnChange } from './settingsTabPanelPropsTypes';

type ContentTabPanelPropsInput = {
    values: SettingsFormValues;
    form: SettingsFormState;
    onChange: SettingsTabPanelOnChange;
    resources: ReturnType<typeof useSettingsResources>;
    setStatusDraft: React.Dispatch<React.SetStateAction<any>>;
    handlePushAnnouncement: () => Promise<void>;
    isPushingAnnouncement: boolean;
    addToast: SettingsTabPanelProps['addToast'];
};

export const buildHomeLayoutTabPanelProps = ({
    values,
    form,
}: Pick<ContentTabPanelPropsInput, 'values' | 'form'>): SettingsTabPanelProps['homeLayout'] => ({
    layout: values.dashboardLayout,
    onChange: form.updateDashboardLayout,
});

export const buildNavigationTabPanelProps = ({
    values,
    onChange,
}: Pick<ContentTabPanelPropsInput, 'values' | 'onChange'>): SettingsTabPanelProps['navigation'] => ({
    navOrder: values.navOrder,
    onNavOrderChange: onChange('navOrder'),
    navHiddenKeys: values.navHiddenKeys,
    onNavHiddenKeysChange: onChange('navHiddenKeys'),
});

export const buildScannerTabPanelProps = ({
    values,
    onChange,
    addToast,
}: Pick<ContentTabPanelPropsInput, 'values' | 'onChange' | 'addToast'>): SettingsTabPanelProps['scanner'] => ({
    enabled: values.scannerEnabled,
    onEnabledChange: onChange('scannerEnabled'),
    homeWidgetEnabled: values.scannerHomeWidgetEnabled,
    onHomeWidgetEnabledChange: onChange('scannerHomeWidgetEnabled'),
    webhooksVisible: values.scannerWebhooksVisible,
    onWebhooksVisibleChange: onChange('scannerWebhooksVisible'),
    manualPathVisible: values.scannerManualPathVisible,
    onManualPathVisibleChange: onChange('scannerManualPathVisible'),
    scanner: values.scanner,
    onChange: onChange('scanner'),
    sectionId: 'scanner',
    addToast,
});

export const buildUpgraderTabPanelProps = ({
    values,
    onChange,
}: Pick<ContentTabPanelPropsInput, 'values' | 'onChange'>): SettingsTabPanelProps['upgrader'] => ({
    enabled: values.upgraderEnabled,
    automationEnabled: values.upgraderAutomationEnabled,
    huntMissingEpisodes: values.upgraderHuntMissingEpisodes,
    huntAvailableMovies: values.upgraderHuntAvailableMovies,
    minSizeGB: values.upgraderMinSizeGB,
    maxActionsPerHour: values.upgraderMaxActionsPerHour,
    maxDownloadsPerLibrary: values.upgraderMaxDownloadsPerLibrary,
    minScoreDelta: values.upgraderMinScoreDelta,
    preferences: values.upgraderPreferences,
    qcCleanupAutomationEnabled: values.qcCleanupAutomationEnabled,
    integrityEnabled: values.qcIntegrityEnabled,
    integrityAutomationEnabled: values.qcIntegrityAutomationEnabled,
    integrityRequireAudio: values.qcIntegrityRequireAudio,
    integrityIncludeMusic: values.qcIntegrityIncludeMusic,
    integrityXxhashEnabled: values.qcIntegrityXxhashEnabled,
    integrityPathMaps: values.qcIntegrityPathMaps,
    integrityMaxPerCycle: values.qcIntegrityMaxPerCycle,
    integrityConcurrency: values.qcIntegrityConcurrency,
    integrityPlayabilityConcurrency: values.qcIntegrityPlayabilityConcurrency,
    integrityBreakerMaxFindings: values.qcIntegrityBreakerMaxFindings,
    integrityBreakerMaxPercent: values.qcIntegrityBreakerMaxPercent,
    integrityPauseWhenSessions: values.qcIntegrityPauseWhenSessions,
    integrityNightlyHour: values.qcIntegrityNightlyHour,
    integrityDiscordDigestEnabled: values.qcIntegrityDiscordDigestEnabled,
    integrityDecodeWindowSec: values.qcIntegrityDecodeWindowSec,
    integrityDecodeTimeoutMs: values.qcIntegrityDecodeTimeoutMs,
    qcMetaDlMinutes: values.qcMetaDlMinutes,
    qcStalledHours: values.qcStalledHours,
    qcSlowDownloadFloorKbps: values.qcSlowDownloadFloorKbps,
    qcSlowDownloadMinAgeHours: values.qcSlowDownloadMinAgeHours,
    qcCompletedNotImportingMinutes: values.qcCompletedNotImportingMinutes,
    qcOrphanGraceMinutes: values.qcOrphanGraceMinutes,
    qcMaxStrikes: values.qcMaxStrikes,
    qcResearchThrottleHours: values.qcResearchThrottleHours,
    qcSnoozeDefaultHours: values.qcSnoozeDefaultHours,
    qcDiscordDigestEnabled: values.qcDiscordDigestEnabled,
    qcPreferImportDiscordOnly: values.qcPreferImportDiscordOnly,
    qcQbitUrl: values.qcQbitUrl,
    qcSabUrl: values.qcSabUrl,
    qcSabApiKey: values.qcSabApiKey,
    qcBlockedExtensions: values.qcBlockedExtensions,
    onEnabledChange: onChange('upgraderEnabled'),
    onAutomationEnabledChange: onChange('upgraderAutomationEnabled'),
    onHuntMissingEpisodesChange: onChange('upgraderHuntMissingEpisodes'),
    onHuntAvailableMoviesChange: onChange('upgraderHuntAvailableMovies'),
    onMinSizeGBChange: onChange('upgraderMinSizeGB'),
    onMaxActionsPerHourChange: onChange('upgraderMaxActionsPerHour'),
    onMaxDownloadsPerLibraryChange: onChange('upgraderMaxDownloadsPerLibrary'),
    onMinScoreDeltaChange: onChange('upgraderMinScoreDelta'),
    onPreferencesChange: onChange('upgraderPreferences'),
    onQcCleanupAutomationEnabledChange: onChange('qcCleanupAutomationEnabled'),
    onIntegrityEnabledChange: onChange('qcIntegrityEnabled'),
    onIntegrityAutomationEnabledChange: onChange('qcIntegrityAutomationEnabled'),
    onIntegrityRequireAudioChange: onChange('qcIntegrityRequireAudio'),
    onIntegrityIncludeMusicChange: onChange('qcIntegrityIncludeMusic'),
    onIntegrityXxhashEnabledChange: onChange('qcIntegrityXxhashEnabled'),
    onIntegrityPathMapsChange: onChange('qcIntegrityPathMaps'),
    onIntegrityMaxPerCycleChange: onChange('qcIntegrityMaxPerCycle'),
    onIntegrityConcurrencyChange: onChange('qcIntegrityConcurrency'),
    onIntegrityPlayabilityConcurrencyChange: onChange('qcIntegrityPlayabilityConcurrency'),
    onIntegrityBreakerMaxFindingsChange: onChange('qcIntegrityBreakerMaxFindings'),
    onIntegrityBreakerMaxPercentChange: onChange('qcIntegrityBreakerMaxPercent'),
    onIntegrityPauseWhenSessionsChange: onChange('qcIntegrityPauseWhenSessions'),
    onIntegrityNightlyHourChange: onChange('qcIntegrityNightlyHour'),
    onIntegrityDiscordDigestEnabledChange: onChange('qcIntegrityDiscordDigestEnabled'),
    onIntegrityDecodeWindowSecChange: onChange('qcIntegrityDecodeWindowSec'),
    onIntegrityDecodeTimeoutMsChange: onChange('qcIntegrityDecodeTimeoutMs'),
    onQcMetaDlMinutesChange: onChange('qcMetaDlMinutes'),
    onQcStalledHoursChange: onChange('qcStalledHours'),
    onQcSlowDownloadFloorKbpsChange: onChange('qcSlowDownloadFloorKbps'),
    onQcSlowDownloadMinAgeHoursChange: onChange('qcSlowDownloadMinAgeHours'),
    onQcCompletedNotImportingMinutesChange: onChange('qcCompletedNotImportingMinutes'),
    onQcOrphanGraceMinutesChange: onChange('qcOrphanGraceMinutes'),
    onQcMaxStrikesChange: onChange('qcMaxStrikes'),
    onQcResearchThrottleHoursChange: onChange('qcResearchThrottleHours'),
    onQcSnoozeDefaultHoursChange: onChange('qcSnoozeDefaultHours'),
    onQcDiscordDigestEnabledChange: onChange('qcDiscordDigestEnabled'),
    onQcPreferImportDiscordOnlyChange: onChange('qcPreferImportDiscordOnly'),
    onQcBlockedExtensionsChange: onChange('qcBlockedExtensions'),
});

export const buildBroadcastTabPanelProps = ({
    resources,
}: Pick<ContentTabPanelPropsInput, 'resources'>): SettingsTabPanelProps['broadcast'] => ({
    users: resources.users,
});

export const buildStatusTabPanelProps = ({
    values,
    onChange,
    resources,
    setStatusDraft,
}: Pick<ContentTabPanelPropsInput, 'values' | 'onChange' | 'resources' | 'setStatusDraft'>): SettingsTabPanelProps['status'] => ({
    statusConfig: resources.statusConfig,
    publicStatusEnabled: values.publicStatusEnabled,
    onPublicStatusEnabledChange: onChange('publicStatusEnabled'),
    onStatusDraftChange: setStatusDraft,
    fetchStatusConfig: resources.fetchStatusConfig,
});

export const buildContactTabPanelProps = ({
    values,
    onChange,
    handlePushAnnouncement,
    isPushingAnnouncement,
}: Pick<ContentTabPanelPropsInput, 'values' | 'onChange' | 'handlePushAnnouncement' | 'isPushingAnnouncement'>): SettingsTabPanelProps['contact'] => ({
    contactEmail: values.contactEmail,
    contactUrl: values.contactUrl,
    announcement: values.announcement,
    isPushingAnnouncement,
    onContactEmailChange: onChange('contactEmail'),
    onContactUrlChange: onChange('contactUrl'),
    onAnnouncementChange: onChange('announcement'),
    onPushAnnouncement: handlePushAnnouncement,
});

export const buildDiscordTabPanelProps = ({
    values,
    onChange,
}: Pick<ContentTabPanelPropsInput, 'values' | 'onChange'>): SettingsTabPanelProps['discord'] => ({
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
    onDiscordEnabledChange: onChange('discordEnabled'),
    onDiscordInviteUrlChange: onChange('discordInviteUrl'),
    onDiscordChatChannelLabelChange: onChange('discordChatChannelLabel'),
    onDiscordMediaChannelLabelChange: onChange('discordMediaChannelLabel'),
    onDiscordGuildIdChange: onChange('discordGuildId'),
    onDiscordBotTokenChange: onChange('discordBotToken'),
    onDiscordBotEnabledChange: onChange('discordBotEnabled'),
    onDiscordWebhookUrlChange: onChange('discordWebhookUrl'),
    onDiscordNotifyRequestUpdatesChange: onChange('discordNotifyRequestUpdates'),
    onDiscordNotifyIssueRepliesChange: onChange('discordNotifyIssueReplies'),
    onDiscordNotifyWatchlistAvailableChange: onChange('discordNotifyWatchlistAvailable'),
    onDiscordLlmEnabledChange: onChange('discordLlmEnabled'),
    onDiscordLlmUrlChange: onChange('discordLlmUrl'),
    onDiscordLlmApiKeyChange: onChange('discordLlmApiKey'),
    onDiscordLlmModelChange: onChange('discordLlmModel'),
    onDiscordAgentEnabledChange: onChange('discordAgentEnabled'),
    onDiscordSearxngUrlChange: onChange('discordSearxngUrl'),
    onDiscordBraveSearchApiKeyChange: onChange('discordBraveSearchApiKey'),
    onDiscordTavilyApiKeyChange: onChange('discordTavilyApiKey'),
    onDiscordMentionNlChange: onChange('discordMentionNl'),
});

export const buildPublicAccessTabPanelProps = ({
    values,
    onChange,
    resources,
}: Pick<ContentTabPanelPropsInput, 'values' | 'onChange' | 'resources'>): SettingsTabPanelProps['publicAccess'] => ({
    showLoginServerStats: values.showLoginServerStats,
    useTrendingSlideshowOnLogin: values.useTrendingSlideshowOnLogin,
    referralEnabled: values.referralEnabled,
    referralTrialDays: values.referralTrialDays,
    referralRewardDays: values.referralRewardDays,
    mediaServerType: values.mediaServerType,
    libraries: resources.libraries,
    defaultLibraryIds: values.defaultLibraryIds,
    hideStreamUsers: values.hideStreamUsers,
    onShowLoginServerStatsChange: onChange('showLoginServerStats'),
    onUseTrendingSlideshowOnLoginChange: onChange('useTrendingSlideshowOnLogin'),
    onReferralEnabledChange: onChange('referralEnabled'),
    onReferralTrialDaysChange: onChange('referralTrialDays'),
    onReferralRewardDaysChange: onChange('referralRewardDays'),
    onDefaultLibraryIdsChange: onChange('defaultLibraryIds'),
    onHideStreamUsersChange: onChange('hideStreamUsers'),
});

export const buildBrandingTabPanelProps = ({
    values,
    onChange,
    addToast,
}: Pick<ContentTabPanelPropsInput, 'values' | 'onChange' | 'addToast'>): SettingsTabPanelProps['branding'] => ({
    mediaServerType: values.mediaServerType,
    customLogoUrl: values.customLogoUrl,
    brandingTheme: values.brandingTheme,
    backgroundImageUrl: values.backgroundImageUrl,
    useScrollRevealAnimations: values.useScrollRevealAnimations,
    useCinematicLoading: values.useCinematicLoading,
    useBrandedSkeleton: values.useBrandedSkeleton,
    useTrendingSlideshow: values.useTrendingSlideshow,
    trendingSlideshowInterval: values.trendingSlideshowInterval,
    use24HourClock: values.use24HourClock,
    showPosterQualityBadges: values.showPosterQualityBadges,
    onCustomLogoUrlChange: onChange('customLogoUrl'),
    onLogoFileChange: onChange('logoFile'),
    onBrandingThemeChange: onChange('brandingTheme'),
    onBackgroundImageUrlChange: onChange('backgroundImageUrl'),
    onUseScrollRevealAnimationsChange: onChange('useScrollRevealAnimations'),
    onUseCinematicLoadingChange: onChange('useCinematicLoading'),
    onUseBrandedSkeletonChange: onChange('useBrandedSkeleton'),
    onUseTrendingSlideshowChange: onChange('useTrendingSlideshow'),
    onTrendingSlideshowIntervalChange: onChange('trendingSlideshowInterval'),
    onUse24HourClockChange: onChange('use24HourClock'),
    onShowPosterQualityBadgesChange: onChange('showPosterQualityBadges'),
    addToast,
});

export const buildInvitesTabPanelProps = ({
    addToast,
}: Pick<ContentTabPanelPropsInput, 'addToast'>): SettingsTabPanelProps['invites'] => ({
    addToast,
});
