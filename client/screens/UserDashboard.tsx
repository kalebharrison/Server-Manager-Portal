import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, AlertTriangle, ChevronDown, ChevronUp, Clock, Copy, DownloadCloud, Home, LogOut, PlaySquare, RefreshCw, Search, Settings, Share2, Shield, Sparkles, Star, TrendingUp } from 'lucide-react';

import { apiFetch } from '../shared/api';
import { getPublicOrigin, logoUrl, portalUrl, resolvePortalAssetUrl, stripBasePath } from '../shared/basePath';
import { formatDate, formatEventName, formatSizeCeil, formatStreamingHour, formatTime, getAccessProgressPct, getDaysUntilExpiry } from '../shared/format';
import { CustomSelect, ScrollReveal } from '../shared/ui';
import { PeriodDropdown } from '../shared/PeriodDropdown';
import { Loader, Toast, ToastContainer, pushToast } from '../shared/toast';
import { ActivityGridSkeleton, HomeRecentlyAddedSkeleton, LibraryStatsSkeleton, TopWatchedGridSkeleton, WrapUpCardsSkeleton } from '../shared/skeletons';
import { ShareWrapUpModal } from '../shared/ShareWrapUp';
import { WrapUpCardGrid } from '../shared/WrapUpCards';
import { SlideshowBackground } from '../shared/theme';
import { activityStreamColumnCount, activityStreamGridClass, discoverPosterGridClass, usePortalWideContentLayout } from '../shared/portalLayout';
import { UserDashboardLayout } from '../home/UserDashboardLayout';
import { createMainGridWidgetRenderer, createRecentlyAddedWidgetRenderer } from '../home/userDashboardWidgetRenderers';
import { RebuildLibraryCacheButton } from './RebuildLibraryCacheButton';
import { ReportIssueModal } from './ReportIssueModal';
import { DiscoverPosterCard, RECENTLY_ADDED_ITEM_LIMIT } from './DiscoverContent';
import type { ToastMessage } from '../shared/types';

import { WrapUpModal } from './user/WrapUpModal';

export const UserDashboard: React.FC<{ sessionInfo: any; publicConfig?: any; onLogout: () => void; refreshSession: () => void; onViewAdmin: () => void; onViewStatus: () => void; onViewDashboard: () => void; onViewSettings?: () => void; onViewLogs?: () => void }> = ({ sessionInfo, publicConfig, onLogout, refreshSession, onViewAdmin, onViewStatus, onViewDashboard, onViewSettings, onViewLogs }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [toast, setToast] = useState<ToastMessage | null>(null);
    const [analytics, setAnalytics] = useState<any>(null);
    const [analyticsLoading, setAnalyticsLoading] = useState(true);
    const [serverStats, setServerStats] = useState<any>(null);
    const [dashboardData, setDashboardData] = useState<any>(null);
    const [serverDataLoading, setServerDataLoading] = useState(true);
    const [topContentPage, setTopContentPage] = useState(0);
    const [isDesktopMostWatched, setIsDesktopMostWatched] = useState(
        () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches
    );
    const topWatchedPageSize = (publicConfig?.dashboardLayout?.topWatchedRows || 2) * 6;
    const [recentHistoryPage, setRecentHistoryPage] = useState(0);
    const recentHistoryPageSize = (publicConfig?.dashboardLayout?.recentHistoryRows || 7) * 2;
    const [analyticsDays, setAnalyticsDays] = useState<number | 'all'>(30);
    const [analyticsDaysOpen, setAnalyticsDaysOpen] = useState(false);
    const [wrapUpDaysOpen, setWrapUpDaysOpen] = useState(false);
    const [analyticsError, setAnalyticsError] = useState<string | null>(null);
    const [reportItem, setReportItem] = useState<any>(null);
    const [selectedMetric, setSelectedMetric] = useState<string | null>(null);
    const [shareWrapUpOpen, setShareWrapUpOpen] = useState(false);

    const user = sessionInfo.account;
    const showQualityBadges = publicConfig?.showPosterQualityBadges !== false;
    const isJellyfinPortal = String(publicConfig?.mediaServerType || 'plex').toLowerCase() === 'jellyfin';
    const [optOutNewsletter, setOptOutNewsletter] = useState(user?.optOutNewsletter || false);

    const resolveHomeImage = (thumbUrl: string | null | undefined, fallback = logoUrl()) => {
        if (!thumbUrl) return fallback;
        if (thumbUrl.startsWith('http://') || thumbUrl.startsWith('https://') || thumbUrl.startsWith('/api/')) {
            return resolvePortalAssetUrl(thumbUrl);
        }
        return portalUrl(`/api/plex/image?path=${encodeURIComponent(thumbUrl)}&width=256&height=256`);
    };

    const buildJellyfinHomeAnalytics = (data: any) => {
        const topMovies = Array.isArray(data?.topMovies) ? data.topMovies : [];
        const topShows = Array.isArray(data?.topShows) ? data.topShows : [];
        const topMusic = Array.isArray(data?.topMusic) ? data.topMusic : [];
        const topWatched = [...topShows, ...topMovies, ...topMusic].sort((a: any, b: any) => (b.plays || 0) - (a.plays || 0));
        const peakHours = Array.isArray(data?.peakHours) ? data.peakHours : [];
        const peakHour = peakHours.reduce((best: number, value: number, hour: number) => value > (peakHours[best] || 0) ? hour : best, 0);
        const moviesCount = data?.jellystatInsights?.moviePlays || topMovies.reduce((sum: number, item: any) => sum + (item.plays || 0), 0);
        const showsCount = data?.jellystatInsights?.tvPlays || topShows.reduce((sum: number, item: any) => sum + (item.plays || 0), 0);
        const musicCount = data?.jellystatInsights?.musicPlays || topMusic.reduce((sum: number, item: any) => sum + (item.plays || 0), 0);
        const topMovie = topMovies[0] || null;
        const topBinge = topShows[0] || null;
        const topLibraries = Array.isArray(data?.topLibraries) ? data.topLibraries : [];

        return {
            totalPlays: data?.totalPlaybacks || data?.jellystatInsights?.totalPlays || 0,
            moviesCount,
            showsCount,
            musicCount,
            topWatched,
            recentHistory: [],
            topMovie: topMovie ? { ...topMovie, artUrl: topMovie.thumbUrl } : null,
            topBinge: topBinge ? { ...topBinge, artUrl: topBinge.thumbUrl } : null,
            peakHour,
            avgHour: peakHour,
            timeOfDay: peakHour >= 5 && peakHour < 12 ? 'Early Bird' : peakHour >= 12 && peakHour < 18 ? 'Afternoon Watcher' : peakHour >= 18 ? 'Evening Streamer' : 'Night Owl',
            popularDay: 'Recent Activity',
            dayOfWeekCounts: {},
            favoriteLibrary: topLibraries[0]?.title || 'None',
            topLibraries,
            mediaPreference: moviesCount > showsCount ? 'Movie Fan' : 'TV Binger',
            watchStyle: topWatched.length >= 10 ? 'Explorer' : 'Focused',
            uniqueTitles: topWatched.length,
            streamingHabit: 'Jellyfin Viewer',
            weekdayPlays: data?.totalPlaybacks || 0,
            weekendPlays: 0,
            libraryHealth: data?.libraryHealth || null,
        };
    };

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
            try {
                setAnalyticsLoading(true);
                setAnalyticsError(null);
                const res = isJellyfinPortal
                    ? buildJellyfinHomeAnalytics(await apiFetch(`/api/jellystat/analytics?days=${analyticsDays}`))
                    : await apiFetch(`/api/plex/analytics/me?days=${analyticsDays}`);
                if (cancelled) return;
                setAnalytics(res);
                setTopContentPage(0);
                setRecentHistoryPage(0);
            } catch (e: any) {
                if (!cancelled) {
                    const message = e?.message || 'Failed to load your analytics';
                    setAnalyticsError(message);
                    setAnalytics(null);
                    setToast({ id: Date.now(), message, type: 'error' });
                }
            } finally {
                if (!cancelled) setAnalyticsLoading(false);
            }
        };
        fetchAnalytics();
        return () => { cancelled = true; };
    }, [user, sessionInfo.session.isAdmin, analyticsDays, isJellyfinPortal]);

    useEffect(() => {
        const mq = window.matchMedia('(min-width: 1024px)');
        const onChange = (e: MediaQueryListEvent) => setIsDesktopMostWatched(e.matches);
        mq.addEventListener('change', onChange);
        return () => mq.removeEventListener('change', onChange);
    }, []);

    useEffect(() => {
        if (!analytics?.topWatched?.length) return;
        const maxPage = Math.max(0, Math.ceil(analytics.topWatched.length / topWatchedPageSize) - 1);
        setTopContentPage((p) => Math.min(p, maxPage));
    }, [topWatchedPageSize, analytics?.topWatched?.length]);

    useEffect(() => {
        if (!analytics?.recentHistory?.length) return;
        const maxPage = Math.max(0, Math.ceil(analytics.recentHistory.length / recentHistoryPageSize) - 1);
        setRecentHistoryPage((p) => Math.min(p, maxPage));
    }, [recentHistoryPageSize, analytics?.recentHistory?.length]);

    useEffect(() => {
        let pollTimer: ReturnType<typeof setTimeout> | null = null;
        let dashboardTimer: ReturnType<typeof setInterval> | null = null;
        let isMounted = true;
        const DASHBOARD_REFRESH_MS = 5 * 60 * 1000;

        const fetchDashboard = async () => {
            if (!isMounted) return;
            try {
                const res = await apiFetch(`${isJellyfinPortal ? '/api/jellyfin/dashboard' : '/api/plex/dashboard'}?limit=${RECENTLY_ADDED_ITEM_LIMIT}`);
                if (isMounted) setDashboardData(res);
            } catch (e) {
                console.error('Failed to refresh dashboard data', e);
            }
        };

        const fetchServerData = async () => {
            if (!isMounted) return;
            try {
                const p1 = isJellyfinPortal
                    ? Promise.resolve({ provider: 'jellyfin' }).then(res => { if (isMounted) setServerStats(res); })
                    : apiFetch('/api/plex/stats').then(res => {
                        if (isMounted) {
                            setServerStats(res);
                            if (res?.isBuilding) {
                                pollTimer = setTimeout(fetchServerData, 5000);
                            }
                        }
                    }).catch(e => console.error("Failed to fetch server stats", e));

                const p2 = fetchDashboard();
                await Promise.all([p1, p2]);
            } finally {
                if (isMounted) setServerDataLoading(false);
            }
        };
        fetchServerData();
        dashboardTimer = setInterval(fetchDashboard, DASHBOARD_REFRESH_MS);
        return () => {
            isMounted = false;
            if (pollTimer) clearTimeout(pollTimer);
            if (dashboardTimer) clearInterval(dashboardTimer);
        };
    }, [isJellyfinPortal]);

    useEffect(() => {
        if (!isJellyfinPortal || !analytics?.libraryHealth) return;
        setServerStats((current: any) => ({
            ...(current || {}),
            provider: 'jellyfin',
            ...analytics.libraryHealth,
        }));
    }, [isJellyfinPortal, analytics?.libraryHealth]);

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
    const isPending = user?.plexAccessStatus?.toLowerCase() === 'pending';

    const heroBgRaw = analytics?.recentHistory?.[0]?.thumbUrl || publicConfig?.customLogoUrl || '';
    const heroBg = heroBgRaw
        ? (heroBgRaw.startsWith('http') ? heroBgRaw : resolvePortalAssetUrl(heroBgRaw))
        : '';

    const wrapUpDaysOptions = [
        { value: 7, label: 'Last 7 Days' },
        { value: 30, label: 'Last 30 Days' },
        { value: 60, label: 'Last 60 Days' },
        { value: 90, label: 'Last 90 Days' },
        { value: 180, label: 'Last 180 Days' },
        { value: 'all', label: 'All Time' },
    ];

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

            {/* Massive Hero Banner */}
            <div className="relative w-full rounded-2xl overflow-hidden shadow-2xl bg-card border border-border">
                {/* Blurred Background */}
                <div className="absolute inset-0 bg-background overflow-hidden">
                    {publicConfig?.useTrendingSlideshow && publicConfig?.trendingBackgrounds?.length > 0 ? (
                        <>
                            <div className="absolute inset-0 opacity-100">
                                <SlideshowBackground backgrounds={publicConfig.trendingBackgrounds} intervalSeconds={publicConfig.trendingSlideshowInterval} opacity={1} />
                            </div>
                            <div className="absolute inset-0 bg-gradient-to-t from-card via-card/50 to-transparent" />
                            <div className="absolute inset-0 bg-gradient-to-r from-card via-card/20 to-transparent" />
                            <div className="absolute inset-0 bg-black/10" />
                        </>
                    ) : dashboardData?.recentMovies?.length > 0 ? (
                        <>
                            <div className="absolute -inset-[50%] opacity-40 transform -rotate-12 scale-110 flex gap-4 overflow-hidden pointer-events-none justify-center">
                                {[...Array(6)].map((_, colIdx) => (
                                    <div key={colIdx} className={`flex flex-col gap-4 ${colIdx % 2 === 0 ? 'animate-[scrollVertical_40s_linear_infinite]' : 'animate-[scrollVertical_50s_linear_infinite_reverse]'}`}>
                                        {[...dashboardData.recentMovies, ...dashboardData.recentMovies].sort(() => 0.5 - Math.random()).map((m: any, i: number) => (m.thumb || m.thumbUrl) && (
                                            <img key={`c${colIdx}-${i}`} src={m.thumbUrl ? resolvePortalAssetUrl(m.thumbUrl) : portalUrl(`/api/plex/image?path=${encodeURIComponent(m.thumb)}&width=200&height=300`)} className="w-32 md:w-48 rounded-xl object-cover" alt="" />
                                        ))}
                                    </div>
                                ))}
                            </div>
                            <div className="absolute inset-0 bg-gradient-to-t from-card via-card/80 to-transparent" />
                            <div className="absolute inset-0 bg-gradient-to-r from-card via-card/40 to-transparent" />
                        </>
                    ) : heroBg ? (
                        <>
                            <div
                                className="absolute inset-0 bg-cover bg-center opacity-30 blur-2xl scale-110"
                                style={{ backgroundImage: `url(${heroBg})` }}
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-card via-card/80 to-transparent" />
                            <div className="absolute inset-0 bg-gradient-to-r from-card via-card/40 to-transparent" />
                        </>
                    ) : (
                        <>
                            <div className="absolute inset-0 bg-gradient-to-t from-card via-card/80 to-transparent" />
                            <div className="absolute inset-0 bg-gradient-to-r from-card via-card/40 to-transparent" />
                        </>
                    )}
                </div>

                <div className="relative pt-14 pb-5 px-4 md:pt-32 md:pb-12 md:px-12 flex flex-col items-center md:items-start text-center md:text-left z-10">
                    <div className="flex flex-col md:flex-row items-center md:items-end gap-4 md:gap-6">
                        {/* Avatar */}
                        {(() => {
                            const thumbUrl = user?.thumb || sessionInfo.session.thumb || (sessionInfo.session.isAdmin ? sessionInfo.adminThumb : null);
                            if (thumbUrl) {
                                return (
                                    <div className="relative">
                                        <img
                                            src={resolveHomeImage(thumbUrl)}
                                            alt={sessionInfo.session.username}
                                            className="relative w-28 h-28 md:w-32 md:h-32 rounded-full object-cover border-4 border-plex shadow-2xl bg-card"
                                            onError={(e) => {
                                                (e.target as HTMLImageElement).style.display = 'none';
                                                (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                                                (e.target as HTMLImageElement).nextElementSibling?.classList.add('flex');
                                            }}
                                        />
                                        <div className={`hidden relative w-28 h-28 md:w-32 md:h-32 rounded-full bg-gradient-to-br from-plex/40 to-plex/10 border-4 border-plex items-center justify-center text-plex font-black text-5xl shadow-2xl overflow-hidden`}>
                                            {sessionInfo.session.username?.[0]?.toUpperCase() || '?'}
                                        </div>
                                    </div>
                                );
                            }
                            return (
                                <div className="relative">
                                    <div className={`relative w-28 h-28 md:w-32 md:h-32 rounded-full bg-gradient-to-br from-plex/40 to-plex/10 border-4 border-plex items-center justify-center text-plex font-black text-5xl flex shadow-2xl overflow-hidden`}>
                                        {sessionInfo.session.username?.[0]?.toUpperCase() || '?'}
                                    </div>
                                </div>
                            );
                        })()}

                        <div className="pb-2">
                            <p className="text-plex text-sm uppercase tracking-[4px] font-bold mb-1 drop-shadow-md">
                                {(() => {
                                    const hour = new Date().getHours();
                                    if (hour >= 5 && hour < 12) return 'Good Morning';
                                    if (hour >= 12 && hour < 17) return 'Good Afternoon';
                                    if (hour >= 17 && hour < 22) return 'Good Evening';
                                    return 'Good Night';
                                })()}
                            </p>
                            <h1 className="text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-400 leading-tight drop-shadow-lg" style={{ fontSize: 'clamp(1.6rem, 8vw, 3rem)', wordBreak: 'break-word' }}>
                                {sessionInfo.session.username}
                            </h1>
                            {sessionInfo.session.isAdmin && (
                                <span className="inline-block mt-3 px-3 py-1 rounded-full text-[10px] font-black bg-plex/20 text-plex border border-plex/40 uppercase tracking-widest">Server Admin</span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {selectedMetric && analytics && (
                <WrapUpModal metric={selectedMetric} analytics={analytics} days={analyticsDays} onClose={() => setSelectedMetric(null)} />
            )}
            {shareWrapUpOpen && analytics && (
                <ShareWrapUpModal
                    analytics={analytics}
                    days={analyticsDays}
                    serverName={sessionInfo?.serverName || 'Server Portal'}
                    username={sessionInfo?.session?.username || user?.username}
                    onClose={() => setShareWrapUpOpen(false)}
                    onToast={(message, type) => setToast({ id: Date.now(), message, type })}
                />
            )}

            <UserDashboardLayout
                layoutConfig={publicConfig?.dashboardLayout}
                layoutCtx={layoutCtx}
                renderMainGridWidget={renderMainGridWidget}
                renderRecentlyAddedWidget={renderRecentlyAddedWidget}
                recentlyAddedLoading={serverDataLoading}
                hasDashboardData={!!dashboardData}
                renderRecentlyAddedSkeleton={() => <HomeRecentlyAddedSkeleton />}
                renderWrapUp={() => (
                    <>
                        {/* Personal Wrap-Up */}
                        {(sessionInfo.session.isAdmin || user) && analyticsLoading && (
                            <WrapUpCardsSkeleton />
                        )}
                        {(sessionInfo.session.isAdmin || user) && !analyticsLoading && analyticsError && (
                            <div className="glass-card p-4 md:p-5 shadow-xl border border-red-500/30 bg-red-500/5">
                                <p className="text-red-300 text-sm font-medium">{analyticsError}</p>
                            </div>
                        )}
                        {(sessionInfo.session.isAdmin || user) && !analyticsLoading && analytics && (
                            <div className="glass-card p-4 md:p-5 shadow-xl">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3 md:mb-4">
                                    <h3 className="text-xl font-bold text-text">Your Personal Wrap-Up</h3>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setShareWrapUpOpen(true)}
                                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-plex/10 border border-plex/30 text-plex hover:bg-plex/20 transition-colors shadow-sm"
                                        >
                                            <Share2 className="w-4 h-4 flex-shrink-0" />
                                            Share
                                        </button>
                                        <PeriodDropdown
                                            value={analyticsDays}
                                            open={wrapUpDaysOpen}
                                            onToggle={() => setWrapUpDaysOpen(!wrapUpDaysOpen)}
                                            onClose={() => setWrapUpDaysOpen(false)}
                                            onChange={(value) => setAnalyticsDays(value as number | 'all')}
                                            options={wrapUpDaysOptions}
                                            buttonClassName="flex items-center gap-2 bg-background border border-border/50 rounded-lg px-3 py-1.5 text-sm font-medium text-text focus:outline-none hover:border-plex/50 transition-colors cursor-pointer shadow-sm"
                                        />
                                    </div>
                                </div>
                                <WrapUpCardGrid analytics={analytics} interactive onCardClick={setSelectedMetric} minCardHeight={112} />
                            </div>
                        )}
                    </>
                )}
                renderWatchRow={() => (
                    <>
                        {/* Recently Watched + Most Watched */}
                        {(sessionInfo.session.isAdmin || user) && (
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4 items-stretch">
                                {!analyticsLoading && analytics?.recentHistory && analytics.recentHistory.length > 0 && (
                                    <div className="lg:col-span-1 flex min-h-0">
                                        <div className="glass-card p-4 md:p-5 shadow-xl flex flex-col h-full w-full min-h-0">
                                            <div className="flex items-center justify-between mb-3 md:mb-4 flex-shrink-0">
                                                <h3 className="text-lg md:text-xl font-bold text-text">Recently Watched</h3>
                                                {analytics.recentHistory.length > recentHistoryPageSize && (
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={() => setRecentHistoryPage(p => Math.max(0, p - 1))}
                                                            disabled={recentHistoryPage === 0}
                                                            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-text"
                                                        >
                                                            <ChevronUp className="w-4 h-4 -rotate-90" />
                                                        </button>
                                                        <span className="text-xs text-muted font-medium w-8 text-center">
                                                            {recentHistoryPage + 1} / {Math.ceil(analytics.recentHistory.length / recentHistoryPageSize)}
                                                        </span>
                                                        <button
                                                            onClick={() => setRecentHistoryPage(p => Math.min(Math.ceil(analytics.recentHistory.length / recentHistoryPageSize) - 1, p + 1))}
                                                            disabled={recentHistoryPage >= Math.ceil(analytics.recentHistory.length / recentHistoryPageSize) - 1}
                                                            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-text"
                                                        >
                                                            <ChevronDown className="w-4 h-4 -rotate-90" />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 items-stretch flex-1 min-h-0 content-start">
                                                {analytics.recentHistory.slice(recentHistoryPage * recentHistoryPageSize, (recentHistoryPage + 1) * recentHistoryPageSize).map((item: any, idx: number) => (
                                                    <div key={idx} className="flex items-center self-stretch gap-3 p-2 bg-black/20 rounded-xl border border-white/5 hover:border-plex/50 hover:bg-black/40 hover:shadow-[0_0_15px_rgba(229,160,13,0.15)] transition-all group relative">
                                                        <a href={item.plexUrl} target="_blank" rel="noreferrer" className="flex items-center flex-1 min-w-0 gap-3">
                                                            <div className="w-10 h-10 rounded-lg overflow-hidden bg-background flex-shrink-0 shadow-md">
                                                                {item.thumbUrl ? (
                                                                    <img src={resolvePortalAssetUrl(item.thumbUrl)} alt={item.title} className="w-full h-full object-cover" />
                                                                ) : (
                                                                    <div className="w-full h-full flex items-center justify-center">
                                                                        <PlaySquare className="w-5 h-5 text-muted/50" />
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <h4 className="font-bold text-text text-sm truncate group-hover:text-plex transition-colors">{item.title}</h4>
                                                                {item.episodeTitle && <p className="text-xs text-muted truncate mt-0.5">{item.episodeTitle}</p>}
                                                                <div className="flex items-center gap-1 mt-1">
                                                                    <Clock className="w-3 h-3 text-muted" />
                                                                    <p className="text-[10px] text-muted">{new Date(item.viewedAt * 1000).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</p>
                                                                </div>
                                                            </div>
                                                        </a>
                                                        <button
                                                            onClick={(e) => { e.preventDefault(); setReportItem(item); }}
                                                            className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 p-2 text-muted hover:text-red-400 hover:bg-red-400/10 rounded-full transition-all focus:outline-none"
                                                            title="Report a playback issue"
                                                        >
                                                            <AlertTriangle className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}
                                {analyticsLoading ? (
                                    <div className="lg:col-span-2 lg:col-start-2 flex min-h-0">
                                        <TopWatchedGridSkeleton />
                                    </div>
                                ) : analytics && analytics.totalPlays > 0 && analytics.topWatched && analytics.topWatched.length > 0 ? (
                                    <div className={`flex min-h-0 ${analytics.recentHistory?.length ? 'lg:col-span-2' : 'lg:col-span-2 lg:col-start-2'}`}>
                                        <div className="glass-card p-4 md:p-5 shadow-xl flex flex-col h-full w-full min-h-0">
                                            <div className="flex items-center justify-between mb-3 md:mb-4 flex-shrink-0">
                                                <div>
                                                    <h3 className="text-lg md:text-xl font-bold text-text mb-0.5">Your Most Watched</h3>
                                                    <p className="text-muted text-sm">Based on your {analytics.totalPlays} total plays</p>
                                                </div>
                                                {analytics.topWatched.length > topWatchedPageSize && (
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={() => setTopContentPage(p => Math.max(0, p - 1))}
                                                            disabled={topContentPage === 0}
                                                            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-text"
                                                        >
                                                            <ChevronUp className="w-4 h-4 -rotate-90" />
                                                        </button>
                                                        <span className="text-xs text-muted font-medium w-8 text-center">
                                                            {topContentPage + 1} / {Math.ceil(analytics.topWatched.length / topWatchedPageSize)}
                                                        </span>
                                                        <button
                                                            onClick={() => setTopContentPage(p => Math.min(Math.ceil(analytics.topWatched.length / topWatchedPageSize) - 1, p + 1))}
                                                            disabled={topContentPage >= Math.ceil(analytics.topWatched.length / topWatchedPageSize) - 1}
                                                            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-text"
                                                        >
                                                            <ChevronDown className="w-4 h-4 -rotate-90" />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2.5 md:gap-3.5 flex-1 min-h-0 content-start">
                                                {analytics.topWatched.slice(topContentPage * topWatchedPageSize, (topContentPage + 1) * topWatchedPageSize).map((item: any) => (
                                                    <a key={item.key} href={item.plexUrl} target="_blank" rel="noreferrer" className="group flex flex-col gap-1.5">
                                                        <div className="relative rounded-lg overflow-hidden aspect-[2/3] bg-background border border-white/5 transition-[box-shadow,border-color] duration-300 group-hover:shadow-xl group-hover:border-plex/50">
                                                            {item.thumbUrl ? (
                                                                <img src={resolvePortalAssetUrl(item.thumbUrl)} alt={item.title} className="w-full h-full object-cover transition-[transform,opacity] duration-300 group-hover:scale-105 group-hover:opacity-80" />
                                                            ) : (
                                                                <div className="w-full h-full flex items-center justify-center p-4 text-center bg-white/5">
                                                                    <span className="text-xs font-bold text-muted line-clamp-3">{item.title}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="flex flex-col px-0.5">
                                                            <p className="text-xs sm:text-sm font-bold text-text truncate group-hover:text-plex transition-colors">{item.title}</p>
                                                            <p className="text-[10px] sm:text-xs text-plex font-black mt-0.5 uppercase tracking-wider">{item.plays} plays</p>
                                                        </div>
                                                    </a>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                        )}
                    </>
                )}
            />

            {reportItem && (
                <ReportIssueModal item={reportItem} onClose={() => setReportItem(null)} />
            )}
        </div>
    );
};
