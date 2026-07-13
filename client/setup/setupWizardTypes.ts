import type { PlexServer } from '../shared/types';

export type SetupWizardForm = {
    token: string;
    mediaServerType: string;
    serverIdentifier: string;
    plexServerUrl: string;
    jellyfinUrl: string;
    jellyfinApiKey: string;
    publicDomain: string;
    brandTheme: string;
    primaryColor: string;
    customLogoUrl: string;
    smtpHost: string;
    smtpPort: number;
    smtpUser: string;
    smtpPass: string;
    smtpFrom: string;
    smtpSecure: boolean;
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
};

export type UpdateSetupWizardForm = (patch: Partial<SetupWizardForm>) => void;

export type SetupWizardMediaState = {
    servers: PlexServer[];
    plexUsername: string;
    showManualToken: boolean;
};

export type IntegrationTab = 'arr' | 'requests' | 'analytics';
