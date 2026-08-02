import { Activity, AlertTriangle, ArrowUpCircle, BarChart3, FileText, Film, Home, Layers, LogOut, Radar, Settings, SlidersHorizontal, Sparkles, Users } from 'lucide-react';
import type React from 'react';

export const THEME_OPTIONS = [
    { label: 'Plex Dark', value: 'plex' },
    { label: 'Sleek Slate', value: 'slate' },
    { label: 'Nordic Frost', value: 'nordic' },
    { label: 'Jellyfin Purple', value: 'jellyfin' },
    { label: 'Emerald Green', value: 'emerald' },
    { label: 'Neon Midnight', value: 'midnight' },
    { label: 'Crimson', value: 'crimson' },
    { label: 'Amethyst', value: 'amethyst' },
    { label: 'Sunset', value: 'sunset' },
] as const;

export type NavItemConfig = {
    label: string;
    icon: React.FC<any>;
    route: string;
    adminOnly: boolean;
    href?: string;
    onClick?: (e: any) => void;
};

export const buildNavItemsConfig = (onLogout: () => void): Record<string, NavItemConfig> => ({
    'home': { label: 'Home', icon: Home, route: 'user', adminOnly: false },
    'users': { label: 'Users', icon: Users, route: 'users', adminOnly: true },
    'discover': { label: 'Discover', icon: Film, route: 'discover', adminOnly: false },
    'issues': { label: 'Issues', icon: AlertTriangle, route: 'issues', adminOnly: false },
    'status': { label: 'Status', icon: Activity, route: 'status', adminOnly: false },
    'logs': { label: 'Logs', icon: FileText, route: 'logs', adminOnly: true },
    'analytics': { label: 'Analytics', icon: BarChart3, route: 'analytics', adminOnly: false },
    'mediastack': { label: 'Calendar', icon: Layers, route: 'mediastack', adminOnly: false },
    'request': { label: 'Request Content', icon: Sparkles, route: 'request', adminOnly: false },
    'scanner': { label: 'Scanner', icon: Radar, route: 'scanner', adminOnly: true },
    'upgrader': { label: 'Quality Hunt', icon: ArrowUpCircle, route: 'upgrader', adminOnly: true },
    'preferences': { label: 'Preferences', icon: SlidersHorizontal, route: 'preferences', adminOnly: false },
    'settings': { label: 'Settings', icon: Settings, route: 'settings', adminOnly: true },
    'logout': { label: 'Logout', icon: LogOut, route: '', adminOnly: false, onClick: onLogout }
});

export const isNavCurrent = (currentRoute: string, key: string, route: string) => (
    ['admin', 'user'].includes(currentRoute) && key === 'home' ? true : currentRoute === route
);
