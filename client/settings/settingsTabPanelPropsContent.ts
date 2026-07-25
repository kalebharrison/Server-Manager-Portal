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
    contactWhatsApp: values.contactWhatsApp,
    contactEmail: values.contactEmail,
    contactUrl: values.contactUrl,
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
    discordMentionNl: values.discordMentionNl,
    announcement: values.announcement,
    isPushingAnnouncement,
    onContactWhatsAppChange: onChange('contactWhatsApp'),
    onContactEmailChange: onChange('contactEmail'),
    onContactUrlChange: onChange('contactUrl'),
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
    onDiscordMentionNlChange: onChange('discordMentionNl'),
    onAnnouncementChange: onChange('announcement'),
    onPushAnnouncement: handlePushAnnouncement,
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
