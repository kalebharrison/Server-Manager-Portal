import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { apiFetch, clearApiCache } from '../shared/api';
import { portalUrl, stripBasePath } from '../shared/basePath';
import { resolveHomeLanding, resolveLocale } from '../shared/userProfile';
import type { AppRoute } from './types';

export const useAppSession = (publicConfig: any, updateRoute: (route: AppRoute) => void) => {
    const [sessionInfo, setSessionInfo] = useState<any>(null);
    const sessionCheckSeq = useRef(0);
    const publicStatusEnabledRef = useRef(publicConfig?.publicStatusEnabled);
    publicStatusEnabledRef.current = publicConfig?.publicStatusEnabled;

    const checkSession = useCallback(async () => {
        const path = stripBasePath(window.location.pathname);
        if (path.startsWith('/invite/')) {
            updateRoute('invite');
            return;
        }
        const params = new URLSearchParams(window.location.search);
        const loginError = params.get('loginError');
        if (loginError) {
            setSessionInfo(null);
            updateRoute('login');
            return;
        }

        if (path.startsWith('/auth/')) {
            setSessionInfo(null);
            updateRoute('login');
            return;
        }

        const seq = ++sessionCheckSeq.current;
        try {
            clearApiCache();
            const data = await apiFetch('/api/users/me', { forceRefresh: true, cacheTtlMs: 0 });
            if (seq !== sessionCheckSeq.current) return;
            setSessionInfo(data);
            if (data.serverName) document.title = `${data.serverName} Portal`;
            const locale = resolveLocale(data.account);
            if (typeof window !== 'undefined') {
                (window as any).__PORTAL_LOCALE__ = locale || undefined;
                if (locale) document.documentElement.lang = locale;
            }
            const preferredLanding = resolveHomeLanding(data.account);
            const landingRoute = preferredLanding === 'portal'
                ? 'user'
                : preferredLanding === 'discover'
                    ? 'dashboard'
                    : preferredLanding;
            const landingPath = preferredLanding === 'portal'
                ? '/portal'
                : preferredLanding === 'discover'
                    ? '/dashboard'
                    : `/${preferredLanding}`;
            if (path === '/status') updateRoute('status');
            else if (path === '/dashboard') updateRoute('dashboard');
            else if (path === '/settings' && data.session.isAdmin) updateRoute('settings');
            else if (path === '/preferences') updateRoute('preferences');
            else if (path === '/logs' && data.session.isAdmin) {
                window.history.replaceState({}, '', portalUrl('/settings#logs'));
                updateRoute('settings');
            }
            else if (path === '/mediastack') updateRoute('mediastack');
            else if (path === '/maintenance') updateRoute(data.session.isAdmin ? 'settings' : 'user');
            else if (path === '/request' || path === '/requests') updateRoute('request');
            else if (path === '/issues') updateRoute('issues');
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
                if (!data.session.isAdmin || data.impersonation?.active) {
                    window.history.replaceState({}, '', portalUrl(landingPath));
                    updateRoute(landingRoute as AppRoute);
                } else {
                    window.history.replaceState({}, '', portalUrl('/portal'));
                    updateRoute('user');
                }
            }
        } catch {
            if (seq !== sessionCheckSeq.current) return;
            if (path === '/status' && publicStatusEnabledRef.current !== false) {
                updateRoute('status');
            } else if (path === '/dashboard') {
                updateRoute('dashboard');
            } else {
                setSessionInfo(null);
                updateRoute('login');
            }
        }
    }, [updateRoute]);

    useEffect(() => {
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
    };

    const handleViewAsUser = async (userId: string) => {
        await apiFetch(`/api/admin/impersonate/${encodeURIComponent(userId)}`, { method: 'POST' });
        clearApiCache();
        await checkSession();
    };

    const handleStopImpersonation = async () => {
        await apiFetch('/api/admin/stop-impersonation', { method: 'POST' });
        clearApiCache();
        await checkSession();
    };

    return {
        sessionInfo,
        setSessionInfo,
        checkSession,
        handleLogout,
        handleViewAsUser,
        handleStopImpersonation,
    };
};

export const useAppRouting = () => {
    const [currentRoute, setCurrentRoute] = useState<AppRoute>('loading');
    const [, startRouteTransition] = useTransition();

    const updateRoute = useCallback((route: AppRoute) => {
        if (route === 'loading') {
            setCurrentRoute(route);
            return;
        }
        startRouteTransition(() => setCurrentRoute(route));
    }, []);

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
            if (route === 'request') path = '/request';
            if (route === 'issues') path = '/issues';
            window.history.pushState({}, '', portalUrl(path));
        }
    }, [updateRoute]);

    return { currentRoute, updateRoute, setRoute };
};
