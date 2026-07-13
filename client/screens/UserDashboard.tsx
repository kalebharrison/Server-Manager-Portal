import React, { useEffect, useMemo, useState } from 'react';

import { apiFetch } from '../shared/api';
import { getAccessProgressPct, getDaysUntilExpiry } from '../shared/format';
import { Loader, Toast } from '../shared/toast';
import { UserDashboardLayout } from '../home/UserDashboardLayout';
import { HomeWeekCalendar } from '../home/HomeWeekCalendar';
import { cacheRefreshMs } from '../shared/cacheRefresh';
import { createMainGridWidgetRenderer, createRecentlyAddedWidgetRenderer } from '../home/userDashboardWidgetRenderers';
import { RebuildLibraryCacheButton } from './RebuildLibraryCacheButton';
import { DiscoverPosterCard, RECENTLY_ADDED_ITEM_LIMIT } from './DiscoverContent';
import { ActiveStreamsPanel } from './discover/ActiveStreamsPanel';
import type { ToastMessage } from '../shared/types';

import { HomeHero } from './user/HomeHero';
import { HomeWatchActivity } from './user/HomeWatchActivity';
import { HomeWrapUpSection } from './user/HomeWrapUpSection';
import { buildJellyfinHomeAnalytics } from './user/userDashboardUtils';

const homeLibraryCacheKey = (sessionInfo: any, publicConfig: any) => `homeLibrary:${sessionInfo?.session?.accountId || sessionInfo?.session?.username || 'member'}:${sessionInfo?.serverName || 'server'}:${publicConfig?.mediaServerType || 'plex'}`;
const homeServerStatsCacheKey = (publicConfig: any) => `homeServerStats:${String(publicConfig?.mediaServerType || 'plex').toLowerCase()}`;
const readCachedHomeLibrary = (key: string) => {
    try {
        return JSON.parse(sessionStorage.getItem(key) || 'null');
    } catch {
        return null;
    }
};
const analyticsCacheKey = (sessionInfo: any, days: number | 'all') => `homeAnalytics:${sessionInfo?.session?.accountId || sessionInfo?.session?.username || 'member'}:${days}`;
const readCachedHomeAnalytics = (sessionInfo: any, days: number | 'all') => {
    try {
        return JSON.parse(sessionStorage.getItem(analyticsCacheKey(sessionInfo, days)) || 'null');
    } catch {
        return null;
    }
};
const readCachedHomeServerStats = (publicConfig: any) => {
    try {
        return JSON.parse(sessionStorage.getItem(homeServerStatsCacheKey(publicConfig)) || 'null');
    } catch {
        return null;
    }
};

export const UserDashboard: React.FC<{ sessionInfo: any; publicConfig?: any; refreshSession: () => void; onViewAdmin: () => void; onViewSettings?: () => void; onViewLogs?: () => void }> = ({ sessionInfo, publicConfig, refreshSession, onViewAdmin, onViewSettings, onViewLogs }) => {
    const libraryStorageKey = homeLibraryCacheKey(sessionInfo, publicConfig);
    const [isLoading, setIsLoading] = useState(false);
    const [toast, setToast] = useState<ToastMessage | null>(null);
    const [analytics, setAnalytics] = useState<any>(() => readCachedHomeAnalytics(sessionInfo, 30));
    const [analyticsLoading, setAnalyticsLoading] = useState(() => !readCachedHomeAnalytics(sessionInfo, 30));
    const [serverStats, setServerStats] = useState<any>(() => readCachedHomeServerStats(publicConfig));
    const [dashboardData, setDashboardData] = useState<any>(() => readCachedHomeLibrary(libraryStorageKey));
    const [serverDataLoading, setServerDataLoading] = useState(() => !readCachedHomeServerStats(publicConfig));
    const [analyticsDays, setAnalyticsDays] = useState<number | 'all'>(30);
    const [analyticsDaysOpen, setAnalyticsDaysOpen] = useState(false);
    const [analyticsError, setAnalyticsError] = useState<string | null>(null);

    const user = sessionInfo.account;
    const showQualityBadges = publicConfig?.showPosterQualityBadges !== false;
    const isJellyfinPortal = String(publicConfig?.mediaServerType || 'plex').toLowerCase() === 'jellyfin';
    const dashboardRefreshMs = cacheRefreshMs(publicConfig);
    const serverStatsStorageKey = homeServerStatsCacheKey(publicConfig);
    const [optOutNewsletter, setOptOutNewsletter] = useState(user?.optOutNewsletter || false);

    const handleToggleNewsletter = async () => {
        setIsLoading(true);
        try {
            const newValue = !optOutNewsletter;
            await apiFetch('/api/users/preferences', {
                method: 'POST',
                body: JSON.stringify({ optOutNewsletter: newValue })
            });
            setOptOutNewsletter(newValue);
            setToast({ id: 3, message: 'Newsletter preferences updated!', type: 'success' });
            refreshSession();
        } catch (e: any) {
            setToast({ id: 3, message: e.message || 'Failed to update preferences', type: 'error' });
        } finally {
            setIsLoading(false);
        }
    };

    const handleRequestInvite = async (): Promise<boolean> => {
        setIsLoading(true);
        try {
            await apiFetch('/api/users/request-invite', { method: 'POST' });
            setToast({ id: 1, message: 'Invite requested successfully! Check your email.', type: 'success' });
            refreshSession();
            return true;
        } catch (e: any) {
            setToast({ id: 1, message: e.message || 'Failed to request invite', type: 'error' });
            return false;
        } finally {
            setIsLoading(false);
        }
    };

    // Auto-request invite if user is totally new — retry if the first attempt fails.
    useEffect(() => {
        if (!user && !isLoading && !sessionInfo.session.isAdmin) {
            if (sessionStorage.getItem('autoInviteSucceeded') === 'true') return;
            if (sessionStorage.getItem('autoInviteRequested') === 'true') return;
            sessionStorage.setItem('autoInviteRequested', 'true');
            handleRequestInvite().then((ok) => {
                if (ok) sessionStorage.setItem('autoInviteSucceeded', 'true');
                else sessionStorage.removeItem('autoInviteRequested');
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        let cancelled = false;
        const fetchAnalytics = async () => {
            if (!sessionInfo?.session?.isAdmin && !user) {
                setAnalyticsLoading(false);
                return;
            }
            const cached = readCachedHomeAnalytics(sessionInfo, analyticsDays);
            if (cached) setAnalytics(cached);
            try {
                setAnalyticsLoading(!cached);
                setAnalyticsError(null);
                const res = isJellyfinPortal
                    ? buildJellyfinHomeAnalytics(await apiFetch(`/api/jellystat/analytics?days=${analyticsDays}`))
                    : await apiFetch(`/api/plex/analytics/me?days=${analyticsDays}`);
                if (cancelled) return;
                setAnalytics(res);
                sessionStorage.setItem(analyticsCacheKey(sessionInfo, analyticsDays), JSON.stringify(res));
            } catch (e: any) {
                if (!cancelled) {
                    const message = e?.message || 'Failed to load your analytics';
                    if (!cached) {
                        setAnalyticsError(message);
                        setAnalytics(null);
                        setToast({ id: Date.now(), message, type: 'error' });
                    } else {
                        setAnalyticsError(null);
                    }
                }
            } finally {
                if (!cancelled) setAnalyticsLoading(false);
            }
        };
        fetchAnalytics();
        return () => { cancelled = true; };
    }, [user, sessionInfo.session.isAdmin, analyticsDays, isJellyfinPortal]);

    useEffect(() => {
        let pollTimer: ReturnType<typeof setTimeout> | null = null;
        let dashboardTimer: ReturnType<typeof setInterval> | null = null;
        let isMounted = true;
        const fetchDashboard = async () => {
            if (!isMounted) return;
            try {
                const endpoint = isJellyfinPortal ? '/api/jellyfin/dashboard' : '/api/plex/library';
                const res = await apiFetch(`${endpoint}?limit=${RECENTLY_ADDED_ITEM_LIMIT}`, { cacheTtlMs: dashboardRefreshMs, staleIfErrorMs: 60 * 60_000 });
                if (isMounted) {
                    setDashboardData(res);
                    sessionStorage.setItem(libraryStorageKey, JSON.stringify(res));
                }
            } catch (e) {
                console.error('Failed to refresh dashboard data', e);
            }
        };

        const fetchServerStats = async () => {
            if (!isMounted) return;
            try {
                if (isJellyfinPortal) {
                    if (isMounted) setServerStats((current: any) => current || { provider: 'jellyfin' });
                    return;
                }
                const res = await apiFetch('/api/plex/stats');
                if (!isMounted) return;
                setServerStats(res);
                sessionStorage.setItem(serverStatsStorageKey, JSON.stringify(res));
                if (res?.isBuilding) {
                    pollTimer = setTimeout(fetchServerStats, 5000);
                }
            } catch (e) {
                console.error("Failed to fetch server stats", e);
            } finally {
                if (isMounted) setServerDataLoading(false);
            }
        };
        fetchServerStats();
        fetchDashboard();
        dashboardTimer = setInterval(fetchDashboard, dashboardRefreshMs);
        return () => {
            isMounted = false;
            if (pollTimer) clearTimeout(pollTimer);
            if (dashboardTimer) clearInterval(dashboardTimer);
        };
    }, [dashboardRefreshMs, isJellyfinPortal, libraryStorageKey, serverStatsStorageKey]);

    useEffect(() => {
        if (!isJellyfinPortal || !analytics?.libraryHealth) return;
        const nextStats = {
            provider: 'jellyfin',
            ...analytics.libraryHealth,
        };
        setServerStats((current: any) => ({
            ...(current || {}),
            ...nextStats,
        }));
        sessionStorage.setItem(serverStatsStorageKey, JSON.stringify(nextStats));
    }, [isJellyfinPortal, analytics?.libraryHealth, serverStatsStorageKey]);

    const handleRelink = async () => {
        setIsLoading(true);
        try {
            await apiFetch('/api/users/relink', { method: 'POST' });
            setToast({ id: 2, message: 'Account re-linked! Check your email for the invite.', type: 'success' });
            refreshSession();
        } catch (e: any) {
            setToast({ id: 2, message: e.message || 'Failed to re-link account', type: 'error' });
        } finally {
            setIsLoading(false);
        }
    };

    const daysLeft = user?.expiryDate ? getDaysUntilExpiry(user.expiryDate) : null;
    const progressPct = getAccessProgressPct(user?.expiryDate || null, user?.joiningDate || null);
    const isExpiringSoon = daysLeft !== null && daysLeft <= 7;
    const isRevoked = user?.plexAccessStatus === 'revoked';

    const layoutCtx = useMemo(() => ({
        isAdmin: !!sessionInfo.session.isAdmin,
        hasUser: !!user,
        referralEnabled: !!publicConfig?.referralEnabled,
    }), [sessionInfo.session.isAdmin, user, publicConfig?.referralEnabled]);

    const widgetDeps = useMemo(() => ({
        sessionInfo,
        publicConfig,
        user,
        isRevoked,
        isExpiringSoon,
        daysLeft,
        progressPct,
        optOutNewsletter,
        serverStats,
        serverDataLoading,
        analytics,
        analyticsLoading,
        analyticsDays,
        analyticsDaysOpen,
        setAnalyticsDays,
        setAnalyticsDaysOpen,
        showQualityBadges,
        dashboardData,
        handleRelink,
        handleToggleNewsletter,
        onViewAdmin,
        onViewSettings,
        onViewLogs,
        setToast,
        DiscoverPosterCard,
        RebuildLibraryCacheButton,
    }), [
        sessionInfo, publicConfig, user, isRevoked, isExpiringSoon, daysLeft, progressPct, optOutNewsletter,
        serverStats, serverDataLoading, analytics, analyticsLoading, analyticsDays, analyticsDaysOpen,
        showQualityBadges, dashboardData, onViewAdmin, onViewSettings, onViewLogs,
    ]);

    const renderMainGridWidget = useMemo(() => createMainGridWidgetRenderer(widgetDeps), [widgetDeps]);
    const renderRecentlyAddedWidget = useMemo(() => createRecentlyAddedWidgetRenderer(widgetDeps), [widgetDeps]);

    return (
        <div className="w-full flex flex-col gap-3 md:gap-4">
            <Loader isLoading={isLoading} isCinematic={!!publicConfig?.useCinematicLoading} />
            {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}

            <HomeHero
                analytics={analytics}
                dashboardData={dashboardData}
                publicConfig={publicConfig}
                sessionInfo={sessionInfo}
                user={user}
            />

            {sessionInfo.session.isAdmin && (
                <ActiveStreamsPanel isAdmin isJellyfinPortal={isJellyfinPortal} />
            )}

            <UserDashboardLayout
                layoutConfig={publicConfig?.dashboardLayout}
                layoutCtx={layoutCtx}
                renderMainGridWidget={renderMainGridWidget}
                renderRecentlyAddedWidget={renderRecentlyAddedWidget}
                renderWeekCalendar={() => <HomeWeekCalendar cacheMinutes={publicConfig?.cacheRefreshMinutes} cacheScope={libraryStorageKey} />}
                hasDashboardData={!!dashboardData}
                renderWrapUp={() => (
                    <HomeWrapUpSection
                        analytics={analytics}
                        analyticsDays={analyticsDays}
                        analyticsError={analyticsError}
                        analyticsLoading={analyticsLoading}
                        canShowAnalytics={!!(sessionInfo.session.isAdmin || user)}
                        onAnalyticsDaysChange={setAnalyticsDays}
                        onToast={setToast}
                        serverName={sessionInfo?.serverName || 'Server Portal'}
                        username={sessionInfo?.session?.username || user?.username}
                    />
                )}
                renderWatchRow={() => (
                    <HomeWatchActivity
                        analytics={analytics}
                        analyticsLoading={analyticsLoading}
                        canShowAnalytics={!!(sessionInfo.session.isAdmin || user)}
                        recentHistoryRows={publicConfig?.dashboardLayout?.recentHistoryRows}
                        topWatchedRows={publicConfig?.dashboardLayout?.topWatchedRows}
                    />
                )}
            />
        </div>
    );
};
