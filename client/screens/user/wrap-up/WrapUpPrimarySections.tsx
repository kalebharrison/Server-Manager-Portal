import { memo } from 'react';
import { PlayCircle } from 'lucide-react';

import { resolvePortalAssetUrl } from '../../../shared/basePath';
import type { WrapUpAnalyticsSectionProps, WrapUpSectionProps } from './types';

export const ServerRankSection = memo(function ServerRankSection({ analytics }: WrapUpAnalyticsSectionProps) {
    const percentile = analytics.totalActiveUsers > 0 ? Math.max(1, Math.round((analytics.leaderboardRank / analytics.totalActiveUsers) * 100)) : 100;
    const progressPct = analytics.totalActiveUsers > 0 ? Math.max(2, 100 - Math.round(((analytics.leaderboardRank - 1) / analytics.totalActiveUsers) * 100)) : 100;
    const neighbourhood: any[] = analytics.leaderboardNeighbourhood || [];
    const myPlays = analytics.myPlaysOnLeaderboard || analytics.totalPlays || 0;
    const userAbove = neighbourhood.find((u: any) => !u.isMe && u.rank < (analytics.leaderboardRank || 999));
    const playsToClimb = userAbove ? (userAbove.plays - myPlays + 1) : null;
    const rankEmoji = analytics.leaderboardRank === 1 ? '🥇' : analytics.leaderboardRank === 2 ? '🥈' : analytics.leaderboardRank === 3 ? '🥉' : '🏆';

    return (
        <div className="flex flex-col items-center justify-center text-center p-6">
            <span className="text-5xl mb-3">{rankEmoji}</span>
            <h2 className="text-3xl font-black text-white mb-1">Rank #{analytics.leaderboardRank || 'Unranked'}</h2>
            <p className="text-muted mb-5 text-sm">Out of {analytics.totalActiveUsers || 0} active users</p>

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
});

export const TotalStreamsSection = memo(function TotalStreamsSection({ analytics, days }: WrapUpSectionProps) {
    const total = analytics.totalPlays || 0;
    const movies = analytics.moviesCount || 0;
    const episodes = analytics.showsCount || 0;
    const tracks = analytics.musicCount || 0;
    const moviePct = total > 0 ? Math.round((movies / total) * 100) : 0;
    const episodePct = total > 0 ? Math.round((episodes / total) * 100) : 0;
    const trackPct = total > 0 ? Math.round((tracks / total) * 100) : 0;
    const filterDays = (days === 'all' || !days) ? 365 : (parseInt(String(days)) || 30);
    const dailyAvg = filterDays > 0 ? (total / filterDays).toFixed(1) : '—';
    const recentItems = (analytics.recentHistory || []).slice(0, 5);

    return (
        <div className="flex flex-col items-center justify-center text-center p-6">
            <PlayCircle className="w-14 h-14 text-plex mb-3 drop-shadow-lg" />
            <h2 className="text-5xl font-black text-white mb-1">{total}</h2>
            <p className="text-muted uppercase tracking-widest text-xs font-bold mb-5">Total Streams</p>

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
});
