import type React from 'react';
import { Layers, Mail, Palette, PartyPopper, Server, Sparkles } from 'lucide-react';

import type { PlexServer } from '../shared/types';

export const STEPS = [
    { id: 'welcome', label: 'Welcome', icon: Sparkles, hint: 'Overview & what to expect' },
    { id: 'plex', label: 'Media Server', icon: Server, hint: 'Choose Plex or Jellyfin' },
    { id: 'branding', label: 'Branding', icon: Palette, hint: 'Colors, logo & domain' },
    { id: 'email', label: 'Email', icon: Mail, hint: 'SMTP alerts & newsletters' },
    { id: 'integrations', label: 'Integrations', icon: Layers, hint: 'Sonarr, Radarr & more' },
    { id: 'finish', label: 'Finish', icon: PartyPopper, hint: 'Review & launch' },
] as const;

export type StepId = (typeof STEPS)[number]['id'];

export const WELCOME_FEATURES = [
    { icon: Server, title: 'Plex or Jellyfin', desc: 'Choose and test your media server' },
    { icon: Palette, title: 'Your Brand', desc: 'Custom colors, logo & domain' },
    { icon: Mail, title: 'Email Alerts', desc: 'Expiry reminders & newsletters' },
    { icon: Layers, title: 'Media Stack', desc: 'Sonarr, Radarr, Tautulli & requests' },
] as const;

export const SETUP_PLEX_STORAGE_KEY = 'setupWizardPlex';

export const REQUEST_APP_OPTIONS = [
    { label: 'Disabled', value: 'none' },
    { label: 'Seerr', value: 'seerr' },
    { label: 'Jellyseerr', value: 'jellyseerr' },
    { label: 'Ombi', value: 'ombi' },
];

export const MEDIA_SERVER_OPTIONS = [
    { label: 'Plex', value: 'plex' },
    { label: 'Jellyfin', value: 'jellyfin' },
];

export const BRAND_THEME_OPTIONS = [
    { label: 'Plex', value: 'plex' },
    { label: 'Jellyfin', value: 'jellyfin' },
    { label: 'Custom', value: 'custom' },
];

export const BRAND_THEME_COLORS: Record<string, string> = {
    plex: '#F7C600',
    jellyfin: '#00A4DC',
};

const SELFHST_ICON_BASE = 'https://cdn.jsdelivr.net/gh/selfhst/icons/svg';
const APP_ICONS: Record<string, string> = {
    sonarr: `${SELFHST_ICON_BASE}/sonarr.svg`,
    radarr: `${SELFHST_ICON_BASE}/radarr.svg`,
    tautulli: `${SELFHST_ICON_BASE}/tautulli.svg`,
    seerr: `${SELFHST_ICON_BASE}/seerr.svg`,
    overseerr: `${SELFHST_ICON_BASE}/seerr.svg`,
    jellyseerr: `${SELFHST_ICON_BASE}/jellyseerr.svg`,
    ombi: `${SELFHST_ICON_BASE}/ombi.svg`,
    jellystat: 'https://cdn.jsdelivr.net/gh/selfhst/icons@main/png/jellystat.png',
};

export type StoredSetupPlex = {
    token?: string;
    mediaServerType?: string;
    servers?: PlexServer[];
    serverIdentifier?: string;
    plexServerUrl?: string;
    jellyfinUrl?: string;
    jellyfinApiKey?: string;
    username?: string;
    step?: StepId;
    publicDomain?: string;
    brandTheme?: string;
    primaryColor?: string;
    customLogoUrl?: string;
    smtpHost?: string;
    smtpPort?: number;
    smtpUser?: string;
    smtpPass?: string;
    smtpFrom?: string;
    smtpSecure?: boolean;
    sonarrUrl?: string;
    sonarrApiKey?: string;
    radarrUrl?: string;
    radarrApiKey?: string;
    tautulliUrl?: string;
    tautulliApiKey?: string;
    jellystatUrl?: string;
    jellystatApiKey?: string;
    requestAppType?: string;
    requestAppUrl?: string;
    requestAppApiKey?: string;
};

export const ProgramIcon: React.FC<{ app: string; label: string }> = ({ app, label }) => (
    <span className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden flex-shrink-0">
        {APP_ICONS[app] ? (
            <img
                src={APP_ICONS[app]}
                alt=""
                className="w-5 h-5 object-contain"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
        ) : (
            <span className="text-[10px] font-black text-plex">{label.slice(0, 2).toUpperCase()}</span>
        )}
        <span className="sr-only">{label}</span>
    </span>
);

export const readStoredSetupPlex = (): StoredSetupPlex | null => {
    try {
        if (typeof sessionStorage === 'undefined') return null;
        const raw = sessionStorage.getItem(SETUP_PLEX_STORAGE_KEY);
        return raw ? JSON.parse(raw) as StoredSetupPlex : null;
    } catch {
        return null;
    }
};
