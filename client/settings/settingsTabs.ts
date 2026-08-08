export const SETTINGS_TABS = ['plex', 'public-access', 'smtp', 'newsletter', 'cleanup', 'mediastack', 'qc-hunt', 'qc-downloads', 'qc-integrity', 'metadata', 'branding', 'navigation', 'home-layout', 'status', 'invites', 'tasks', 'system', 'contact', 'discord', 'broadcast', 'stream-rules', 'logs'] as const;

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

/** Resolve tab id from location hash (`#qc-hunt`, `#upgrader/downloads`, `#qbittorrent`). */
export const settingsTabIdFromHash = (rawHash: string): SettingsTabId | null => {
    const raw = String(rawHash || '').replace(/^#/, '').trim();
    if (!raw) return null;
    const primary = raw.split(/[/?]/)[0] || '';
    if (isSettingsTabId(primary)) return primary;
    if (primary === 'upgrader') {
        const sub = raw.startsWith('upgrader/') ? raw.slice('upgrader/'.length).split(/[/?]/)[0] : '';
        if (sub === 'downloads') return 'qc-downloads';
        if (sub === 'integrity') return 'qc-integrity';
        return 'qc-hunt';
    }
    if (primary === 'qbittorrent' || primary === 'sabnzbd') return 'mediastack';
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
                keywords: ['public', 'login', 'stats', 'temporary', 'referral', 'privacy', 'libraries', 'trending'],
            },
            {
                id: 'contact',
                label: 'Support',
                blurb: 'Need Help mailto (public), expiry extension link, and how portal mail replies stay in-app.',
                keywords: ['email', 'support', 'announcement', 'banner', 'contact', 'mailto', 'reply', 'inbound', 'need help'],
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
                keywords: ['plex', 'jellyfin', 'media', 'player', 'token', 'server', 'libraries', 'docker', 'local', 'url', 'direct'],
            },
            {
                id: 'mediastack',
                label: 'Arr & Clients',
                blurb: 'Sonarr, Radarr, Lidarr, qBit/SAB, and watch-stats apps.',
                keywords: ['sonarr', 'radarr', 'lidarr', 'tautulli', 'jellystat', 'requests', 'integrations', 'arr', 'discover', 'qbittorrent', 'qbit', 'sabnzbd', 'sab', 'download client'],
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
                id: 'qc-hunt',
                label: 'Hunt',
                blurb: 'Find upgrades and missing episodes or available movies.',
                adminOnly: true,
                keywords: ['upgrade', 'qc', 'quality control', 'hunt', 'score', 'remux', 'custom format', 'admin'],
            },
            {
                id: 'qc-downloads',
                label: 'Downloads',
                blurb: 'Remove stuck downloads and set how long to wait.',
                adminOnly: true,
                keywords: ['qc', 'cleanup', 'download', 'strike', 'stalled', 'orphan', 'metadl', 'admin'],
            },
            {
                id: 'qc-integrity',
                label: 'Integrity',
                blurb: 'Check library files play, map Arr paths, and auto-fix bad media.',
                adminOnly: true,
                keywords: ['qc', 'integrity', 'webhook', 'fingerprint', 'hash', 'playback', 'path map', 'admin'],
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
                label: 'Inactive Cleanup',
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
                blurb: 'Bot, member/admin webhooks, DMs for request updates, Arr import hooks, media posts, and QC digests.',
                keywords: [
                    'discord', 'bot', 'webhook', 'llm', 'ollama', 'ask', 'agent', 'searx', 'brave', 'tavily',
                    'requesty', 'digest', 'cleanup', 'integrity',
                ],
            },
            {
                id: 'smtp',
                label: 'Email Delivery',
                blurb: 'Outbound SMTP. Request and issue replies return to the portal, not Contact Email.',
                keywords: ['mail', 'smtp', 'test', 'reply', 'inbound', 'parse'],
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
                blurb: 'Health, backups, diagnostics, and scheduled task interval.',
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
