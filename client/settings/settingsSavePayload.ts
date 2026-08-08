import { normalizeSectionLayout, type DashboardLayoutConfig } from '../shared/dashboardLayout';
import { normalizeNavHiddenKeys, normalizeSettingsNavOrder } from './settingsNavOrder';
import type { ArrInstance } from '../shared/types';

type SettingsSavePayloadInput = {
    token: string;
    mediaServerType: 'plex' | 'jellyfin';
    selectedServer: string;
    plexServerUrl: string;
    jellyfinUrl: string;
    jellyfinApiKey: string;
    checkInterval: number;
    smtpEnabled: boolean;
    smtpAdminOnly: boolean;
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
    contactEmail: string;
    discordEnabled: boolean;
    discordInviteUrl: string;
    discordChatChannelLabel: string;
    discordMediaChannelLabel: string;
    discordGuildId: string;
    discordMemberChannelId: string;
    discordBotToken: string;
    discordBotEnabled: boolean;
    discordWebhookUrl: string;
    discordAdminWebhookUrl: string;
    discordNotifyRequestUpdates: boolean;
    discordNotifyIssueReplies: boolean;
    discordNotifyWatchlistAvailable: boolean;
    discordNotifyAnnouncements: boolean;
    discordNotifyBroadcasts: boolean;
    discordNotifyNewsletters: boolean;
    discordNotifyMediaReady: boolean;
    discordMediaAnnounceDebounceMinutes: number;
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
    navHiddenKeys: string[];
    hideStreamUsers: string;
    useTrendingSlideshowOnLogin: boolean;
    showLoginServerStats: boolean;
    publicStatusEnabled: boolean;
    defaultLibraryIds: string[];
    use24HourClock: boolean;
    showPosterQualityBadges: boolean;
    autoBackupEnabled: boolean;
    autoBackupIntervalDays: number;
    autoBackupRetentionCount: number;
    upgraderEnabled: boolean;
    upgraderAutomationEnabled: boolean;
    upgraderHuntMissingEpisodes: boolean;
    upgraderHuntAvailableMovies: boolean;
    upgraderMinSizeGB: number;
    upgraderMaxActionsPerHour: number;
    upgraderMaxDownloadsPerLibrary: number;
    upgraderMinScoreDelta: number;
    upgraderHuntIntensity: string;
    upgraderPreferences: {
        preferDolbyVisionHdr: boolean;
        preferAtmos: boolean;
        preferRemux: boolean;
        preferSeasonPacks: boolean;
    };
    qcCleanupAutomationEnabled: boolean;
    qcCleanupAggression: string;
    qcIntegrityEnabled: boolean;
    qcIntegrityAutomationEnabled: boolean;
    qcIntegrityRequireAudio: boolean;
    qcIntegrityIncludeMusic: boolean;
    qcIntegrityXxhashEnabled: boolean;
    qcIntegrityPathMaps: Array<{ from: string; to: string }>;
    qcIntegrityMaxPerCycle: number;
    qcIntegrityConcurrency: number;
    qcIntegrityPlayabilityConcurrency: number;
    qcIntegrityBreakerMaxFindings: number;
    qcIntegrityBreakerMaxPercent: number;
    qcIntegrityPauseWhenSessions: number;
    qcIntegrityNightlyHour: number;
    qcIntegrityDiscordDigestEnabled: boolean;
    qcIntegrityDecodeWindowSec: number;
    qcIntegrityDecodeTimeoutMs: number;
    qcIntegrityDecodeRetries: number;
    qcIntegritySoftDecodeTimeouts: boolean;
    qcIntegrityWebhookUsername: string;
    qcIntegrityWebhookPassword: string;
    qcMetaDlMinutes: number;
    qcStalledHours: number;
    qcSlowDownloadFloorKbps: number;
    qcSlowDownloadMinAgeHours: number;
    qcCompletedNotImportingMinutes: number;
    qcOrphanGraceMinutes: number;
    qcMaxStrikes: number;
    qcResearchThrottleHours: number;
    qcSnoozeDefaultHours: number;
    qcDiscordDigestEnabled: boolean;
    qcQbitUrl: string;
    qcQbitUsername: string;
    qcQbitPassword: string;
    qcSabUrl: string;
    qcSabApiKey: string;
    qcBlockedExtensions: string[];
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
    navHiddenKeys: normalizeNavHiddenKeys(settings.navHiddenKeys),
    dashboardLayout: normalizeSectionLayout(dashboardLayout),
});
