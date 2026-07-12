import React, { useMemo } from 'react';

const statusClasses: Record<string, string> = {
    online: 'bg-green-500/10 text-green-300 border-green-500/30',
    offline: 'bg-red-500/10 text-red-300 border-red-500/30',
    degraded: 'bg-amber-500/10 text-amber-200 border-amber-500/30',
    unknown: 'bg-white/5 text-muted border-white/10',
};

const dateKey = (offset: number) => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - offset);
    return date.toISOString().slice(0, 10);
};

export const StatusServiceCard: React.FC<{ service: any; health?: any }> = ({ service, health = {} }) => {
    const days = useMemo(() => Array.from({ length: 30 }, (_, index) => dateKey(29 - index)), []);
    const status = String(health.currentStatus || 'unknown').toLowerCase();
    const uptime = useMemo(() => {
        const totals = days.reduce((result, day) => {
            const stat = health.dailyHistory?.[day];
            result.up += Number(stat?.up || 0);
            result.total += Number(stat?.total || 0);
            return result;
        }, { up: 0, total: 0 });
        return totals.total > 0 ? Math.round((totals.up / totals.total) * 100) : null;
    }, [days, health.dailyHistory]);

    return (
        <article className="bg-card rounded-lg p-5 border border-white/5 shadow-lg min-w-0">
            <div className="flex justify-between items-start gap-4">
                <div className="min-w-0">
                    <h3 className="font-bold text-text text-lg truncate">{service.name}</h3>
                    {service.description && <p className="text-xs text-muted mt-1 line-clamp-2">{service.description}</p>}
                </div>
                <span className={`px-2.5 py-1 rounded-full text-[10px] uppercase tracking-wider font-bold border ${statusClasses[status] || statusClasses.unknown}`}>{status}</span>
            </div>

            <div className="flex items-end justify-between gap-3 mt-5 mb-3">
                <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted font-bold">30-day uptime</p>
                    <p className="text-xl font-black text-text mt-1">{uptime == null ? 'Collecting' : `${uptime}%`}</p>
                </div>
                {Number(health.latency) > 0 && <span className="text-xs text-muted">{health.latency} ms</span>}
            </div>

            <div className="grid grid-cols-[repeat(30,minmax(2px,1fr))] gap-1 h-8 items-stretch" aria-label="30-day uptime history">
                {days.map((day) => {
                    const stat = health.dailyHistory?.[day];
                    const percent = stat?.total > 0 ? (stat.up / stat.total) * 100 : null;
                    const color = percent == null ? 'bg-white/10' : percent >= 99 ? 'bg-green-500' : percent >= 90 ? 'bg-amber-500' : 'bg-red-500';
                    return <span key={day} title={percent == null ? `${day}: No data` : `${day}: ${percent.toFixed(1)}% uptime`} className={`rounded-sm ${color}`} />;
                })}
            </div>
            <div className="flex justify-between text-[9px] text-muted uppercase tracking-wider mt-2"><span>30 days ago</span><span>Today</span></div>
        </article>
    );
};
