import React from 'react';

type SystemHealth = {
    score: number;
    status: string;
    alerts: string[];
    integrationsConfigured: number;
    integrationsTotal: number;
    cacheHealthy: number;
    cacheTotal: number;
    runningJobs: number;
    failingJobs: number;
};

type SystemHealthPanelProps = {
    systemHealth: SystemHealth;
};

export const SystemHealthPanel: React.FC<SystemHealthPanelProps> = ({ systemHealth }) => (
    <section className="space-y-4 mb-8">
        <div className="flex items-center justify-between">
            <h4 className="font-bold text-text">Health Dashboard</h4>
            <span className={`text-xs px-2 py-1 rounded font-bold ${systemHealth.score >= 85 ? 'bg-green-500/20 text-green-300' : systemHealth.score >= 65 ? 'bg-yellow-500/20 text-yellow-300' : 'bg-red-500/20 text-red-300'}`}>
                {systemHealth.status}
            </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4 text-sm">
            <div>
                <p className="text-muted text-xs mb-1">Health Score</p>
                <p className="text-xl font-bold text-text">{systemHealth.score}%</p>
            </div>
            <div>
                <p className="text-muted text-xs mb-1">Integrations</p>
                <p className="text-xl font-bold text-text">{systemHealth.integrationsConfigured}/{systemHealth.integrationsTotal}</p>
            </div>
            <div>
                <p className="text-muted text-xs mb-1">Caches</p>
                <p className="text-xl font-bold text-text">{systemHealth.cacheHealthy}/{systemHealth.cacheTotal}</p>
            </div>
            <div>
                <p className="text-muted text-xs mb-1">Running Jobs</p>
                <p className="text-xl font-bold text-text">{systemHealth.runningJobs}</p>
            </div>
            <div>
                <p className="text-muted text-xs mb-1">Failing Jobs</p>
                <p className={`text-xl font-bold ${systemHealth.failingJobs > 0 ? 'text-red-300' : 'text-text'}`}>{systemHealth.failingJobs}</p>
            </div>
        </div>
        <div>
            <p className="text-xs font-semibold text-muted mb-2">Attention Needed</p>
            {systemHealth.alerts.length === 0 ? (
                <p className="text-sm text-green-300">No active health alerts.</p>
            ) : (
                <ul className="text-sm text-yellow-200 space-y-1">
                    {systemHealth.alerts.map((alert, index) => (
                        <li key={`health-alert-${index}`}>- {alert}</li>
                    ))}
                </ul>
            )}
        </div>
    </section>
);
