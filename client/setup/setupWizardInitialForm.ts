import { getPublicOrigin } from '../shared/basePath';
import {
    BRAND_THEME_COLORS,
    type StoredSetupPlex,
} from './setupWizardModel';
import type { SetupWizardForm } from './setupWizardTypes';

export const createInitialSetupWizardForm = (stored: StoredSetupPlex | null): SetupWizardForm => ({
    token: stored?.token || '',
    mediaServerType: stored?.mediaServerType || 'plex',
    serverIdentifier: stored?.serverIdentifier || '',
    plexServerUrl: stored?.plexServerUrl || '',
    jellyfinUrl: stored?.jellyfinUrl || '',
    jellyfinApiKey: stored?.jellyfinApiKey || '',
    publicDomain: stored?.publicDomain ?? (typeof window !== 'undefined' ? getPublicOrigin() : ''),
    brandTheme: stored?.brandTheme ?? 'plex',
    primaryColor: stored?.primaryColor ?? BRAND_THEME_COLORS.plex,
    customLogoUrl: stored?.customLogoUrl ?? '',
    smtpHost: stored?.smtpHost ?? '',
    smtpPort: stored?.smtpPort ?? 587,
    smtpUser: stored?.smtpUser ?? '',
    smtpPass: stored?.smtpPass ?? '',
    smtpFrom: stored?.smtpFrom ?? '',
    smtpSecure: stored?.smtpSecure ?? false,
    sonarrUrl: stored?.sonarrUrl ?? '',
    sonarrApiKey: stored?.sonarrApiKey ?? '',
    radarrUrl: stored?.radarrUrl ?? '',
    radarrApiKey: stored?.radarrApiKey ?? '',
    tautulliUrl: stored?.tautulliUrl ?? '',
    tautulliApiKey: stored?.tautulliApiKey ?? '',
    jellystatUrl: stored?.jellystatUrl ?? '',
    jellystatApiKey: stored?.jellystatApiKey ?? '',
    requestAppType: stored?.requestAppType === 'overseerr' ? 'seerr' : (stored?.requestAppType ?? 'none'),
    requestAppUrl: stored?.requestAppUrl ?? '',
    requestAppApiKey: stored?.requestAppApiKey ?? '',
});
