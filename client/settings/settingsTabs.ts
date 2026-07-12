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

export const isSettingsTabId = (value: string): value is SettingsTabId => (
    (SETTINGS_TABS as readonly string[]).includes(value)
);

export const SETTINGS_TAB_GROUPS: SettingsTabGroup[] = [
    {
        title: 'Portal Experience',
        tabs: [
            { id: 'branding', label: 'Appearance', keywords: ['theme', 'logo', 'color', 'announcement', 'referral', 'quality', 'badges', 'poster', 'hdr', 'codec', 'ui'] },
            { id: 'home-layout', label: 'Home Page', keywords: ['dashboard', 'widgets', 'sections', 'home', 'layout', 'reorder', 'hide'] },
            { id: 'navigation', label: 'Navigation', keywords: ['menu', 'order', 'sidebar'] },
            { id: 'contact', label: 'Contact & Support', keywords: ['email', 'whatsapp', 'support'] }
        ]
    },
    {
        title: 'Media Stack',
        tabs: [
            { id: 'plex', label: 'Media Server', keywords: ['plex', 'jellyfin', 'media', 'player', 'token', 'server', 'libraries', 'docker', 'local', 'url', 'direct', 'privacy', 'usernames', 'analytics'] },
            { id: 'mediastack', label: 'Automation & Requests', keywords: ['sonarr', 'radarr', 'tautulli', 'jellystat', 'seerr', 'jellyseerr', 'integrations'] },
            { id: 'status', label: 'Status Page', keywords: ['uptime', 'health', 'services', 'monitor'] }
        ]
    },
    {
        title: 'Users & Communication',
        tabs: [
            { id: 'cleanup', label: 'Access & Cleanup', keywords: ['inactive', 'revoke', 'expiry', 'users'] },
            { id: 'invites', label: 'Invites', keywords: ['invite', 'link', 'code', 'users'] },
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
