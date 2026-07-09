import React from 'react';

import { portalUrl } from '../../shared/basePath';

export const MaintenanceDisabledNotice: React.FC = () => (
    <div className="glass-card-sm border-yellow-500/30 p-5">
        <h3 className="text-xl font-bold text-plex mb-2">Cleaner Disabled</h3>
        <p className="text-sm text-muted mb-3">Experimental Cleaner Mode is currently OFF.</p>
        <p className="text-xs text-muted">Enable it in `Settings` &rarr; `System` under `Maintenance Experimental Mode`, then click Save Settings.</p>
        <button
            type="button"
            onClick={() => { window.location.href = portalUrl('/settings?focus=maintenance-toggle#system'); }}
            className="mt-3 px-3 py-1.5 bg-plex text-background rounded-md text-xs font-semibold hover:bg-plex-hover transition-colors"
        >
            Open Settings
        </button>
    </div>
);
