import { normalizeSectionLayout, type DashboardLayoutConfig } from '../shared/dashboardLayout';
import { normalizeSettingsNavOrder } from './settingsNavOrder';
import type { ArrInstance } from '../shared/types';

type SettingsSavePayloadInput = {
    token: string;
    mediaServerType: 'plex' | 'jellyfin';
    selectedServer: string;
    plexServerUrl: string;
    jellyfinUrl: string;
    jellyfinApiKey: string;
    checkInterval: number;
    smtpHost: string;
    smtpPort: number;
    smtpUser: string;
    smtpPass: string;
    smtpFrom: string;
    smtpSecure: boolean;
    emailDaysBefore: number;
    newsletterFrequency: string;
    newsletterDay: number;
    inactiveCleanupEnabled: boolean;
    inactiveCleanupDays: number;
    publicDomain: string;
    contactUrl: string;
    contactWhatsApp: string;
    contactEmail: string;
    discordEnabled: boolean;
    discordInviteUrl: string;
    discordChatChannelLabel: string;
    discordMediaChannelLabel: string;
    discordGuildId: string;
    discordBotToken: string;
    discordBotEnabled: boolean;
    discordWebhookUrl: string;
    discordNotifyRequestUpdates: boolean;
    discordNotifyIssueReplies: boolean;
    discordNotifyWatchlistAvailable: boolean;
    discordLlmEnabled: boolean;
    discordLlmUrl: string;
    discordLlmApiKey: string;
    discordLlmModel: string;
    discordAgentEnabled: boolean;
    discordSearxngUrl: string;
    discordBraveSearchApiKey: string;
    discordTavilyApiKey: string;
    discordMentionNl: boolean;
    arrInstances: ArrInstance[];
    tautulliUrl: string;
    tautulliApiKey: string;
    jellystatUrl: string;
    jellystatApiKey: string;
    requestAppType: string;
    requestAppUrl: string;
    requestAppApiKey: string;
    requestAppMembershipSync: boolean;
    ombiUrl: string;
    ombiApiKey: string;
    customLogoUrl: string;
    brandingTheme: string;
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
    referralEnabled: boolean;
    referralTrialDays: number;
    referralRewardDays: number;
    announcement: string;
    navOrder: string[];
    hideStreamUsers: string;
    useTrendingSlideshowOnLogin: boolean;
    showLoginServerStats: boolean;
    publicStatusEnabled: boolean;
    defaultLibraryIds: string[];
    use24HourClock: boolean;
    allowTemporaryAccess: boolean;
    showPosterQualityBadges: boolean;
    autoBackupEnabled: boolean;
    autoBackupIntervalDays: number;
    autoBackupRetentionCount: number;
    dashboardLayout: DashboardLayoutConfig;
};

export const buildSettingsSavePayload = ({
    selectedServer,
    checkInterval,
    dashboardLayout,
    navOrder,
    ...settings
}: SettingsSavePayloadInput) => ({
    ...settings,
    serverIdentifier: selectedServer,
    plexServerUrl: settings.plexServerUrl || '',
    checkIntervalMinutes: checkInterval,
    primaryColor: '',
    allowTemporaryAccess: false,
    navOrder: normalizeSettingsNavOrder(navOrder),
    dashboardLayout: normalizeSectionLayout(dashboardLayout),
});
