import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, AlertCircle, BarChart3, Calendar, Clock, Film, Layers, LineChart as LucideLineChart, List, Monitor, MonitorSmartphone, Music, Play, PlaySquare, RefreshCw, Search, Settings, Star, TrendingUp, Trophy, Users, X } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, PieChart as RechartsPieChart, Pie, Cell } from 'recharts';

import { apiFetch } from '../shared/api';
import { logoUrl, portalUrl, resolvePortalAssetUrl } from '../shared/basePath';
import { formatSizeCeil } from '../shared/format';
import { CustomSelect } from '../shared/ui';
import { Loader } from '../shared/toast';

import { UserAnalyticsModal } from './analytics/UserAnalyticsModal';

const CountUp: React.FC<{ end: number, duration?: number }> = ({ end, duration = 1500 }) => {
    const [count, setCount] = useState(0);

    useEffect(() => {
        let startTime: number | null = null;
        let animationFrame: number;

        const animate = (timestamp: number) => {
            if (!startTime) startTime = timestamp;
            const progress = timestamp - startTime;
            const percentage = Math.min(progress / duration, 1);

            // easeOutQuart easing
            const easeOut = 1 - Math.pow(1 - percentage, 4);

            setCount(Math.floor(end * easeOut));

            if (percentage < 1) {
                animationFrame = requestAnimationFrame(animate);
            } else {
                setCount(end);
            }
        };

        animationFrame = requestAnimationFrame(animate);

        return () => cancelAnimationFrame(animationFrame);
    }, [end, duration]);

    return <span>{count.toLocaleString()}</span>;
};

// --- Analytics Dashboard Component ---

import { TautulliGraphsTab } from './analytics/TautulliGraphsTab';

const ServerInsightsWidget: React.FC<{
    peakHours: number[],
    tautulliData: any,
    compare: any,
    analyticsSourceLabel: string
}> = ({ peakHours, tautulliData, compare, analyticsSourceLabel }) => {
    
    // Format chart data
    const chartData = peakHours ? peakHours.map((count, hour) => {
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const h = hour % 12 || 12;
        return {
            time: `${h}${ampm}`,
            plays: count
        };
    }) : [];

    const formatChange = (data: any) => {
        if (!data || data.percent === null) return null;
        const isPos = data.percent > 0;
        const color = isPos ? 'text-green-500' : (data.percent < 0 ? 'text-red-500' : 'text-muted');
        const icon = isPos ? '↑' : (data.percent < 0 ? '↓' : '');
        return <span className={`text-xs font-bold ${color} ml-2`}>{icon}{Math.abs(data.percent)}%</span>;
    };

    return (
        <div className="w-full flex flex-col gap-6 lg:col-span-2">
            <h2 className="text-xl font-bold text-text uppercase tracking-wider flex items-center gap-2">
                <Activity className="text-plex w-5 h-5" /> Server Insights & Load
            </h2>

            {/* Peak Hours Chart */}
            <div className="glass-card-sm p-4 md:p-6 w-full flex flex-col flex-1">
                <h3 className="text-sm font-bold text-muted uppercase tracking-wider mb-4 flex items-center gap-2">
                    <Clock className="w-4 h-4" /> Peak Playback Hours
                </h3>
                <div className="w-full h-[250px] sm:h-[320px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <defs>
                                <linearGradient id="colorPlays" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#e5a00d" stopOpacity={0.4}/>
                                    <stop offset="95%" stopColor="#e5a00d" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                            <XAxis dataKey="time" stroke="#ffffff40" fontSize={10} tickMargin={10} minTickGap={15} />
                            <YAxis stroke="#ffffff40" fontSize={10} tickFormatter={(val) => val} />
                            <RechartsTooltip 
                                contentStyle={{ backgroundColor: '#111315', borderColor: '#ffffff20', borderRadius: '8px', color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
                                itemStyle={{ color: '#e5a00d' }}
                                formatter={(value: any) => [`${value} plays`, 'Activity']}
                            />
                            <Area type="monotone" dataKey="plays" stroke="#e5a00d" strokeWidth={3} fillOpacity={1} fill="url(#colorPlays)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Server Records Grid */}
            {tautulliData && (
                <div className="glass-card-sm p-4 md:p-6 w-full flex flex-col relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-3 opacity-5 pointer-events-none">
                        <Activity className="w-48 h-48 text-[#3b82f6]" />
                    </div>
                    <h3 className="text-sm font-bold text-muted uppercase tracking-wider mb-4 flex items-center gap-2 relative z-10">
                        <Activity className="w-4 h-4 text-[#3b82f6]" /> {analyticsSourceLabel} Records & Period Stats
                    </h3>
                    <div className="grid grid-cols-2 gap-3 relative z-10">
                        <div className="flex flex-col p-3 bg-black/20 rounded-lg border border-white/5 shadow-inner">
                            <span className="font-bold text-muted text-[10px] uppercase tracking-wider mb-1 flex items-center gap-1.5"><Users className="w-3 h-3 text-[#3b82f6]"/> Peak Streams</span>
                            <p className="text-xl font-black text-[#3b82f6]">{tautulliData?.streamsRecord || 0} <span className="text-[9px] font-normal text-muted">concurrent</span></p>
                        </div>
                        <div className="flex flex-col p-3 bg-black/20 rounded-lg border border-white/5 shadow-inner">
                            <span className="font-bold text-muted text-[10px] uppercase tracking-wider mb-1 flex items-center gap-1.5"><Clock className="w-3 h-3 text-green-400"/> Watch Time</span>
                            <p className="text-base font-black text-green-400 leading-tight">{tautulliData?.totalTimeStr || '0 mins'}</p>
                        </div>
                        <div className="flex flex-col p-3 bg-black/20 rounded-lg border border-white/5 shadow-inner">
                            <span className="font-bold text-muted text-[10px] uppercase tracking-wider mb-1 flex items-center gap-1.5"><TrendingUp className="w-3 h-3 text-yellow-400"/> Period Plays</span>
                            <p className="text-xl font-black text-yellow-400 flex items-center">{compare?.totalPlaybacks?.current || 0} {formatChange(compare?.totalPlaybacks)}</p>
                        </div>
                        <div className="flex flex-col p-3 bg-black/20 rounded-lg border border-white/5 shadow-inner">
                            <span className="font-bold text-muted text-[10px] uppercase tracking-wider mb-1 flex items-center gap-1.5"><Users className="w-3 h-3 text-pink-400"/> Unique Viewers</span>
                            <p className="text-xl font-black text-pink-400 flex items-center">{compare?.uniqueViewers?.current || 0} {formatChange(compare?.uniqueViewers)}</p>
                        </div>
                        <div className="flex flex-col p-3 bg-black/20 rounded-lg border border-white/5 shadow-inner">
                            <span className="font-bold text-muted text-[10px] uppercase tracking-wider mb-1 flex items-center gap-1.5"><Monitor className="w-3 h-3 text-cyan-400" /> Peak Direct Plays</span>
                            <p className="font-mono font-black text-cyan-400 text-xl">{tautulliData?.directPlayRecord || 0}</p>
                        </div>
                        <div className="flex flex-col p-3 bg-black/20 rounded-lg border border-white/5 shadow-inner">
                            <span className="font-bold text-muted text-[10px] uppercase tracking-wider mb-1 flex items-center gap-1.5"><Activity className="w-3 h-3 text-orange-400" /> Peak Direct Streams</span>
                            <p className="font-mono font-black text-orange-400 text-xl">{tautulliData?.directStreamRecord || 0}</p>
                        </div>
                        <div className="flex flex-col p-3 bg-black/20 rounded-lg border border-white/5 shadow-inner">
                            <span className="font-bold text-muted text-[10px] uppercase tracking-wider mb-1 flex items-center gap-1.5"><Settings className="w-3 h-3 text-rose-400" /> Peak Transcodes</span>
                            <p className="font-mono font-black text-rose-400 text-xl">{tautulliData?.transcodeRecord || 0}</p>
                        </div>
                        <div className="flex flex-col p-3 bg-black/20 rounded-lg border border-white/5 shadow-inner">
                            <span className="font-bold text-muted text-[10px] uppercase tracking-wider mb-1 flex items-center gap-1.5"><PlaySquare className="w-3 h-3 text-purple-400" /> TV Shows Played</span>
                            <p className="font-mono font-black text-purple-400 text-xl">{tautulliData?.tvPlays ? tautulliData.tvPlays.toLocaleString() : 0}</p>
                        </div>
                        <div className="flex flex-col p-3 bg-black/20 rounded-lg border border-white/5 shadow-inner">
                            <span className="font-bold text-muted text-[10px] uppercase tracking-wider mb-1 flex items-center gap-1.5"><Film className="w-3 h-3 text-red-400" /> Movies Played</span>
                            <p className="font-mono font-black text-red-400 text-xl">{tautulliData?.moviePlays ? tautulliData.moviePlays.toLocaleString() : 0}</p>
                        </div>
                        <div className="flex flex-col p-3 bg-black/20 rounded-lg border border-white/5 shadow-inner">
                            <span className="font-bold text-muted text-[10px] uppercase tracking-wider mb-1 flex items-center gap-1.5"><Music className="w-3 h-3 text-emerald-400" /> Music Played</span>
                            <p className="font-mono font-black text-emerald-400 text-xl">{tautulliData?.musicPlays ? tautulliData.musicPlays.toLocaleString() : 0}</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

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
const AnimatedLeaderboard: React.FC<{ users: any[], resolveAvatar: (thumb: string | null | undefined, w?: number, h?: number) => string, isAdmin: boolean, onUserClick: (u: any) => void }> = ({ users, resolveAvatar, isAdmin, onUserClick }) => {
    const prevUsersRef = useRef<any[]>([]);
    
    useEffect(() => {
        prevUsersRef.current = users;
    }, [users]);

    const prevUsers = prevUsersRef.current;
    
    if (!users || users.length === 0) return null;

    const maxPlays = Math.max(...users.map(u => u.plays || 0), 1);

    const top3 = users.slice(0, 3);
    const rest = users.slice(3, 10);

    const getRankDelta = (userId: string, currentRank: number) => {
        if (!prevUsers || prevUsers.length === 0) return null;
        const prevIdx = prevUsers.findIndex(u => u.id === userId);
        if (prevIdx === -1) return { type: 'new' };
        const diff = prevIdx - (currentRank - 1);
        if (diff > 0) return { type: 'up', val: diff };
        if (diff < 0) return { type: 'down', val: Math.abs(diff) };
        return null;
    };

    const renderPodiumCard = (user: any, rank: number) => {
        const delta = getRankDelta(user.id, rank);
        const isFirst = rank === 1;
        const heightClass = isFirst ? 'h-48' : 'h-40';
        const ringClass = isFirst ? 'ring-2 ring-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.3)]' : rank === 2 ? 'ring-1 ring-slate-300' : 'ring-1 ring-amber-700';
        
        return (
            <div onClick={() => isAdmin && onUserClick(user)} className={`flex flex-col items-center justify-end bg-card/80 border border-border rounded-xl p-4 relative cursor-pointer hover:bg-white/5 transition-all group w-full ${heightClass} ${ringClass}`}>
                {isFirst && <div className="absolute -top-6 text-4xl animate-[crown-pulse_2s_ease-in-out_infinite]">👑</div>}
                {!isFirst && <div className="absolute -top-4 text-3xl">{rank === 2 ? '🥈' : '🥉'}</div>}
                
                <img src={resolveAvatar(user.thumb, 80, 80)} alt={user.username} onError={(e) => { (e.target as HTMLImageElement).src = logoUrl(); }} className={`rounded-full object-cover mb-2 border-2 ${isFirst ? 'w-20 h-20 border-yellow-500' : 'w-16 h-16 border-border'} bg-card`} />
                <span className="font-bold text-text group-hover:text-plex transition-colors truncate w-full text-center">{user.username}</span>
                <span className="text-xs text-muted font-mono mt-1">{user.plays} plays</span>
                
                {delta && (
                    <div className="absolute -right-2 -top-2">
                        {delta.type === 'new' && <span className="bg-plex text-black text-[9px] font-bold px-1.5 py-0.5 rounded-full animate-[rank-up_0.3s_ease-out]">NEW</span>}
                        {delta.type === 'up' && <span className="bg-green-500/20 text-green-400 text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center animate-[rank-up_0.3s_ease-out]">↑{delta.val}</span>}
                        {delta.type === 'down' && <span className="bg-red-500/20 text-red-400 text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center animate-[rank-down_0.3s_ease-out]">↓{delta.val}</span>}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="w-full flex flex-col gap-4">
            <h2 className="text-xl font-bold text-text uppercase tracking-wider flex items-center gap-2">
                <Trophy className="text-plex w-5 h-5" /> Hall of Fame
            </h2>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Podium */}
                {top3.length > 0 && (
                    <div className="lg:col-span-1 flex flex-col justify-center h-full pt-8 lg:pt-0">
                        <div className="flex items-end justify-center gap-2 sm:gap-4">
                            {top3[1] && <div className="flex-1 max-w-[120px]">{renderPodiumCard(top3[1], 2)}</div>}
                            <div className="flex-1 max-w-[140px] z-10">{renderPodiumCard(top3[0], 1)}</div>
                            {top3[2] && <div className="flex-1 max-w-[120px]">{renderPodiumCard(top3[2], 3)}</div>}
                        </div>
                    </div>
                )}

                {/* List */}
                <div className="lg:col-span-2 flex flex-col gap-2 justify-center">
                    {rest.map((user, idx) => {
                        const rank = idx + 4;
                        const delta = getRankDelta(user.id, rank);
                        const pct = Math.max(2, (user.plays / maxPlays) * 100);
                        const hasFire = user.plays >= (maxPlays * 0.4) && user.plays > 0;

                        return (
                            <div key={user.id} onClick={() => isAdmin && onUserClick(user)} className="flex items-center gap-3 sm:gap-4 bg-black/20 p-2 sm:p-3 rounded-lg border border-border/50 cursor-pointer hover:bg-black/40 hover:border-plex/50 transition-colors group relative overflow-hidden">
                                <div className="absolute left-0 top-0 bottom-0 bg-plex/10 animate-[bar-grow_1s_ease-out]" style={{ width: `${pct}%` }}></div>
                                
                                <div className="w-6 text-center font-bold text-muted group-hover:text-text z-10">#{rank}</div>
                                <img src={resolveAvatar(user.thumb, 40, 40)} onError={(e) => { (e.target as HTMLImageElement).src = logoUrl(); }} className="w-8 h-8 rounded-full border border-border z-10 bg-card flex-shrink-0" />
                                
                                <div className="flex-1 flex items-center gap-2 z-10 min-w-0">
                                    <span className="font-bold text-text truncate group-hover:text-plex transition-colors">{user.username}</span>
                                    {hasFire && <span className="text-sm" title="Hot Streak!">🔥</span>}
                                </div>

                                <div className="flex items-center gap-3 z-10 flex-shrink-0">
                                    {delta && (
                                        <div className="w-8 sm:w-10 text-right">
                                            {delta.type === 'new' && <span className="bg-plex/20 text-plex text-[9px] font-bold px-1.5 py-0.5 rounded animate-[rank-up_0.3s_ease-out]">NEW</span>}
                                            {delta.type === 'up' && <span className="text-green-400 text-xs font-bold animate-[rank-up_0.3s_ease-out]">↑{delta.val}</span>}
                                            {delta.type === 'down' && <span className="text-red-400 text-xs font-bold animate-[rank-down_0.3s_ease-out]">↓{delta.val}</span>}
                                        </div>
                                    )}
                                    <div className="w-16 sm:w-20 text-right font-mono text-xs sm:text-sm whitespace-nowrap">
                                        <CountUp end={user.plays} /> <span className="text-muted hidden sm:inline">plays</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export const AnalyticsDashboard: React.FC<{ isAdmin: boolean, sessionInfo: any }> = ({ isAdmin, sessionInfo }) => {
    const [analyticsData, setAnalyticsData] = useState<{
        topUsers: any[],
        topLibraries: any[],
        topMovies: any[],
        topShows: any[],
        topMusic: any[],
        topDevices: any[],
        peakHours: number[],
        totalPlaybacks: number,
        maxConcurrentStreams: number,
        maxDirectPlays: number,
        maxTranscodes: number,
        compare?: {
            previousPeriodDays: string,
            totalPlaybacks: { absolute: number, percent: number | null, previous?: number, current?: number },
            uniqueViewers: { absolute: number, percent: number | null, previous?: number, current?: number },
            libraryPlays: { absolute: number, percent: number | null, previous?: number, current?: number }
        } | null,
        libraryHealth?: {
            activeLibraries: number,
            concentrationPct: number,
            totalCatalogItems: number,
            totalCatalogBytes?: number,
            sizeGB: number,
            fourKPercent: number,
            catalogWatchedPct?: number,
            healthLabel: string,
            movies?: number,
            shows?: number,
            episodes?: number,
            artists?: number,
            albums?: number,
            tracks?: number,
            resolutions?: Record<string, number> | null,
            codecs?: Record<string, number> | null,
            fileSizes?: Record<string, any> | null,
            deltas?: any
        },
        requestedPeriodDays?: string | number,
        cachePeriodDays?: string | number | null,
        cacheFallback?: boolean,
    } | null>(null);
    const [tautulliData, setTautulliData] = useState<{ streamsRecord: number, transcodeRecord: number, directPlayRecord: number, directStreamRecord: number, totalPlays: number, tvPlays: number, moviePlays: number, musicPlays: number, totalTimeStr: string } | null>(null);
    const [isLoading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [days, setDays] = useState<string>('30');
    const [selectedUser, setSelectedUser] = useState<{ id: string, username: string, thumb: string | null } | null>(null);
    const [allUsers, setAllUsers] = useState<any[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [contentTab, setContentTab] = useState<'movies' | 'shows' | 'music'>('movies');
    const [viewerPage, setViewerPage] = useState(1);
    const viewersPerPage = 10;
    const [viewTab, setViewTab] = useState<'overview' | 'graphs'>('overview');
    const mediaServerType = String(sessionInfo?.mediaServerType || 'plex').toLowerCase();
    const isJellyfinPortal = mediaServerType === 'jellyfin';
    const analyticsSourceLabel = isJellyfinPortal ? 'Jellystat' : 'Tautulli';
    const libraryDeltas = (analyticsData?.libraryHealth as any)?.deltas || {};

    const resolveUserAvatar = (thumb: string | null | undefined, width = 80, height = 80) => {
        if (!thumb) return logoUrl();
        if (thumb.startsWith('http://') || thumb.startsWith('https://') || thumb.startsWith('/api/')) {
            return resolvePortalAssetUrl(thumb);
        }
        return portalUrl(`/api/plex/image?path=${encodeURIComponent(thumb)}&width=${width}&height=${height}`);
    };

    useEffect(() => {
        if (!isAdmin) return;
        const fetchUsers = async () => {
            try {
                const usersData = await apiFetch('/api/users');
                setAllUsers(usersData);
            } catch (err) {
                console.error("Failed to fetch users", err);
            }
        };
        fetchUsers();
    }, []);

    useEffect(() => {
        let cancelled = false;
        const fetchAnalytics = async () => {
            setLoading(true);
            setError(null);
            try {
                const data = await apiFetch(`${isJellyfinPortal ? '/api/jellystat/analytics' : '/api/plex/analytics'}?days=${days}`);
                if (cancelled) return;
                setAnalyticsData(data);

                if (isAdmin) {
                    try {
                        const tData = isJellyfinPortal ? data.jellystatInsights : await apiFetch('/api/tautulli/stats');
                        if (cancelled) return;
                        setTautulliData(tData);
                    } catch (e) {
                        // Tautulli/Jellystat might not be configured, ignore the extra panel.
                        if (!cancelled) setTautulliData(null);
                    }
                } else {
                    setTautulliData(null);
                }
            } catch (err: any) {
                if (!cancelled) setError(err.message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        fetchAnalytics();
        return () => { cancelled = true; };
    }, [days, isAdmin, isJellyfinPortal]);

    useEffect(() => {
        if (isJellyfinPortal && viewTab === 'graphs') setViewTab('overview');
    }, [isJellyfinPortal, viewTab]);

    const topUsersLength = analyticsData?.topUsers?.length || 0;
    const totalViewerPages = Math.max(1, Math.ceil(topUsersLength / viewersPerPage));

    useEffect(() => {
        setViewerPage(1);
    }, [days]);

    useEffect(() => {
        if (viewerPage > totalViewerPages) {
            setViewerPage(totalViewerPages);
        }
    }, [viewerPage, totalViewerPages]);

    if (isLoading) return <Loader isLoading={true} />;
    if (error) return <div className="text-red-500 font-bold p-8 text-center">{error}</div>;
    if (!analyticsData) return null;

    const { topUsers, topLibraries, topMovies, topShows, topMusic, topDevices, peakHours, totalPlaybacks, maxConcurrentStreams, maxDirectPlays, maxTranscodes } = analyticsData;
    const uniqueActiveViewers = topUsers.filter((u: any) => (u.plays || 0) > 0).length;
    const maxLibraryPlays = Math.max(...topLibraries.map(l => l.plays), 1);
    const maxDevicePlays = Math.max(...topDevices.map(d => d.plays), 1);
    const maxPeakHour = Math.max(...peakHours, 1);
    const viewerPageSafe = Math.min(viewerPage, totalViewerPages);
    const pagedTopUsers = topUsers.slice((viewerPageSafe - 1) * viewersPerPage, viewerPageSafe * viewersPerPage);

    let activeContent = topMovies;
    if (contentTab === 'shows') activeContent = topShows;
    else if (contentTab === 'music') activeContent = topMusic;
    const compare = analyticsData.compare || null;
    const libraryHealth = analyticsData.libraryHealth || null;

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

            {viewTab === 'graphs' && <TautulliGraphsTab />}

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

                            {libraryHealth.resolutions && libraryHealth.codecs && libraryHealth.fileSizes && (() => {
                                const sortedCodecs = Object.entries(libraryHealth.codecs || {})
                                    .map(([name, count]) => ({ name, count: count as number }))
                                    .sort((a, b) => b.count - a.count);
                                const totalCodecs = sortedCodecs.reduce((sum, item) => sum + item.count, 0) || 1;

                                const sortedResolutions = Object.entries(libraryHealth.resolutions || {})
                                    .map(([name, count]) => ({ name, count: count as number }))
                                    .sort((a, b) => b.count - a.count);
                                const totalResolutions = sortedResolutions.reduce((sum, item) => sum + item.count, 0) || 1;

                                const fileSizeEntries = Object.entries(libraryHealth.fileSizes || {})
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

                                return (
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="glass-card-sm p-5 flex flex-col justify-between">
                                            <div>
                                                <h3 className="text-muted text-xs uppercase tracking-wider font-bold mb-4">Video Codecs</h3>
                                                <div className="flex flex-col gap-3">
                                                    {sortedCodecs.map((item) => {
                                                        const pct = Math.round((item.count / totalCodecs) * 100);
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
                                                    {sortedResolutions.map((item) => {
                                                        const pct = Math.round((item.count / totalResolutions) * 100);
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
                                                {fileSizeEntries.map((item) => {
                                                    const totalHeightPct = (item.total / maxFileSizeCount) * 100;
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
                                );
                            })()}
                        </>
                    )}

                    <div className="w-full">
                        <AnimatedLeaderboard users={topUsers} resolveAvatar={resolveUserAvatar} isAdmin={isAdmin} onUserClick={setSelectedUser as any} />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                        <ServerInsightsWidget 
                            peakHours={analyticsData?.peakHours || []} 
                            tautulliData={tautulliData} 
                            compare={analyticsData?.compare} 
                            analyticsSourceLabel={analyticsSourceLabel}
                        />

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



                        {/* Trending Content Card */}
                        <div className="glass-card-sm p-4 md:p-6 col-span-full">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
                                <h2 className="text-xl font-bold text-text uppercase tracking-wider flex items-center gap-2"><TrendingUp className="text-plex w-5 h-5" /> Trending Content</h2>
                                <div className="flex items-center gap-2 bg-black/30 p-1 rounded-lg border border-border">
                                    <button onClick={() => setContentTab('movies')} className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${contentTab === 'movies' ? 'bg-plex text-black shadow-md' : 'text-muted hover:text-text hover:bg-white/5'}`}>Movies</button>
                                    <button onClick={() => setContentTab('shows')} className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${contentTab === 'shows' ? 'bg-plex text-black shadow-md' : 'text-muted hover:text-text hover:bg-white/5'}`}>TV Shows</button>
                                    <button onClick={() => setContentTab('music')} className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${contentTab === 'music' ? 'bg-plex text-black shadow-md' : 'text-muted hover:text-text hover:bg-white/5'}`}>Music</button>
                                </div>
                            </div>
                            <div className="flex flex-col gap-4">
                                {activeContent.length === 0 ? <p className="text-muted text-sm col-span-full">No data available.</p> : activeContent.slice(0, 10).map((item, idx) => (
                                    <a key={item.key} href={item.plexUrl} target="_blank" rel="noreferrer" className="flex flex-col sm:flex-row bg-black/20 rounded-xl overflow-hidden hover:bg-black/40 transition-all cursor-pointer group hover:ring-1 hover:ring-plex shadow-md">
                                        <div className={`sm:w-32 lg:w-40 flex-shrink-0 relative ${contentTab === 'music' ? 'aspect-square' : 'aspect-[2/3]'}`}>
                                            {item.thumbUrl ? (
                                                <img src={resolvePortalAssetUrl(item.thumbUrl)} alt={item.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center bg-black/40"><Film className="w-8 h-8 opacity-50 text-muted" /></div>
                                            )}
                                            <div className="absolute top-2 left-2 bg-plex text-black font-bold text-xs px-2 py-1 rounded-md shadow-lg drop-shadow-md">#{idx + 1}</div>
                                        </div>
                                        <div className="p-4 sm:p-5 flex flex-col justify-between flex-grow">
                                            <div>
                                                <div className="flex items-start justify-between gap-2 mb-2">
                                                    <h3 className="text-lg sm:text-xl font-bold text-text group-hover:text-plex transition-colors line-clamp-1">{item.title}</h3>
                                                    <div className="flex items-center gap-1 bg-white/10 px-2 py-1 rounded-md text-xs font-mono text-plex flex-shrink-0 whitespace-nowrap shadow-sm">
                                                        <PlaySquare className="w-3 h-3" /> {item.plays} plays
                                                    </div>
                                                </div>
                                                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted mb-3 font-medium">
                                                    {item.year && <span>{item.year}</span>}
                                                    {item.year && (item.contentRating || item.rating || item.duration > 0 || (item.genres && item.genres.length > 0)) && <span className="opacity-50">&bull;</span>}
                                                    {item.contentRating && <span>{item.contentRating}</span>}
                                                    {item.contentRating && (item.rating || item.duration > 0 || (item.genres && item.genres.length > 0)) && <span className="opacity-50">&bull;</span>}
                                                    {item.duration > 0 && <span>{Math.round(item.duration / 60000)} min</span>}
                                                    {item.duration > 0 && item.rating && <span className="opacity-50">&bull;</span>}
                                                    {item.rating && (
                                                        <span className="flex items-center gap-1 text-yellow-500">
                                                            <Star className="w-3 h-3 fill-current" /> {item.rating}
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-sm text-text/80 line-clamp-2 sm:line-clamp-3 mb-3 leading-relaxed">
                                                    {item.summary || "No summary available."}
                                                </p>
                                            </div>
                                            {item.genres && item.genres.length > 0 && (
                                                <div className="flex flex-wrap gap-2 mt-auto">
                                                    {item.genres.slice(0, 4).map((g: string, i: number) => (
                                                        <span key={i} className="text-[10px] uppercase tracking-wider bg-white/5 border border-white/10 text-muted px-2 py-1 rounded-full shadow-sm">{g}</span>
                                                    ))}
                                                    {item.genres.length > 4 && (
                                                        <span className="text-[10px] uppercase tracking-wider bg-white/5 border border-white/10 text-muted px-2 py-1 rounded-full shadow-sm">+{item.genres.length - 4}</span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </a>
                                ))}
                            </div>
                        </div>
                    </div>
                </>
            )}
            {isAdmin && selectedUser && (
                <UserAnalyticsModal
                    userId={selectedUser.id}
                    username={selectedUser.username}
                    thumb={selectedUser.thumb}
                    days={days}
                    onClose={() => setSelectedUser(null)}
                />
            )}
        </div>
    );
};
