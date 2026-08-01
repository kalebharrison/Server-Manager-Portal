import React from 'react';

const SELFHST_ICON_BASE = 'https://cdn.jsdelivr.net/gh/selfhst/icons/svg';

const APP_ICONS: Record<string, string> = {
    sonarr: `${SELFHST_ICON_BASE}/sonarr.svg`,
    radarr: `${SELFHST_ICON_BASE}/radarr.svg`,
    lidarr: `${SELFHST_ICON_BASE}/lidarr.svg`,
    tautulli: `${SELFHST_ICON_BASE}/tautulli.svg`,
    ombi: `${SELFHST_ICON_BASE}/ombi.svg`,
    jellystat: 'https://cdn.jsdelivr.net/gh/selfhst/icons@main/png/jellystat.png',
    tmdb: `${SELFHST_ICON_BASE}/tmdb.svg`,
    tvdb: `${SELFHST_ICON_BASE}/the-tvdb.svg`,
};

export const hasIntegrationCredentials = (
    url: string | undefined,
    apiKey: string | undefined,
    savedUrl?: string,
    savedApiKey?: string,
) => {
    const effectiveUrl = String(url || savedUrl || '').trim();
    const effectiveKey = String(apiKey || savedApiKey || '').trim();
    return Boolean(effectiveUrl && effectiveKey);
};

const ProgramIcon: React.FC<{ app: string; label: string }> = ({ app, label }) => (
    <span className="inline-flex w-8 h-8 rounded-lg bg-white/5 border border-white/10 items-center justify-center overflow-hidden flex-shrink-0">
        {APP_ICONS[app] ? (
            <img
                src={APP_ICONS[app]}
                alt=""
                className="w-5 h-5 object-contain"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
        ) : (
            <span className="text-[10px] font-black text-plex">{label.slice(0, 2).toUpperCase()}</span>
        )}
        <span className="sr-only">{label}</span>
    </span>
);

export const IntegrationHeading: React.FC<{ app: string; title: string; subtitle?: string; className?: string }> = ({ app, title, subtitle, className = '' }) => (
    <div className={`integration-heading border-b border-border pb-3 mb-4 ${className}`}>
        <div className="grid grid-cols-[2rem_1fr] gap-x-3 gap-y-0.5">
            <div className="row-start-1 self-center">
                <ProgramIcon app={app} label={title} />
            </div>
            <h3 className="integration-heading-title text-xl font-bold text-text leading-tight min-w-0 col-start-2 row-start-1">{title}</h3>
            {subtitle && <p className="text-xs text-muted col-start-2 row-start-2">{subtitle}</p>}
        </div>
    </div>
);
