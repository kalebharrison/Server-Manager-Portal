import React, { useCallback, useEffect, useState } from 'react';
import { Activity, Film, Music, Sparkles, Tv } from 'lucide-react';

import { apiFetch } from '../shared/api';
import { portalUrl } from '../shared/basePath';
import { useVisibleInterval } from '../shared/useVisibleInterval';

export const PublicUptimeBanner: React.FC = () => {
    const [healthData, setHealthData] = useState<Record<string, any>>({});
    const [config, setConfig] = useState<any>({});

    const fetchStatus = useCallback(async () => {
        try {
            const res = await apiFetch('/api/status');
            setConfig(res.config);
            setHealthData(res.healthData);
        } catch (e) { }
    }, []);

    useEffect(() => {
        fetchStatus();
    }, [fetchStatus]);
    useVisibleInterval(fetchStatus, 15000);

    if (!config.services?.length) return null;

    const visibleServices = config.services.filter((service: any) => healthData[service.id]);
    if (visibleServices.length === 0) return null;

    return (
        <div className="rounded-2xl border border-white/10 bg-card/40 backdrop-blur-xl px-4 py-5 sm:px-6 w-full">
            <div className="w-full flex flex-col">
                <div className="flex flex-col items-center text-center mb-4">
                    <a href={portalUrl('/status')} className="text-plex hover:text-plex-hover font-bold text-[10px] tracking-[0.16em] uppercase mb-1.5 transition-colors">
                        View Full Status Page &rarr;
                    </a>
                    <h3 className="text-text font-bold uppercase tracking-[0.14em] text-xs">Live System Status</h3>
                </div>
                <div className="flex flex-wrap justify-center gap-2 sm:gap-3 w-full">
                    {visibleServices.map((service: any) => {
                        const health = healthData[service.id];
                        const isUp = health.currentStatus === 'online';
                        const colorClass = isUp ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-red-500/30 bg-red-500/10';
                        const dotClass = isUp ? 'bg-emerald-500 shadow-[0_0_8px_rgba(52,211,153,0.6)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]';

                        return (
                            <div key={service.id} className={`inline-flex items-center gap-1.5 sm:gap-2.5 px-2.5 py-1.5 sm:px-4 sm:py-2.5 rounded-lg sm:rounded-xl border ${colorClass} backdrop-blur-sm`}>
                                <span className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full shrink-0 ${dotClass}`} />
                                <span className="text-[11px] sm:text-sm font-bold text-text leading-tight">{service.name}</span>
                                <span className="text-[10px] sm:text-xs font-bold text-muted tabular-nums">{health.uptimePercentage}%</span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export const LivePlexStats: React.FC = () => {
    const [stats, setStats] = useState<{ movies: number, shows: number, music: number, fourKPercent?: number } | null>(null);

    const fetchStats = useCallback(async () => {
        const endpoints = ['/api/public/plex/stats', '/api/plex/stats'];

        for (const endpoint of endpoints) {
            try {
                const res = await apiFetch(endpoint, { cacheTtlMs: 15000 });
                if (res && typeof res.movies === 'number' && typeof res.shows === 'number' && typeof res.music === 'number') {
                    setStats(res);
                    return;
                }
            } catch (e) {
                // Try next endpoint
            }
        }
    }, []);

    useEffect(() => {
        fetchStats();
    }, [fetchStats]);
    useVisibleInterval(fetchStats, 30000);

    if (!stats) return (
        <div className="w-full grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
                { icon: Film, label: 'Movies & TV', desc: 'Massive library' },
                { icon: Music, label: 'Music', desc: 'Thousands of albums' },
                { icon: Sparkles, label: 'Requests', desc: 'Automated system' },
            ].map(({ icon: Icon, label, desc }) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-transparent p-4 flex flex-col items-center text-center gap-2 animate-pulse">
                    <Icon className="w-5 h-5 text-plex/60" />
                    <span className="text-xs font-bold text-muted uppercase tracking-wider">{label}</span>
                    <span className="text-[11px] text-muted/70">{desc}</span>
                </div>
            ))}
        </div>
    );

    const statCardClass = 'section-card p-4 flex flex-col items-center justify-center gap-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]';

    return (
        <div className="w-full flex flex-col">
            <div className="inline-flex self-center items-center gap-2 px-3 py-1 rounded-full bg-plex/10 border border-plex/25 text-plex text-[10px] font-bold uppercase tracking-[0.14em] mb-4">
                <Activity className="w-3 h-3" /> Live Library Stats
            </div>
            <div className={`grid gap-3 w-full ${stats.music > 0 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                <div className={statCardClass}>
                    <Film className="w-5 h-5 text-plex mb-0.5" />
                    <span className="text-plex font-black text-xl tabular-nums">{stats.movies.toLocaleString()}</span>
                    <span className="text-muted text-[10px] uppercase tracking-[0.12em] font-bold">Movies</span>
                </div>
                <div className={statCardClass}>
                    <Tv className="w-5 h-5 text-plex mb-0.5" />
                    <span className="text-plex font-black text-xl tabular-nums">{stats.shows.toLocaleString()}</span>
                    <span className="text-muted text-[10px] uppercase tracking-[0.12em] font-bold">TV Shows</span>
                </div>
                {stats.music > 0 && (
                    <div className={statCardClass}>
                        <Music className="w-5 h-5 text-plex mb-0.5" />
                        <span className="text-plex font-black text-xl tabular-nums">{stats.music.toLocaleString()}</span>
                        <span className="text-muted text-[10px] uppercase tracking-[0.12em] font-bold">Artists</span>
                    </div>
                )}
            </div>
            <div className="w-full mt-3">
                <div className={statCardClass + ' py-3.5'}>
                    <span className="text-plex font-black text-lg flex items-center gap-2 tabular-nums">
                        <Sparkles className="w-4 h-4 text-amber-400" />
                        {stats.fourKPercent !== undefined ? stats.fourKPercent : 30}%
                    </span>
                    <span className="text-muted text-[10px] uppercase tracking-[0.12em] font-bold">Available in 4K</span>
                </div>
            </div>
        </div>
    );
};
