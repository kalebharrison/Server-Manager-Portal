import React from 'react';
import { logoUrl, portalUrl, resolvePortalAssetUrl } from './shared/basePath';

type ScreenModule = typeof import('./screens');

const lazyScreen = <P,>(selector: (module: ScreenModule) => React.ComponentType<P>) =>
    React.lazy(async () => {
        const module = await import('./screens');
        return { default: selector(module) };
    });

export const Login = lazyScreen((module) => module.Login);
export const PublicInviteClaim = lazyScreen((module) => module.PublicInviteClaim);
export const StatusDashboard = lazyScreen((module) => module.StatusDashboard);
export const LibraryDashboard = lazyScreen((module) => module.LibraryDashboard);
export const MaintenanceDashboard = lazyScreen((module) => module.MaintenanceDashboard);
export const LogsDashboard = lazyScreen((module) => module.LogsDashboard);
export const MediaStackDashboard = lazyScreen((module) => module.MediaStackDashboard);
export const AnalyticsDashboard = lazyScreen((module) => module.AnalyticsDashboard);
export const AdminDashboard = lazyScreen((module) => module.AdminDashboard);
export const UserDashboard = lazyScreen((module) => module.UserDashboard);
export const Navigation = lazyScreen((module) => module.Navigation);

export const SettingsDashboard = React.lazy(async () => {
    const module = await import('./settings/SettingsDashboard');
    return { default: module.SettingsDashboard };
});

export const updateFavicon = (thumbUrl: string | null | undefined) => {
    let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
    if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        link.type = 'image/png';
        document.head.appendChild(link);
    }
    if (thumbUrl) {
        if (thumbUrl.startsWith('http://') || thumbUrl.startsWith('https://')) {
            link.href = thumbUrl;
        } else if (thumbUrl.startsWith('/api/')) {
            link.href = resolvePortalAssetUrl(thumbUrl);
        } else {
            link.href = portalUrl(`/api/plex/image?path=${encodeURIComponent(thumbUrl)}&width=32&height=32`);
        }
    } else {
        link.href = logoUrl();
    }
};
