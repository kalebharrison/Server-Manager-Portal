import React from 'react';

type CleanupSettingsTabProps = {
    inactiveCleanupEnabled: boolean;
    inactiveCleanupDays: number;
    onInactiveCleanupEnabledChange: (enabled: boolean) => void;
    onInactiveCleanupDaysChange: (days: number) => void;
};

export const CleanupSettingsTab: React.FC<CleanupSettingsTabProps> = ({
    inactiveCleanupEnabled,
    inactiveCleanupDays,
    onInactiveCleanupEnabledChange,
    onInactiveCleanupDaysChange,
}) => (
    <div className="mb-8 animate-fade-in">
        <div className="mb-6 bg-yellow-500/10 border border-yellow-500/20 p-4 rounded-lg">
            <p className="text-sm text-yellow-500 font-bold mb-1">Warning</p>
            <p className="text-xs text-muted">Revokes portal access for members who have not watched anything for the specified number of days. Exempt users from the Users table.</p>
        </div>

        <div className="mb-6 flex items-center justify-between py-4 border-b border-border/40">
            <div>
                <label className="font-bold block mb-1">Enable inactive member cleanup</label>
            </div>
            <button
                onClick={() => onInactiveCleanupEnabledChange(!inactiveCleanupEnabled)}
                className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors ${inactiveCleanupEnabled ? 'bg-plex' : 'bg-border'}`}
            >
                <span className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform ${inactiveCleanupEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
        </div>

        <div className={`transition-all ${!inactiveCleanupEnabled ? 'opacity-50 pointer-events-none' : ''}`}>
            <div className="mb-4">
                <label htmlFor="inactiveCleanupDays">Inactivity Threshold (Days)</label>
                <input
                    className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all"
                    id="inactiveCleanupDays"
                    type="number"
                    min="1"
                    value={inactiveCleanupDays}
                    onChange={e => onInactiveCleanupDaysChange(Number(e.target.value))}
                />
            </div>
        </div>

        <p className="mt-4 text-xs text-muted">
            Runs on the scheduled task interval under{' '}
            <a href="#system" className="text-plex font-semibold hover:underline">System &amp; Backups</a>.
        </p>
    </div>
);
