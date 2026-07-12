import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Play } from 'lucide-react';

import { apiFetch } from '../shared/api';
import { portalUrl, resolvePortalAssetUrl } from '../shared/basePath';
import { formatTime } from '../shared/format';
import { CustomSelect, ScrollReveal } from '../shared/ui';
import { DiscoverPageSkeleton, TrendingSectionsSkeleton } from '../shared/skeletons';
import { activityStreamColumnCount, activityStreamGridClass, discoverPosterGridClass, usePortalWideContentLayout } from '../shared/portalLayout';
import { useVisibleInterval } from '../shared/useVisibleInterval';
import { StreamDetailsModal } from './StreamDetailsModal';
import { DiscoverDownloadsSection } from './DiscoverDownloadsSection';
import {
    DISCOVER_DESKTOP_ITEM_LIMIT,
    DISCOVER_LIMIT_OPTIONS,
    DISCOVER_MOBILE_ITEM_LIMIT,
    DiscoverPosterCard,
    TrendingDiscoverSection,
} from './DiscoverContent';

export const LibraryDashboard: React.FC<{ onBack: () => void, isAdmin?: boolean, publicConfig?: any, mediaServerType?: string }> = ({ onBack, isAdmin, publicConfig, mediaServerType }) => {
    const [dashboardData, setDashboardData] = useState<{ activeSessions: any[], recentMovies: any[], recentShows: any[], recentMusic: any[] } | null>(null);
    const [trendingStats, setTrendingStats] = useState<{ trending7Days: any[], movies30Days: any[], shows30Days: any[], top365Days: any[], allTime: any[], weekendWarriors: any[], nightOwls: any[], retroHits: any[], cultClassics: any[] } | null>(null);
    const [dashboardLoading, setDashboardLoading] = useState(true);
    const [trendingLoading, setTrendingLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [pollError, setPollError] = useState<string | null>(null);
    const isWidePortalLayout = usePortalWideContentLayout();
    const [isDiscoverDesktop, setIsDiscoverDesktop] = useState(
        () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches
    );
    const [recentLimitOverride, setRecentLimitOverride] = useState<number | null>(() => {
        const saved = localStorage.getItem('discoverRecentLimitOverride');
        return saved ? Number(saved) : null;
    });
    const responsiveRecentLimit = isDiscoverDesktop ? DISCOVER_DESKTOP_ITEM_LIMIT : DISCOVER_MOBILE_ITEM_LIMIT;
    const recentLimit = recentLimitOverride ?? responsiveRecentLimit;
    const [selectedSession, setSelectedSession] = useState<any | null>(null);
    const showQualityBadges = publicConfig?.showPosterQualityBadges !== false;
    const isJellyfinPortal = String(publicConfig?.mediaServerType || mediaServerType || 'plex').toLowerCase() === 'jellyfin';
    const hasLoadedDashboard = useRef(false);
    const hasLoadedTrending = useRef(false);

    useEffect(() => {
        const mq = window.matchMedia('(min-width: 1024px)');
        const onChange = (e: MediaQueryListEvent) => setIsDiscoverDesktop(e.matches);
        mq.addEventListener('change', onChange);
        return () => mq.removeEventListener('change', onChange);
    }, []);

    useEffect(() => {
        if (!isJellyfinPortal) return;
        setDashboardData({ activeSessions: [], recentMovies: [], recentShows: [], recentMusic: [] });
        setTrendingStats(null);
        setError(null);
        setPollError(null);
        setDashboardLoading(false);
        setTrendingLoading(false);
    }, [isJellyfinPortal]);

    const handleRecentLimitChange = useCallback((value: string) => {
        const next = Number(value);
        setRecentLimitOverride(next);
        localStorage.setItem('discoverRecentLimitOverride', String(next));
        localStorage.removeItem('discoverRecentLimit');
    }, []);

    const fetchDashboardOnly = useCallback(async () => {
        try {
            const res = await apiFetch(`${isJellyfinPortal ? '/api/jellyfin/dashboard' : '/api/plex/dashboard'}?limit=${recentLimit}`);
            if (res.error) {
                setPollError(res.error);
                return;
            }
            setDashboardData(res);
            setPollError(null);
        } catch (err: any) {
            setPollError(err?.message || 'Live dashboard update failed');
        }
    }, [recentLimit, isJellyfinPortal]);

    const fetchData = useCallback(async () => {
        setError(null);
        if (!hasLoadedDashboard.current) setDashboardLoading(true);
        if (!isJellyfinPortal && !hasLoadedTrending.current) setTrendingLoading(true);
        const trendingPromise = isJellyfinPortal
            ? null
            : apiFetch('/api/plex/stats/trending').catch(() => null);
        try {
            const res = await apiFetch(`${isJellyfinPortal ? '/api/jellyfin/dashboard' : '/api/plex/dashboard'}?limit=${recentLimit}`);
            if (res.error) throw new Error(res.error);
            setDashboardData(res);
        } catch (err: any) {
            setError(err.message || 'Failed to load dashboard data');
        } finally {
            hasLoadedDashboard.current = true;
            setDashboardLoading(false);
        }

        if (isJellyfinPortal) {
            setTrendingStats(null);
            hasLoadedTrending.current = true;
            setTrendingLoading(false);
            return;
        }

        try {
            const statsRes = await trendingPromise;
            if (!statsRes.error) {
                setTrendingStats(statsRes);
            }
        } catch {
            // Trending cache may still be building
        } finally {
            hasLoadedTrending.current = true;
            setTrendingLoading(false);
        }
    }, [recentLimit, isJellyfinPortal]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);
    useVisibleInterval(fetchDashboardOnly, 10000);

    if (dashboardLoading && !dashboardData) {
        return <DiscoverPageSkeleton recentLimit={recentLimit} wideLayout={isWidePortalLayout} />;
    }

    const totalStreams = dashboardData?.activeSessions?.length || 0;
    const trendingCount = recentLimit;
    const transcodingStreams = dashboardData?.activeSessions?.filter(s => s.isTranscoding).length || 0;
    const directStreams = totalStreams - transcodingStreams;
    const totalBandwidthKbps = dashboardData?.activeSessions?.reduce((acc, s) => acc + (s.bandwidth || 0), 0) || 0;
    const totalBandwidthMbps = (totalBandwidthKbps / 1000).toFixed(2);

    return (
        <div className="w-full flex flex-col min-h-screen">
            <main className="discover-layout-container w-full pb-8 mt-4 md:mt-0">
                {error && <div className="toast error show">{error}</div>}
                {pollError && !error && <div className="toast error show">{pollError}</div>}

                {/* SUMMARY CARDS */}
                {dashboardData && totalStreams > 0 && (
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                        <div className="bg-white/5 border border-white/10 rounded-xl py-2 px-3 flex flex-col items-center justify-center gap-0.5 shadow-lg backdrop-blur-sm">
                            <span className="text-plex font-bold text-2xl">{totalStreams}</span>
                            <span className="text-muted text-[10px] uppercase tracking-wider font-bold">Total Streams</span>
                        </div>
                        <div className="bg-white/5 border border-white/10 rounded-xl py-2 px-3 flex flex-col items-center justify-center gap-0.5 shadow-lg backdrop-blur-sm">
                            <span className="text-status-active font-bold text-2xl">{directStreams}</span>
                            <span className="text-muted text-[10px] uppercase tracking-wider font-bold">Direct Play</span>
                        </div>
                        <div className="bg-white/5 border border-white/10 rounded-xl py-2 px-3 flex flex-col items-center justify-center gap-0.5 shadow-lg backdrop-blur-sm">
                            <span className="text-status-expiring font-bold text-2xl">{transcodingStreams}</span>
                            <span className="text-muted text-[10px] uppercase tracking-wider font-bold">Transcoding</span>
                        </div>
                        <div className="bg-white/5 border border-white/10 rounded-xl py-2 px-3 flex flex-col items-center justify-center gap-0.5 shadow-lg backdrop-blur-sm">
                            <span className="text-plex font-bold text-2xl">{totalBandwidthMbps} <span className="text-sm">Mbps</span></span>
                            <span className="text-muted text-[10px] uppercase tracking-wider font-bold">Total Bandwidth</span>
                        </div>
                    </div>
                )}

                {/* ACTIVITY CARDS */}
                <section className="mb-12 w-full">
                    <h2 className="text-plex text-sm uppercase tracking-[2px] mb-6 font-bold border-b border-white/10 pb-2">ACTIVITY</h2>
                    {dashboardData && dashboardData.activeSessions && dashboardData.activeSessions.length > 0 ? (
                        <div className="w-full">
                            <div className={activityStreamGridClass(isWidePortalLayout, dashboardData.activeSessions.length)}>
                                {dashboardData.activeSessions.map((session, i) => {
                                    const activityCols = activityStreamColumnCount(isWidePortalLayout, dashboardData.activeSessions.length);
                                    const sessionPosterSrc = session.thumbUrl
                                        ? resolvePortalAssetUrl(session.thumbUrl)
                                        : portalUrl(`/api/plex/image?path=${encodeURIComponent(session.thumb)}&width=300&height=500`);
                                    const sessionUserThumbSrc = session.userThumb ? resolvePortalAssetUrl(session.userThumb) : 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y';
                                    return (
                                        <div key={session.sessionId ?? i} onClick={() => setSelectedSession(session)} className="bg-card rounded-xl border border-border flex flex-col overflow-hidden shadow-lg hover:border-plex/50 hover:shadow-plex/20 transition-all cursor-pointer select-none h-full min-h-[11.5rem] md:min-h-[14.5rem]">
                                            <div className="flex flex-row flex-1 items-stretch min-h-0">
                                                <div className={`${activityCols === 4 ? 'w-28 md:w-32' : 'w-32 md:w-40'} flex-shrink-0 relative overflow-hidden bg-card self-stretch`}>
                                                    <img src={sessionPosterSrc} alt={session.title} loading="lazy" className="absolute inset-0 w-full h-full object-cover object-top drop-shadow-2xl" />
                                                </div>
                                                <div className="p-2 md:p-3 flex flex-col flex-1 min-w-0 relative">
                                                    {session.user && (
                                                        <div className="absolute top-2 right-2 flex items-center gap-1.5 bg-black/50 backdrop-blur-md rounded-full pr-2.5 p-0.5 shadow-md border border-white/5">
                                                            <img src={sessionUserThumbSrc} alt={session.user} className="w-5 h-5 rounded-full object-cover" onError={(e) => { e.currentTarget.src = 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y'; }} />
                                                            <span className="text-[10px] font-bold text-white/90 truncate max-w-[80px] md:max-w-[100px]">{session.user}</span>
                                                        </div>
                                                    )}

                                                    <div className="activity-header mb-0.5 pr-20 md:pr-28">
                                                        <div className="activity-title-group">
                                                            <div className="text-sm md:text-base font-bold text-text line-clamp-2 leading-tight">{session.grandparentTitle ? session.grandparentTitle : session.title}</div>
                                                            {session.type === 'episode' && session.season !== undefined && session.episode !== undefined ? (
                                                                <div className="text-[10px] md:text-xs text-muted line-clamp-2 leading-snug mt-0.5">
                                                                    {session.title} | S{String(session.season).padStart(2, '0')}E{String(session.episode).padStart(2, '0')}
                                                                </div>
                                                            ) : (
                                                                session.grandparentTitle && <div className="text-[10px] md:text-xs text-muted line-clamp-2 leading-snug mt-0.5">{session.title}</div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="flex flex-wrap gap-1 mb-2 mt-0.5">
                                                        {session.resolution && (
                                                            <span className="bg-white/10 text-white/90 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide border border-white/10">{session.resolution.includes('p') || session.resolution.includes('k') ? session.resolution : `${session.resolution}p`}</span>
                                                        )}
                                                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide border ${session.sessionLocation === 'lan' ? 'bg-status-active/20 text-status-active border-status-active/30' : 'bg-plex/20 text-plex border-plex/30'}`}>
                                                            {session.sessionLocation === 'lan' ? 'Local' : 'Remote'}
                                                        </span>
                                                    </div>

                                                    <div className="activity-details flex flex-col gap-0.5 mt-auto">
                                                        <div className="flex justify-between items-start text-[10px] md:text-xs border-b border-white/5 pb-0.5">
                                                            <span className="text-muted uppercase tracking-wider font-bold mt-0.5">PLAYER</span>
                                                            <span className="detail-value text-right break-words max-w-[130px] md:max-w-[180px]">{session.playerTitle}</span>
                                                        </div>
                                                        <div className="flex justify-between items-center text-[10px] md:text-xs border-b border-white/5 pb-0.5">
                                                            <span className="text-muted uppercase tracking-wider font-bold">STREAM</span>
                                                            <span className={`font-bold ${session.isTranscoding ? 'text-status-expiring' : 'text-status-active'}`}>
                                                                {session.isTranscoding ? 'Transcode' : 'Direct Play'}
                                                            </span>
                                                        </div>
                                                        <div className="flex justify-between items-center text-[10px] md:text-xs border-b border-white/5 pb-0.5">
                                                            <span className="text-muted uppercase tracking-wider font-bold">STATE</span>
                                                            <div className="flex items-center gap-1.5 min-w-0">
                                                                <span className="detail-value font-bold truncate">{session.state.charAt(0).toUpperCase() + session.state.slice(1)}</span>
                                                                {session.timeRemaining > 0 && session.state === 'playing' && (
                                                                    <span className="text-[9px] text-muted/80 whitespace-nowrap">
                                                                        ({Math.floor(session.timeRemaining / 3600000) > 0 ? `${Math.floor(session.timeRemaining / 3600000)}h ` : ''}
                                                                        {Math.floor((session.timeRemaining % 3600000) / 60000)}m left)
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="flex justify-between items-center text-[10px] md:text-xs pb-0.5">
                                                            <span className="text-muted uppercase tracking-wider font-bold">BANDWIDTH</span>
                                                            <span className="detail-value">{(session.bandwidth / 1000).toFixed(1)} Mbps</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                            {/* Progress Bar with embedded text */}
                                            {(() => {
                                                const progressBarText = `${Math.round(session.progress)}%${session.timeRemaining > 0 && session.state === 'playing' ? ` • ETA ${formatTime(new Date(Date.now() + session.timeRemaining))}` : ''}`;
                                                return (
                                                    <div className="w-full h-4 bg-background/80 relative mt-auto z-10 overflow-hidden rounded-b-lg">
                                                        {/* Progress fill */}
                                                        <div className="h-full bg-plex absolute top-0 left-0 transition-all duration-1000 z-10" style={{ width: `${session.progress}%` }}></div>

                                                        {/* Text visible on black background (white text) */}
                                                        <div
                                                            className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white z-20 pointer-events-none whitespace-nowrap"
                                                            style={{ clipPath: `inset(0 0 0 ${session.progress}%)` }}
                                                        >
                                                            {progressBarText}
                                                        </div>

                                                        {/* Text visible on yellow progress bar (black text) */}
                                                        <div
                                                            className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-black z-30 pointer-events-none whitespace-nowrap"
                                                            style={{ clipPath: `inset(0 ${100 - session.progress}% 0 0)` }}
                                                        >
                                                            {progressBarText}
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ) : (
                        <div className="text-center text-muted p-8 border border-dashed border-border rounded-xl mt-4 w-full">No active streams</div>
                    )}
                </section>

                {!isJellyfinPortal && (
                    <DiscoverDownloadsSection useScrollRevealAnimations={publicConfig?.useScrollRevealAnimations} />
                )}

                <div className="flex justify-end gap-4 items-center mb-8">
                    <span className="text-xs uppercase tracking-wider text-muted font-semibold">Items Per Section</span>
                    <CustomSelect
                        compact
                        className="w-32"
                        value={String(recentLimit)}
                        onChange={handleRecentLimitChange}
                        options={DISCOVER_LIMIT_OPTIONS}
                    />
                </div>

                <div className="flex flex-col gap-12 w-full">
                    {/* RECENT MOVIES */}
                    <ScrollReveal enabled={!!publicConfig?.useScrollRevealAnimations} className="flex flex-col discover-deferred-section">
                        <h2 className="text-plex text-sm uppercase tracking-[2px] mb-6 font-bold border-b border-white/10 pb-2">RECENTLY ADDED MOVIES</h2>
                        <div className={discoverPosterGridClass}>
                            {dashboardData && dashboardData.recentMovies.slice(0, recentLimit).map((item, i) => (
                                <DiscoverPosterCard key={i} item={item} showQualityBadges={showQualityBadges} />
                            ))}
                            {(!dashboardData || dashboardData.recentMovies.length === 0) && <div className="text-center text-muted p-8 border border-dashed border-border rounded-xl mt-4 w-full col-span-full">No recent movies</div>}
                        </div>
                    </ScrollReveal>

                    {/* RECENT TV SHOWS */}
                    <ScrollReveal enabled={!!publicConfig?.useScrollRevealAnimations} className="flex flex-col discover-deferred-section">
                        <h2 className="text-plex text-sm uppercase tracking-[2px] mb-6 font-bold border-b border-white/10 pb-2">{isJellyfinPortal ? 'RECENTLY ADDED EPISODES' : 'RECENTLY ADDED TV SHOWS'}</h2>
                        <div className={discoverPosterGridClass}>
                            {dashboardData && dashboardData.recentShows.slice(0, recentLimit).map((item, i) => (
                                <DiscoverPosterCard key={i} item={item} showQualityBadges={showQualityBadges} />
                            ))}
                            {(!dashboardData || dashboardData.recentShows.length === 0) && <div className="text-center text-muted p-8 border border-dashed border-border rounded-xl mt-4 w-full col-span-full">{isJellyfinPortal ? 'No recent episodes' : 'No recent TV shows'}</div>}
                        </div>
                    </ScrollReveal>

                    {/* RECENT MUSIC */}
                    <ScrollReveal enabled={!!publicConfig?.useScrollRevealAnimations} className="flex flex-col discover-deferred-section">
                        <h2 className="text-plex text-sm uppercase tracking-[2px] mb-6 font-bold border-b border-white/10 pb-2">RECENTLY ADDED MUSIC</h2>
                        <div className={discoverPosterGridClass}>
                            {dashboardData && dashboardData.recentMusic.slice(0, recentLimit).map((item, i) => (
                                <DiscoverPosterCard key={i} item={item} aspect="square" showQualityBadges={showQualityBadges} />
                            ))}
                            {(!dashboardData || dashboardData.recentMusic.length === 0) && <div className="text-center text-muted p-8 border border-dashed border-border rounded-xl mt-4 w-full col-span-full">No recent music</div>}
                        </div>
                    </ScrollReveal>
                </div>

                {/* SERVER WIDE STATS SECTION */}
                {!isJellyfinPortal && trendingLoading && !trendingStats ? (
                    <TrendingSectionsSkeleton count={trendingCount} sections={3} />
                ) : !isJellyfinPortal && trendingStats && (
                    <div className="mt-16 w-full flex flex-col gap-12 discover-deferred-section">
                        <div className="flex flex-col gap-2 items-center text-center mb-4">
                            <h2 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight">Other things happening on {publicConfig?.serverIdentifier || 'this server'}</h2>
                            <p className="text-muted text-sm max-w-xl">A look at what the community is currently watching across the entire server.</p>
                        </div>

                        <TrendingDiscoverSection useScrollRevealAnimations={publicConfig?.useScrollRevealAnimations} title="🔥 Trending This Week" items={trendingStats.trending7Days} limit={recentLimit} showQualityBadges={showQualityBadges} />
                        <TrendingDiscoverSection useScrollRevealAnimations={publicConfig?.useScrollRevealAnimations} title="🍿 Most Watched Movies (This Month)" items={trendingStats.movies30Days} limit={recentLimit} showQualityBadges={showQualityBadges} />
                        <TrendingDiscoverSection useScrollRevealAnimations={publicConfig?.useScrollRevealAnimations} title="📺 Most Watched Shows (This Month)" items={trendingStats.shows30Days} limit={recentLimit} showQualityBadges={showQualityBadges} />
                        <TrendingDiscoverSection useScrollRevealAnimations={publicConfig?.useScrollRevealAnimations} title="🏆 Top of the Year" items={trendingStats.top365Days} limit={recentLimit} showQualityBadges={showQualityBadges} />
                        <TrendingDiscoverSection useScrollRevealAnimations={publicConfig?.useScrollRevealAnimations} title="🌟 All Time Favorites" items={trendingStats.allTime} limit={recentLimit} showQualityBadges={showQualityBadges} />
                        <TrendingDiscoverSection useScrollRevealAnimations={publicConfig?.useScrollRevealAnimations} title="🍿 Weekend Warriors" items={trendingStats.weekendWarriors} limit={recentLimit} showQualityBadges={showQualityBadges} />
                        <TrendingDiscoverSection useScrollRevealAnimations={publicConfig?.useScrollRevealAnimations} title="🦇 Night Owl Club" items={trendingStats.nightOwls} limit={recentLimit} showQualityBadges={showQualityBadges} />
                        <TrendingDiscoverSection useScrollRevealAnimations={publicConfig?.useScrollRevealAnimations} title="📼 Blast from the Past" items={trendingStats.retroHits} limit={recentLimit} showQualityBadges={showQualityBadges} />
                        <TrendingDiscoverSection useScrollRevealAnimations={publicConfig?.useScrollRevealAnimations} title="💎 Cult Classics" items={trendingStats.cultClassics} limit={recentLimit} showQualityBadges={showQualityBadges} />
                    </div>
                )}
            </main>

            {/* Stream Details Modal */}
            {selectedSession && <StreamDetailsModal session={selectedSession} onClose={() => setSelectedSession(null)} isAdmin={isAdmin} onKilled={fetchData} providerLabel={isJellyfinPortal ? 'Jellyfin' : 'Plex'} />}
        </div>
    );
};
