import React from 'react';

type Prefs = {
    preferDolbyVisionHdr: boolean;
    preferAtmos: boolean;
    preferRemux: boolean;
    preferSeasonPacks: boolean;
};

type Props = {
    enabled: boolean;
    automationEnabled: boolean;
    minSizeGB: number;
    maxActionsPerHour: number;
    minScoreDelta: number;
    preferences: Prefs;
    onEnabledChange: (value: boolean) => void;
    onAutomationEnabledChange: (value: boolean) => void;
    onMinSizeGBChange: (value: number) => void;
    onMaxActionsPerHourChange: (value: number) => void;
    onMinScoreDeltaChange: (value: number) => void;
    onPreferencesChange: (value: Prefs) => void;
};

export const UpgraderSettingsPanel: React.FC<Props> = ({
    enabled,
    automationEnabled,
    minSizeGB,
    maxActionsPerHour,
    minScoreDelta,
    preferences,
    onEnabledChange,
    onAutomationEnabledChange,
    onMinSizeGBChange,
    onMaxActionsPerHourChange,
    onMinScoreDeltaChange,
    onPreferencesChange,
}) => (
    <div className="mb-8 animate-fade-in space-y-6">
        <h3 className="text-xl font-bold text-plex mb-4 border-b border-border pb-2">Quality Hunt</h3>
        <section id="upgrader" className="space-y-5 scroll-mt-24">
            <p className="text-sm text-muted">
                Hunts Sonarr/Radarr libraries for higher custom-format scores (Remux, DV/HDR, Atmos) and can auto-grab upgrades.
                Season packs are preferred for TV, but never when they would downgrade resolution (e.g. 1080p pack over 4K episodes).
            </p>
            <div className="rounded-xl border border-border/60 bg-white/[0.02] p-5 space-y-4">
                <label className="flex items-center justify-between gap-4">
                    <span>
                        <span className="block font-semibold">Enable Quality Hunt</span>
                        <span className="block text-xs text-muted mt-1">Shows the admin Quality Hunt page and enables its API.</span>
                    </span>
                    <input type="checkbox" className="h-4 w-4 accent-plex" checked={enabled} onChange={(event) => onEnabledChange(event.target.checked)} />
                </label>
                <label className="flex items-center justify-between gap-4">
                    <span>
                        <span className="block font-semibold">Enable auto-hunt</span>
                        <span className="block text-xs text-muted mt-1">Background hunt every ~20 minutes, plus manual “Grab better releases” in Quality Hunt.</span>
                    </span>
                    <input
                        type="checkbox"
                        className="h-4 w-4 accent-plex"
                        disabled={!enabled}
                        checked={automationEnabled && enabled}
                        onChange={(event) => onAutomationEnabledChange(event.target.checked)}
                    />
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <label className="text-sm font-semibold">Minimum file size (GB)
                        <input
                            type="number"
                            min="0"
                            className="mt-2 w-full p-2.5 rounded-lg border border-border bg-background text-text"
                            value={minSizeGB}
                            disabled={!enabled}
                            onChange={(event) => onMinSizeGBChange(Number(event.target.value) || 0)}
                        />
                    </label>
                    <label className="text-sm font-semibold">Maximum actions per hour
                        <input
                            type="number"
                            min="1"
                            className="mt-2 w-full p-2.5 rounded-lg border border-border bg-background text-text"
                            value={maxActionsPerHour}
                            disabled={!enabled}
                            onChange={(event) => onMaxActionsPerHourChange(Math.max(1, Number(event.target.value) || 1))}
                        />
                    </label>
                    <label className="text-sm font-semibold">Minimum score delta
                        <input
                            type="number"
                            min="0"
                            className="mt-2 w-full p-2.5 rounded-lg border border-border bg-background text-text"
                            value={minScoreDelta}
                            disabled={!enabled}
                            onChange={(event) => onMinScoreDeltaChange(Math.max(0, Number(event.target.value) || 0))}
                        />
                    </label>
                </div>
                <div className="pt-2 border-t border-border/40 space-y-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-muted">Portal preference boosts</p>
                    {([
                        ['preferDolbyVisionHdr', 'Prefer Dolby Vision + HDR'],
                        ['preferAtmos', 'Prefer Atmos / TrueHD'],
                        ['preferRemux', 'Prefer Remux'],
                        ['preferSeasonPacks', 'Prefer season packs (TV, never downgrade res)'],
                    ] as const).map(([key, label]) => (
                        <label key={key} className="flex items-center justify-between gap-4">
                            <span className="text-sm font-semibold">{label}</span>
                            <input
                                type="checkbox"
                                className="h-4 w-4 accent-plex"
                                disabled={!enabled}
                                checked={!!preferences[key]}
                                onChange={(event) => onPreferencesChange({ ...preferences, [key]: event.target.checked })}
                            />
                        </label>
                    ))}
                </div>
            </div>
        </section>
    </div>
);
