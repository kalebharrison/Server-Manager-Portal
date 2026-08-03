import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { apiFetch } from '../shared/api';
import { portalUrl, stripBasePath } from '../shared/basePath';
import { clearPortalViewCaches } from '../shared/sessionCaches';
import { resolveHomeLanding, resolveLocale } from '../shared/userProfile';
import type { AppRoute } from './types';

const sessionIdentity = (data: any) => String(
    data?.session?.accountId
    || data?.session?.plexId
    || data?.session?.jellyfinId
    || data?.session?.username
    || data?.account?.id
    || ''
);

export const useAppSession = (publicConfig: any, updateRoute: (route: AppRoute) => void) => {
    const [sessionInfo, setSessionInfo] = useState<any>(null);
    const sessionCheckSeq = useRef(0);
    const sessionIdentityRef = useRef('');
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
            clearPortalViewCaches();
            sessionIdentityRef.current = '';
            setSessionInfo(null);
            updateRoute('login');
            return;
        }

        if (path.startsWith('/auth/')) {
            clearPortalViewCaches();
            sessionIdentityRef.current = '';
            setSessionInfo(null);
            updateRoute('login');
            return;
        }

        const seq = ++sessionCheckSeq.current;
        try {
            // Refresh session only; keep other API cache warm across navigations.
            const data = await apiFetch('/api/users/me', { forceRefresh: true, cacheTtlMs: 0 });
            if (seq !== sessionCheckSeq.current) return;
            const nextIdentity = sessionIdentity(data);
            if (sessionIdentityRef.current && sessionIdentityRef.current !== nextIdentity) {
                clearPortalViewCaches();
            } else if (!sessionIdentityRef.current && nextIdentity) {
                // Fresh login into an already-mounted SPA — drop prior anonymous/stale views.
                clearPortalViewCaches();
            }
            sessionIdentityRef.current = nextIdentity;
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
                    ? 'discover'
                    : preferredLanding === 'request'
                        ? 'discover'
                        : preferredLanding;
            const landingPath = preferredLanding === 'portal'
                ? '/portal'
                : preferredLanding === 'discover' || preferredLanding === 'request'
                    ? '/discovery'
                    : `/${preferredLanding}`;
            if (path === '/status') updateRoute('status');
            else if (path === '/dashboard') {
                // Orphaned post-Discover-merge route — send bookmarks to Discover.
                window.history.replaceState({}, '', portalUrl('/discovery'));
                updateRoute('discover');
            }
            else if (path === '/discovery' || path.startsWith('/discovery/')) updateRoute('discover');
            else if (path === '/settings' && data.session.isAdmin) updateRoute('settings');
            else if (path === '/preferences') updateRoute('preferences');
            else if (path === '/logs' && data.session.isAdmin) {
                window.history.replaceState({}, '', portalUrl('/settings#logs'));
                updateRoute('settings');
            }
            else if (path === '/mediastack') updateRoute('mediastack');
            else if (path === '/maintenance') updateRoute(data.session.isAdmin ? 'settings' : 'user');
            else if (path === '/request' || path === '/requests') {
                // Discover is the request UI — don't keep a duplicate route alive.
                window.history.replaceState({}, '', portalUrl('/discovery'));
                updateRoute('discover');
            }
            else if (path === '/scanner' && data.session.isAdmin && !data.impersonation?.active && data.navFeatures?.scanner) updateRoute('scanner');
            else if (path === '/upgrader' && data.session.isAdmin && !data.impersonation?.active && data.navFeatures?.upgrader) updateRoute('upgrader');
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
            clearPortalViewCaches();
            sessionIdentityRef.current = '';
            setSessionInfo(null);
            if (path === '/status' && publicStatusEnabledRef.current !== false) {
                updateRoute('status');
            } else if (path === '/dashboard') {
                window.history.replaceState({}, '', portalUrl('/discovery'));
                updateRoute('login');
            } else {
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
        clearPortalViewCaches();
        sessionIdentityRef.current = '';
        setSessionInfo(null);
    };

    const handleViewAsUser = async (userId: string) => {
        await apiFetch(`/api/admin/impersonate/${encodeURIComponent(userId)}`, { method: 'POST' });
        clearPortalViewCaches();
        await checkSession();
    };

    const handleStopImpersonation = async () => {
        await apiFetch('/api/admin/stop-impersonation', { method: 'POST' });
        clearPortalViewCaches();
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
        // Legacy aliases — Discover owns request UI + the old library dashboard.
        const normalized: AppRoute = (route === 'dashboard' || route === 'request') ? 'discover' : route;
        updateRoute(normalized);
        if (normalized !== 'loading' && normalized !== 'invite') {
            let path = '/';
            if (normalized === 'admin') path = '/admin';
            if (normalized === 'users') path = '/users';
            if (normalized === 'user') path = '/portal';
            if (normalized === 'status') path = '/status';
            if (normalized === 'discover') path = '/discovery';
            if (normalized === 'settings') path = '/settings#branding';
            if (normalized === 'preferences') path = '/preferences';
            if (normalized === 'analytics') path = '/analytics';
            if (normalized === 'mediastack') path = '/mediastack';
            if (normalized === 'scanner') path = '/scanner';
            if (normalized === 'upgrader') path = '/upgrader';
            if (normalized === 'issues') path = '/issues';
            window.history.pushState({}, '', portalUrl(path));
        }
    }, [updateRoute]);

    return { currentRoute, updateRoute, setRoute };
};
