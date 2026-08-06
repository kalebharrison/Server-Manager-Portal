import React from 'react';

import { SettingHint } from './SettingHint';

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
        <h3 className="text-xl font-bold text-plex mb-4 border-b border-border pb-2">Automated User Cleanup</h3>
        <div className="mb-6 bg-yellow-500/10 border border-yellow-500/20 p-4 rounded-lg">
            <p className="text-sm text-yellow-500 font-bold mb-1">Warning</p>
            <p className="text-xs text-muted">When enabled, the server will automatically revoke portal access for users who have not watched anything for the specified number of days. You can exempt specific users from this rule by editing them in the Users table.</p>
        </div>

        <div className="mb-6 flex items-center justify-between py-4 border-b border-border/40">
            <div>
                <label className="font-bold block mb-1">Enable Automated Cleanup</label>
                <SettingHint>Run cleanup job automatically in the background</SettingHint>
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
                <div className="mt-2">
                    <SettingHint>Revoke access if a user has not watched anything in this many days.</SettingHint>
                </div>
            </div>
        </div>

        <div className="mt-4">
            <SettingHint>
                How often the portal checks expiration and cleanup conditions is under{' '}
                <a href="#system" className="text-plex font-semibold hover:underline">System &amp; Backups</a>
                {' '}→ Access check interval.
            </SettingHint>
        </div>
    </div>
);
