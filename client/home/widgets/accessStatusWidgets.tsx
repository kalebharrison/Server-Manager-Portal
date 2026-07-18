import React from 'react';
import { Activity, Calendar, Settings, Shield, Star, Users } from 'lucide-react';
import type { MainGridWidgetId } from '../../shared/dashboardLayout';
import type { MainGridWidgetDeps } from '../userDashboardWidgetTypes';
import type { WidgetRenderContext } from './shared';

export const renderAccessStatusWidget = (
    id: MainGridWidgetId,
    deps: MainGridWidgetDeps,
    ctx: WidgetRenderContext,
): React.ReactNode | undefined => {
    const {
        user,
        isRevoked,
        isExpiringSoon,
        daysLeft,
        progressPct,
        handleRelink,
        onViewAdmin,
        onViewSettings,
        onViewLogs,
    } = deps;
    const { showTempAccessMessage } = ctx;

    switch (id) {
        case 'adminBadge':
            return (
                <div className="glass-card p-4 md:p-5 shadow-xl flex flex-col items-center justify-center text-center flex-shrink-0">
                    <div className="w-14 h-14 md:w-16 md:h-16 bg-plex/10 rounded-full flex items-center justify-center mb-2 md:mb-3 border border-plex/30 shadow-[0_0_15px_rgba(229,160,13,0.15)]">
                        <Shield className="w-7 h-7 md:w-8 md:h-8 text-plex drop-shadow-md" />
                    </div>
                    <h3 className="text-xl md:text-2xl font-black text-text uppercase tracking-widest mb-1">Server Admin</h3>
                    <div className="mt-2 inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[10px] font-black bg-gradient-to-r from-amber-500/20 to-yellow-500/20 border border-amber-500/40 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.25)] tracking-widest uppercase">
                        <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.8)]" /> VIP UNLIMITED
                    </div>
                </div>
            );
        case 'accessStatus':
            if (!user) return null;
            return (
                <div className="glass-card p-4 md:p-5 shadow-xl flex flex-col justify-center flex-shrink-0">
                    <div className="flex flex-col gap-3 md:gap-4">
                        <div>
                            <p className="text-muted text-xs uppercase tracking-widest font-semibold mb-3">Access Status</p>
                            <div className="flex flex-wrap items-center gap-3">
                                <span className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-black border uppercase tracking-wider shadow-sm ${isRevoked ? 'bg-red-500/10 border-red-500/30 text-red-400' : isExpiringSoon ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400' : 'bg-green-500/10 border-green-500/30 text-green-400'}`}>
                                    <span className={`w-2 h-2 rounded-full animate-pulse ${isRevoked ? 'bg-red-400' : isExpiringSoon ? 'bg-yellow-400' : 'bg-green-400'}`} />
                                    {user.plexAccessStatus}{showTempAccessMessage && ' · Temp Access'}
                                </span>
                                {user.expiryDate ? (
                                    <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold bg-white/5 border border-white/10 text-text shadow-sm">
                                        <Calendar size={14} className="text-muted" />
                                        {new Date(user.expiryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-2 px-5 py-2 rounded-full text-[11px] font-black bg-gradient-to-r from-amber-500/20 to-yellow-500/20 border border-amber-500/40 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.25)] tracking-widest uppercase">
                                        <Star className="w-4 h-4 text-amber-400 fill-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.8)]" /> VIP UNLIMITED
                                    </span>
                                )}
                            </div>
                        </div>
                        {isRevoked && daysLeft !== null && daysLeft >= 0 && (
                            <button className="w-full mt-2 px-6 py-2.5 bg-plex text-background rounded-xl font-bold hover:bg-plex-hover transition-colors shadow-lg" onClick={handleRelink}>
                                Re-link Plex Account
                            </button>
                        )}
                        {daysLeft !== null && (
                            <div className="bg-background/40 rounded-xl p-5 border border-white/5 mt-2">
                                <div className="flex justify-between items-baseline mb-3">
                                    <span className="text-muted text-xs uppercase tracking-widest font-semibold">Time Remaining</span>
                                    <span className={`font-black text-3xl md:text-4xl leading-none ${isExpiringSoon ? 'text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.3)]' : 'text-plex drop-shadow-[0_0_8px_rgba(229,160,13,0.3)]'}`}>
                                        {daysLeft}<span className="text-base font-semibold text-muted ml-1.5">{daysLeft === 1 ? 'day' : 'days'}</span>
                                    </span>
                                </div>
                                <div className="w-full h-3 bg-black/40 rounded-full overflow-hidden shadow-inner border border-white/5">
                                    <div className={`h-full rounded-full transition-all duration-1000 relative ${isExpiringSoon ? 'bg-yellow-400' : 'bg-gradient-to-r from-plex via-amber-400 to-orange-500'}`} style={{ width: `${progressPct}%` }}>
                                        <div className="absolute top-0 bottom-0 left-0 right-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.15)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.15)_50%,rgba(255,255,255,0.15)_75%,transparent_75%,transparent)] bg-[length:1rem_1rem] animate-[shimmer_1s_linear_infinite]" />
                                    </div>
                                </div>
                                {isExpiringSoon && <p className="text-yellow-400/90 text-sm font-medium mt-3 flex items-center gap-2">⚠️ Expiring soon — contact admin</p>}
                            </div>
                        )}
                    </div>
                </div>
            );
        case 'tempAccessSetup':
            return (
                <div className="flex items-center gap-3 text-muted text-sm bg-card p-6 rounded-2xl border border-border shadow-lg flex-shrink-0">
                    <div className="w-5 h-5 rounded-full border-2 border-plex border-t-transparent animate-spin flex-shrink-0" />
                    Setting up your 3-Day Temporary Access...
                </div>
            );
        case 'quickActions':
            return (
                <div className="glass-card p-3 md:p-4 shadow-xl flex flex-col flex-shrink-0 justify-center gap-2.5">
                    <p className="text-muted text-xs uppercase tracking-widest font-semibold flex-shrink-0">Quick Actions</p>
                    <div className="grid grid-cols-3 gap-2">
                        <button type="button" onClick={() => onViewAdmin()} className="flex flex-col items-center justify-center gap-1.5 px-2 py-3 rounded-xl font-bold text-[10px] leading-tight text-center transition-all border bg-plex/10 border-plex/30 text-plex hover:bg-plex/20">
                            <Users size={18} />
                            <span>Manage Users</span>
                        </button>
                        <button type="button" onClick={() => onViewSettings?.()} className="flex flex-col items-center justify-center gap-1.5 px-2 py-3 rounded-xl font-bold text-[10px] leading-tight text-center transition-all border bg-white/5 border-white/10 text-text hover:bg-white/10">
                            <Settings size={18} />
                            <span>Settings</span>
                        </button>
                        <button type="button" onClick={() => onViewLogs?.()} className="flex flex-col items-center justify-center gap-1.5 px-2 py-3 rounded-xl font-bold text-[10px] leading-tight text-center transition-all border bg-white/5 border-white/10 text-text hover:bg-white/10">
                            <Activity size={18} />
                            <span>System Logs</span>
                        </button>
                    </div>
                </div>
            );
        default:
            return undefined;
    }
};
