import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { Activity, BarChart3, Clock, LineChart as LucideLineChart, MonitorSmartphone, PlaySquare, Trophy, Users } from 'lucide-react';

import { logoUrl, portalUrl, resolvePortalAssetUrl } from '../shared/basePath';
import { formatSizeCeil } from '../shared/format';
import { CustomSelect } from '../shared/ui';
import { Loader } from '../shared/toast';

import { CountUp } from './analytics/CountUp';
import { useAnalyticsData } from './analytics/useAnalyticsData';
import { AnalyticsTrendingContent } from './analytics/AnalyticsTrendingContent';

const ServerInsightsWidget = lazy(() => import('./analytics/ServerInsightsWidget').then(module => ({ default: module.ServerInsightsWidget })));
const TautulliGraphsTab = lazy(() => import('./analytics/TautulliGraphsTab').then(module => ({ default: module.TautulliGraphsTab })));
const UserAnalyticsModal = lazy(() => import('./analytics/UserAnalyticsModal').then(module => ({ default: module.UserAnalyticsModal })));
const AnimatedLeaderboard = lazy(() => import('./analytics/AnimatedLeaderboard').then(module => ({ default: module.AnimatedLeaderboard })));

const LibraryDeltaBadge: React.FC<{ value?: number }> = ({ value }) => {
    if (!value) return null;
    const isPos = value > 0;
    return (
        <span 
            className={`text-sm font-bold ml-2 ${isPos ? 'text-green-500' : 'text-red-500'} animate-[fade-in_0.5s_ease-out] cursor-help`}
            title="Added since the last daily library scan"
        >
            {isPos ? '+' : ''}{value.toLocaleString()}
        </span>
    );
};

const AnalyticsPanelFallback: React.FC<{ className?: string }> = ({ className = '' }) => (
    <div className={`min-h-[320px] ${className}`} aria-hidden="true" />
);

export const AnalyticsDashboard: React.FC<{ isAdmin: boolean, sessionInfo: any }> = ({ isAdmin, sessionInfo }) => {
    const [days, setDays] = useState<string>('30');
    const [selectedUser, setSelectedUser] = useState<{ id: string, username: string, thumb: string | null } | null>(null);
    const [viewTab, setViewTab] = useState<'overview' | 'graphs'>('overview');
    const mediaServerType = String(sessionInfo?.mediaServerType || 'plex').toLowerCase();
    const isJellyfinPortal = mediaServerType === 'jellyfin';
    const analyticsSourceLabel = isJellyfinPortal ? 'Jellystat' : 'Tautulli';
    const { analyticsData, providerData: tautulliData, isLoading, error } = useAnalyticsData({ days, isAdmin, isJellyfinPortal });
    const libraryDeltas = (analyticsData?.libraryHealth as any)?.deltas || {};

    const resolveUserAvatar = (thumb: string | null | undefined, width = 80, height = 80) => {
        if (!thumb) return logoUrl();
        if (thumb.startsWith('http://') || thumb.startsWith('https://') || thumb.startsWith('/api/')) {
            return resolvePortalAssetUrl(thumb);
        }
        return portalUrl(`/api/plex/image?path=${encodeURIComponent(thumb)}&width=${width}&height=${height}`);
    };

    useEffect(() => {
        if (isJellyfinPortal && viewTab === 'graphs') setViewTab('overview');
    }, [isJellyfinPortal, viewTab]);

    const libraryHealth = analyticsData?.libraryHealth || null;
    const libraryHealthDistributions = useMemo(() => {
        if (!libraryHealth?.resolutions || !libraryHealth?.codecs || !libraryHealth?.fileSizes) return null;

        const sortedCodecs = Object.entries(libraryHealth.codecs)
            .map(([name, count]) => ({ name, count: count as number }))
            .sort((a, b) => b.count - a.count);
        const totalCodecs = sortedCodecs.reduce((sum, item) => sum + item.count, 0) || 1;

        const sortedResolutions = Object.entries(libraryHealth.resolutions)
            .map(([name, count]) => ({ name, count: count as number }))
            .sort((a, b) => b.count - a.count);
        const totalResolutions = sortedResolutions.reduce((sum, item) => sum + item.count, 0) || 1;

        const fileSizeEntries = Object.entries(libraryHealth.fileSizes)
            .map(([range, val]) => {
                let movies = 0;
                let shows = 0;
                if (val && typeof val === 'object') {
                    movies = (val as any).movies || 0;
                    shows = (val as any).shows || 0;
                } else if (typeof val === 'number') {
                    shows = val;
                }
                return { range, movies, shows, total: movies + shows };
            });
        const maxFileSizeCount = Math.max(...fileSizeEntries.map(e => e.total), 1);

        return { sortedCodecs, totalCodecs, sortedResolutions, totalResolutions, fileSizeEntries, maxFileSizeCount };
    }, [libraryHealth?.resolutions, libraryHealth?.codecs, libraryHealth?.fileSizes]);

    if (isLoading) return <Loader isLoading={true} />;
    if (error) return <div className="text-red-500 font-bold p-8 text-center">{error}</div>;
    if (!analyticsData) return null;

    const { topUsers, topLibraries, topMovies, topShows, topMusic, topDevices, peakHours, totalPlaybacks, maxConcurrentStreams, maxDirectPlays, maxTranscodes } = analyticsData;
    const uniqueActiveViewers = topUsers.filter((u: any) => (u.plays || 0) > 0).length;
    const maxLibraryPlays = Math.max(...topLibraries.map(l => l.plays), 1);
    const maxDevicePlays = Math.max(...topDevices.map(d => d.plays), 1);
    const maxPeakHour = Math.max(...peakHours, 1);

    const compare = analyticsData.compare || null;

    const formatPriorPeriodLabel = (days: string) => {
        if (days === '1') return '24 hours';
        if (days === '7') return '7 days';
        if (days === '365') return 'year';
        if (days === '1825') return '5 years';
        return `${days} days`;
    };

    const renderDelta = (delta?: { absolute: number, percent: number | null, previous?: number, current?: number } | null) => {
        if (!delta) return null;
        if (delta.absolute === 0 && delta.previous === 0) return null;
        const isUp = delta.absolute >= 0;
        const sign = isUp ? '+' : '';
        let pctText: string;
        if (delta.percent !== null) {
            pctText = `${sign}${delta.percent}%`;
        } else if ((delta.previous ?? 0) === 0 && delta.absolute > 0) {
            pctText = 'New';
        } else {
            pctText = `${sign}${delta.absolute}`;
        }
        const priorLabel = compare?.previousPeriodDays ? formatPriorPeriodLabel(compare.previousPeriodDays) : null;
        const tooltip = priorLabel
            ? `Compared to the previous ${priorLabel}${delta.previous != null ? ` (${delta.previous})` : ''}`
            : undefined;
        return (
            <span
                title={tooltip}
                className={`inline-flex items-center px-2 py-1 rounded-md text-[10px] font-bold mt-1 ${isUp ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}
            >
                {pctText}
            </span>
        );
    };
return (
        <div className="w-full min-w-0 animate-fade-in flex flex-col gap-6">
            <div className="flex flex-col gap-4 mb-6">
                <h1 className="text-3xl font-black text-white flex items-center gap-3 uppercase tracking-wider">
                    <BarChart3 className="w-8 h-8 text-plex" />
                    Advanced Analytics
                </h1>
                <div className="flex flex-row items-center justify-between gap-3 w-full">
                    <div className="flex bg-black/40 rounded-lg p-1 border border-white/5 w-fit overflow-x-auto hide-scrollbar">
                        <button onClick={() => setViewTab('overview')} className={`px-3 md:px-4 py-2 rounded-md text-xs md:text-sm font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5 md:gap-2 ${viewTab === 'overview' ? 'bg-plex text-white shadow-lg' : 'text-muted hover:text-white'}`}>
                            <Activity className="w-4 h-4 shrink-0" /> <span className="hidden sm:inline">Overview</span><span className="sm:hidden">Overview</span>
                        </button>
                        {!isJellyfinPortal && (
                            <button onClick={() => setViewTab('graphs')} className={`px-3 md:px-4 py-2 rounded-md text-xs md:text-sm font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5 md:gap-2 ${viewTab === 'graphs' ? 'bg-plex text-white shadow-lg' : 'text-muted hover:text-white'}`}>
                                <LucideLineChart className="w-4 h-4 shrink-0" /> <span className="hidden sm:inline">Graphs</span><span className="sm:hidden">Graphs</span>
                            </button>
                        )}
                    </div>
                    {viewTab === 'overview' && (
                        <div className="w-[140px] md:w-48 shrink-0">
                            <CustomSelect
                                value={days}
                                onChange={(val) => setDays(val as string)}
                                compact={true}
                                options={[
                                    { label: 'Last 24 Hours', value: '1' },
                                    { label: 'Last 7 Days', value: '7' },
                                    { label: 'Last 30 Days', value: '30' },
                                    { label: 'Last 60 Days', value: '60' },
                                    { label: 'Last 1 Year', value: '365' },
                                    { label: 'Last 5 Years', value: '1825' },
                                    { label: 'All Time', value: 'all' }
                                ]}
                            />
                        </div>
                    )}
                </div>
            </div>

            {viewTab === 'graphs' && (
                <Suspense fallback={<AnalyticsPanelFallback />}>
                    <TautulliGraphsTab />
                </Suspense>
            )}

            {viewTab === 'overview' && (
                <>
                    {analyticsData.cacheFallback && (
                        <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200">
                            Analytics cache for this period is still building. Showing cached data from the last {analyticsData.cachePeriodDays} day period instead.
                        </div>
                    )}
                    {/* High Level Stats Overview */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                        <div className="glass-card-sm p-6 flex items-center gap-4">
                            <div className="bg-plex/10 p-4 rounded-full">
                                <PlaySquare className="text-plex w-8 h-8" />
                            </div>
                            <div>
                                <p className="text-muted text-sm uppercase tracking-wider font-bold mb-1">Total Playbacks</p>
                                <p className="text-2xl font-black text-text"><CountUp end={totalPlaybacks} /></p>
                                {renderDelta(compare?.totalPlaybacks)}
                            </div>
                        </div>
                        <div className="glass-card-sm p-6 flex items-center gap-4">
                            <div className="bg-plex/10 p-4 rounded-full">
                                <Users className="text-plex w-8 h-8" />
                            </div>
                            <div>
                                <p className="text-muted text-sm uppercase tracking-wider font-bold mb-1">Unique Viewers</p>
                                <p className="text-lg font-bold text-text truncate max-w-[150px]" title={String(uniqueActiveViewers)}>{uniqueActiveViewers}</p>
                                {renderDelta(compare?.uniqueViewers)}
                            </div>
                        </div>
                        <div className="glass-card-sm p-6 flex items-center gap-4 col-span-1 sm:col-span-2">
                            <div className="w-full h-full flex flex-col justify-center">
                                <p className="text-muted text-sm uppercase tracking-wider font-bold mb-2 flex items-center gap-2"><Clock className="w-4 h-4 text-plex" /> Peak Viewing Hours</p>
                                <div className="flex items-end gap-1 h-12 w-full mt-auto">
                                    {peakHours.map((val, idx) => (
                                        <div key={idx} className="flex-1 bg-plex opacity-20 hover:opacity-80 transition-opacity rounded-t-sm relative group" style={{ height: `${Math.max((val / maxPeakHour) * 100, 5)}%` }}>
                                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-black/80 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-10">
                                                {idx === 0 ? '12 AM' : idx < 12 ? `${idx} AM` : idx === 12 ? '12 PM' : `${idx - 12} PM`}: {val} plays
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className="flex justify-between text-[10px] text-muted mt-1 font-mono">
                                    <span>12am</span><span>6am</span><span>12pm</span><span>6pm</span><span>11pm</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    {libraryHealth && (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div className="glass-card-sm p-4">
                                    <p className="text-muted text-xs uppercase tracking-wider font-bold mb-1">Library Balance</p>
                                    <p className="text-xl font-black text-plex">{libraryHealth.healthLabel}</p>
                                    <p className="text-[10px] text-muted mt-1 leading-snug">How evenly viewing is spread across libraries — not server health.</p>
                                </div>
                                <div className="glass-card-sm p-4">
                                    <p className="text-muted text-xs uppercase tracking-wider font-bold mb-1">Active Libraries</p>
                                    <p className="text-xl font-black text-text">{libraryHealth.activeLibraries}</p>
                                </div>
                                <div className="glass-card-sm p-4">
                                    <p className="text-muted text-xs uppercase tracking-wider font-bold mb-1">Catalog Size</p>
                                    <p className="text-xl font-black text-text">{libraryHealth.totalCatalogItems.toLocaleString()}</p>
                                    <p className="text-[11px] text-muted">{formatSizeCeil(libraryHealth.totalCatalogBytes ?? libraryHealth.sizeGB * 1024 ** 3)}</p>
                                </div>
                                <div className="glass-card-sm p-4">
                                    <p className="text-muted text-xs uppercase tracking-wider font-bold mb-1">Usage Concentration</p>
                                    <p className="text-xl font-black text-text">{libraryHealth.concentrationPct}%</p>
                                    <p className="text-[11px] text-muted truncate">Watched: {libraryHealth.catalogWatchedPct || 0}% • 4K: {libraryHealth.fourKPercent}%</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="glass-card-sm p-4 flex flex-col justify-center">
                                    <p className="text-muted text-xs uppercase tracking-wider font-bold mb-1">Movies Catalog</p>
                                    <div className="flex items-center">
                                        <p className="text-xl font-black text-text"><CountUp end={libraryHealth.movies || 0} /></p>
                                        <LibraryDeltaBadge value={libraryDeltas.movies} />
                                    </div>
                                    <p className="text-[11px] text-muted">Total movies in library</p>
                                </div>
                                <div className="glass-card-sm p-4 flex flex-col justify-center">
                                    <p className="text-muted text-xs uppercase tracking-wider font-bold mb-1">TV Shows Catalog</p>
                                    <div className="flex items-center gap-1">
                                        <p className="text-xl font-black text-text"><CountUp end={libraryHealth.shows || 0} /></p>
                                        <span className="text-xs font-semibold text-muted ml-1">Shows</span>
                                        <LibraryDeltaBadge value={libraryDeltas.shows} />
                                    </div>
                                    <div className="flex items-center text-[11px] text-muted mt-0.5">
                                        <CountUp end={libraryHealth.episodes || 0} /> <span className="ml-1">episodes</span>
                                        <LibraryDeltaBadge value={libraryDeltas.episodes} />
                                    </div>
                                </div>
                                <div className="glass-card-sm p-4 flex flex-col justify-center">
                                    <p className="text-muted text-xs uppercase tracking-wider font-bold mb-1">Music Catalog</p>
                                    <div className="flex items-center gap-1">
                                        <p className="text-xl font-black text-text"><CountUp end={libraryHealth.artists || 0} /></p>
                                        <span className="text-xs font-semibold text-muted ml-1">Artists</span>
                                        <LibraryDeltaBadge value={libraryDeltas.artists} />
                                    </div>
                                    <div className="flex items-center text-[11px] text-muted mt-0.5">
                                        <CountUp end={libraryHealth.albums || 0} /> <span className="mx-1">albums</span> <LibraryDeltaBadge value={libraryDeltas.albums} />
                                        <span className="mx-1">•</span> 
                                        <CountUp end={libraryHealth.tracks || 0} /> <span className="mx-1">tracks</span> <LibraryDeltaBadge value={libraryDeltas.tracks} />
                                    </div>
                                </div>
                            </div>

                            {libraryHealthDistributions && (
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="glass-card-sm p-5 flex flex-col justify-between">
                                            <div>
                                                <h3 className="text-muted text-xs uppercase tracking-wider font-bold mb-4">Video Codecs</h3>
                                                <div className="flex flex-col gap-3">
                                                    {libraryHealthDistributions.sortedCodecs.map((item) => {
                                                        const pct = Math.round((item.count / libraryHealthDistributions.totalCodecs) * 100);
                                                        return (
                                                            <div key={item.name} className="flex flex-col gap-1">
                                                                <div className="flex justify-between text-xs font-semibold">
                                                                    <span className="text-text">{item.name}</span>
                                                                    <span className="text-muted font-mono">{item.count.toLocaleString()} ({pct}%)</span>
                                                                </div>
                                                                <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden">
                                                                    <div className="bg-plex h-full rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="glass-card-sm p-5 flex flex-col justify-between">
                                            <div>
                                                <h3 className="text-muted text-xs uppercase tracking-wider font-bold mb-4">Resolutions</h3>
                                                <div className="flex flex-col gap-3">
                                                    {libraryHealthDistributions.sortedResolutions.map((item) => {
                                                        const pct = Math.round((item.count / libraryHealthDistributions.totalResolutions) * 100);
                                                        return (
                                                            <div key={item.name} className="flex flex-col gap-1">
                                                                <div className="flex justify-between text-xs font-semibold">
                                                                    <span className="text-text">{item.name}</span>
                                                                    <span className="text-muted font-mono">{item.count.toLocaleString()} ({pct}%)</span>
                                                                </div>
                                                                <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden">
                                                                    <div className="bg-plex h-full rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="glass-card-sm p-5 flex flex-col">
                                            <div className="flex items-center justify-between mb-1">
                                                <h3 className="text-muted text-xs uppercase tracking-wider font-bold">File Size Distribution</h3>
                                                <div className="flex items-center gap-3 text-[10px] text-muted font-semibold">
                                                    <span className="flex items-center gap-1">
                                                        <span className="w-2 h-2 bg-plex rounded-sm inline-block" />
                                                        <span>Movies</span>
                                                    </span>
                                                    <span className="flex items-center gap-1">
                                                        <span className="w-2 h-2 bg-plex/30 rounded-sm inline-block border border-plex/20" />
                                                        <span>TV Shows</span>
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="flex items-end justify-between h-40 pt-4 px-2 w-full gap-3 mt-auto">
                                                {libraryHealthDistributions.fileSizeEntries.map((item) => {
                                                    const totalHeightPct = (item.total / libraryHealthDistributions.maxFileSizeCount) * 100;
                                                    const moviesPctOfBar = item.total > 0 ? (item.movies / item.total) * 100 : 0;
                                                    const showsPctOfBar = item.total > 0 ? (item.shows / item.total) * 100 : 0;
                                                    
                                                    return (
                                                        <div key={item.range} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group relative">
                                                            <div 
                                                                className="w-full relative transition-all duration-500 flex flex-col justify-end" 
                                                                style={{ height: `${Math.max(totalHeightPct, 4)}%` }}
                                                            >
                                                                {/* Bar container with overflow-hidden for rounded-t corners */}
                                                                <div className="w-full h-full rounded-t overflow-hidden flex flex-col justify-end">
                                                                    {/* Movies part (Top) */}
                                                                    {item.movies > 0 && (
                                                                        <div 
                                                                            className="w-full bg-plex hover:opacity-100 transition-opacity" 
                                                                            style={{ height: `${moviesPctOfBar}%` }} 
                                                                        />
                                                                    )}
                                                                    {/* TV Shows part (Bottom) */}
                                                                    {item.shows > 0 && (
                                                                        <div 
                                                                            className="w-full bg-plex/30 hover:opacity-100 transition-opacity border-t border-black/10" 
                                                                            style={{ height: `${showsPctOfBar}%` }} 
                                                                        />
                                                                    )}
                                                                </div>

                                                                {/* Detailed Tooltip (Placed outside the overflow-hidden container, inside the height wrapper) */}
                                                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 bg-black/95 text-white text-[10px] px-2.5 py-1.5 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-20 font-mono shadow-md border border-white/5 flex flex-col gap-0.5 leading-none">
                                                                    <span className="font-bold text-plex mb-1 text-[11px]">{item.range}</span>
                                                                    <span className="flex justify-between gap-4"><span>Movies:</span> <span className="text-white font-bold">{item.movies.toLocaleString()}</span></span>
                                                                    <span className="flex justify-between gap-4"><span>TV Episodes:</span> <span className="text-white font-bold">{item.shows.toLocaleString()}</span></span>
                                                                    <span className="border-t border-white/10 mt-1 pt-1 flex justify-between gap-4"><span>Total:</span> <span className="text-plex font-bold">{item.total.toLocaleString()}</span></span>
                                                                </div>
                                                            </div>
                                                            <span className="text-[9px] text-muted font-bold tracking-wider text-center line-clamp-1 w-full" title={item.range}>{item.range}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                            )}
                        </>
                    )}

                    <div className="w-full">
                        <Suspense fallback={<AnalyticsPanelFallback />}>
                            <AnimatedLeaderboard users={topUsers} resolveAvatar={resolveUserAvatar} isAdmin={isAdmin} onUserClick={setSelectedUser as any} />
                        </Suspense>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                        <Suspense fallback={<AnalyticsPanelFallback className="lg:col-span-2" />}>
                            <ServerInsightsWidget
                                peakHours={analyticsData?.peakHours || []}
                                tautulliData={tautulliData}
                                compare={analyticsData?.compare}
                                analyticsSourceLabel={analyticsSourceLabel}
                            />
                        </Suspense>

                        {/* Top Devices & Libraries Container */}
                        <div className="flex flex-col gap-6 lg:col-span-1">
                            {/* Popular Libraries Card */}
                            <div className="glass-card-sm p-4 md:p-6">
                                <h2 className="text-xl font-bold text-text mb-4 uppercase tracking-wider flex items-center gap-2"><PlaySquare className="text-plex w-5 h-5" /> Popular Libraries</h2>
                                <div className="flex flex-col gap-5 mt-2">
                                    {topLibraries.length === 0 ? <p className="text-muted text-sm">No data available.</p> : topLibraries.map((lib, idx) => (
                                        <div key={lib.id} className="flex flex-col gap-2">
                                            <div className="flex justify-between items-end">
                                                <span className="font-bold text-text flex items-center gap-2"><span className="text-muted text-xs">#{idx + 1}</span> {lib.title}</span>
                                                <span className="text-xs text-muted font-mono">{lib.plays} plays</span>
                                            </div>
                                            <div className="h-2 w-full bg-black/40 rounded-full overflow-hidden">
                                                <div className="h-full bg-gradient-to-r from-plex to-[#e5a00d] rounded-full" style={{ width: `${(lib.plays / maxLibraryPlays) * 100}%` }}></div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Top Devices Card */}
                            {topDevices && topDevices.length > 0 && (
                                <div className="glass-card-sm p-4 md:p-6">
                                    <h2 className="text-xl font-bold text-text mb-4 uppercase tracking-wider flex items-center gap-2"><MonitorSmartphone className="text-plex w-5 h-5" /> Top Devices</h2>
                                    <div className="flex flex-col gap-4">
                                        {topDevices.slice(0, 5).map((device: any, idx: number) => (
                                            <div key={idx} className="flex flex-col gap-1.5">
                                                <div className="flex justify-between items-end">
                                                    <span className="font-bold text-sm text-text truncate pr-2 flex items-center gap-2">
                                                        <span className="text-muted text-xs">#{idx + 1}</span> {device.name || 'Unknown Device'}
                                                    </span>
                                                    <span className="text-xs text-muted font-mono flex-shrink-0">{device.plays} plays</span>
                                                </div>
                                                <div className="h-1.5 w-full bg-black/40 rounded-full overflow-hidden">
                                                    <div className="h-full bg-gradient-to-r from-blue-600 to-blue-400 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.5)] transition-all duration-1000" style={{ width: `${(device.plays / Math.max(maxDevicePlays, 1)) * 100}%` }}></div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>



                        <AnalyticsTrendingContent movies={topMovies} shows={topShows} music={topMusic} />
                    </div>
                </>
            )}
            {isAdmin && selectedUser && (
                <Suspense fallback={null}>
                    <UserAnalyticsModal
                        userId={selectedUser.id}
                        username={selectedUser.username}
                        thumb={selectedUser.thumb}
                        days={days}
                        onClose={() => setSelectedUser(null)}
                    />
                </Suspense>
            )}
        </div>
    );
};
