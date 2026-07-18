export interface User {
    id: string;
    username: string;
    email?: string;
    thumb?: string;
    joiningDate: string;
    expiryDate: string | null;
    plexAccessStatus: 'active' | 'pending' | 'revoked' | 'unknown';
    exemptFromCleanup?: boolean;
    isTrial?: boolean;
    /** Opt-in weekly newsletter. Default/undefined = off. */
    newsletterOptIn?: boolean;
    /** Custom portal display name; falls back to Plex/Jellyfin username. */
    displayName?: string;
    lastLogin?: string;
}

export type ArrType = 'sonarr' | 'radarr' | 'lidarr';

export interface ArrInstance {
    id: string;
    type: ArrType;
    name: string;
    url: string;
    apiKey: string;
    enabled: boolean;
    isDefault: boolean;
}

export interface PlexConfig {
    token: string;
    mediaServerType?: 'plex' | 'jellyfin';
    serverIdentifier: string;
    jellyfinUrl?: string;
    jellyfinApiKey?: string;
    checkIntervalMinutes: number;
    smtpHost: string;
    smtpPort: number;
    smtpUser: string;
    smtpPass: string;
    smtpFrom: string;
    smtpSecure: boolean;
    emailDaysBefore: number;
    newsletterFrequency: string;
    newsletterDay: number;
    publicDomain: string;
    requestUrl?: string;
    contactUrl?: string;
}

export interface AppSettings {
    token?: string;
    mediaServerType?: 'plex' | 'jellyfin';
    serverIdentifier?: string;
    jellyfinUrl?: string;
    jellyfinApiKey?: string;
    checkIntervalMinutes: number;
    smtpHost?: string;
    smtpPort?: number;
    smtpUser?: string;
    smtpPass?: string;
    smtpFrom?: string;
    smtpSecure?: boolean;
    emailDaysBefore?: number;
    newsletterFrequency?: string;
    newsletterDay?: number;
    publicDomain?: string;
    requestUrl?: string;
    contactUrl?: string;
    inactiveCleanupEnabled?: boolean;
    inactiveCleanupDays?: number;
    sonarrUrl?: string;
    sonarrApiKey?: string;
    radarrUrl?: string;
    radarrApiKey?: string;
    lidarrUrl?: string;
    lidarrApiKey?: string;
    arrInstances?: ArrInstance[];
    tmdbApiKey?: string;
    tvdbApiKey?: string;
    tvdbPin?: string;
    cacheRefreshMinutes?: number;
    ombiUrl?: string;
    ombiApiKey?: string;
    tautulliUrl?: string;
    tautulliApiKey?: string;
    jellystatUrl?: string;
    jellystatApiKey?: string;
    primaryColor?: string;
    customLogoUrl?: string;
    backgroundImageUrl?: string;
    navOrder?: string[];
}

export interface PlexServer {
    name: string;
    identifier: string;
}

export interface ToastMessage {
    id: number;
    message: string;
    type: 'success' | 'error';
}


export type UserStatus = 'active' | 'expiring' | 'expired';

export interface CustomSelectProps {
    id?: string;
    value: string | number;
    onChange: (value: string) => void;
    options: { label: string; value: string | number }[];
    className?: string;
    compact?: boolean;
}
