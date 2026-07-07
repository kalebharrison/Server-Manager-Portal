import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, AlertCircle, AlertTriangle, BarChart3, Calendar, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Clapperboard, Clock, Coffee, Compass, Copy, DownloadCloud, Film, HardDrive, Home, Layers, List, LogOut, MonitorSmartphone, Music, PieChart, Play, PlayCircle, PlaySquare, RefreshCw, Search, Settings, Share2, Shield, Sparkles, Star, TrendingUp, Trophy, Tv, Users, X } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart as RechartsPieChart, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from 'recharts';

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

const WrapUpModal: React.FC<{ metric: string; analytics: any; days: number | string; onClose: () => void }> = ({ metric, analytics, days, onClose }) => {
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose]);

    const renderContent = () => {
        switch (metric) {
            case 'Server Rank': {
                const percentile = analytics.totalActiveUsers > 0 ? Math.max(1, Math.round((analytics.leaderboardRank / analytics.totalActiveUsers) * 100)) : 100;
                const progressPct = analytics.totalActiveUsers > 0 ? Math.max(2, 100 - Math.round(((analytics.leaderboardRank - 1) / analytics.totalActiveUsers) * 100)) : 100;
                const neighbourhood: any[] = analytics.leaderboardNeighbourhood || [];
                const myPlays = analytics.myPlaysOnLeaderboard || analytics.totalPlays || 0;
                const userAbove = neighbourhood.find((u: any) => !u.isMe && u.rank < (analytics.leaderboardRank || 999));
                const playsToClimb = userAbove ? (userAbove.plays - myPlays + 1) : null;

                const rankEmoji = (analytics.leaderboardRank === 1) ? '🥇' : (analytics.leaderboardRank === 2) ? '🥈' : (analytics.leaderboardRank === 3) ? '🥉' : '🏆';

                return (
                    <div className="flex flex-col items-center justify-center text-center p-6">
                        <span className="text-5xl mb-3">{rankEmoji}</span>
                        <h2 className="text-3xl font-black text-white mb-1">Rank #{analytics.leaderboardRank || 'Unranked'}</h2>
                        <p className="text-muted mb-5 text-sm">Out of {analytics.totalActiveUsers || 0} active users</p>

                        {/* Progress bar */}
                        <div className="w-full mb-1">
                            <div className="flex justify-between text-[10px] font-black uppercase tracking-widest mb-1.5">
                                <span className="text-gray-500">#1 Top</span>
                                <span className="text-plex">Top {percentile}%</span>
                                <span className="text-gray-500">#{analytics.totalActiveUsers} Last</span>
                            </div>
                            <div className="w-full h-3 bg-black/50 rounded-full overflow-hidden border border-white/10">
                                <div
                                    className="h-full bg-gradient-to-r from-plex via-amber-400 to-orange-400 rounded-full shadow-[0_0_10px_rgba(229,160,13,0.6)] transition-all duration-1000"
                                    style={{ width: `${progressPct}%` }}
                                />
                            </div>
                        </div>

                        {/* Stats row */}
                        <div className="grid grid-cols-2 gap-3 w-full mt-4 mb-4">
                            <div className="bg-gradient-to-b from-white/10 to-white/5 border border-white/10 rounded-xl p-4 flex flex-col items-center shadow-lg">
                                <span className="text-2xl font-black text-white mb-1">{myPlays}</span>
                                <span className="text-[9px] text-muted uppercase tracking-widest font-black">My Streams</span>
                            </div>
                            <div className="bg-gradient-to-b from-plex/20 to-plex/5 border border-plex/30 rounded-xl p-4 flex flex-col items-center shadow-lg relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-16 h-16 bg-plex/20 blur-xl -mr-5 -mt-5 rounded-full" />
                                <span className="text-2xl font-black text-plex mb-1">{percentile}%</span>
                                <span className="text-[9px] text-plex/80 uppercase tracking-widest font-black">Top Percentile</span>
                            </div>
                        </div>

                        {/* Plays to climb */}
                        {playsToClimb !== null && playsToClimb > 0 && (
                            <div className="w-full bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-3 mb-4 text-sm text-blue-300 font-medium">
                                🎯 <strong>{playsToClimb} more stream{playsToClimb !== 1 ? 's' : ''}</strong> to overtake <strong>{userAbove?.username}</strong> (Rank #{userAbove?.rank})
                            </div>
                        )}
                        {playsToClimb === null && analytics.leaderboardRank === 1 && (
                            <div className="w-full bg-plex/10 border border-plex/30 rounded-xl px-4 py-3 mb-4 text-sm text-plex font-medium">
                                👑 You're at the top of the leaderboard!
                            </div>
                        )}

                        {/* Mini leaderboard neighbourhood */}
                        {neighbourhood.length > 0 && (
                            <div className="w-full">
                                <p className="text-left text-xs uppercase tracking-widest font-bold text-muted mb-3 border-b border-white/10 pb-2">Your Leaderboard Position</p>
                                <div className="flex flex-col gap-1.5">
                                    {neighbourhood.map((u: any, i: number) => (
                                        <div key={i} className={`flex items-center justify-between rounded-lg px-3 py-2.5 border transition-all ${u.isMe
                                            ? 'bg-plex/15 border-plex/50 shadow-[0_0_12px_rgba(229,160,13,0.2)]'
                                            : 'bg-white/5 border-white/5'
                                            }`}>
                                            <div className="flex items-center gap-3">
                                                <span className={`font-black text-sm w-8 text-right ${u.isMe ? 'text-plex' : 'text-gray-500'}`}>#{u.rank}</span>
                                                <span className={`font-bold text-sm ${u.isMe ? 'text-white' : 'text-gray-300'}`}>
                                                    {u.isMe ? <span className="inline-flex items-center gap-1.5">{u.username} <span className="text-[9px] text-plex font-black uppercase tracking-widest bg-plex/20 px-1.5 py-0.5 rounded">You</span></span> : u.username}
                                                </span>
                                            </div>
                                            <span className={`text-xs font-black whitespace-nowrap ${u.isMe ? 'text-plex' : 'text-gray-400'}`}>{u.plays} plays</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                );
            }
            case 'Total Streams': {
                const total = analytics.totalPlays || 0;
                const movies = analytics.moviesCount || 0;
                const episodes = analytics.showsCount || 0;
                const tracks = analytics.musicCount || 0;
                const moviePct = total > 0 ? Math.round((movies / total) * 100) : 0;
                const episodePct = total > 0 ? Math.round((episodes / total) * 100) : 0;
                const trackPct = total > 0 ? Math.round((tracks / total) * 100) : 0;
                // Approximate daily average based on current filter
                const filterDays = (days === 'all' || !days) ? 365 : (parseInt(String(days)) || 30);
                const dailyAvg = filterDays > 0 ? (total / filterDays).toFixed(1) : '—';
                const recentItems = (analytics.recentHistory || []).slice(0, 5);

                return (
                    <div className="flex flex-col items-center justify-center text-center p-6">
                        <PlayCircle className="w-14 h-14 text-plex mb-3 drop-shadow-lg" />
                        <h2 className="text-5xl font-black text-white mb-1">{total}</h2>
                        <p className="text-muted uppercase tracking-widest text-xs font-bold mb-5">Total Streams</p>

                        {/* Type breakdown bars */}
                        <div className="w-full flex flex-col gap-3 mb-5">
                            <div>
                                <div className="flex justify-between text-xs font-bold mb-1">
                                    <span className="text-blue-400">🎬 Movies</span>
                                    <span className="text-gray-300">{movies} <span className="text-gray-500">({moviePct}%)</span></span>
                                </div>
                                <div className="w-full h-2 bg-black/50 rounded-full overflow-hidden border border-white/5">
                                    <div className="h-full bg-gradient-to-r from-blue-600 to-blue-400 rounded-full transition-all duration-1000" style={{ width: `${moviePct}%` }} />
                                </div>
                            </div>
                            <div>
                                <div className="flex justify-between text-xs font-bold mb-1">
                                    <span className="text-green-400">📺 Episodes</span>
                                    <span className="text-gray-300">{episodes} <span className="text-gray-500">({episodePct}%)</span></span>
                                </div>
                                <div className="w-full h-2 bg-black/50 rounded-full overflow-hidden border border-white/5">
                                    <div className="h-full bg-gradient-to-r from-green-600 to-green-400 rounded-full transition-all duration-1000" style={{ width: `${episodePct}%` }} />
                                </div>
                            </div>
                            {tracks > 0 && (
                                <div>
                                    <div className="flex justify-between text-xs font-bold mb-1">
                                        <span className="text-purple-400">🎵 Tracks</span>
                                        <span className="text-gray-300">{tracks} <span className="text-gray-500">({trackPct}%)</span></span>
                                    </div>
                                    <div className="w-full h-2 bg-black/50 rounded-full overflow-hidden border border-white/5">
                                        <div className="h-full bg-gradient-to-r from-purple-600 to-purple-400 rounded-full transition-all duration-1000" style={{ width: `${trackPct}%` }} />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Extra stats */}
                        <div className="grid grid-cols-2 gap-3 w-full mb-5">
                            <div className="bg-gradient-to-b from-white/10 to-white/5 border border-white/10 rounded-xl p-4 flex flex-col items-center shadow-lg">
                                <span className="text-2xl font-black text-white mb-1">{dailyAvg}</span>
                                <span className="text-[9px] text-muted uppercase tracking-widest font-black">Per Day</span>
                            </div>
                            <div className="bg-gradient-to-b from-plex/20 to-plex/5 border border-plex/30 rounded-xl p-4 flex flex-col items-center shadow-lg relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-12 h-12 bg-plex/20 blur-xl -mr-4 -mt-4 rounded-full" />
                                <span className="text-2xl font-black text-plex mb-1">{analytics.uniqueTitles || 0}</span>
                                <span className="text-[9px] text-plex/80 uppercase tracking-widest font-black">Unique Titles</span>
                            </div>
                        </div>

                        {/* Recent activity */}
                        {recentItems.length > 0 && (
                            <div className="w-full">
                                <p className="text-left text-xs uppercase tracking-widest font-bold text-muted mb-3 border-b border-white/10 pb-2">Recently Watched</p>
                                <div className="flex flex-col gap-1.5">
                                    {recentItems.map((item: any, i: number) => (
                                        <div key={i} className="flex items-center gap-3 bg-white/5 border border-white/5 rounded-lg px-3 py-2 hover:bg-white/10 transition-colors">
                                            {item.thumbUrl
                                                ? <img src={resolvePortalAssetUrl(item.thumbUrl)} className="w-8 h-8 rounded object-cover flex-shrink-0" />
                                                : <div className="w-8 h-8 rounded bg-white/10 flex-shrink-0" />}
                                            <div className="flex flex-col text-left overflow-hidden">
                                                <span className="font-bold text-sm text-gray-200 truncate">{item.title}</span>
                                                {item.episodeTitle && <span className="text-[10px] text-gray-400 truncate">{item.episodeTitle}</span>}
                                            </div>
                                            <span className="ml-auto text-[10px] text-gray-500 whitespace-nowrap flex-shrink-0">
                                                {new Date(item.viewedAt * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                );
            }
            case 'Top Binge':
                return (
                    <div className="flex flex-col items-center justify-center text-center p-6 relative">
                        {analytics.topBinge?.artUrl || analytics.topBinge?.thumbUrl ? (
                            <div className="w-full h-40 bg-cover bg-center rounded-xl shadow-lg mb-6 border border-white/10 relative overflow-hidden" style={{ backgroundImage: `url('${resolvePortalAssetUrl(analytics.topBinge.artUrl) || 'https://images.unsplash.com/photo-1594909122845-11baa439b7bf?auto=format&fit=crop&q=80&w=600'}')` }}>
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>
                                <div className="absolute bottom-4 left-0 right-0 px-4 flex flex-col items-center">
                                    <h2 className="text-2xl font-black text-white mb-1 line-clamp-1 drop-shadow-md">{analytics.topBinge?.title || 'Nothing yet'}</h2>
                                    <p className="text-plex font-bold drop-shadow-md">{analytics.topBinge?.plays || 0} episodes</p>
                                </div>
                            </div>
                        ) : (
                            <Tv className="w-16 h-16 text-plex mb-6 drop-shadow-lg" />
                        )}

                        {analytics.topBinge?.summary && (
                            <div className="w-full mt-2 mb-4 bg-white/5 border border-white/5 rounded-lg p-4 text-left">
                                <p className="text-gray-300 text-sm leading-relaxed">{analytics.topBinge.summary}</p>
                                {analytics.topBinge.year && <span className="inline-block mt-3 text-xs font-black px-2 py-1 bg-black/40 rounded text-gray-400">{analytics.topBinge.year}</span>}
                            </div>
                        )}

                        {analytics.topShows && analytics.topShows.length > 1 ? (
                            <div className="w-full mt-2">
                                <p className="text-left text-xs uppercase tracking-widest font-bold text-muted mb-3 border-b border-white/10 pb-2">Runner Ups</p>
                                <div className="flex flex-col gap-2">
                                    {analytics.topShows.slice(1).map((show: any, i: number) => (
                                        <div key={i} className="flex items-center justify-between bg-white/5 border border-white/5 rounded-lg p-2 hover:bg-white/10 transition-colors">
                                            <div className="flex items-center gap-3">
                                                <span className="text-gray-500 font-bold w-4 text-right">{i + 2}</span>
                                                {show.thumbUrl ? <img src={resolvePortalAssetUrl(show.thumbUrl)} className="w-8 h-12 object-cover rounded shadow-sm" /> : <div className="w-8 h-12 bg-white/10 rounded"></div>}
                                                <span className="font-bold text-sm text-gray-200 line-clamp-1 text-left">{show.title}</span>
                                            </div>
                                            <span className="text-xs font-black text-plex whitespace-nowrap">{show.plays} eps</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="w-full mt-2 py-6 border border-dashed border-white/10 rounded-xl flex flex-col items-center justify-center opacity-50">
                                <Tv className="w-8 h-8 text-gray-500 mb-2" />
                                <p className="text-sm font-bold text-gray-400">No other shows watched</p>
                            </div>
                        )}
                    </div>
                );
            case 'Top Movie':
                return (
                    <div className="flex flex-col items-center justify-center text-center p-6 relative">
                        {analytics.topMovie?.artUrl || analytics.topMovie?.thumbUrl ? (
                            <div className="w-full h-40 bg-cover bg-center rounded-xl shadow-lg mb-6 border border-white/10 relative overflow-hidden" style={{ backgroundImage: `url('${resolvePortalAssetUrl(analytics.topMovie.artUrl) || 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&q=80&w=600'}')` }}>
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>
                                <div className="absolute bottom-4 left-0 right-0 px-4 flex flex-col items-center">
                                    <h2 className="text-2xl font-black text-white mb-1 line-clamp-1 drop-shadow-md">{analytics.topMovie?.title || 'Nothing yet'}</h2>
                                    <p className="text-plex font-bold drop-shadow-md">{analytics.topMovie?.plays || 0} plays</p>
                                </div>
                            </div>
                        ) : (
                            <Clapperboard className="w-16 h-16 text-plex mb-6 drop-shadow-lg" />
                        )}

                        {analytics.topMovie?.summary && (
                            <div className="w-full mt-2 mb-4 bg-white/5 border border-white/5 rounded-lg p-4 text-left">
                                {analytics.topMovie.tagline && <p className="italic text-plex text-xs mb-2 font-bold">"{analytics.topMovie.tagline}"</p>}
                                <p className="text-gray-300 text-sm leading-relaxed">{analytics.topMovie.summary}</p>
                                {analytics.topMovie.year && <span className="inline-block mt-3 text-xs font-black px-2 py-1 bg-black/40 rounded text-gray-400">{analytics.topMovie.year}</span>}
                            </div>
                        )}

                        {analytics.topMovies && analytics.topMovies.length > 1 ? (
                            <div className="w-full mt-2">
                                <p className="text-left text-xs uppercase tracking-widest font-bold text-muted mb-3 border-b border-white/10 pb-2">Runner Ups</p>
                                <div className="flex flex-col gap-2">
                                    {analytics.topMovies.slice(1).map((movie: any, i: number) => (
                                        <div key={i} className="flex items-center justify-between bg-white/5 border border-white/5 rounded-lg p-2 hover:bg-white/10 transition-colors">
                                            <div className="flex items-center gap-3">
                                                <span className="text-gray-500 font-bold w-4 text-right">{i + 2}</span>
                                                {movie.thumbUrl ? <img src={resolvePortalAssetUrl(movie.thumbUrl)} className="w-8 h-12 object-cover rounded shadow-sm" /> : <div className="w-8 h-12 bg-white/10 rounded"></div>}
                                                <span className="font-bold text-sm text-gray-200 line-clamp-1 text-left">{movie.title}</span>
                                            </div>
                                            <span className="text-xs font-black text-plex whitespace-nowrap">{movie.plays} plays</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="w-full mt-2 py-6 border border-dashed border-white/10 rounded-xl flex flex-col items-center justify-center opacity-50">
                                <Film className="w-8 h-8 text-gray-500 mb-2" />
                                <p className="text-sm font-bold text-gray-400">No other movies watched</p>
                            </div>
                        )}
                    </div>
                );
            case 'Time of Day':
                const maxHour = Math.max(...(analytics.hourDistribution || [0]));
                return (
                    <div className="flex flex-col items-center justify-center text-center p-6">
                        <Clock className="w-16 h-16 text-plex mb-4 drop-shadow-lg" />
                        <h2 className="text-3xl font-black text-white mb-2">{analytics.timeOfDay || 'Unknown'}</h2>
                        <p className="text-muted mb-6">You typically stream around {formatStreamingHour(analytics.peakHour ?? analytics.avgHour)}.</p>

                        <div className="w-full mt-2 mb-6">
                            <p className="text-left text-xs uppercase tracking-widest font-bold text-muted mb-3 border-b border-white/10 pb-2">24-Hour Heat Map</p>
                            <div className="w-full flex items-end justify-between h-24 gap-[2px] mt-4 px-1">
                                {analytics.hourDistribution?.map((count: number, hour: number) => {
                                    const height = maxHour > 0 ? (count / maxHour) * 100 : 0;
                                    const isTop = count === maxHour && count > 0;
                                    return (
                                        <div key={hour} className="flex flex-col items-center justify-end w-full h-full group relative">
                                            <div className={`w-full rounded-t-sm transition-all duration-500 relative flex items-end justify-center overflow-hidden
                                                ${isTop ? 'bg-plex shadow-[0_0_10px_rgba(229,160,13,0.5)]' : 'bg-white/10 group-hover:bg-white/30'}`}
                                                style={{ height: `${Math.max(height, 2)}%` }}>
                                            </div>
                                            {hour % 6 === 0 && <span className="text-[8px] mt-1 font-bold text-muted absolute top-full pointer-events-none">{hour}h</span>}

                                            <div className="absolute bottom-full mb-1 opacity-0 group-hover:opacity-100 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded pointer-events-none whitespace-nowrap z-10 transition-opacity">
                                                {count} plays at {formatStreamingHour(hour)}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>

                        <div className="w-full bg-gradient-to-r from-plex/5 via-plex/10 to-plex/5 border border-plex/20 rounded-xl p-4 shadow-inner mt-4">
                            <p className="text-sm text-plex font-medium">
                                {analytics.timeOfDay === 'Early Bird' ? 'Catching the worm with those morning streams!' :
                                    analytics.timeOfDay === 'Afternoon Watcher' ? 'Perfect way to spend the afternoon.' :
                                        analytics.timeOfDay === 'Evening Streamer' ? 'Unwinding after a long day.' :
                                            'Burning the midnight oil with some late night streaming!'}
                            </p>
                        </div>
                    </div>
                );
            case 'Top Day':
                const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                const maxCount = Math.max(...(analytics.dayOfWeekCounts ? Object.values(analytics.dayOfWeekCounts) as number[] : [0]));
                return (
                    <div className="flex flex-col items-center justify-center text-center p-6">
                        <Calendar className="w-16 h-16 text-plex mb-4 drop-shadow-lg" />
                        <h2 className="text-3xl font-black text-white mb-2">{analytics.popularDay || 'Unknown'}</h2>
                        <p className="text-muted mb-6 uppercase tracking-widest text-xs font-bold">Most Active Day</p>
                        <div className="w-full flex items-end justify-between h-32 gap-1.5 mt-4 px-2">
                            {daysOfWeek.map((day, i) => {
                                const count = analytics.dayOfWeekCounts ? analytics.dayOfWeekCounts[i] : 0;
                                const height = maxCount > 0 ? (count / maxCount) * 100 : 0;
                                const isTop = count === maxCount && count > 0;
                                return (
                                    <div key={day} className="flex flex-col items-center justify-end w-full h-full group relative">
                                        <div className={`w-full rounded-t-md transition-all duration-500 relative flex items-end justify-center pb-1 overflow-hidden
                                            ${isTop ? 'bg-gradient-to-t from-plex/80 to-plex shadow-[0_0_15px_rgba(229,160,13,0.3)]' : 'bg-gradient-to-t from-white/10 to-white/20 group-hover:from-white/20 group-hover:to-white/30'}`}
                                            style={{ height: `${Math.max(height, 8)}%` }}>
                                        </div>
                                        <span className={`text-[9px] mt-2 font-black uppercase tracking-wider ${isTop ? 'text-plex' : 'text-muted'}`}>{day}</span>
                                        <div className="absolute bottom-full mb-1 opacity-0 group-hover:opacity-100 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded pointer-events-none whitespace-nowrap z-10 transition-opacity">
                                            {count} plays
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                );
            case 'Top Library':
                const maxLibPlays = analytics.allLibraries?.[0]?.plays || 1;
                return (
                    <div className="flex flex-col items-center justify-center text-center p-6 max-h-[80vh] overflow-hidden flex-1">
                        <Layers className="w-16 h-16 text-plex mb-4 drop-shadow-lg shrink-0" />
                        <h2 className="text-3xl font-black text-white mb-2 line-clamp-1 shrink-0">{analytics.favoriteLibrary || 'None'}</h2>
                        <p className="text-muted mb-6 uppercase tracking-widest text-xs font-bold shrink-0">Library Breakdown</p>

                        <div className="w-full flex flex-col gap-3 overflow-y-auto pr-2 pb-2 custom-scrollbar">
                            {analytics.allLibraries?.map((lib: any, i: number) => {
                                const percent = (lib.plays / maxLibPlays) * 100;
                                return (
                                    <div key={i} className="flex flex-col gap-1 w-full text-left">
                                        <div className="flex justify-between items-end">
                                            <span className={`font-bold text-sm truncate pr-2 ${i === 0 ? 'text-plex' : 'text-gray-300'}`}>{i + 1}. {lib.title}</span>
                                            <span className={`font-black text-xs whitespace-nowrap ${i === 0 ? 'text-plex' : 'text-gray-400'}`}>{lib.plays} plays</span>
                                        </div>
                                        <div className="w-full bg-black/40 rounded-full h-1.5 overflow-hidden border border-white/5">
                                            <div className={`h-full rounded-full transition-all duration-1000 ${i === 0 ? 'bg-plex shadow-[0_0_8px_rgba(229,160,13,0.8)]' : 'bg-gray-400'}`} style={{ width: `${percent}%` }}></div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                );
            case 'Media Profile': {
                const total = analytics.totalPlays || 1;
                const movies = analytics.moviesCount || 0;
                const shows = analytics.showsCount || 0;
                const music = analytics.musicCount || 0;
                const moviePct = Math.round((movies / total) * 100);
                const showPct = Math.round((shows / total) * 100);
                const musicPct = Math.round((music / total) * 100);

                const topMoviesList: any[] = (analytics.topMovies || []).slice(0, 3);
                const topShowsList: any[] = (analytics.topShows || []).slice(0, 3);

                const profileDesc = analytics.mediaPreference === 'Movie Buff'
                    ? 'You love the big screen experience. Movies are your go-to comfort.'
                    : analytics.mediaPreference === 'TV Show Binger'
                        ? 'You\'re a serial binger — once you start a show, you see it through.'
                        : analytics.mediaPreference === 'Music Lover'
                            ? 'Music is your thing — you\'re always on the listening grind.'
                            : 'You keep things varied. A bit of everything keeps it interesting.';

                return (
                    <div className="flex flex-col items-center justify-center text-center p-6">
                        <PieChart className="w-14 h-14 text-plex mb-3 drop-shadow-lg" />
                        <h2 className="text-3xl font-black text-white mb-1">{analytics.mediaPreference || 'Mixed Bag'}</h2>
                        <p className="text-muted mb-2 uppercase tracking-widest text-xs font-bold">Content Breakdown</p>
                        <p className="text-gray-400 text-sm mb-5 italic">{profileDesc}</p>

                        {/* Breakdown bars with percentages */}
                        <div className="w-full flex flex-col gap-4 mb-5">
                            <div>
                                <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider mb-1.5">
                                    <span className="text-blue-400 flex items-center gap-1.5">🎬 Movies</span>
                                    <span className="text-gray-300">{movies} <span className="text-gray-500 font-normal">({moviePct}%)</span></span>
                                </div>
                                <div className="w-full bg-black/60 rounded-full h-3 overflow-hidden shadow-inner border border-white/5">
                                    <div className="bg-gradient-to-r from-blue-600 to-blue-400 h-full rounded-full shadow-[0_0_10px_rgba(59,130,246,0.5)] transition-all duration-1000" style={{ width: `${moviePct}%` }} />
                                </div>
                            </div>
                            <div>
                                <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider mb-1.5">
                                    <span className="text-green-400 flex items-center gap-1.5">📺 Shows</span>
                                    <span className="text-gray-300">{shows} <span className="text-gray-500 font-normal">({showPct}%)</span></span>
                                </div>
                                <div className="w-full bg-black/60 rounded-full h-3 overflow-hidden shadow-inner border border-white/5">
                                    <div className="bg-gradient-to-r from-green-600 to-green-400 h-full rounded-full shadow-[0_0_10px_rgba(34,197,94,0.5)] transition-all duration-1000" style={{ width: `${showPct}%` }} />
                                </div>
                            </div>
                            {music > 0 && (
                                <div>
                                    <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider mb-1.5">
                                        <span className="text-purple-400 flex items-center gap-1.5">🎵 Music</span>
                                        <span className="text-gray-300">{music} <span className="text-gray-500 font-normal">({musicPct}%)</span></span>
                                    </div>
                                    <div className="w-full bg-black/60 rounded-full h-3 overflow-hidden shadow-inner border border-white/5">
                                        <div className="bg-gradient-to-r from-purple-600 to-purple-400 h-full rounded-full shadow-[0_0_10px_rgba(168,85,247,0.5)] transition-all duration-1000" style={{ width: `${musicPct}%` }} />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Top picks per category */}
                        {(topMoviesList.length > 0 || topShowsList.length > 0) && (
                            <div className="w-full">
                                <p className="text-left text-xs uppercase tracking-widest font-bold text-muted mb-3 border-b border-white/10 pb-2">Top Picks This Period</p>
                                <div className="flex flex-col gap-2">
                                    {topMoviesList.length > 0 && (
                                        <>
                                            <p className="text-left text-[9px] text-blue-400 font-black uppercase tracking-widest mt-1">🎬 Movies</p>
                                            {topMoviesList.map((m: any, i: number) => (
                                                <div key={i} className="flex items-center gap-3 bg-white/5 border border-white/5 rounded-lg p-2 hover:bg-white/10 transition-colors">
                                                    <span className="text-gray-500 font-black text-xs w-4 text-right flex-shrink-0">{i + 1}</span>
                                                    {m.thumbUrl
                                                        ? <img src={resolvePortalAssetUrl(m.thumbUrl)} className="w-8 h-12 object-cover rounded shadow-sm flex-shrink-0" />
                                                        : <div className="w-8 h-12 bg-white/10 rounded flex-shrink-0" />}
                                                    <div className="flex flex-col text-left overflow-hidden">
                                                        <span className="font-bold text-sm text-gray-200 truncate">{m.title}</span>
                                                        <span className="text-[10px] text-gray-400">{m.plays} play{m.plays !== 1 ? 's' : ''}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </>
                                    )}
                                    {topShowsList.length > 0 && (
                                        <>
                                            <p className="text-left text-[9px] text-green-400 font-black uppercase tracking-widest mt-2">📺 Shows</p>
                                            {topShowsList.map((s: any, i: number) => (
                                                <div key={i} className="flex items-center gap-3 bg-white/5 border border-white/5 rounded-lg p-2 hover:bg-white/10 transition-colors">
                                                    <span className="text-gray-500 font-black text-xs w-4 text-right flex-shrink-0">{i + 1}</span>
                                                    {s.thumbUrl
                                                        ? <img src={resolvePortalAssetUrl(s.thumbUrl)} className="w-8 h-12 object-cover rounded shadow-sm flex-shrink-0" />
                                                        : <div className="w-8 h-12 bg-white/10 rounded flex-shrink-0" />}
                                                    <div className="flex flex-col text-left overflow-hidden">
                                                        <span className="font-bold text-sm text-gray-200 truncate">{s.title}</span>
                                                        <span className="text-[10px] text-gray-400">{s.plays} episode{s.plays !== 1 ? 's' : ''}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                );
            }
            case 'Watch Style':
                const discoveryPlays = analytics.uniqueTitles || 0;
                const rewatchPlays = Math.max(0, (analytics.totalPlays || 0) - discoveryPlays);
                return (
                    <div className="flex flex-col items-center justify-center text-center p-6">
                        <Compass className="w-16 h-16 text-plex mb-4 drop-shadow-lg" />
                        <h2 className="text-3xl font-black text-white mb-2">{analytics.watchStyle || 'Unknown'}</h2>
                        <p className="text-muted mb-6 uppercase tracking-widest text-xs font-bold">Discovery vs Rewatch</p>

                        <div className="w-full relative h-4 rounded-full overflow-hidden flex shadow-inner bg-black/50 border border-white/10 mb-2 mt-2">
                            <div className="h-full bg-gradient-to-r from-plex to-orange-400 flex items-center justify-center transition-all duration-1000 shadow-[inset_0_0_20px_rgba(0,0,0,0.3)] relative overflow-hidden" style={{ width: `${((discoveryPlays) / Math.max(analytics.totalPlays || 1, 1)) * 100}%` }}>
                            </div>
                            <div className="h-full bg-gradient-to-r from-blue-600 to-blue-400 flex items-center justify-center transition-all duration-1000 shadow-[inset_0_0_20px_rgba(0,0,0,0.3)] relative overflow-hidden" style={{ width: `${((rewatchPlays) / Math.max(analytics.totalPlays || 1, 1)) * 100}%` }}>
                            </div>
                        </div>
                        <div className="flex justify-between w-full px-2 mb-6 text-[10px] font-black uppercase tracking-wider">
                            <span className="text-plex">{discoveryPlays} New</span>
                            <span className="text-blue-400">{rewatchPlays} Rewatches</span>
                        </div>

                        <div className="grid grid-cols-2 gap-4 w-full mb-6">
                            <div className="bg-gradient-to-b from-white/10 to-white/5 border border-white/10 rounded-xl p-4 flex flex-col items-center justify-center shadow-lg">
                                <span className="text-3xl font-black text-white mb-1 drop-shadow">{analytics.totalPlays || 0}</span>
                                <span className="text-[9px] text-muted uppercase tracking-widest font-black">Total Plays</span>
                            </div>
                            <div className="bg-gradient-to-b from-plex/20 to-plex/5 border border-plex/30 rounded-xl p-4 flex flex-col items-center justify-center shadow-lg relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-16 h-16 bg-plex/20 blur-xl -mr-5 -mt-5 rounded-full"></div>
                                <span className="text-3xl font-black text-plex mb-1 drop-shadow-md">{analytics.uniqueTitles || 0}</span>
                                <span className="text-[9px] text-plex/80 uppercase tracking-widest font-black">Unique Titles</span>
                            </div>
                        </div>

                        <p className="text-sm text-gray-300 italic bg-white/5 border border-white/10 rounded-lg px-4 py-3 w-full shadow-inner mb-4">
                            {analytics.watchStyle === 'Comfort Binger' ? 'You love returning to your favorite comfort shows.' :
                                analytics.watchStyle === 'Loyal Fan' ? 'You stick around to finish what you start.' :
                                    'You love exploring a wide variety of different content!'}
                        </p>

                        {analytics.topWatched && analytics.topWatched.filter((c: any) => c.plays > 1).length > 0 && (
                            <div className="w-full mt-2">
                                <p className="text-left text-xs uppercase tracking-widest font-bold text-muted mb-3 border-b border-white/10 pb-2">Top Obsessions</p>
                                <div className="flex flex-col gap-2">
                                    {analytics.topWatched.filter((c: any) => c.plays > 1).slice(0, 5).map((item: any, i: number) => (
                                        <div key={i} className="flex items-center justify-between bg-white/5 border border-white/5 rounded-lg p-2 hover:bg-white/10 transition-colors">
                                            <div className="flex items-center gap-3">
                                                <span className="text-gray-500 font-bold w-4 text-right">{i + 1}</span>
                                                {item.thumbUrl ? <img src={resolvePortalAssetUrl(item.thumbUrl)} className="w-8 h-12 object-cover rounded shadow-sm" /> : <div className="w-8 h-12 bg-white/10 rounded"></div>}
                                                <div className="flex flex-col text-left">
                                                    <span className="font-bold text-sm text-gray-200 line-clamp-1">{item.title}</span>
                                                    <span className="text-[10px] text-gray-400 font-bold tracking-widest uppercase">{item.type}</span>
                                                </div>
                                            </div>
                                            <span className="text-xs font-black text-plex whitespace-nowrap">{item.plays} plays</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                );
            case 'Streaming Habit':
                const avgWd = (analytics.weekdayPlays || 0) / 5;
                const avgWe = (analytics.weekendPlays || 0) / 2;
                return (
                    <div className="flex flex-col items-center justify-center text-center p-6">
                        <Coffee className="w-16 h-16 text-plex mb-4 drop-shadow-lg" />
                        <h2 className="text-3xl font-black text-white mb-2">{analytics.streamingHabit || 'Unknown'}</h2>
                        <p className="text-muted mb-8 uppercase tracking-widest text-xs font-bold">Weekday vs Weekend</p>

                        <div className="w-full relative h-16 rounded-2xl overflow-hidden flex shadow-inner bg-black/50 border border-white/10">
                            <div className="h-full bg-gradient-to-r from-blue-600 to-blue-400 flex items-center justify-center transition-all duration-1000 shadow-[inset_0_0_20px_rgba(0,0,0,0.3)] relative overflow-hidden group" style={{ width: `${((analytics.weekdayPlays || 0) / Math.max(analytics.totalPlays || 1, 1)) * 100}%` }}>
                                {analytics.weekdayPlays > 0 && <span className="text-white font-black drop-shadow-md z-10 text-sm">WD</span>}
                            </div>
                            <div className="h-full bg-gradient-to-r from-plex to-orange-400 flex items-center justify-center transition-all duration-1000 shadow-[inset_0_0_20px_rgba(0,0,0,0.3)] relative overflow-hidden group" style={{ width: `${((analytics.weekendPlays || 0) / Math.max(analytics.totalPlays || 1, 1)) * 100}%` }}>
                                {analytics.weekendPlays > 0 && <span className="text-white font-black drop-shadow-md z-10 text-sm">WE</span>}
                            </div>
                        </div>
                        <div className="flex justify-between w-full mt-3 px-2">
                            <div className="flex flex-col items-start">
                                <span className="text-[10px] uppercase tracking-widest font-bold text-blue-400">Weekdays (5 days)</span>
                                <span className="text-lg font-black text-white">{analytics.weekdayPlays || 0} <span className="text-[10px] text-gray-500 font-normal">({avgWd.toFixed(1)}/day)</span></span>
                            </div>
                            <div className="flex flex-col items-end">
                                <span className="text-[10px] uppercase tracking-widest font-bold text-plex">Weekends (2 days)</span>
                                <span className="text-lg font-black text-white">{analytics.weekendPlays || 0} <span className="text-[10px] text-gray-500 font-normal">({avgWe.toFixed(1)}/day)</span></span>
                            </div>
                        </div>
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity" onClick={onClose} />
            <div className="relative bg-gradient-to-b from-card to-background border border-border/80 shadow-[0_0_50px_rgba(0,0,0,0.5)] rounded-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-plex/0 via-plex to-plex/0 opacity-50"></div>
                <button onClick={onClose} className="absolute top-4 right-4 text-muted hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-full p-2 transition-all z-20 group">
                    <X className="w-4 h-4 group-hover:rotate-90 transition-transform duration-300" />
                </button>
                {renderContent()}
            </div>
        </div>
    );
};

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
