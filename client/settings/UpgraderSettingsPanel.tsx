import React from 'react';
import {
    applyCleanupPreset,
    applyHuntPreset,
    CLEANUP_PRESET_LABELS,
    HUNT_PRESET_LABELS,
    type QcPresetId,
} from './qcPresets';

const PRESET_IDS: QcPresetId[] = ['relaxed', 'balanced', 'aggressive', 'custom'];

const selectClassName = 'mt-2 w-full p-2.5 rounded-lg border border-border bg-background text-text outline-none focus:border-plex transition-all';

type Prefs = {
    preferDolbyVisionHdr: boolean;
    preferAtmos: boolean;
    preferRemux: boolean;
    preferSeasonPacks: boolean;
};

type QcSettingsSection = 'qc-hunt' | 'qc-downloads' | 'qc-integrity';

type Props = {
    section: QcSettingsSection;
    enabled: boolean;
    automationEnabled: boolean;
    huntMissingEpisodes: boolean;
    huntAvailableMovies: boolean;
    minSizeGB: number;
    maxActionsPerHour: number;
    maxDownloadsPerLibrary: number;
    minScoreDelta: number;
    upgraderHuntIntensity: string;
    preferences: Prefs;
    qcCleanupAutomationEnabled: boolean;
    qcCleanupAggression: string;
    integrityEnabled: boolean;
    integrityAutomationEnabled: boolean;
    integrityRequireAudio: boolean;
    integrityIncludeMusic: boolean;
    integrityXxhashEnabled: boolean;
    integrityPathMaps: Array<{ from: string; to: string }>;
    integrityMaxPerCycle: number;
    integrityConcurrency: number;
    integrityPlayabilityConcurrency: number;
    integrityBreakerMaxFindings: number;
    integrityBreakerMaxPercent: number;
    integrityPauseWhenSessions: number;
    integrityNightlyHour: number;
    integrityDecodeWindowSec: number;
    integrityDecodeTimeoutMs: number;
    integrityDecodeRetries: number;
    integritySoftDecodeTimeouts: boolean;
    integrityWebhookUsername: string;
    integrityWebhookPassword: string;
    qcMetaDlMinutes: number;
    qcStalledHours: number;
    qcSlowDownloadFloorKbps: number;
    qcSlowDownloadMinAgeHours: number;
    qcCompletedNotImportingMinutes: number;
    qcOrphanGraceMinutes: number;
    qcMaxStrikes: number;
    qcResearchThrottleHours: number;
    qcSnoozeDefaultHours: number;
    onEnabledChange: (value: boolean) => void;
    onAutomationEnabledChange: (value: boolean) => void;
    onHuntMissingEpisodesChange: (value: boolean) => void;
    onHuntAvailableMoviesChange: (value: boolean) => void;
    onMinSizeGBChange: (value: number) => void;
    onMaxActionsPerHourChange: (value: number) => void;
    onMaxDownloadsPerLibraryChange: (value: number) => void;
    onMinScoreDeltaChange: (value: number) => void;
    onUpgraderHuntIntensityChange: (value: string) => void;
    onPreferencesChange: (value: Prefs) => void;
    onQcCleanupAutomationEnabledChange: (value: boolean) => void;
    onQcCleanupAggressionChange: (value: string) => void;
    onIntegrityEnabledChange: (value: boolean) => void;
    onIntegrityAutomationEnabledChange: (value: boolean) => void;
    onIntegrityRequireAudioChange: (value: boolean) => void;
    onIntegrityIncludeMusicChange: (value: boolean) => void;
    onIntegrityXxhashEnabledChange: (value: boolean) => void;
    onIntegrityPathMapsChange: (value: Array<{ from: string; to: string }>) => void;
    onIntegrityMaxPerCycleChange: (value: number) => void;
    onIntegrityConcurrencyChange: (value: number) => void;
    onIntegrityPlayabilityConcurrencyChange: (value: number) => void;
    onIntegrityBreakerMaxFindingsChange: (value: number) => void;
    onIntegrityBreakerMaxPercentChange: (value: number) => void;
    onIntegrityPauseWhenSessionsChange: (value: number) => void;
    onIntegrityNightlyHourChange: (value: number) => void;
    onIntegrityDecodeWindowSecChange: (value: number) => void;
    onIntegrityDecodeTimeoutMsChange: (value: number) => void;
    onIntegrityDecodeRetriesChange: (value: number) => void;
    onIntegritySoftDecodeTimeoutsChange: (value: boolean) => void;
    onIntegrityWebhookUsernameChange: (value: string) => void;
    onIntegrityWebhookPasswordChange: (value: string) => void;
    onQcMetaDlMinutesChange: (value: number) => void;
    onQcStalledHoursChange: (value: number) => void;
    onQcSlowDownloadFloorKbpsChange: (value: number) => void;
    onQcSlowDownloadMinAgeHoursChange: (value: number) => void;
    onQcCompletedNotImportingMinutesChange: (value: number) => void;
    onQcOrphanGraceMinutesChange: (value: number) => void;
    onQcMaxStrikesChange: (value: number) => void;
    onQcResearchThrottleHoursChange: (value: number) => void;
    onQcSnoozeDefaultHoursChange: (value: number) => void;
};

export const UpgraderSettingsPanel: React.FC<Props> = ({
    section,
    enabled,
    automationEnabled,
    huntMissingEpisodes,
    huntAvailableMovies,
    minSizeGB,
    maxActionsPerHour,
    maxDownloadsPerLibrary,
    minScoreDelta,
    upgraderHuntIntensity,
    preferences,
    qcCleanupAutomationEnabled,
    qcCleanupAggression,
    integrityEnabled,
    integrityAutomationEnabled,
    integrityRequireAudio,
    integrityIncludeMusic,
    integrityXxhashEnabled,
    integrityPathMaps,
    integrityMaxPerCycle: _integrityMaxPerCycle,
    integrityConcurrency,
    integrityPlayabilityConcurrency,
    integrityBreakerMaxFindings,
    integrityBreakerMaxPercent,
    integrityPauseWhenSessions,
    integrityNightlyHour,
    integrityDecodeWindowSec,
    integrityDecodeTimeoutMs,
    integrityDecodeRetries,
    integritySoftDecodeTimeouts,
    integrityWebhookUsername,
    integrityWebhookPassword,
    qcMetaDlMinutes,
    qcStalledHours,
    qcSlowDownloadFloorKbps,
    qcSlowDownloadMinAgeHours,
    qcCompletedNotImportingMinutes,
    qcOrphanGraceMinutes,
    qcMaxStrikes,
    qcResearchThrottleHours,
    qcSnoozeDefaultHours,
    onEnabledChange,
    onAutomationEnabledChange,
    onHuntMissingEpisodesChange,
    onHuntAvailableMoviesChange,
    onMinSizeGBChange,
    onMaxActionsPerHourChange,
    onMaxDownloadsPerLibraryChange,
    onMinScoreDeltaChange,
    onUpgraderHuntIntensityChange,
    onPreferencesChange,
    onQcCleanupAutomationEnabledChange,
    onQcCleanupAggressionChange,
    onIntegrityEnabledChange,
    onIntegrityAutomationEnabledChange,
    onIntegrityRequireAudioChange,
    onIntegrityIncludeMusicChange,
    onIntegrityXxhashEnabledChange,
    onIntegrityPathMapsChange,
    onIntegrityMaxPerCycleChange: _onIntegrityMaxPerCycleChange,
    onIntegrityConcurrencyChange,
    onIntegrityPlayabilityConcurrencyChange,
    onIntegrityBreakerMaxFindingsChange,
    onIntegrityBreakerMaxPercentChange,
    onIntegrityPauseWhenSessionsChange,
    onIntegrityNightlyHourChange,
    onIntegrityDecodeWindowSecChange,
    onIntegrityDecodeTimeoutMsChange,
    onIntegrityDecodeRetriesChange,
    onIntegritySoftDecodeTimeoutsChange,
    onIntegrityWebhookUsernameChange,
    onIntegrityWebhookPasswordChange,
    onQcMetaDlMinutesChange,
    onQcStalledHoursChange,
    onQcSlowDownloadFloorKbpsChange,
    onQcSlowDownloadMinAgeHoursChange,
    onQcCompletedNotImportingMinutesChange,
    onQcOrphanGraceMinutesChange,
    onQcMaxStrikesChange,
    onQcResearchThrottleHoursChange,
    onQcSnoozeDefaultHoursChange,
}) => {
    const handleHuntIntensitySelect = (value: string) => {
        if (value === 'custom') {
            onUpgraderHuntIntensityChange('custom');
            return;
        }
        if (value === 'relaxed' || value === 'balanced' || value === 'aggressive') {
            const preset = applyHuntPreset(value);
            onMaxActionsPerHourChange(preset.upgraderMaxActionsPerHour);
            onMaxDownloadsPerLibraryChange(preset.upgraderMaxDownloadsPerLibrary);
            onMinScoreDeltaChange(preset.upgraderMinScoreDelta);
            onUpgraderHuntIntensityChange(preset.upgraderHuntIntensity ?? value);
        }
    };

    const handleCleanupAggressionSelect = (value: string) => {
        if (value === 'custom') {
            onQcCleanupAggressionChange('custom');
            return;
        }
        if (value === 'relaxed' || value === 'balanced' || value === 'aggressive') {
            const preset = applyCleanupPreset(value);
            onQcMaxStrikesChange(preset.qcMaxStrikes);
            onQcMetaDlMinutesChange(preset.qcMetaDlMinutes);
            onQcStalledHoursChange(preset.qcStalledHours);
            onQcCompletedNotImportingMinutesChange(preset.qcCompletedNotImportingMinutes);
            onQcOrphanGraceMinutesChange(preset.qcOrphanGraceMinutes);
            onQcSlowDownloadFloorKbpsChange(preset.qcSlowDownloadFloorKbps);
            onQcSlowDownloadMinAgeHoursChange(preset.qcSlowDownloadMinAgeHours);
            onQcCleanupAggressionChange(preset.qcCleanupAggression ?? value);
        }
    };

    const markHuntCustom = () => onUpgraderHuntIntensityChange('custom');
    const markCleanupCustom = () => onQcCleanupAggressionChange('custom');

    return (
        <div className="mb-8 animate-fade-in space-y-6">
            <section className="space-y-5">
                {section === 'qc-hunt' && (
                    <div className="space-y-4">
                        <div className="rounded-xl border border-border/60 bg-white/[0.02] p-5 space-y-4">
                            <h4 className="text-sm font-bold uppercase tracking-wide text-muted">Quality Control</h4>
                            <label className="flex items-center justify-between gap-4">
                                <span className="font-semibold">Turn on Quality Control</span>
                                <input type="checkbox" className="h-4 w-4 accent-plex" checked={enabled} onChange={(event) => onEnabledChange(event.target.checked)} />
                            </label>
                            <label className="flex items-center justify-between gap-4">
                                <span className="font-semibold">Automatically hunt upgrades</span>
                                <input
                                    type="checkbox"
                                    className="h-4 w-4 accent-plex"
                                    disabled={!enabled}
                                    checked={automationEnabled && enabled}
                                    onChange={(event) => onAutomationEnabledChange(event.target.checked)}
                                />
                            </label>
                        </div>
                    <div className="rounded-xl border border-border/60 bg-white/[0.02] p-5 space-y-4">
                        <h4 className="text-sm font-bold uppercase tracking-wide text-muted">What to hunt</h4>
                        <div className="space-y-3">
                            <label className="flex items-center justify-between gap-4">
                                <span className="font-semibold">Missing TV episodes that have aired</span>
                                <input
                                    type="checkbox"
                                    className="h-4 w-4 accent-plex"
                                    disabled={!enabled}
                                    checked={huntMissingEpisodes && enabled}
                                    onChange={(event) => onHuntMissingEpisodesChange(event.target.checked)}
                                />
                            </label>
                            <label className="flex items-center justify-between gap-4">
                                <span className="font-semibold">Movies that are digitally available</span>
                                <input
                                    type="checkbox"
                                    className="h-4 w-4 accent-plex"
                                    disabled={!enabled}
                                    checked={huntAvailableMovies && enabled}
                                    onChange={(event) => onHuntAvailableMoviesChange(event.target.checked)}
                                />
                            </label>
                        </div>
                        <label className="text-sm font-semibold block max-w-md">
                            Ignore files smaller than (GB)
                            <input
                                type="number"
                                min="0"
                                className="mt-2 w-full p-2.5 rounded-lg border border-border bg-background text-text"
                                value={minSizeGB}
                                disabled={!enabled}
                                onChange={(event) => onMinSizeGBChange(Number(event.target.value) || 0)}
                            />
                        </label>
                        <div className="pt-2 border-t border-border/40 space-y-3">
                            <p className="text-xs font-bold uppercase tracking-wide text-muted">When choosing an upgrade, prefer</p>
                            {([
                                ['preferDolbyVisionHdr', 'Dolby Vision + HDR'],
                                ['preferAtmos', 'Atmos / TrueHD'],
                                ['preferRemux', 'Remux'],
                                ['preferSeasonPacks', 'Season packs (never lower resolution)'],
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

                        <div className="pt-2 border-t border-border/40 space-y-4">
                            <label className="text-sm font-semibold block max-w-md">
                                How hard to hunt
                                <select
                                    className={selectClassName}
                                    value={upgraderHuntIntensity || 'balanced'}
                                    disabled={!enabled}
                                    onChange={(event) => handleHuntIntensitySelect(event.target.value)}
                                >
                                    {PRESET_IDS.map((id) => (
                                        <option key={id} value={id}>{HUNT_PRESET_LABELS[id]}</option>
                                    ))}
                                </select>
                            </label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <label className="text-sm font-semibold">
                                    Max upgrades per hour
                                    <input
                                        type="number"
                                        min="1"
                                        className="mt-2 w-full p-2.5 rounded-lg border border-border bg-background text-text"
                                        value={maxActionsPerHour}
                                        disabled={!enabled}
                                        onChange={(event) => {
                                            onMaxActionsPerHourChange(Math.max(1, Number(event.target.value) || 1));
                                            markHuntCustom();
                                        }}
                                    />
                                </label>
                                <label className="text-sm font-semibold">
                                    Max downloads at once per library
                                    <input
                                        type="number"
                                        min="1"
                                        className="mt-2 w-full p-2.5 rounded-lg border border-border bg-background text-text"
                                        value={maxDownloadsPerLibrary}
                                        disabled={!enabled}
                                        onChange={(event) => {
                                            onMaxDownloadsPerLibraryChange(Math.max(1, Number(event.target.value) || 1));
                                            markHuntCustom();
                                        }}
                                    />
                                </label>
                                <label className="text-sm font-semibold">
                                    Min score gain to upgrade
                                    <input
                                        type="number"
                                        min="0"
                                        className="mt-2 w-full p-2.5 rounded-lg border border-border bg-background text-text"
                                        value={minScoreDelta}
                                        disabled={!enabled}
                                        onChange={(event) => {
                                            onMinScoreDeltaChange(Math.max(0, Number(event.target.value) || 0));
                                            markHuntCustom();
                                        }}
                                    />
                                </label>
                            </div>
                        </div>
                    </div>
                    </div>
                )}

                {section === 'qc-downloads' && (
                    <div className="rounded-xl border border-border/60 bg-white/[0.02] p-5 space-y-4">
                        <h4 className="text-sm font-bold uppercase tracking-wide text-muted">Stuck download cleanup</h4>
                        <label className="flex items-center justify-between gap-4">
                            <span className="font-semibold">Automatically remove stuck downloads</span>
                            <input
                                type="checkbox"
                                className="h-4 w-4 accent-plex"
                                disabled={!enabled}
                                checked={qcCleanupAutomationEnabled && enabled}
                                onChange={(event) => onQcCleanupAutomationEnabledChange(event.target.checked)}
                            />
                        </label>
                        <label className="text-sm font-semibold block max-w-md">
                            How quickly to remove them
                            <select
                                className={selectClassName}
                                value={qcCleanupAggression || 'balanced'}
                                disabled={!enabled}
                                onChange={(event) => handleCleanupAggressionSelect(event.target.value)}
                            >
                                {PRESET_IDS.map((id) => (
                                    <option key={id} value={id}>{CLEANUP_PRESET_LABELS[id]}</option>
                                ))}
                            </select>
                        </label>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            <label className="text-sm font-semibold">
                                Warnings before remove
                                <input
                                    type="number"
                                    min="1"
                                    className="mt-2 w-full p-2.5 rounded-lg border border-border bg-background text-text"
                                    value={qcMaxStrikes}
                                    disabled={!enabled}
                                    onChange={(event) => {
                                        onQcMaxStrikesChange(Math.max(1, Number(event.target.value) || 1));
                                        markCleanupCustom();
                                    }}
                                />
                            </label>
                            <label className="text-sm font-semibold">
                                Stuck getting torrent info (minutes)
                                <input
                                    type="number"
                                    min="1"
                                    className="mt-2 w-full p-2.5 rounded-lg border border-border bg-background text-text"
                                    value={qcMetaDlMinutes}
                                    disabled={!enabled}
                                    onChange={(event) => {
                                        onQcMetaDlMinutesChange(Math.max(1, Number(event.target.value) || 1));
                                        markCleanupCustom();
                                    }}
                                />
                            </label>
                            <label className="text-sm font-semibold">
                                No progress (hours)
                                <input
                                    type="number"
                                    min="1"
                                    className="mt-2 w-full p-2.5 rounded-lg border border-border bg-background text-text"
                                    value={qcStalledHours}
                                    disabled={!enabled}
                                    onChange={(event) => {
                                        onQcStalledHoursChange(Math.max(1, Number(event.target.value) || 1));
                                        markCleanupCustom();
                                    }}
                                />
                            </label>
                            <label className="text-sm font-semibold">
                                Too slow if under (KB/s)
                                <input
                                    type="number"
                                    min="0"
                                    className="mt-2 w-full p-2.5 rounded-lg border border-border bg-background text-text"
                                    value={qcSlowDownloadFloorKbps}
                                    disabled={!enabled}
                                    onChange={(event) => {
                                        onQcSlowDownloadFloorKbpsChange(Math.max(0, Number(event.target.value) || 0));
                                        markCleanupCustom();
                                    }}
                                />
                            </label>
                            <label className="text-sm font-semibold">
                                Wait this long before slow check (hours)
                                <input
                                    type="number"
                                    min="0"
                                    className="mt-2 w-full p-2.5 rounded-lg border border-border bg-background text-text"
                                    value={qcSlowDownloadMinAgeHours}
                                    disabled={!enabled}
                                    onChange={(event) => {
                                        onQcSlowDownloadMinAgeHoursChange(Math.max(0, Number(event.target.value) || 0));
                                        markCleanupCustom();
                                    }}
                                />
                            </label>
                            <label className="text-sm font-semibold">
                                Finished download, not in library yet (minutes)
                                <input
                                    type="number"
                                    min="1"
                                    className="mt-2 w-full p-2.5 rounded-lg border border-border bg-background text-text"
                                    value={qcCompletedNotImportingMinutes}
                                    disabled={!enabled}
                                    onChange={(event) => {
                                        onQcCompletedNotImportingMinutesChange(Math.max(1, Number(event.target.value) || 1));
                                        markCleanupCustom();
                                    }}
                                />
                            </label>
                            <label className="text-sm font-semibold">
                                In downloader with no Arr job (minutes)
                                <input
                                    type="number"
                                    min="0"
                                    className="mt-2 w-full p-2.5 rounded-lg border border-border bg-background text-text"
                                    value={qcOrphanGraceMinutes}
                                    disabled={!enabled}
                                    onChange={(event) => {
                                        onQcOrphanGraceMinutesChange(Math.max(0, Number(event.target.value) || 0));
                                        markCleanupCustom();
                                    }}
                                />
                            </label>
                            <label className="text-sm font-semibold">
                                Wait between re-searches (hours)
                                <input
                                    type="number"
                                    min="1"
                                    className="mt-2 w-full p-2.5 rounded-lg border border-border bg-background text-text"
                                    value={qcResearchThrottleHours}
                                    disabled={!enabled}
                                    onChange={(event) => {
                                        onQcResearchThrottleHoursChange(Math.max(1, Number(event.target.value) || 1));
                                        markCleanupCustom();
                                    }}
                                />
                            </label>
                            <label className="text-sm font-semibold">
                                How long a snooze lasts (hours)
                                <input
                                    type="number"
                                    min="1"
                                    className="mt-2 w-full p-2.5 rounded-lg border border-border bg-background text-text"
                                    value={qcSnoozeDefaultHours}
                                    disabled={!enabled}
                                    onChange={(event) => {
                                        onQcSnoozeDefaultHoursChange(Math.max(1, Number(event.target.value) || 1));
                                        markCleanupCustom();
                                    }}
                                />
                            </label>
                        </div>
                    </div>
                )}

                {section === 'qc-integrity' && (
                    <div className="space-y-4">
                        <div className="rounded-xl border border-border/60 bg-white/[0.02] p-5 space-y-4">
                            <h4 className="text-sm font-bold uppercase tracking-wide text-muted">Library checks</h4>
                            <label className="flex items-center justify-between gap-4">
                                <span className="font-semibold">Scan library files for problems</span>
                                <input
                                    type="checkbox"
                                    className="h-4 w-4 accent-plex"
                                    disabled={!enabled}
                                    checked={integrityEnabled && enabled}
                                    onChange={(event) => onIntegrityEnabledChange(event.target.checked)}
                                />
                            </label>
                            <label className="flex items-center justify-between gap-4">
                                <span className="min-w-0">
                                    <span className="font-semibold">Delete bad files and re-search replacements</span>
                                    <p className="text-xs text-muted font-normal mt-0.5">Prefer dry-run on the QC dashboard first.</p>
                                </span>
                                <input
                                    type="checkbox"
                                    className="h-4 w-4 accent-plex"
                                    disabled={!enabled || !integrityEnabled}
                                    checked={integrityAutomationEnabled && integrityEnabled && enabled}
                                    onChange={(event) => onIntegrityAutomationEnabledChange(event.target.checked)}
                                />
                            </label>
                        </div>

                        <div className="rounded-xl border border-border/60 bg-white/[0.02] p-5 space-y-4">
                            <h4 className="text-sm font-bold uppercase tracking-wide text-muted">Arr import hooks</h4>
                            <p className="text-xs text-muted">
                                Point Arr at: <code className="text-[11px]">/triggers/sonarr</code>,{' '}
                                <code className="text-[11px]">/triggers/radarr</code>,{' '}
                                <code className="text-[11px]">/triggers/lidarr</code>
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <label className="text-sm font-semibold">
                                    Hook username
                                    <input
                                        type="text"
                                        className="mt-2 w-full p-2.5 rounded-lg border border-border bg-background text-text"
                                        value={integrityWebhookUsername}
                                        disabled={!enabled}
                                        autoComplete="off"
                                        onChange={(event) => onIntegrityWebhookUsernameChange(event.target.value)}
                                    />
                                </label>
                                <label className="text-sm font-semibold">
                                    Hook password
                                    <input
                                        type="password"
                                        className="mt-2 w-full p-2.5 rounded-lg border border-border bg-background text-text"
                                        value={integrityWebhookPassword}
                                        disabled={!enabled}
                                        autoComplete="new-password"
                                        placeholder="••••••••"
                                        onChange={(event) => onIntegrityWebhookPasswordChange(event.target.value)}
                                    />
                                    <p className="text-xs text-muted font-normal mt-1">Leave blank to keep the current password.</p>
                                </label>
                            </div>
                        </div>

                        <div className="rounded-xl border border-border/60 bg-white/[0.02] p-5 space-y-4">
                            <h4 className="text-sm font-bold uppercase tracking-wide text-muted">What to check</h4>
                            <label className="text-sm font-semibold block">
                                Path translation (Arr path = path inside this container)
                                <textarea
                                    className="mt-2 w-full min-h-[90px] p-2.5 rounded-lg border border-border bg-background text-text text-sm font-mono"
                                    disabled={!enabled || !integrityEnabled}
                                    value={(integrityPathMaps || []).map((entry) => `${entry.from}=${entry.to}`).join('\n')}
                                    placeholder={'/movies=/media/movies\n/tv=/media/tv'}
                                    onChange={(event) => {
                                        const maps = event.target.value
                                            .split('\n')
                                            .map((line) => line.trim())
                                            .filter(Boolean)
                                            .map((line) => {
                                                const splitAt = line.includes('=') ? line.indexOf('=') : line.indexOf('→');
                                                if (splitAt < 0) return null;
                                                const from = line.slice(0, splitAt).trim();
                                                const to = line.slice(splitAt + 1).trim();
                                                if (!from || !to) return null;
                                                return { from, to };
                                            })
                                            .filter(Boolean) as Array<{ from: string; to: string }>;
                                        onIntegrityPathMapsChange(maps);
                                    }}
                                />
                            </label>
                            <label className="flex items-center justify-between gap-4">
                                <span className="font-semibold">Fail files with no audio track</span>
                                <input
                                    type="checkbox"
                                    className="h-4 w-4 accent-plex"
                                    disabled={!enabled || !integrityEnabled}
                                    checked={integrityRequireAudio && integrityEnabled && enabled}
                                    onChange={(event) => onIntegrityRequireAudioChange(event.target.checked)}
                                />
                            </label>
                            <label className="flex items-center justify-between gap-4">
                                <span className="font-semibold">Also scan music libraries</span>
                                <input
                                    type="checkbox"
                                    className="h-4 w-4 accent-plex"
                                    disabled={!enabled || !integrityEnabled}
                                    checked={integrityIncludeMusic && integrityEnabled && enabled}
                                    onChange={(event) => onIntegrityIncludeMusicChange(event.target.checked)}
                                />
                            </label>
                            <label className="flex items-center justify-between gap-4">
                                <span className="font-semibold">Hash the whole file (slower, stricter)</span>
                                <input
                                    type="checkbox"
                                    className="h-4 w-4 accent-plex"
                                    disabled={!enabled || !integrityEnabled}
                                    checked={integrityXxhashEnabled && integrityEnabled && enabled}
                                    onChange={(event) => onIntegrityXxhashEnabledChange(event.target.checked)}
                                />
                            </label>
                            <label className="flex items-center justify-between gap-4">
                                <span className="font-semibold">Retry later if a playback check times out</span>
                                <input
                                    type="checkbox"
                                    className="h-4 w-4 accent-plex"
                                    disabled={!enabled || !integrityEnabled}
                                    checked={integritySoftDecodeTimeouts && integrityEnabled && enabled}
                                    onChange={(event) => onIntegritySoftDecodeTimeoutsChange(event.target.checked)}
                                />
                            </label>
                        </div>

                        <div className="rounded-xl border border-border/60 bg-white/[0.02] p-5 space-y-4">
                            <h4 className="text-sm font-bold uppercase tracking-wide text-muted">Scan speed &amp; limits</h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                <label className="text-sm font-semibold">
                                    Files fingerprinting at once
                                    <input
                                        type="number"
                                        min="1"
                                        className="mt-2 w-full p-2.5 rounded-lg border border-border bg-background text-text"
                                        value={integrityConcurrency}
                                        disabled={!enabled || !integrityEnabled}
                                        onChange={(event) => onIntegrityConcurrencyChange(Math.max(1, Number(event.target.value) || 1))}
                                    />
                                </label>
                                <label className="text-sm font-semibold">
                                    Files playback-checking at once
                                    <input
                                        type="number"
                                        min="1"
                                        className="mt-2 w-full p-2.5 rounded-lg border border-border bg-background text-text"
                                        value={integrityPlayabilityConcurrency}
                                        disabled={!enabled || !integrityEnabled}
                                        onChange={(event) => onIntegrityPlayabilityConcurrencyChange(Math.max(1, Number(event.target.value) || 1))}
                                    />
                                </label>
                                <label className="text-sm font-semibold">
                                    Nightly scan start hour (0–23)
                                    <input
                                        type="number"
                                        min="0"
                                        max="23"
                                        className="mt-2 w-full p-2.5 rounded-lg border border-border bg-background text-text"
                                        value={integrityNightlyHour}
                                        disabled={!enabled || !integrityEnabled}
                                        onChange={(event) => onIntegrityNightlyHourChange(Math.max(0, Math.min(23, Number(event.target.value) || 0)))}
                                    />
                                </label>
                                <label className="text-sm font-semibold">
                                    Seconds of video to test-play
                                    <input
                                        type="number"
                                        min="1"
                                        className="mt-2 w-full p-2.5 rounded-lg border border-border bg-background text-text"
                                        value={integrityDecodeWindowSec}
                                        disabled={!enabled || !integrityEnabled}
                                        onChange={(event) => onIntegrityDecodeWindowSecChange(Math.max(1, Number(event.target.value) || 1))}
                                    />
                                </label>
                                <label className="text-sm font-semibold">
                                    Give up on a test-play after (ms)
                                    <input
                                        type="number"
                                        min="1000"
                                        step="1000"
                                        className="mt-2 w-full p-2.5 rounded-lg border border-border bg-background text-text"
                                        value={integrityDecodeTimeoutMs}
                                        disabled={!enabled || !integrityEnabled}
                                        onChange={(event) => onIntegrityDecodeTimeoutMsChange(Math.max(1000, Number(event.target.value) || 1000))}
                                    />
                                </label>
                                <label className="text-sm font-semibold">
                                    Extra tries after a failed test-play
                                    <input
                                        type="number"
                                        min="0"
                                        className="mt-2 w-full p-2.5 rounded-lg border border-border bg-background text-text"
                                        value={integrityDecodeRetries}
                                        disabled={!enabled || !integrityEnabled}
                                        onChange={(event) => onIntegrityDecodeRetriesChange(Math.max(0, Number(event.target.value) || 0))}
                                    />
                                </label>
                                <label className="text-sm font-semibold">
                                    Pause scans when this many are watching
                                    <input
                                        type="number"
                                        min="0"
                                        className="mt-2 w-full p-2.5 rounded-lg border border-border bg-background text-text"
                                        value={integrityPauseWhenSessions}
                                        disabled={!enabled || !integrityEnabled}
                                        onChange={(event) => onIntegrityPauseWhenSessionsChange(Math.max(0, Number(event.target.value) || 0))}
                                    />
                                </label>
                                <label className="text-sm font-semibold">
                                    Stop a scan after this many bad files
                                    <input
                                        type="number"
                                        min="1"
                                        className="mt-2 w-full p-2.5 rounded-lg border border-border bg-background text-text"
                                        value={integrityBreakerMaxFindings}
                                        disabled={!enabled || !integrityEnabled}
                                        onChange={(event) => onIntegrityBreakerMaxFindingsChange(Math.max(1, Number(event.target.value) || 1))}
                                    />
                                </label>
                                <label className="text-sm font-semibold">
                                    Stop a scan after this % of library is bad
                                    <input
                                        type="number"
                                        min="0.1"
                                        step="0.1"
                                        className="mt-2 w-full p-2.5 rounded-lg border border-border bg-background text-text"
                                        value={integrityBreakerMaxPercent}
                                        disabled={!enabled || !integrityEnabled}
                                        onChange={(event) => onIntegrityBreakerMaxPercentChange(Math.max(0.1, Number(event.target.value) || 0.1))}
                                    />
                                </label>
                            </div>
                        </div>
                    </div>
                )}
            </section>
        </div>
    );
};
