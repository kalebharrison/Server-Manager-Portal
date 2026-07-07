import React from 'react';
export { updateFavicon } from './shared/favicon';

type ScreenModule = typeof import('./screens');

const lazyScreen = <P,>(selector: (module: ScreenModule) => React.ComponentType<P>) =>
    React.lazy(async () => {
        const module = await import('./screens');
        return { default: selector(module) };
    });

const lazyComponent = <P, TModule>(loader: () => Promise<TModule>, selector: (module: TModule) => React.ComponentType<P>) =>
    React.lazy(async () => {
        const module = await loader();
        return { default: selector(module) };
    });

export const Login = lazyComponent(() => import('./screens/Login'), (module) => module.Login);
export const PublicInviteClaim = lazyComponent(() => import('./screens/PublicInviteClaim'), (module) => module.PublicInviteClaim);
export const StatusDashboard = lazyComponent(() => import('./screens/StatusDashboard'), (module) => module.StatusDashboard);
export const LibraryDashboard = lazyScreen((module) => module.LibraryDashboard);
export const MaintenanceDashboard = lazyComponent(() => import('./screens/MaintenanceDashboard'), (module) => module.MaintenanceDashboard);
export const LogsDashboard = lazyComponent(() => import('./screens/LogsDashboard'), (module) => module.LogsDashboard);
export const MediaStackDashboard = lazyComponent(() => import('./screens/MediaStackDashboard'), (module) => module.MediaStackDashboard);
export const AnalyticsDashboard = lazyScreen((module) => module.AnalyticsDashboard);
export const AdminDashboard = lazyScreen((module) => module.AdminDashboard);
export const UserDashboard = lazyScreen((module) => module.UserDashboard);
export const Navigation = lazyComponent(() => import('./screens/Navigation'), (module) => module.Navigation);

export const SettingsDashboard = React.lazy(async () => {
    const module = await import('./settings/SettingsDashboard');
    return { default: module.SettingsDashboard };
});
