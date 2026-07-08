export const SETTINGS_TABS = ['plex', 'smtp', 'newsletter', 'cleanup', 'mediastack', 'branding', 'navigation', 'home-layout', 'status', 'invites', 'tasks', 'system', 'contact', 'broadcast', 'stream-rules', 'logs'] as const;

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

export const SETTINGS_TAB_GROUPS: SettingsTabGroup[] = [
    {
        title: 'Portal',
        tabs: [
            { id: 'branding', label: 'Portal UI', keywords: ['theme', 'logo', 'color', 'announcement', 'referral', 'quality', 'badges', 'poster', 'hdr', 'codec'] },
            { id: 'contact', label: 'Contact Details', keywords: ['email', 'whatsapp', 'support'] },
            { id: 'navigation', label: 'Navigation', keywords: ['menu', 'order', 'sidebar'] },
            { id: 'home-layout', label: 'Home Layout', keywords: ['dashboard', 'widgets', 'sections', 'home', 'layout', 'reorder', 'hide'] }
        ]
    },
    {
        title: 'Media Stack',
        tabs: [
            { id: 'plex', label: 'Media Player', keywords: ['plex', 'jellyfin', 'media', 'player', 'token', 'server', 'libraries', 'docker', 'local', 'url', 'direct', 'privacy', 'usernames', 'analytics'] },
            { id: 'mediastack', label: 'Integrations', keywords: ['sonarr', 'radarr', 'tautulli', 'jellystat', 'seerr', 'jellyseerr'] },
            { id: 'status', label: 'Status Monitor', keywords: ['uptime', 'health', 'services'] }
        ]
    },
    {
        title: 'Comms',
        tabs: [
            { id: 'smtp', label: 'SMTP Alerts', keywords: ['mail', 'smtp', 'test'] },
            { id: 'newsletter', label: 'Newsletter', keywords: ['digest', 'send', 'frequency'] },
            { id: 'broadcast', label: 'Broadcast Email', keywords: ['announcement', 'bulk', 'users'] },
            { id: 'invites', label: 'Invites', keywords: ['invite', 'link', 'code'] }
        ]
    },
    {
        title: 'Automation',
        tabs: [
            { id: 'cleanup', label: 'Cleanup', keywords: ['inactive', 'revoke', 'expiry'] },
            { id: 'stream-rules', label: 'Stream Rules', keywords: ['kill', 'transcode', 'rule'] },
            { id: 'tasks', label: 'Background Tasks', keywords: ['jobs', 'scheduler', 'run now'] },
            { id: 'system', label: 'System', keywords: ['backup', 'restore', 'diagnostics'] },
            { id: 'logs', label: 'Logs & Audit', keywords: ['audit', 'emails', 'deleted users', 'history'] }
        ]
    }
];
