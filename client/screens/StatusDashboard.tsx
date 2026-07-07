import React, { useCallback, useEffect, useState } from 'react';
import { Activity, AlertCircle } from 'lucide-react';

import { apiFetch } from '../shared/api';
import { Loader } from '../shared/toast';

export const StatusDashboard: React.FC<{ onBack: () => void, isAdmin: boolean, isPublic?: boolean }> = ({ onBack, isAdmin, isPublic }) => {
    const [statusData, setStatusData] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);
    const [activeTab, setActiveTab] = useState<'overview' | 'history' | 'analytics'>('overview');

    const fetchStatus = useCallback(async () => {
        try {
            const data = await apiFetch('/api/status', { cacheTtlMs: 2000 });
            setStatusData(data);
            setHasError(false);
        } catch (e) {
            console.error(e);
            setHasError(true);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStatus();
        const interval = setInterval(fetchStatus, 15000);
        return () => clearInterval(interval);
    }, [fetchStatus]);

    if (isLoading || !statusData) {
        return (
            <div className="w-full max-w-4xl mx-auto flex flex-col items-center justify-center">
                <header className="flex items-center gap-4 w-full mb-8 pb-4 border-b border-border">
                    {isPublic && (
                        <button onClick={onBack} className="p-2 bg-white/5 hover:bg-white/10 rounded-full transition-colors flex items-center justify-center text-muted hover:text-text">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                        </button>
                    )}
                    <h2 className="text-2xl font-bold text-text">Server Status</h2>
                </header>
                {!isLoading && hasError ? (
                    <div className="w-full bg-red-500/10 border border-red-500 text-red-400 p-6 rounded-xl flex flex-col items-center gap-3 mt-4">
                        <AlertCircle className="w-8 h-8" />
                        <p className="font-semibold">Failed to load server status.</p>
                        <button onClick={() => { setIsLoading(true); fetchStatus(); }} className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-text text-sm font-medium transition-colors">Retry</button>
                    </div>
                ) : (
                    <Loader isLoading={true} />
                )}
            </div>
        );
    }

    const { config, healthData } = statusData;
    const services = config?.services || [];
    const groups = config?.groups || [];

    return (
        <div className="w-full flex flex-col">
            <header className="flex items-center gap-4 w-full mb-8 pb-4 border-b border-border">
                {isPublic && (
                    <button onClick={onBack} className="p-2 bg-white/5 hover:bg-white/10 rounded-full transition-colors flex items-center justify-center text-muted hover:text-text">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                    </button>
                )}
                <h2 className="text-2xl font-bold text-text">Server Status</h2>
            </header>

            <div className="flex flex-wrap gap-2 mb-8 p-1.5 bg-black/20 rounded-xl border border-border w-fit mx-auto md:mx-0">
                {[
                    { id: 'overview', label: 'Overview' },
                    { id: 'history', label: 'Detailed History' },
                    { id: 'analytics', label: 'Analytics' }
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`px-5 py-2.5 rounded-lg font-bold text-sm transition-all duration-200 cursor-pointer border-none outline-none ${activeTab === tab.id
                            ? 'bg-plex text-background shadow-md'
                            : 'bg-transparent text-muted hover:text-text hover:bg-white/5'
                            }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            <main className="user-content">
                {activeTab === 'overview' && (
                    <>
                        {config.announcement && config.announcement.enabled && (
                            <div className="status-announcement">
                                {config.announcement.message}
                            </div>
                        )}

                        {groups.length === 0 && (
                            <div className="flex flex-col items-center justify-center p-12 text-center border-2 border-dashed border-border rounded-xl bg-card my-8">
                                <Activity className="w-12 h-12 text-muted mb-4 opacity-50" />
                                <h3 className="text-xl font-bold text-text mb-2">No Services Monitored</h3>
                                <p className="text-muted max-w-md">
                                    The status page is currently blank because no services have been configured yet.
                                    {isAdmin ? (
                                        <>
                                            <br /><br />
                                            You can add status monitors by going to <strong className="text-text">Settings &gt; Status Page</strong> and adding your services and groups.
                                        </>
                                    ) : (
                                        <>
                                            <br /><br />
                                            The server administrator hasn't added any services to monitor yet. Check back later!
                                        </>
                                    )}
                                </p>
                            </div>
                        )}

                        {groups.map((group: any) => {
                            const groupServices = services.filter((s: any) => s.groupId === group.id);
                            if (groupServices.length === 0) return null;
                            return (
                                <div key={group.id} className="mb-8">
                                    <h3 className="text-lg font-bold text-muted uppercase tracking-[2px] mb-6 border-b border-white/10 pb-2">{group.name}</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        {groupServices.map((service: any, index: number) => {
                                            const health = healthData[service.id] || { currentStatus: 'unknown', uptimePercentage: 100, dailyHistory: {} };
                                            return (
                                                <div key={service.id} className="bg-card rounded-xl p-4 md:p-6 border border-white/5 shadow-lg flex flex-col gap-4 animate-fade-in hover:-translate-y-1 hover:shadow-plex/10 hover:shadow-2xl hover:border-plex/30 transition-all duration-300" style={{ animationFillMode: 'both', animationDelay: `${index * 75}ms` }}>
                                                    <div className="flex justify-between items-start mb-2 gap-4">
                                                        <h4 className="font-bold text-text text-lg">{service.name}</h4>
                                                        <span className={`px-3 py-1 rounded-full text-[0.65rem] uppercase tracking-wider font-bold border flex items-center gap-1.5 shadow-lg transition-all duration-300 ${health.currentStatus === 'online' ? 'bg-status-active/10 text-status-active border-status-active/30 shadow-[0_0_10px_rgba(35,134,54,0.3)]' : health.currentStatus === 'offline' ? 'bg-status-expired/10 text-[#D32F2F] border-[#D32F2F]/30 shadow-[0_0_10px_rgba(211,47,47,0.3)] animate-pulse' : 'bg-status-expiring/10 text-status-expiring border-status-expiring/30 shadow-[0_0_10px_rgba(210,153,34,0.3)]'}`}>
                                                            {health.currentStatus === 'online' && <span className="w-1.5 h-1.5 rounded-full bg-status-active animate-pulse shadow-[0_0_5px_rgba(35,134,54,0.8)]" />}
                                                            {health.currentStatus === 'offline' && <span className="w-1.5 h-1.5 rounded-full bg-[#D32F2F] animate-ping" />}
                                                            {health.currentStatus === 'degraded' && <span className="w-1.5 h-1.5 rounded-full bg-status-expiring animate-pulse shadow-[0_0_5px_rgba(210,153,34,0.8)]" />}
                                                            {health.currentStatus.toUpperCase()}
                                                        </span>
                                                    </div>
                                                    <div className="text-sm text-muted font-medium">
                                                        <span>Uptime: {health.uptimePercentage}%</span>
                                                    </div>
                                                    <div className="flex gap-[2px] h-12 mt-auto items-end pt-4 group/bars relative">
                                                        {Array.from({ length: 90 }).map((_, i) => {
                                                            const d = new Date();
                                                            d.setDate(d.getDate() - (89 - i));
                                                            const dateStr = d.toISOString().split('T')[0];
                                                            const stat = health.dailyHistory?.[dateStr];

                                                            let barClass = 'unknown';
                                                            let title = `${dateStr}: No data`;
                                                            let hClass = 'h-1/5';

                                                            if (stat && stat.total > 0) {
                                                                const pct = (stat.up / stat.total) * 100;
                                                                title = `${dateStr}: ${pct.toFixed(1)}% uptime`;
                                                                if (pct >= 99) { barClass = 'online'; hClass = 'h-full'; }
                                                                else if (pct >= 90) { barClass = 'degraded'; hClass = 'h-2/3'; }
                                                                else { barClass = 'offline'; hClass = 'h-1/3'; }
                                                            }

                                                            return (
                                                                <div
                                                                    key={i}
                                                                    className={`flex-1 rounded-sm transition-all duration-300 hover:opacity-100 opacity-60 cursor-pointer animate-fade-in ${barClass === 'online' ? 'bg-status-active hover:shadow-[0_0_8px_rgba(35,134,54,0.6)]' : barClass === 'offline' ? 'bg-status-expired hover:shadow-[0_0_8px_rgba(218,54,51,0.6)]' : barClass === 'degraded' ? 'bg-status-expiring hover:shadow-[0_0_8px_rgba(210,153,34,0.6)]' : 'bg-border'} ${hClass}`}
                                                                    style={{ animationFillMode: 'both', animationDelay: `${i * 10}ms` }}
                                                                    title={title}
                                                                />
                                                            );
                                                        })}
                                                    </div>
                                                    <div className="flex justify-between text-[10px] text-muted font-bold tracking-wider mt-1 opacity-50">
                                                        <span>90 DAYS AGO</span>
                                                        <span className="text-center flex-1">{health.uptimePercentage}%</span>
                                                        <span>TODAY</span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </>
                )}

                {activeTab === 'history' && (
                    <div className="flex flex-col gap-8 animate-fade-in">
                        {services.map((service: any) => (
                            <div key={service.id} className="bg-card border border-white/5 shadow-2xl rounded-2xl overflow-hidden mt-4">
                                <div className="p-4 bg-black/20 border-b border-border/50">
                                    <h3 className="text-lg font-bold text-plex uppercase tracking-wider">{service.name}</h3>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead className="bg-black/40 border-b border-border text-muted text-xs uppercase tracking-wider">
                                            <tr>
                                                <th className="px-6 py-4 font-bold whitespace-nowrap">Date</th>
                                                <th className="px-6 py-4 font-bold whitespace-nowrap">Uptime %</th>
                                                <th className="px-6 py-4 font-bold whitespace-nowrap">Checks (Up / Total)</th>
                                                <th className="px-6 py-4 font-bold text-right whitespace-nowrap">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border/50">
                                            {Object.entries(healthData[service.id]?.dailyHistory || {})
                                                .sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime())
                                                .map(([dateStr, stat]: [string, any]) => {
                                                    const pct = stat.total > 0 ? (stat.up / stat.total) * 100 : 0;
                                                    return (
                                                        <tr key={dateStr} className="hover:bg-white/5 transition-colors">
                                                            <td className="px-6 py-4 font-medium whitespace-nowrap text-text">{dateStr}</td>
                                                            <td className="px-6 py-4 font-mono whitespace-nowrap text-muted">{pct.toFixed(2)}%</td>
                                                            <td className="px-6 py-4 text-muted text-sm whitespace-nowrap">{stat.up} / {stat.total} checks</td>
                                                            <td className="px-6 py-4 text-right whitespace-nowrap">
                                                                <span className={`px-2.5 py-1 rounded-full text-[10px] uppercase font-bold tracking-widest border ${pct >= 99 ? 'bg-status-active/10 text-status-active border-status-active/30' : pct >= 90 ? 'bg-status-expiring/10 text-status-expiring border-status-expiring/30' : 'bg-status-expired/10 text-status-expired border-status-expired/30'}`}>
                                                                    {pct >= 99 ? 'Healthy' : pct >= 90 ? 'Degraded' : 'Outage'}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {activeTab === 'analytics' && (
                    <div className="flex flex-col gap-8 animate-fade-in">
                        {services.map((service: any) => (
                            <div key={service.id} className="bg-card border border-white/5 shadow-2xl rounded-2xl p-6 md:p-10 mt-4">
                                <h3 className="text-xl font-bold mb-10 text-center text-muted tracking-widest uppercase">{service.name} - 90-Day Uptime Trend</h3>
                                <div className="relative h-64 md:h-80 flex items-end gap-1 w-full pl-12 pr-4 md:pr-8">
                                    <div className="absolute inset-0 pl-12 pr-4 md:pr-8 flex flex-col justify-between pointer-events-none pb-8">
                                        <div className="w-full border-t border-white/5 h-0 relative">
                                            <span className="absolute -left-12 -top-2.5 text-xs font-mono text-muted/50 w-10 text-right">100%</span>
                                        </div>
                                        <div className="w-full border-t border-white/5 h-0 relative">
                                            <span className="absolute -left-12 -top-2.5 text-xs font-mono text-muted/50 w-10 text-right">75%</span>
                                        </div>
                                        <div className="w-full border-t border-white/5 h-0 relative">
                                            <span className="absolute -left-12 -top-2.5 text-xs font-mono text-muted/50 w-10 text-right">50%</span>
                                        </div>
                                        <div className="w-full border-t border-white/5 h-0 relative">
                                            <span className="absolute -left-12 -top-2.5 text-xs font-mono text-muted/50 w-10 text-right">25%</span>
                                        </div>
                                        <div className="w-full border-t border-white/20 h-0 relative">
                                            <span className="absolute -left-12 -top-2.5 text-xs font-mono text-muted/50 w-10 text-right">0%</span>
                                        </div>
                                    </div>

                                    <div className="w-full h-full flex items-end gap-[2px] pb-8 z-10">
                                        {Array.from({ length: 90 }).map((_, i) => {
                                            const d = new Date();
                                            d.setDate(d.getDate() - (89 - i));
                                            const dateStr = d.toISOString().split('T')[0];
                                            const stat = healthData[service.id]?.dailyHistory?.[dateStr];
                                            const pct = stat && stat.total > 0 ? (stat.up / stat.total) * 100 : 0;

                                            return (
                                                <div
                                                    key={i}
                                                    className="flex-1 flex flex-col justify-end h-full relative group/chart cursor-crosshair"
                                                >
                                                    <div
                                                        className={`w-full rounded-t-sm transition-all duration-300 opacity-80 group-hover/chart:opacity-100 ${pct >= 99 ? 'bg-status-active' : pct >= 90 ? 'bg-status-expiring' : stat && stat.total > 0 ? 'bg-status-expired' : 'bg-white/10'}`}
                                                        style={{ height: `${Math.max(1, pct)}%` }}
                                                    />
                                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 p-3 bg-card border border-border shadow-2xl text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover/chart:opacity-100 pointer-events-none transition-opacity z-50 flex flex-col items-center">
                                                        <strong className="text-plex mb-1 tracking-wider uppercase text-[10px]">{dateStr}</strong>
                                                        <span className="text-lg font-mono font-bold">{stat && stat.total > 0 ? `${pct.toFixed(2)}%` : 'No data'}</span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                                <div className="flex justify-between text-[10px] text-muted font-bold tracking-widest mt-2 px-12 uppercase">
                                    <span>90 days ago</span>
                                    <span>Today</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
};
