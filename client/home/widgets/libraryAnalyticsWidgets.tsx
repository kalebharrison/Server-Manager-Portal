import React from 'react';
import { Activity, Film, Layers, Music, Tv } from 'lucide-react';
import { PeriodDropdown } from '../../shared/PeriodDropdown';
import type { MainGridWidgetId } from '../../shared/dashboardLayout';
import type { MainGridWidgetDeps } from '../userDashboardWidgetTypes';
import { formatBytes, type WidgetRenderContext } from './shared';

export const renderLibraryAnalyticsWidget = (
    id: MainGridWidgetId,
    deps: MainGridWidgetDeps,
    ctx: WidgetRenderContext,
): React.ReactNode | undefined => {
    const {
        sessionInfo,
        user,
        serverStats,
        serverDataLoading,
        analytics,
        analyticsLoading,
        analyticsDays,
        analyticsDaysOpen,
        setAnalyticsDays,
        setAnalyticsDaysOpen,
        RebuildLibraryCacheButton,
    } = deps;
    const { isJellyfinPortal, analyticsDaysOptions } = ctx;

    switch (id) {
        case 'libraryStats':
            if (serverDataLoading && !serverStats) return null;
            if (isJellyfinPortal) {
                return (
                    <div className="glass-card p-4 md:p-5 shadow-xl flex flex-col justify-center flex-shrink-0">
                        <div className="flex items-center justify-between mb-3 md:mb-4">
                            <p className="text-muted text-sm uppercase tracking-widest font-semibold">Jellyfin Library</p>
                        </div>
                        {serverStats ? (
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 md:gap-3">
                                <div className="bg-background/60 p-3 md:p-4 rounded-2xl border border-white/5 flex flex-col items-center justify-center text-center shadow-inner hover:bg-background/80 transition-colors">
                                    <Film className="w-7 h-7 text-plex mb-2 opacity-80" />
                                    <span className="text-3xl font-black text-text drop-shadow-md mb-1">{serverStats.movies?.toLocaleString?.() || 0}</span>
                                    <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-muted">Movies</span>
                                </div>
                                <div className="bg-background/60 p-3 md:p-4 rounded-2xl border border-white/5 flex flex-col items-center justify-center text-center shadow-inner hover:bg-background/80 transition-colors">
                                    <Tv className="w-7 h-7 text-plex mb-2 opacity-80" />
                                    <span className="text-3xl font-black text-text drop-shadow-md mb-1">{serverStats.shows?.toLocaleString?.() || 0}</span>
                                    <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-muted">{serverStats.episodes?.toLocaleString?.() || 0} Episodes</span>
                                </div>
                                <div className="bg-background/60 p-3 md:p-4 rounded-2xl border border-white/5 flex flex-col items-center justify-center text-center shadow-inner hover:bg-background/80 transition-colors">
                                    <Layers className="w-7 h-7 text-plex mb-2 opacity-80" />
                                    <span className="text-3xl font-black text-text drop-shadow-md mb-1">{formatBytes(serverStats.totalCatalogBytes || 0)}</span>
                                    <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-muted">Catalog Size</span>
                                </div>
                            </div>
                        ) : (
                            <div className="text-muted text-sm bg-background/50 p-4 rounded-xl border border-white/5">Could not load Jellyfin library statistics at this time.</div>
                        )}
                    </div>
                );
            }
            return (
                <div className="glass-card p-4 md:p-5 shadow-xl flex flex-col justify-center flex-shrink-0">
                    <div className="flex items-center justify-between mb-3 md:mb-4">
                        <p className="text-muted text-sm uppercase tracking-widest font-semibold">Server Library Size</p>
                        {sessionInfo.session.isAdmin && <RebuildLibraryCacheButton />}
                    </div>
                    {serverStats?.isBuilding ? (
                        <div className="flex flex-col gap-2">
                            <div className="flex gap-3 items-center text-muted"><div className="w-5 h-5 rounded-full border-2 border-plex border-t-transparent animate-spin" /> Building library size cache in background...</div>
                            <p className="text-xs text-muted/60">This runs once and may take a few minutes for large libraries. The page will auto-update when ready.</p>
                        </div>
                    ) : serverStats ? (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 md:gap-3">
                            <div className="bg-background/60 p-3 md:p-4 rounded-2xl border border-white/5 flex flex-col items-center justify-center text-center shadow-inner hover:bg-background/80 transition-colors">
                                <Film className="w-7 h-7 text-plex mb-2 opacity-80" />
                                <span className="text-3xl font-black text-text drop-shadow-md mb-1">{formatBytes(serverStats.moviesBytes)}</span>
                                <div className="flex items-center gap-1.5 text-[10px] sm:text-xs font-bold uppercase tracking-wider mt-1">
                                    <span className="text-plex">{serverStats.movies?.toLocaleString() || 0}</span>
                                    <span className="text-muted">Movies</span>
                                </div>
                            </div>
                            <div className="bg-background/60 p-3 md:p-4 rounded-2xl border border-white/5 flex flex-col items-center justify-center text-center shadow-inner hover:bg-background/80 transition-colors">
                                <Tv className="w-7 h-7 text-plex mb-2 opacity-80" />
                                <span className="text-3xl font-black text-text drop-shadow-md mb-1">{formatBytes(serverStats.showsBytes)}</span>
                                <div className="flex items-center gap-1.5 text-[10px] sm:text-xs font-bold uppercase tracking-wider mt-1">
                                    <span className="text-plex">{serverStats.shows?.toLocaleString() || 0}</span>
                                    <span className="text-muted">Shows</span>
                                </div>
                            </div>
                            <div className="bg-background/60 p-3 md:p-4 rounded-2xl border border-white/5 flex flex-col items-center justify-center text-center shadow-inner hover:bg-background/80 transition-colors">
                                <Music className="w-7 h-7 text-plex mb-2 opacity-80" />
                                <span className="text-3xl font-black text-text drop-shadow-md mb-1">{formatBytes(serverStats.musicBytes)}</span>
                                <div className="flex items-center gap-1.5 text-[10px] sm:text-xs font-bold uppercase tracking-wider mt-1">
                                    <span className="text-plex">{serverStats.music?.toLocaleString() || 0}</span>
                                    <span className="text-muted">Albums</span>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="text-muted text-sm bg-background/50 p-4 rounded-xl border border-white/5">Could not load server statistics at this time.</div>
                    )}
                </div>
            );
        case 'analytics':
            if (!sessionInfo.session.isAdmin && !user) return null;
            if (analyticsLoading && !analytics) return null;
            if (isJellyfinPortal) {
                return (
                    <div className="glass-card p-3 md:p-4 shadow-xl flex flex-col flex-1 min-h-0">
                        <div className="flex items-center justify-between flex-shrink-0">
                            <h2 className="text-lg md:text-xl font-bold text-text flex items-center gap-2">
                                <Activity className="w-5 h-5 text-plex" /> Server Activity
                            </h2>
                            <PeriodDropdown
                                value={analyticsDays}
                                open={analyticsDaysOpen}
                                onToggle={() => setAnalyticsDaysOpen(!analyticsDaysOpen)}
                                onClose={() => setAnalyticsDaysOpen(false)}
                                onChange={(value) => setAnalyticsDays(value as number | 'all')}
                                options={analyticsDaysOptions}
                            />
                        </div>
                        {analytics && analytics.totalPlays > 0 ? (
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mt-4">
                                <div className="bg-background/60 rounded-xl border border-white/5 p-3">
                                    <p className="text-[10px] text-muted uppercase tracking-widest font-bold">Total Plays</p>
                                    <p className="text-2xl font-black text-text mt-1">{analytics.totalPlays?.toLocaleString?.() || 0}</p>
                                </div>
                                <div className="bg-background/60 rounded-xl border border-white/5 p-3">
                                    <p className="text-[10px] text-muted uppercase tracking-widest font-bold">Top Library</p>
                                    <p className="text-sm font-bold text-text mt-1 truncate">{analytics.favoriteLibrary || 'None'}</p>
                                </div>
                                <div className="bg-background/60 rounded-xl border border-white/5 p-3">
                                    <p className="text-[10px] text-muted uppercase tracking-widest font-bold">Top Movie</p>
                                    <p className="text-sm font-bold text-text mt-1 truncate">{analytics.topMovie?.title || 'None'}</p>
                                </div>
                                <div className="bg-background/60 rounded-xl border border-white/5 p-3">
                                    <p className="text-[10px] text-muted uppercase tracking-widest font-bold">Top Show</p>
                                    <p className="text-sm font-bold text-text mt-1 truncate">{analytics.topBinge?.title || 'None'}</p>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center p-4 md:p-5 text-center flex-1 min-h-0 mt-2 md:mt-3">
                                <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-3 text-xl shadow-inner">🍿</div>
                                <h3 className="font-bold text-text mb-1">No activity yet</h3>
                                <p className="text-muted text-sm max-w-sm">Once playback is recorded, your server activity summary will appear right here.</p>
                            </div>
                        )}
                    </div>
                );
            }
            return (
                <div className="glass-card p-3 md:p-4 shadow-xl flex flex-col flex-1 min-h-0">
                    <div className="flex items-center justify-between flex-shrink-0">
                        <h2 className="text-lg md:text-xl font-bold text-text flex items-center gap-2">
                            <Activity className="w-5 h-5 text-plex" /> Your Analytics
                        </h2>
                        <PeriodDropdown
                            value={analyticsDays}
                            open={analyticsDaysOpen}
                            onToggle={() => setAnalyticsDaysOpen(!analyticsDaysOpen)}
                            onClose={() => setAnalyticsDaysOpen(false)}
                            onChange={(value) => setAnalyticsDays(value as number | 'all')}
                            options={analyticsDaysOptions}
                        />
                    </div>
                    {!analyticsLoading && analytics && analytics.totalPlays === 0 && (
                        <div className="flex flex-col items-center justify-center p-4 md:p-5 text-center flex-1 min-h-0 mt-2 md:mt-3">
                            <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-3 text-xl shadow-inner">🍿</div>
                            <h3 className="font-bold text-text mb-1">No watch history yet</h3>
                            <p className="text-muted text-sm max-w-sm">Once you start watching content on the server, your personal watch stats and history will appear right here!</p>
                        </div>
                    )}
                </div>
            );
        default:
            return undefined;
    }
};
