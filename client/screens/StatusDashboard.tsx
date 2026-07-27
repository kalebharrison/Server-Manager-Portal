import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertCircle, ArrowLeft, CheckCircle2 } from 'lucide-react';

import { apiFetch } from '../shared/api';
import { Loader } from '../shared/toast';
import { useVisibleInterval } from '../shared/useVisibleInterval';
import { StatusHistory } from './status/StatusHistory';
import { StatusServiceCard } from './status/StatusServiceCard';

type StatusTab = 'overview' | 'history';

export const StatusDashboard: React.FC<{ onBack: () => void; isAdmin: boolean; isPublic?: boolean }> = ({ onBack, isAdmin, isPublic }) => {
    const [statusData, setStatusData] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);
    const [activeTab, setActiveTab] = useState<StatusTab>('overview');

    const fetchStatus = useCallback(async () => {
        try {
            setStatusData(await apiFetch('/api/status', { cacheTtlMs: 2000 }));
            setHasError(false);
        } catch {
            setHasError(true);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { fetchStatus(); }, [fetchStatus]);
    useVisibleInterval(fetchStatus, 15000);

    const services = statusData?.config?.services || [];
    const groups = statusData?.config?.groups || [];
    const healthData = statusData?.healthData || {};
    const summary = useMemo(() => {
        const statuses = services.map((service: any) => healthData[service.id]?.currentStatus || 'unknown');
        const offline = statuses.filter((status: string) => status === 'offline').length;
        const degraded = statuses.filter((status: string) => status === 'degraded').length;
        const unknown = statuses.filter((status: string) => status === 'unknown').length;
        const lastCheck = Math.max(0, ...services.map((service: any) => Number(healthData[service.id]?.lastCheck || 0)));
        return { offline, degraded, unknown, lastCheck };
    }, [healthData, services]);

    if (isLoading && !statusData) return <Loader isLoading />;
    if (hasError && !statusData) {
        return (
            <div className="w-full max-w-xl mx-auto rounded-lg border border-red-500/30 bg-red-500/10 p-6 text-center text-red-300">
                <AlertCircle className="w-8 h-8 mx-auto mb-3" />
                <p className="font-semibold">Server status is temporarily unavailable.</p>
                <button onClick={() => { setIsLoading(true); fetchStatus(); }} className="mt-4 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-text text-sm font-semibold">Retry</button>
            </div>
        );
    }

    const hasIncident = summary.offline > 0 || summary.degraded > 0;
    const isStarting = !hasIncident && summary.unknown > 0;
    const summaryLabel = summary.offline > 0
        ? `${summary.offline} service${summary.offline === 1 ? '' : 's'} unavailable`
        : summary.degraded > 0
            ? `${summary.degraded} service${summary.degraded === 1 ? '' : 's'} degraded`
            : summary.unknown > 0
                ? 'Status checks are starting'
                : 'All systems operational';
    const announcement = statusData?.config?.announcement;

    return (
        <div className="w-full flex flex-col">
            <header className="flex items-center gap-3 w-full mb-6 pb-4 border-b border-border">
                {isPublic && <button onClick={onBack} aria-label="Back" className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-muted hover:text-text"><ArrowLeft className="w-5 h-5" /></button>}
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-text">Server Status</h1>
                    <p className="text-sm text-muted mt-1">Current availability and recent service history.</p>
                </div>
            </header>

            <section className={`mb-6 rounded-lg border px-4 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${hasIncident ? 'border-amber-500/30 bg-amber-500/10' : isStarting ? 'border-white/10 bg-white/5' : 'border-green-500/25 bg-green-500/10'}`}>
                <div className="flex items-center gap-3">
                    {hasIncident ? <AlertCircle className="w-5 h-5 text-amber-300" /> : isStarting ? <Activity className="w-5 h-5 text-muted" /> : <CheckCircle2 className="w-5 h-5 text-green-400" />}
                    <span className="font-bold text-text">{summaryLabel}</span>
                </div>
                <span className="text-xs text-muted">{summary.lastCheck ? `Last checked ${new Date(summary.lastCheck).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Waiting for first check'}</span>
            </section>

            {announcement && (typeof announcement === 'string' || announcement.enabled) && (
                <div className="mb-6 rounded-lg border border-plex/25 bg-plex/10 px-4 py-3 text-sm text-text">{typeof announcement === 'string' ? announcement : announcement.message}</div>
            )}

            <div className="flex gap-1 mb-8 p-1 bg-black/20 rounded-lg border border-border w-fit">
                {([['overview', 'Overview'], ['history', 'History']] as const).map(([id, label]) => (
                    <button key={id} onClick={() => setActiveTab(id)} className={`px-5 py-2 rounded-md font-bold text-sm transition-colors ${activeTab === id ? 'bg-plex text-background' : 'text-muted hover:text-text hover:bg-white/5'}`}>{label}</button>
                ))}
            </div>

            {services.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-10 text-center border border-dashed border-border rounded-lg bg-card/40">
                    <Activity className="w-10 h-10 text-muted mb-3 opacity-50" />
                    <h2 className="text-lg font-bold text-text">No services configured</h2>
                    <p className="text-sm text-muted mt-2">{isAdmin ? 'Add monitors under Settings > Status Page.' : 'The server administrator has not published any monitors yet.'}</p>
                </div>
            ) : activeTab === 'history' ? (
                <StatusHistory services={services} healthData={healthData} />
            ) : (
                <div className="space-y-10">
                    {groups.map((group: any) => {
                        const groupServices = services.filter((service: any) => service.groupId === group.id);
                        if (!groupServices.length) return null;
                        return (
                            <section key={group.id}>
                                <h2 className="text-sm font-bold text-muted uppercase tracking-[2px] mb-4 border-b border-white/10 pb-2">{group.name}</h2>
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                    {groupServices.map((service: any) => <StatusServiceCard key={service.id} service={service} health={healthData[service.id]} />)}
                                </div>
                            </section>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
