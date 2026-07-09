import React from 'react';

export const MaintenanceSettingsSection: React.FC<{
    addToast: (message: string, type?: 'success' | 'error') => void;
    preferences: any;
    savePreferences: (nextPrefs: any) => Promise<void>;
    setPreferences: React.Dispatch<React.SetStateAction<any>>;
}> = ({ addToast, preferences, savePreferences, setPreferences }) => (
    <div className="glass-card-sm p-5 space-y-4">
        <h3 className="text-xl font-bold text-plex">Cleaner Settings</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-background/30 border border-white/5 rounded-lg p-3">
                <label className="text-xs text-muted font-bold uppercase block mb-2">Default Dry-run</label>
                <label className="text-sm text-muted flex items-center gap-2">
                    <input type="checkbox" checked={!!preferences?.global?.dryRunByDefault} onChange={(e) => setPreferences((prev: any) => ({ ...prev, global: { ...(prev.global || {}), dryRunByDefault: e.target.checked } }))} />
                    Enable by default
                </label>
            </div>
            <div className="bg-background/30 border border-white/5 rounded-lg p-3">
                <label className="text-xs text-muted font-bold uppercase block mb-2">Max Actions Per Run</label>
                <input type="number" min={1} className="w-full p-2 rounded border border-border bg-card text-text text-sm" value={preferences?.global?.maxActionsPerRun || 25} onChange={(e) => setPreferences((prev: any) => ({ ...prev, global: { ...(prev.global || {}), maxActionsPerRun: Math.max(1, Number(e.target.value) || 1) } }))} />
            </div>
            <div className="bg-background/30 border border-white/5 rounded-lg p-3">
                <label className="text-xs text-muted font-bold uppercase block mb-2">Require Confirm Token</label>
                <label className="text-sm text-muted flex items-center gap-2">
                    <input type="checkbox" checked={!!preferences?.global?.requireConfirmForDestructive} onChange={(e) => setPreferences((prev: any) => ({ ...prev, global: { ...(prev.global || {}), requireConfirmForDestructive: e.target.checked } }))} />
                    Required for destructive runs
                </label>
            </div>
        </div>
        <button type="button" className="px-3 py-2 bg-plex text-background rounded-md text-sm font-semibold" onClick={async () => { await savePreferences(preferences); addToast('Maintenance settings saved.'); }}>
            Save Cleaner Settings
        </button>
    </div>
);
