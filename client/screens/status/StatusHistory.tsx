import React from 'react';

export const StatusHistory: React.FC<{ services: any[]; healthData: Record<string, any> }> = ({ services, healthData }) => (
    <div className="flex flex-col gap-6">
        {services.map((service) => {
            const rows = Object.entries(healthData[service.id]?.dailyHistory || {}).sort((a, b) => b[0].localeCompare(a[0]));
            return (
                <section key={service.id} className="bg-card border border-white/5 rounded-lg overflow-hidden">
                    <div className="px-4 py-3 bg-black/20 border-b border-border/50"><h2 className="font-bold text-text">{service.name}</h2></div>
                    {rows.length === 0 ? <p className="p-5 text-sm text-muted">No history collected yet.</p> : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-black/30 text-muted text-xs uppercase tracking-wider"><tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Uptime</th><th className="px-4 py-3">Checks</th><th className="px-4 py-3 text-right">Result</th></tr></thead>
                                <tbody className="divide-y divide-border/40">
                                    {rows.map(([day, value]: [string, any]) => {
                                        const percent = value.total > 0 ? (value.up / value.total) * 100 : 0;
                                        const label = percent >= 99 ? 'Operational' : percent >= 90 ? 'Degraded' : 'Outage';
                                        return <tr key={day}><td className="px-4 py-3 text-text whitespace-nowrap">{day}</td><td className="px-4 py-3 text-muted font-mono">{percent.toFixed(1)}%</td><td className="px-4 py-3 text-muted">{value.up} / {value.total}</td><td className="px-4 py-3 text-right font-semibold text-text">{label}</td></tr>;
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            );
        })}
    </div>
);
