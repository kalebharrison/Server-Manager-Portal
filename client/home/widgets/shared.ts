import type { MainGridWidgetDeps } from '../userDashboardWidgetTypes';

export const formatBytes = (bytes: number) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

export const isActiveShortTermTrial = (user: any, daysLeft: number | null) => (
    !!user?.isTrial && daysLeft !== null && daysLeft <= 3
);

export const ANALYTICS_DAYS_OPTIONS = [
    { value: 7, label: 'Last 7 Days' },
    { value: 30, label: 'Last 30 Days' },
    { value: 60, label: 'Last 60 Days' },
    { value: 90, label: 'Last 90 Days' },
    { value: 180, label: 'Last 180 Days' },
    { value: 'all' as const, label: 'All Time' },
];

export type WidgetRenderContext = {
    showTempAccessMessage: boolean;
    isJellyfinPortal: boolean;
    analyticsDaysOptions: typeof ANALYTICS_DAYS_OPTIONS;
};

export const buildWidgetContext = (deps: MainGridWidgetDeps): WidgetRenderContext => ({
    showTempAccessMessage: isActiveShortTermTrial(deps.user, deps.daysLeft),
    isJellyfinPortal: String(deps.publicConfig?.mediaServerType || 'plex').toLowerCase() === 'jellyfin',
    analyticsDaysOptions: ANALYTICS_DAYS_OPTIONS,
});
