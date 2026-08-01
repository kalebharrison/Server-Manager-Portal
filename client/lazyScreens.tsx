import React from 'react';
export { updateFavicon } from './shared/favicon';

const lazyComponent = <P, TModule>(loader: () => Promise<TModule>, selector: (module: TModule) => React.ComponentType<P>) =>
    React.lazy(async () => {
        const module = await loader();
        return { default: selector(module) };
    });

export const Login = lazyComponent(() => import('./screens/Login'), (module) => module.Login);
export const PublicInviteClaim = lazyComponent(() => import('./screens/PublicInviteClaim'), (module) => module.PublicInviteClaim);
export const StatusDashboard = lazyComponent(() => import('./screens/StatusDashboard'), (module) => module.StatusDashboard);
export const LibraryDashboard = lazyComponent(() => import('./screens/LibraryDashboard'), (module) => module.LibraryDashboard);
export const DiscoveryDashboard = lazyComponent(() => import('./discovery/DiscoveryDashboard'), (module) => module.DiscoveryDashboard);
export const MediaStackDashboard = lazyComponent(() => import('./screens/MediaStackDashboard'), (module) => module.MediaStackDashboard);
export const AnalyticsDashboard = lazyComponent(() => import('./screens/AnalyticsDashboard'), (module) => module.AnalyticsDashboard);
export const ScannerDashboard = lazyComponent(() => import('./scanner/ScannerDashboard'), (module) => module.ScannerDashboard);
export const UpgraderDashboard = lazyComponent(() => import('./upgrader/UpgraderDashboard'), (module) => module.UpgraderDashboard);
export const IssuesDashboard = lazyComponent(() => import('./screens/IssuesDashboard'), (module) => module.IssuesDashboard);
export const AdminDashboard = lazyComponent(() => import('./screens/AdminDashboard'), (module) => module.AdminDashboard);
export const UserDashboard = lazyComponent(() => import('./screens/UserDashboard'), (module) => module.UserDashboard);
export const UserPreferencesDashboard = lazyComponent(() => import('./screens/UserPreferencesDashboard'), (module) => module.UserPreferencesDashboard);
export const Navigation = lazyComponent(() => import('./screens/Navigation'), (module) => module.Navigation);

export const SettingsDashboard = React.lazy(async () => {
    const module = await import('./settings/SettingsDashboard');
    return { default: module.SettingsDashboard };
});
