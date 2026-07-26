export const SETTINGS_TABS = ['plex', 'public-access', 'smtp', 'newsletter', 'cleanup', 'mediastack', 'scanner', 'upgrader', 'metadata', 'branding', 'navigation', 'home-layout', 'status', 'invites', 'tasks', 'system', 'contact', 'discord', 'broadcast', 'stream-rules', 'logs'] as const;

export type SettingsTabId = typeof SETTINGS_TABS[number];

export type SettingsTab = {
    id: SettingsTabId;
    label: string;
    keywords: string[];
};

export type SettingsTabGroup = {
    title: string;
    tabs: SettingsTab[];
};

export const isSettingsTabId = (value: string): value is SettingsTabId => (
    (SETTINGS_TABS as readonly string[]).includes(value)
);

export const SETTINGS_TAB_GROUPS: SettingsTabGroup[] = [
    {
        title: 'Portal',
        tabs: [
            { id: 'branding', label: 'Appearance', keywords: ['theme', 'logo', 'color', 'quality', 'badges', 'poster', 'hdr', 'codec', 'ui', 'animation', 'background'] },
            { id: 'home-layout', label: 'Home Page', keywords: ['dashboard', 'widgets', 'sections', 'home', 'layout', 'reorder', 'hide'] },
            { id: 'navigation', label: 'Navigation', keywords: ['menu', 'order', 'sidebar'] },
            { id: 'contact', label: 'Support & Announcements', keywords: ['email', 'whatsapp', 'support', 'announcement', 'banner'] },
            { id: 'discord', label: 'Discord', keywords: ['discord', 'bot', 'webhook', 'llm', 'ollama', 'ask', 'agent', 'searx', 'brave', 'tavily', 'requesty'] },
        ]
    },
    {
        title: 'Connections',
        tabs: [
            { id: 'plex', label: 'Plex / Jellyfin', keywords: ['plex', 'jellyfin', 'media', 'player', 'token', 'server', 'libraries', 'docker', 'local', 'url', 'direct', 'privacy', 'usernames'] },
            { id: 'mediastack', label: 'Apps & Automation', keywords: ['sonarr', 'radarr', 'tautulli', 'jellystat', 'seerr', 'jellyseerr', 'requests', 'integrations'] },
            { id: 'scanner', label: 'Scanner', keywords: ['autoscan', 'scanner', 'webhook', 'path rewrite', 'sonarr', 'radarr', 'lidarr', 'library refresh'] },
            { id: 'upgrader', label: 'Library Upgrader', keywords: ['upgrade', 'hevc', 'codec', 'sonarr', 'radarr', 'quality profile'] },
            { id: 'metadata', label: 'Metadata', keywords: ['tmdb', 'tvdb', 'artwork', 'genres', 'discovery', 'metadata'] },
            { id: 'status', label: 'Status Page', keywords: ['uptime', 'health', 'services', 'monitor'] }
        ]
    },
    {
        title: 'Access',
        tabs: [
            { id: 'public-access', label: 'Access & Privacy', keywords: ['public', 'login', 'stats', 'registration', 'temporary', 'referral', 'privacy', 'libraries'] },
            { id: 'cleanup', label: 'User Cleanup', keywords: ['inactive', 'revoke', 'expiry', 'users'] },
            { id: 'invites', label: 'Invites', keywords: ['invite', 'link', 'code', 'users'] },
        ]
    },
    {
        title: 'Email',
        tabs: [
            { id: 'smtp', label: 'Email Delivery', keywords: ['mail', 'smtp', 'test'] },
            { id: 'newsletter', label: 'Newsletter', keywords: ['digest', 'send', 'frequency'] },
            { id: 'broadcast', label: 'Broadcast Email', keywords: ['announcement', 'bulk', 'users'] }
        ]
    },
    {
        title: 'Operations',
        tabs: [
            { id: 'stream-rules', label: 'Stream Policies', keywords: ['kill', 'transcode', 'rule'] },
            { id: 'tasks', label: 'Scheduled Tasks', keywords: ['jobs', 'scheduler', 'run now', 'background'] },
            { id: 'system', label: 'System & Backups', keywords: ['backup', 'restore', 'diagnostics', 'health'] },
            { id: 'logs', label: 'Logs & Audit', keywords: ['audit', 'emails', 'deleted users', 'history'] }
        ]
    }
];
