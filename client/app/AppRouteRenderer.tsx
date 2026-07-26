import React from 'react';
import { portalUrl, stripBasePath } from '../shared/basePath';
import {
    Login,
    PublicInviteClaim,
    StatusDashboard,
    LibraryDashboard,
    DiscoveryDashboard,
    MediaStackDashboard,
    AnalyticsDashboard,
    RequestDashboard,
    ScannerDashboard,
    UpgraderDashboard,
    IssuesDashboard,
    AdminDashboard,
    UserDashboard,
    UserPreferencesDashboard,
    SettingsDashboard,
} from '../lazyScreens';
import type { AppRoute } from './types';

export const RouteFallback: React.FC = () => (
    <div className="min-h-[60vh]" aria-hidden="true" />
);

type AppRouteRendererProps = {
    currentRoute: AppRoute;
    sessionInfo: any;
    effectivePublicConfig: any;
    activeTheme: string;
    setActiveTheme: (theme: string) => void;
    checkSession: () => Promise<void>;
    setRoute: (route: AppRoute) => void;
    handleViewAsUser: (userId: string) => Promise<void>;
    isAdmin: boolean;
    isImpersonating: boolean;
    isPublicStatus: boolean;
};

export const AppRouteRenderer: React.FC<AppRouteRendererProps> = ({
    currentRoute,
    sessionInfo,
    effectivePublicConfig,
    activeTheme,
    setActiveTheme,
    checkSession,
    setRoute,
    handleViewAsUser,
    isAdmin,
    isImpersonating,
    isPublicStatus,
}) => {
    if (currentRoute === 'login') {
        const initialLoginError = typeof window !== 'undefined'
            ? new URLSearchParams(window.location.search).get('loginError')
            : null;
        return (
            <Login onLoginSuccess={checkSession} publicConfig={effectivePublicConfig} initialError={initialLoginError || undefined} />
        );
    }

    if (currentRoute === 'invite') {
        const code = stripBasePath(window.location.pathname).split('/')[2];
        return <PublicInviteClaim code={code} showServerStats={effectivePublicConfig?.showLoginServerStats === true} />;
    }
    if (currentRoute === 'status') return <StatusDashboard onBack={() => isPublicStatus ? setRoute('login') : setRoute('user')} isAdmin={isAdmin} isPublic={isPublicStatus} />;
    if (currentRoute === 'dashboard') return <LibraryDashboard isAdmin={isAdmin} publicConfig={effectivePublicConfig} mediaServerType={sessionInfo?.mediaServerType} cacheScope={sessionInfo?.serverName} />;
    if (currentRoute === 'discover') return <DiscoveryDashboard onItemClick={() => {}} mediaServerType={sessionInfo?.mediaServerType} isAdmin={isAdmin} />;
    if (currentRoute === 'settings' && isAdmin) return <SettingsDashboard />;
    if (currentRoute === 'preferences') return <UserPreferencesDashboard account={sessionInfo?.account} activeTheme={activeTheme} setActiveTheme={setActiveTheme} refreshSession={checkSession} readOnly={isImpersonating} />;
    if (currentRoute === 'mediastack') return <MediaStackDashboard cacheMinutes={effectivePublicConfig?.cacheRefreshMinutes} />;
    if (currentRoute === 'analytics') return <AnalyticsDashboard isAdmin={isAdmin} sessionInfo={sessionInfo} />;
    if (currentRoute === 'request' && (effectivePublicConfig?.requestEngine === 'portal' || sessionInfo?.requestEngine === 'portal')) {
        return <DiscoveryDashboard onItemClick={() => {}} mediaServerType={sessionInfo?.mediaServerType} isAdmin={isAdmin} />;
    }
    if (currentRoute === 'request') return <RequestDashboard isAdmin={isAdmin} cacheMinutes={effectivePublicConfig?.cacheRefreshMinutes} />;
    if (currentRoute === 'scanner' && isAdmin) return <ScannerDashboard />;
    if (currentRoute === 'upgrader' && isAdmin) return <UpgraderDashboard />;
    if (currentRoute === 'issues') return <IssuesDashboard isAdmin={isAdmin} />;
    if (currentRoute === 'admin' || currentRoute === 'users') return <AdminDashboard onViewAsUser={handleViewAsUser} />;
    return <UserDashboard sessionInfo={sessionInfo} publicConfig={effectivePublicConfig} refreshSession={checkSession} onViewAdmin={() => setRoute('users')} onViewSettings={() => setRoute('settings')} onViewLogs={() => { window.history.replaceState({}, '', portalUrl('/settings#logs')); setRoute('settings'); }} />;
};
