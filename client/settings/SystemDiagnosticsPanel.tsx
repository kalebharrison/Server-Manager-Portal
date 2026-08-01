import React from 'react';

const ConfigPill: React.FC<{ configured: boolean }> = ({ configured }) => (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${configured ? 'bg-green-500/20 text-green-300 border border-green-500/30' : 'bg-red-500/20 text-red-300 border border-red-500/30'}`}>
        {configured ? 'Configured' : 'Missing'}
    </span>
);

const OptionalIntegrationPill: React.FC<{ configured: boolean }> = ({ configured }) => {
    if (configured) return <ConfigPill configured />;
    return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-white/10 text-muted border border-border">
            Optional
        </span>
    );
};

type SystemDiagnosticsPanelProps = {
    diagnostics: any;
    mediaServerType: string;
    isLoadingDiagnostics: boolean;
    onRefresh: () => void;
};

export const SystemDiagnosticsPanel: React.FC<SystemDiagnosticsPanelProps> = ({
    diagnostics,
    mediaServerType,
    isLoadingDiagnostics,
    onRefresh,
}) => (
    <section className="space-y-4 mb-8">
        <div className="flex items-center justify-between">
            <h4 className="font-bold text-text">System Diagnostics</h4>
            <button className="px-3 py-1.5 bg-border text-text rounded-md font-semibold hover:bg-opacity-80" onClick={onRefresh}>
                {isLoadingDiagnostics ? 'Refreshing...' : 'Refresh'}
            </button>
        </div>
        {diagnostics ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-x-4 gap-y-2 text-sm">
                <div><strong>App Version:</strong> {diagnostics?.app?.version || 'unknown'}</div>
                <div><strong>Uptime:</strong> {diagnostics?.app?.uptimeSeconds || 0}s</div>
                <div><strong>Node:</strong> {diagnostics?.app?.nodeVersion || 'n/a'}</div>
                <div><strong>Memory:</strong> {diagnostics?.app?.memoryRssMB || 0} MB</div>
                <div className="flex items-center justify-between gap-2">
                    <strong>Media Player ({mediaServerType === 'jellyfin' ? 'Jellyfin' : 'Plex'})</strong>
                    <ConfigPill configured={mediaServerType === 'jellyfin' ? !!diagnostics?.integrations?.jellyfinConfigured : !!diagnostics?.integrations?.plexConfigured} />
                </div>
                <div className="flex items-center justify-between gap-2"><strong>SMTP</strong><OptionalIntegrationPill configured={!!diagnostics?.integrations?.smtpConfigured} /></div>
                <div className="flex items-center justify-between gap-2"><strong>Sonarr</strong><ConfigPill configured={!!diagnostics?.integrations?.sonarrConfigured} /></div>
                <div className="flex items-center justify-between gap-2"><strong>Radarr</strong><ConfigPill configured={!!diagnostics?.integrations?.radarrConfigured} /></div>
                {mediaServerType === 'jellyfin' ? (
                    <div className="flex items-center justify-between gap-2"><strong>Jellystat</strong><ConfigPill configured={!!diagnostics?.integrations?.jellystatConfigured} /></div>
                ) : (
                    <div className="flex items-center justify-between gap-2"><strong>Tautulli</strong><ConfigPill configured={!!diagnostics?.integrations?.tautulliConfigured} /></div>
                )}
                <div className="flex items-center justify-between gap-2"><strong>Analytics Cache</strong><ConfigPill configured={!!diagnostics?.caches?.analytics?.exists} /></div>
                <div className="flex items-center justify-between gap-2"><strong>Trending Cache</strong><ConfigPill configured={!!diagnostics?.caches?.trending?.exists} /></div>
                {mediaServerType !== 'jellyfin' && (
                    <div className="flex items-center justify-between gap-2"><strong>Plex Stats Cache</strong><ConfigPill configured={!!diagnostics?.caches?.plexStats?.exists} /></div>
                )}
                <div className="flex items-center justify-between gap-2"><strong>Users File</strong><ConfigPill configured={!!diagnostics?.files?.users?.exists} /></div>
                <div className="flex items-center justify-between gap-2"><strong>Config File</strong><ConfigPill configured={!!diagnostics?.files?.config?.exists} /></div>
                <div className="flex items-center justify-between gap-2"><strong>Auto Backup</strong><ConfigPill configured={!!diagnostics?.backup?.enabled} /></div>
                <div><strong>Backup Files:</strong> {diagnostics?.backup?.availableBackups ?? 0}</div>
            </div>
        ) : (
            <p className="text-sm text-muted">No diagnostics loaded yet.</p>
        )}
    </section>
);
