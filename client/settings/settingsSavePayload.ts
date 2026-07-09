import { normalizeSectionLayout, type DashboardLayoutConfig } from '../shared/dashboardLayout';
import { ensureMaintenanceNavOrder } from './settingsNavOrder';

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
    requestUrl: string;
    contactUrl: string;
    contactWhatsApp: string;
    contactEmail: string;
    sonarrUrl: string;
    sonarrApiKey: string;
    radarrUrl: string;
    radarrApiKey: string;
    tautulliUrl: string;
    tautulliApiKey: string;
    jellystatUrl: string;
    jellystatApiKey: string;
    requestAppType: string;
    requestAppUrl: string;
    requestAppApiKey: string;
    customLogoUrl: string;
    brandingTheme: string;
    backgroundImageUrl: string;
    useScrollRevealAnimations: boolean;
    useCinematicLoading: boolean;
    useBrandedSkeleton: boolean;
    useTrendingSlideshow: boolean;
    trendingSlideshowInterval: number;
    tmdbApiKey: string;
    referralEnabled: boolean;
    referralTrialDays: number;
    referralRewardDays: number;
    announcement: string;
    navOrder: string[];
    hideStreamUsers: string;
    showUsernamesInAnalytics: boolean;
    useTrendingSlideshowOnLogin: boolean;
    publicStatusEnabled: boolean;
    defaultLibraryIds: string[];
    use24HourClock: boolean;
    allowTemporaryAccess: boolean;
    showPosterQualityBadges: boolean;
    autoBackupEnabled: boolean;
    autoBackupIntervalDays: number;
    autoBackupRetentionCount: number;
    maintenanceExperimentalEnabled: boolean;
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
    navOrder: ensureMaintenanceNavOrder(navOrder),
    dashboardLayout: normalizeSectionLayout(dashboardLayout),
});
