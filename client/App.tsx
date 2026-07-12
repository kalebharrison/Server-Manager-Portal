import React, { useState, useEffect, useCallback, useMemo, useRef, useTransition } from 'react';
import { bindAppConfirm } from './shared/confirm';
import { apiFetch, clearApiCache } from './shared/api';
import { portalUrl, stripBasePath } from './shared/basePath';
import { Loader } from './shared/toast';
import { AppAmbientBackground } from './shared/theme';
import { PORTAL_WIDE_LAYOUT_THRESHOLD } from './shared/portalLayout';
import { applyLocalPortalPreferences, loadLocalPortalPreferences, USER_PREFERENCES_EVENT } from './shared/userPreferences';
import {
    updateFavicon,
    Login,
    PublicInviteClaim,
    StatusDashboard,
    LibraryDashboard,
    MaintenanceDashboard,
    LogsDashboard,
    MediaStackDashboard,
    AnalyticsDashboard,
    RequestDashboard,
    AdminDashboard,
    UserDashboard,
    UserPreferencesDashboard,
    Navigation,
    SettingsDashboard,
} from './lazyScreens';

const ConfirmModal = React.lazy(() => import('./shared/ConfirmModal').then(module => ({ default: module.ConfirmModal })));

type AppRoute = 'login' | 'admin' | 'user' | 'users' | 'status' | 'dashboard' | 'settings' | 'preferences' | 'logs' | 'analytics' | 'mediastack' | 'maintenance' | 'request' | 'invite' | 'loading';

const RouteFallback: React.FC = () => (
    <div className="min-h-[60vh]" aria-hidden="true" />
);

export const MainApp: React.FC = () => {
    const [confirmState, setConfirmState] = useState<{ isOpen: boolean, message: string, onConfirm: () => void }>({ isOpen: false, message: '', onConfirm: () => { } });
    const [contentMaxWidth, setContentMaxWidth] = useState<string>('100%');
    const [activeTheme, setActiveTheme] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('portal-theme') || 'plex';
        }
        return 'plex';
    });

    useEffect(() => {
        bindAppConfirm((message, onConfirm) => {
            setConfirmState({ isOpen: true, message, onConfirm });
        });
    }, []);

    useEffect(() => {
        const updateResponsiveContentWidth = () => {
            const screenWidth = window.screen?.width || window.innerWidth;
            const screenHeight = window.screen?.height || window.innerHeight;
            const screenRatio = screenWidth / Math.max(1, screenHeight);
            if (screenRatio > PORTAL_WIDE_LAYOUT_THRESHOLD) {
                setContentMaxWidth(`${Math.round(screenHeight * (16 / 9))}px`);
            } else {
                setContentMaxWidth('100%');
            }
        };

        updateResponsiveContentWidth();
        window.addEventListener('resize', updateResponsiveContentWidth);
        return () => window.removeEventListener('resize', updateResponsiveContentWidth);
    }, []);

    const closeConfirm = () => setConfirmState(s => ({ ...s, isOpen: false }));
    const handleConfirm = () => {
        confirmState.onConfirm();
        closeConfirm();
    };

    const [currentRoute, setCurrentRoute] = useState<AppRoute>('loading');
    const [sessionInfo, setSessionInfo] = useState<any>(null);
    const [publicConfig, setPublicConfig] = useState<any>({});
    const [localPreferences, setLocalPreferences] = useState(loadLocalPortalPreferences);
    const effectivePublicConfig = useMemo(() => applyLocalPortalPreferences(publicConfig, localPreferences), [localPreferences, publicConfig]);
    const [, startRouteTransition] = useTransition();
    const updateRoute = useCallback((route: AppRoute) => {
        if (route === 'loading') {
            setCurrentRoute(route);
            return;
        }
        startRouteTransition(() => setCurrentRoute(route));
    }, []);

    const fetchPublicConfig = useCallback(async (forceRefresh = false) => {
        try {
            const data = await apiFetch(forceRefresh ? '/api/config/public?refresh=1' : '/api/config/public', { forceRefresh });
            if (typeof data.basePath === 'string') {
                window.__BASE_PATH__ = data.basePath;
            }
            setPublicConfig(data);

            if (data.customLogoUrl) {
                updateFavicon(data.customLogoUrl);
            }
        } catch (e) { }
    }, []);

    useEffect(() => {
        const updatePreferences = () => setLocalPreferences(loadLocalPortalPreferences());
        window.addEventListener(USER_PREFERENCES_EVENT, updatePreferences);
        return () => window.removeEventListener(USER_PREFERENCES_EVENT, updatePreferences);
    }, []);

    useEffect(() => {
        window.__USE_24_HOUR_CLOCK__ = effectivePublicConfig.use24HourClock === true;
    }, [effectivePublicConfig.use24HourClock]);

    const lastBrandingTheme = useRef<string | null>(null);

    useEffect(() => {
        if (!publicConfig.brandingTheme) return;

        if (lastBrandingTheme.current === null) {
            // First time config loads - respect user's localStorage choice if any
            const theme = localStorage.getItem('portal-theme') || publicConfig.brandingTheme || 'plex';
            setActiveTheme(theme);
            lastBrandingTheme.current = publicConfig.brandingTheme;
        } else if (publicConfig.brandingTheme !== lastBrandingTheme.current) {
            // Default theme setting was changed (e.g. saved in Settings) - override local theme
            setActiveTheme(publicConfig.brandingTheme);
            localStorage.setItem('portal-theme', publicConfig.brandingTheme);
            lastBrandingTheme.current = publicConfig.brandingTheme;
        }
    }, [publicConfig.brandingTheme]);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', activeTheme);
        localStorage.setItem('portal-theme', activeTheme);
        document.documentElement.style.removeProperty('--color-plex');
        document.documentElement.style.removeProperty('--color-plex-hover');
    }, [activeTheme]);

    useEffect(() => {
        if (effectivePublicConfig?.useBrandedSkeleton !== false) {
            document.documentElement.classList.add('branded-skeleton');
        } else {
            document.documentElement.classList.remove('branded-skeleton');
        }
    }, [effectivePublicConfig?.useBrandedSkeleton]);

    useEffect(() => {
        fetchPublicConfig();
    }, [fetchPublicConfig]);

    useEffect(() => {
        const onPublicConfigUpdated = () => { fetchPublicConfig(true); };
        window.addEventListener('portal-public-config-updated', onPublicConfigUpdated);
        return () => window.removeEventListener('portal-public-config-updated', onPublicConfigUpdated);
    }, [fetchPublicConfig]);

    const setRoute = useCallback((route: AppRoute) => {
        if (route === 'logs') {
            updateRoute('settings');
            window.history.pushState({}, '', portalUrl('/settings#logs'));
            return;
        }
        updateRoute(route);
        if (route !== 'loading' && route !== 'invite') {
            let path = '/';
            if (route === 'admin') path = '/admin';
            if (route === 'users') path = '/users';
            if (route === 'user') path = '/portal';
            if (route === 'status') path = '/status';
            if (route === 'dashboard') path = '/dashboard';
            if (route === 'settings') path = '/settings#branding';
            if (route === 'preferences') path = '/preferences';
            if (route === 'analytics') path = '/analytics';
            if (route === 'mediastack') path = '/mediastack';
            if (route === 'maintenance') path = '/maintenance';
            if (route === 'request') path = '/request';
            window.history.pushState({}, '', portalUrl(path));
        }
    }, [updateRoute]);

    const checkSession = useCallback(async () => {
        const path = stripBasePath(window.location.pathname);
        if (path.startsWith('/invite/')) {
            updateRoute('invite');
            return;
        }
        const params = new URLSearchParams(window.location.search);
        const loginError = params.get('loginError');
        if (loginError) {
            updateRoute('login');
            return;
        }

        if (path.startsWith('/auth/')) {
            updateRoute('login');
            return;
        }

        try {
            const data = await apiFetch('/api/users/me');
            setSessionInfo(data);
            if (data.serverName) document.title = `${data.serverName} Portal`;
            if (path === '/status') updateRoute('status');
            else if (path === '/dashboard') updateRoute('dashboard');
            else if (path === '/settings' && data.session.isAdmin) updateRoute('settings');
            else if (path === '/preferences') updateRoute('preferences');
            else if (path === '/logs' && data.session.isAdmin) {
                window.history.replaceState({}, '', portalUrl('/settings#logs'));
                updateRoute('settings');
            }
            else if (path === '/mediastack') updateRoute('mediastack');
            else if (path === '/maintenance' && data.session.isAdmin) updateRoute('maintenance');
            else if (path === '/request' || path === '/requests') updateRoute('request');
            else if (path === '/analytics') updateRoute('analytics');
            else if (path === '/settings' && !data.session.isAdmin) updateRoute('user');
            else if (path === '/portal') updateRoute('user');
            else if (path === '/admin' || path === '/users') {
                if (data.session.isAdmin && !data.impersonation?.active) updateRoute('users');
                else {
                    window.history.replaceState({}, '', portalUrl('/portal'));
                    updateRoute('user');
                }
            }
            else {
                window.history.replaceState({}, '', portalUrl('/portal'));
                updateRoute('user');
            }
        } catch {
            if (path === '/status' && publicConfig?.publicStatusEnabled !== false) updateRoute('status');
            else if (path === '/dashboard') updateRoute('dashboard');
            else updateRoute('login');
        }
    }, [publicConfig?.publicStatusEnabled, updateRoute]);

    useEffect(() => {
        // Initial session check
        checkSession();
    }, [checkSession]);

    useEffect(() => {
        const onPopState = () => {
            checkSession();
        };
        window.addEventListener('popstate', onPopState);
        return () => window.removeEventListener('popstate', onPopState);
    }, [checkSession]);

    const handleLogout = async () => {
        await apiFetch('/api/auth/logout', { method: 'POST' });
        clearApiCache();
        setSessionInfo(null);
        setRoute('login');
    };

    const handleViewAsUser = async (userId: string) => {
        await apiFetch(`/api/admin/impersonate/${encodeURIComponent(userId)}`, { method: 'POST' });
        clearApiCache();
        await checkSession();
        setRoute('user');
    };

    const handleStopImpersonation = async () => {
        await apiFetch('/api/admin/stop-impersonation', { method: 'POST' });
        clearApiCache();
        await checkSession();
        setRoute('users');
    };

    if (currentRoute === 'loading') return <Loader isLoading={true} isCinematic={!!effectivePublicConfig?.useCinematicLoading} />;
    if (currentRoute === 'login') {
        const initialLoginError = typeof window !== 'undefined'
            ? new URLSearchParams(window.location.search).get('loginError')
            : null;
        return (
            <React.Suspense fallback={<RouteFallback />}>
                <Login onLoginSuccess={checkSession} publicConfig={effectivePublicConfig} initialError={initialLoginError || undefined} />
            </React.Suspense>
        );
    }

    const isAdmin = !!sessionInfo?.session?.isAdmin;
    const isImpersonating = !!sessionInfo?.impersonation?.active;

    const isPublicStatus = currentRoute === 'status' && !sessionInfo;
    const isPublicInvite = currentRoute === 'invite';
    const isPublicView = isPublicStatus || isPublicInvite;

    const renderView = () => {
        if (currentRoute === 'invite') {
            const code = stripBasePath(window.location.pathname).split('/')[2];
            return <PublicInviteClaim code={code} showServerStats={effectivePublicConfig?.showLoginServerStats === true} />;
        }
        if (currentRoute === 'status') return <StatusDashboard onBack={() => isPublicStatus ? setRoute('login') : setRoute('user')} isAdmin={isAdmin} isPublic={isPublicStatus} />;
        if (currentRoute === 'dashboard') return <LibraryDashboard onBack={() => setRoute('user')} isAdmin={isAdmin} publicConfig={effectivePublicConfig} mediaServerType={sessionInfo?.mediaServerType} />;
        if (currentRoute === 'settings' && isAdmin) return <SettingsDashboard />;
        if (currentRoute === 'preferences') return <UserPreferencesDashboard account={sessionInfo?.account} activeTheme={activeTheme} setActiveTheme={setActiveTheme} refreshSession={checkSession} readOnly={isImpersonating} />;
        if (currentRoute === 'maintenance' && isAdmin) return <MaintenanceDashboard />;
        if (currentRoute === 'logs' && isAdmin) return <LogsDashboard onLogout={handleLogout} />;
        if (currentRoute === 'mediastack') return <MediaStackDashboard isAdmin={isAdmin} />;
        if (currentRoute === 'analytics') return <AnalyticsDashboard isAdmin={isAdmin} sessionInfo={sessionInfo} />;
        if (currentRoute === 'request') return <RequestDashboard isAdmin={isAdmin} />;
        if (currentRoute === 'admin' || currentRoute === 'users') return <AdminDashboard onLogout={handleLogout} onViewUserPortal={() => setRoute('user')} onViewStatus={() => setRoute('status')} onViewDashboard={() => setRoute('dashboard')} onViewAsUser={handleViewAsUser} />;
        return <UserDashboard sessionInfo={sessionInfo} publicConfig={effectivePublicConfig} onLogout={handleLogout} refreshSession={checkSession} onViewAdmin={() => setRoute('users')} onViewStatus={() => setRoute('status')} onViewDashboard={() => setRoute('dashboard')} onViewSettings={() => setRoute('settings')} onViewLogs={() => setRoute('logs')} />;
    };

    return (
        <div className="relative flex w-full min-h-screen overflow-x-clip">
            <AppAmbientBackground backgroundImageUrl={publicConfig?.backgroundImageUrl} />
            {confirmState.isOpen && (
                <React.Suspense fallback={null}>
                    <ConfirmModal isOpen={true} message={confirmState.message} onConfirm={handleConfirm} onCancel={closeConfirm} />
                </React.Suspense>
            )}
            <React.Suspense fallback={null}>
                {!isPublicView && <Navigation currentRoute={currentRoute} onNavigate={setRoute as any} onLogout={handleLogout} isAdmin={isAdmin} serverName={sessionInfo?.serverName || 'Server Portal'} adminThumb={sessionInfo?.adminThumb} customLogoUrl={publicConfig?.customLogoUrl} navOrder={sessionInfo?.navOrder || ['home', 'discover', 'status', 'analytics', 'mediastack', 'maintenance', 'request', 'settings', 'logout']} navFeatures={sessionInfo?.navFeatures} appVersion={publicConfig.appVersion} activeTheme={activeTheme} setActiveTheme={setActiveTheme} />}
            </React.Suspense>
            <div className={`relative z-10 flex-1 min-w-0 flex flex-col items-center px-4 pt-20 pb-[80px] md:p-8 md:pt-8 md:pb-8 overflow-x-visible ${isPublicView ? '!pt-8 !pb-8' : ''}`}>
                {isImpersonating && (
                    <div className="w-full mb-4" style={{ maxWidth: contentMaxWidth }}>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-100 shadow-lg">
                            <p className="text-sm font-medium">Viewing as <strong className="text-white">{sessionInfo?.impersonation?.targetUsername || sessionInfo?.session?.username}</strong>. Changes and requests are disabled.</p>
                            <button type="button" onClick={handleStopImpersonation} className="px-4 py-2 rounded-lg bg-amber-500/20 border border-amber-500/40 text-sm font-bold hover:bg-amber-500/30 whitespace-nowrap">Exit view</button>
                        </div>
                    </div>
                )}
                <div className="w-full min-w-0" style={{ maxWidth: contentMaxWidth }}>
                    <React.Suspense fallback={<RouteFallback />}>
                        {renderView()}
                    </React.Suspense>
                </div>

                {/* Mobile Bottom Version */}
                {!isPublicView && publicConfig?.appVersion && (
                    <div className="md:hidden mt-auto pt-12 pb-4 w-full text-center text-[10px] text-white/30 font-mono tracking-widest pointer-events-none">
                        {publicConfig.appVersion}
                    </div>
                )}
            </div>
        </div>
    );
};
