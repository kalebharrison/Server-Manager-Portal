export const SETTINGS_TABS = ['plex', 'public-access', 'smtp', 'newsletter', 'cleanup', 'mediastack', 'upgrader', 'metadata', 'branding', 'navigation', 'home-layout', 'status', 'invites', 'tasks', 'system', 'contact', 'discord', 'broadcast', 'stream-rules', 'logs'] as const;

export type SettingsTabId = typeof SETTINGS_TABS[number];

export type SettingsTab = {
    id: SettingsTabId;
    label: string;
    /** One-line purpose shown above the panel. */
    blurb: string;
    /** Show an Admin badge in settings nav (page is already admin-gated). */
    adminOnly?: boolean;
    keywords: string[];
};

export type SettingsTabGroup = {
    title: string;
    tabs: SettingsTab[];
};

export const isSettingsTabId = (value: string): value is SettingsTabId => (
    (SETTINGS_TABS as readonly string[]).includes(value)
);

/** Resolve tab id from location hash (`#upgrader`, `#upgrader/hunt`, `#qbittorrent` → upgrader). */
export const settingsTabIdFromHash = (rawHash: string): SettingsTabId | null => {
    const raw = String(rawHash || '').replace(/^#/, '').trim();
    if (!raw) return null;
    const primary = raw.split(/[/?]/)[0] || '';
    if (isSettingsTabId(primary)) return primary;
    // Legacy element anchors that live under Quality Control → Downloads
    if (primary === 'qbittorrent' || primary === 'sabnzbd') return 'upgrader';
    return null;
};

export const SETTINGS_TAB_GROUPS: SettingsTabGroup[] = [
    {
        title: 'Portal',
        tabs: [
            {
                id: 'branding',
                label: 'Appearance',
                blurb: 'Logo, theme, motion, and in-portal visuals.',
                keywords: ['theme', 'logo', 'color', 'quality', 'badges', 'poster', 'hdr', 'codec', 'ui', 'animation', 'background', 'trending', 'slideshow'],
            },
            {
                id: 'home-layout',
                label: 'Home Page',
                blurb: 'Reorder and hide home dashboard sections.',
                keywords: ['dashboard', 'widgets', 'sections', 'home', 'layout', 'reorder', 'hide'],
            },
            {
                id: 'navigation',
                label: 'Navigation',
                blurb: 'Sidebar order and which portal pages members see.',
                keywords: ['menu', 'order', 'sidebar'],
            },
            {
                id: 'public-access',
                label: 'Access & Privacy',
                blurb: 'Pre-login experience, referrals, stream privacy, and default libraries.',
                keywords: ['public', 'login', 'stats', 'registration', 'temporary', 'referral', 'privacy', 'libraries', 'trending'],
            },
            {
                id: 'contact',
                label: 'Support',
                blurb: 'Support contact and the portal announcement banner.',
                keywords: ['email', 'support', 'announcement', 'banner', 'contact'],
            },
        ],
    },
    {
        title: 'Media',
        tabs: [
            {
                id: 'plex',
                label: 'Media Server',
                blurb: 'Connect Plex or Jellyfin as the library source of truth.',
                keywords: ['plex', 'jellyfin', 'media', 'player', 'token', 'server', 'libraries', 'docker', 'local', 'url', 'direct', 'privacy', 'usernames'],
            },
            {
                id: 'mediastack',
                label: 'Arr & Analytics',
                blurb: 'Sonarr, Radarr, Lidarr instances and watch-stats apps.',
                keywords: ['sonarr', 'radarr', 'lidarr', 'tautulli', 'jellystat', 'requests', 'integrations', 'arr', 'discover'],
            },
            {
                id: 'metadata',
                label: 'Metadata',
                blurb: 'TMDB/TVDB keys and background metadata cache.',
                keywords: ['tmdb', 'tvdb', 'artwork', 'genres', 'discovery', 'metadata'],
            },
            {
                id: 'status',
                label: 'Status Page',
                blurb: 'Public uptime page and monitored services.',
                keywords: ['uptime', 'health', 'services', 'monitor'],
            },
        ],
    },
    {
        title: 'Quality Control',
        tabs: [
            {
                id: 'upgrader',
                label: 'Quality Control',
                blurb: 'Hunt upgrades, download clients/cleanup, and library integrity.',
                adminOnly: true,
                keywords: [
                    'upgrade', 'qc', 'quality control', 'download', 'quality', 'score', 'remux', 'sonarr', 'radarr',
                    'custom format', 'admin', 'integrity', 'webhook', 'qbittorrent', 'qbit', 'sabnzbd', 'sab',
                    'cleanup', 'hunt', 'download client',
                ],
            },
        ],
    },
    {
        title: 'Members',
        tabs: [
            {
                id: 'invites',
                label: 'Invites',
                blurb: 'Create invite links and email invitations.',
                keywords: ['invite', 'link', 'code', 'users'],
            },
            {
                id: 'cleanup',
                label: 'User Cleanup',
                blurb: 'Automatically revoke inactive member access.',
                keywords: ['inactive', 'revoke', 'expiry', 'users', 'cleanup'],
            },
            {
                id: 'stream-rules',
                label: 'Stream Policies',
                blurb: 'Kill rules for streams that break your policies.',
                keywords: ['kill', 'transcode', 'rule', 'stream'],
            },
        ],
    },
    {
        title: 'Notifications',
        tabs: [
            {
                id: 'discord',
                label: 'Discord',
                blurb: 'Bot, webhooks, LLM agent, and Quality Control digests.',
                keywords: [
                    'discord', 'bot', 'webhook', 'llm', 'ollama', 'ask', 'agent', 'searx', 'brave', 'tavily',
                    'requesty', 'digest', 'cleanup', 'integrity',
                ],
            },
            {
                id: 'smtp',
                label: 'Email Delivery',
                blurb: 'SMTP server used for portal email.',
                keywords: ['mail', 'smtp', 'test'],
            },
            {
                id: 'newsletter',
                label: 'Newsletter',
                blurb: 'Scheduled digest emails to members.',
                keywords: ['digest', 'send', 'frequency'],
            },
            {
                id: 'broadcast',
                label: 'Broadcast Email',
                blurb: 'One-off campaigns to selected members.',
                keywords: ['announcement', 'bulk', 'users', 'campaign'],
            },
        ],
    },
    {
        title: 'System',
        tabs: [
            {
                id: 'tasks',
                label: 'Scheduled Tasks',
                blurb: 'Background jobs and Run Now controls.',
                keywords: ['jobs', 'scheduler', 'run now', 'background', 'interval', 'check interval'],
            },
            {
                id: 'system',
                label: 'System & Backups',
                blurb: 'Health, backups, diagnostics, and access-check interval.',
                keywords: ['backup', 'restore', 'diagnostics', 'health', 'check interval', 'scheduler', 'access check'],
            },
            {
                id: 'logs',
                label: 'Logs & Audit',
                blurb: 'Audit trail, deleted-user blocklist, and email log.',
                keywords: ['audit', 'emails', 'deleted users', 'history'],
            },
        ],
    },
];

export const getSettingsTabMeta = (id: SettingsTabId): SettingsTab | undefined => (
    SETTINGS_TAB_GROUPS.flatMap((group) => group.tabs).find((tab) => tab.id === id)
);
