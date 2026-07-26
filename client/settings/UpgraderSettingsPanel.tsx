import React from 'react';

type Props = {
    enabled: boolean;
    automationEnabled: boolean;
    minSizeGB: number;
    maxActionsPerHour: number;
    onEnabledChange: (value: boolean) => void;
    onAutomationEnabledChange: (value: boolean) => void;
    onMinSizeGBChange: (value: number) => void;
    onMaxActionsPerHourChange: (value: number) => void;
};

export const UpgraderSettingsPanel: React.FC<Props> = ({
    enabled, automationEnabled, minSizeGB, maxActionsPerHour,
    onEnabledChange, onAutomationEnabledChange, onMinSizeGBChange, onMaxActionsPerHourChange,
}) => (
    <div className="mb-8 animate-fade-in space-y-6">
        <h3 className="text-xl font-bold text-plex mb-4 border-b border-border pb-2">Library Upgrader</h3>
        <section id="upgrader" className="space-y-5 scroll-mt-24">
            <p className="text-sm text-muted">Indexes Sonarr and Radarr directly. It is independent of the retired maintenance feature.</p>
            <div className="rounded-xl border border-border/60 bg-white/[0.02] p-5 space-y-4">
                <label className="flex items-center justify-between gap-4">
                    <span><span className="block font-semibold">Enable Library Upgrader</span><span className="block text-xs text-muted mt-1">Shows the admin Upgrader page and enables its API.</span></span>
                    <input type="checkbox" className="h-4 w-4 accent-plex" checked={enabled} onChange={(event) => onEnabledChange(event.target.checked)} />
                </label>
                <label className="flex items-center justify-between gap-4">
                    <span><span className="block font-semibold">Enable automated upgrades</span><span className="block text-xs text-muted mt-1">Allows quality-profile changes and searches from the Upgrader.</span></span>
                    <input type="checkbox" className="h-4 w-4 accent-plex" disabled={!enabled} checked={automationEnabled && enabled} onChange={(event) => onAutomationEnabledChange(event.target.checked)} />
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <label className="text-sm font-semibold">Minimum file size (GB)
                        <input type="number" min="0" className="mt-2 w-full p-2.5 rounded-lg border border-border bg-background text-text" value={minSizeGB} disabled={!enabled} onChange={(event) => onMinSizeGBChange(Number(event.target.value) || 0)} />
                    </label>
                    <label className="text-sm font-semibold">Maximum actions per hour
                        <input type="number" min="1" className="mt-2 w-full p-2.5 rounded-lg border border-border bg-background text-text" value={maxActionsPerHour} disabled={!enabled} onChange={(event) => onMaxActionsPerHourChange(Math.max(1, Number(event.target.value) || 1))} />
                    </label>
                </div>
            </div>
        </section>
    </div>
);
