import React from 'react';
import {
    applyCleanupPreset,
    applyHuntPreset,
    CLEANUP_PRESET_LABELS,
    HUNT_PRESET_LABELS,
    type QcPresetId,
} from './qcPresets';
import {
    IntegritySchedulePolicyCard,
    type IntegritySchedulePolicy,
} from './IntegritySchedulePolicyCard';

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
    huntIndexerDeny: string;
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
    integrityPlexRefreshAfterImport: boolean;
    integrityRequireAudio: boolean;
    integrityIncludeMusic: boolean;
    integrityXxhashEnabled: boolean;
    qcTrimEnabled: boolean;
    qcTrimDryRun: boolean;
    qcTrimLanguages: string;
    qcTrimKeepNativeAudio: boolean;
    qcTrimStripCommentary: boolean;
    qcTrimStripLowerChannels: boolean;
    qcTrimDeleteMetadataTitle: boolean;
    integrityPathMaps: Array<{ from: string; to: string }>;
    integrityMaxPerCycle: number;
    integrityConcurrency: number;
    integrityPlayabilityConcurrency: number;
    integrityTrimConcurrency: number;
    integrityBreakerMaxFindings: number;
    integrityBreakerMaxPercent: number;
    integrityPauseWhenSessions: number;
    integrityNightlyHour: number;
    integritySchedulePolicy: IntegritySchedulePolicy;
    integrityDecodeWindowSec: number;
    integrityDecodeTimeoutMs: number;
    integrityDecodeRetries: number;
    integritySoftDecodeTimeouts: boolean;
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
    onHuntIndexerDenyChange: (value: string) => void;
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
    onIntegrityPlexRefreshAfterImportChange: (value: boolean) => void;
    onIntegrityRequireAudioChange: (value: boolean) => void;
    onIntegrityIncludeMusicChange: (value: boolean) => void;
    onIntegrityXxhashEnabledChange: (value: boolean) => void;
    onQcTrimEnabledChange: (value: boolean) => void;
    onQcTrimDryRunChange: (value: boolean) => void;
    onQcTrimLanguagesChange: (value: string) => void;
    onQcTrimKeepNativeAudioChange: (value: boolean) => void;
    onQcTrimStripCommentaryChange: (value: boolean) => void;
    onQcTrimStripLowerChannelsChange: (value: boolean) => void;
    onQcTrimDeleteMetadataTitleChange: (value: boolean) => void;
    onIntegrityPathMapsChange: (value: Array<{ from: string; to: string }>) => void;
    onIntegrityMaxPerCycleChange: (value: number) => void;
    onIntegrityConcurrencyChange: (value: number) => void;
    onIntegrityPlayabilityConcurrencyChange: (value: number) => void;
    onIntegrityTrimConcurrencyChange: (value: number) => void;
    onIntegrityBreakerMaxFindingsChange: (value: number) => void;
    onIntegrityBreakerMaxPercentChange: (value: number) => void;
    onIntegrityPauseWhenSessionsChange: (value: number) => void;
    onIntegrityNightlyHourChange: (value: number) => void;
    onIntegritySchedulePolicyChange: (value: IntegritySchedulePolicy) => void;
    onIntegrityDecodeWindowSecChange: (value: number) => void;
    onIntegrityDecodeTimeoutMsChange: (value: number) => void;
    onIntegrityDecodeRetriesChange: (value: number) => void;
    onIntegritySoftDecodeTimeoutsChange: (value: boolean) => void;
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
    huntIndexerDeny,
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
    integrityPlexRefreshAfterImport,
    integrityRequireAudio,
    integrityIncludeMusic,
    integrityXxhashEnabled,
    qcTrimEnabled,
    qcTrimDryRun,
    qcTrimLanguages,
    qcTrimKeepNativeAudio,
    qcTrimStripCommentary,
    qcTrimStripLowerChannels,
    qcTrimDeleteMetadataTitle,
    integrityPathMaps,
    integrityMaxPerCycle: _integrityMaxPerCycle,
    integrityConcurrency,
    integrityPlayabilityConcurrency,
    integrityTrimConcurrency,
    integrityBreakerMaxFindings,
    integrityBreakerMaxPercent,
    integrityPauseWhenSessions,
    integrityNightlyHour,
    integritySchedulePolicy,
    integrityDecodeWindowSec,
    integrityDecodeTimeoutMs,
    integrityDecodeRetries,
    integritySoftDecodeTimeouts,
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
    onHuntIndexerDenyChange,
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
    onIntegrityPlexRefreshAfterImportChange,
    onIntegrityRequireAudioChange,
    onIntegrityIncludeMusicChange,
    onIntegrityXxhashEnabledChange,
    onQcTrimEnabledChange,
    onQcTrimDryRunChange,
    onQcTrimLanguagesChange,
    onQcTrimKeepNativeAudioChange,
    onQcTrimStripCommentaryChange,
    onQcTrimStripLowerChannelsChange,
    onQcTrimDeleteMetadataTitleChange,
    onIntegrityPathMapsChange,
    onIntegrityMaxPerCycleChange: _onIntegrityMaxPerCycleChange,
    onIntegrityConcurrencyChange,
    onIntegrityPlayabilityConcurrencyChange,
    onIntegrityTrimConcurrencyChange,
    onIntegrityBreakerMaxFindingsChange,
    onIntegrityBreakerMaxPercentChange,
    onIntegrityPauseWhenSessionsChange,
    onIntegrityNightlyHourChange,
    onIntegritySchedulePolicyChange,
    onIntegrityDecodeWindowSecChange,
    onIntegrityDecodeTimeoutMsChange,
    onIntegrityDecodeRetriesChange,
    onIntegritySoftDecodeTimeoutsChange,
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
                                <span className="font-semibold">Enable QC</span>
                                <input type="checkbox" className="h-4 w-4 accent-plex" checked={enabled} onChange={(event) => onEnabledChange(event.target.checked)} />
                            </label>
                            <label className="flex items-center justify-between gap-4">
                                <span className="font-semibold">Auto-hunt</span>
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
                        <h4 className="text-sm font-bold uppercase tracking-wide text-muted">Targets</h4>
                        <div className="space-y-3">
                            <label className="flex items-center justify-between gap-4">
                                <span className="font-semibold">Missing episodes</span>
                                <input
                                    type="checkbox"
                                    className="h-4 w-4 accent-plex"
                                    disabled={!enabled}
                                    checked={huntMissingEpisodes && enabled}
                                    onChange={(event) => onHuntMissingEpisodesChange(event.target.checked)}
                                />
                            </label>
                            <label className="flex items-center justify-between gap-4">
                                <span className="font-semibold">Available movies</span>
                                <input
                                    type="checkbox"
                                    className="h-4 w-4 accent-plex"
                                    disabled={!enabled}
                                    checked={huntAvailableMovies && enabled}
                                    onChange={(event) => onHuntAvailableMoviesChange(event.target.checked)}
                                />
                            </label>
                            <label className="text-sm font-semibold block">
                                Hunt indexer deny list
                                <input
                                    type="text"
                                    className="mt-2 w-full p-2.5 rounded-lg border border-border bg-background text-text"
                                    value={huntIndexerDeny}
                                    disabled={!enabled}
                                    placeholder="bitmagnet"
                                    onChange={(event) => onHuntIndexerDenyChange(event.target.value)}
                                />
                                <span className="mt-1 block text-xs font-normal text-muted">
                                    Comma-separated. Hunt never grabs these (manual Arr search still can). Empty defaults to bitmagnet.
                                </span>
                            </label>
                        </div>
                        <label className="text-sm font-semibold block max-w-md">
                            Min size (GB)
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
                            <p className="text-xs font-bold uppercase tracking-wide text-muted">Prefer</p>
                            {([
                                ['preferDolbyVisionHdr', 'Dolby Vision + HDR'],
                                ['preferAtmos', 'Atmos / TrueHD'],
                                ['preferRemux', 'Remux'],
                                ['preferSeasonPacks', 'Season packs'],
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
                                Intensity
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
                                    Max / hour
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
                                    Max / library
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
                                    Min score gain
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
                        <h4 className="text-sm font-bold uppercase tracking-wide text-muted">Cleanup</h4>
                        <label className="flex items-center justify-between gap-4">
                            <span className="font-semibold">Auto-cleanup</span>
                            <input
                                type="checkbox"
                                className="h-4 w-4 accent-plex"
                                disabled={!enabled}
                                checked={qcCleanupAutomationEnabled && enabled}
                                onChange={(event) => onQcCleanupAutomationEnabledChange(event.target.checked)}
                            />
                        </label>
                        <label className="text-sm font-semibold block max-w-md">
                            Intensity
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
                                Strikes
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
                                Metadata stuck (min)
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
                                Stalled (hours)
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
                                Slow floor (KB/s)
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
                                Slow grace (hours)
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
                                Not importing (min)
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
                                No Arr job (min)
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
                                Re-search wait (hours)
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
                                Snooze (hours)
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
                            <h4 className="text-sm font-bold uppercase tracking-wide text-muted">Integrity</h4>
                            <label className="flex items-center justify-between gap-4">
                                <span className="font-semibold">Enable scans</span>
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
                                    <span className="font-semibold">Auto-fix</span>
                                    <p className="text-xs text-muted font-normal mt-0.5">Dry-run first on the QC dashboard.</p>
                                </span>
                                <input
                                    type="checkbox"
                                    className="h-4 w-4 accent-plex"
                                    disabled={!enabled || !integrityEnabled}
                                    checked={integrityAutomationEnabled && integrityEnabled && enabled}
                                    onChange={(event) => onIntegrityAutomationEnabledChange(event.target.checked)}
                                />
                            </label>
                            <label className="flex items-center justify-between gap-4">
                                <span className="min-w-0">
                                    <span className="font-semibold">Plex refresh after import</span>
                                    <p className="text-xs text-muted font-normal mt-0.5">
                                        Path-scan Plex once Integrity finishes. Turn off Arr → Plex On Import/Upgrade to avoid double analyze.
                                    </p>
                                </span>
                                <input
                                    type="checkbox"
                                    className="h-4 w-4 accent-plex"
                                    disabled={!enabled || !integrityEnabled}
                                    checked={integrityPlexRefreshAfterImport && integrityEnabled && enabled}
                                    onChange={(event) => onIntegrityPlexRefreshAfterImportChange(event.target.checked)}
                                />
                            </label>
                        </div>

                        <IntegritySchedulePolicyCard
                            enabled={enabled}
                            integrityEnabled={integrityEnabled}
                            integrityXxhashEnabled={integrityXxhashEnabled}
                            policy={integritySchedulePolicy || {}}
                            onChange={onIntegritySchedulePolicyChange}
                        />

                        <div className="rounded-xl border border-border/60 bg-white/[0.02] p-5 space-y-4">
                            <h4 className="text-sm font-bold uppercase tracking-wide text-muted">Options</h4>
                            <label className="text-sm font-semibold block">
                                Path maps
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
                                <span className="font-semibold">Require audio</span>
                                <input
                                    type="checkbox"
                                    className="h-4 w-4 accent-plex"
                                    disabled={!enabled || !integrityEnabled}
                                    checked={integrityRequireAudio && integrityEnabled && enabled}
                                    onChange={(event) => onIntegrityRequireAudioChange(event.target.checked)}
                                />
                            </label>
                            <label className="flex items-center justify-between gap-4">
                                <span className="font-semibold">Include music</span>
                                <input
                                    type="checkbox"
                                    className="h-4 w-4 accent-plex"
                                    disabled={!enabled || !integrityEnabled}
                                    checked={integrityIncludeMusic && integrityEnabled && enabled}
                                    onChange={(event) => onIntegrityIncludeMusicChange(event.target.checked)}
                                />
                            </label>
                            <label className="flex items-center justify-between gap-4">
                                <span className="font-semibold">Full-file hash</span>
                                <input
                                    type="checkbox"
                                    className="h-4 w-4 accent-plex"
                                    disabled={!enabled || !integrityEnabled}
                                    checked={integrityXxhashEnabled && integrityEnabled && enabled}
                                    onChange={(event) => onIntegrityXxhashEnabledChange(event.target.checked)}
                                />
                            </label>
                            <label className="flex items-center justify-between gap-4">
                                <span className="font-semibold">Soft timeouts</span>
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
                            <h4 className="text-sm font-bold uppercase tracking-wide text-muted">Media trim</h4>
                            <p className="text-xs text-muted">
                                After import playback passes, remux MKV video (keep eng+ara+native, drop commentary / extra langs),
                                then playback again, then fingerprint. Failures stay on the Integrity panel. Needs RW media mounts + mkvmerge.
                            </p>
                            <label className="flex items-center justify-between gap-4">
                                <span className="font-semibold">Enable trim</span>
                                <input
                                    type="checkbox"
                                    className="h-4 w-4 accent-plex"
                                    disabled={!enabled || !integrityEnabled}
                                    checked={qcTrimEnabled && integrityEnabled && enabled}
                                    onChange={(event) => onQcTrimEnabledChange(event.target.checked)}
                                />
                            </label>
                            <label className="flex items-center justify-between gap-4">
                                <span className="min-w-0">
                                    <span className="font-semibold">Dry-run only</span>
                                    <p className="text-xs text-muted font-normal mt-0.5">Uncheck and turn on Integrity auto-fix to rewrite files.</p>
                                </span>
                                <input
                                    type="checkbox"
                                    className="h-4 w-4 accent-plex"
                                    disabled={!enabled || !integrityEnabled || !qcTrimEnabled}
                                    checked={qcTrimDryRun}
                                    onChange={(event) => onQcTrimDryRunChange(event.target.checked)}
                                />
                            </label>
                            <label className="text-sm font-semibold block">
                                Keep languages
                                <input
                                    type="text"
                                    className="mt-2 w-full p-2.5 rounded-lg border border-border bg-background text-text font-mono text-sm"
                                    disabled={!enabled || !integrityEnabled || !qcTrimEnabled}
                                    value={qcTrimLanguages}
                                    onChange={(event) => onQcTrimLanguagesChange(event.target.value)}
                                    placeholder="eng,ara"
                                />
                            </label>
                            <label className="flex items-center justify-between gap-4">
                                <span className="font-semibold">Keep native audio</span>
                                <input
                                    type="checkbox"
                                    className="h-4 w-4 accent-plex"
                                    disabled={!enabled || !integrityEnabled || !qcTrimEnabled}
                                    checked={qcTrimKeepNativeAudio}
                                    onChange={(event) => onQcTrimKeepNativeAudioChange(event.target.checked)}
                                />
                            </label>
                            <label className="flex items-center justify-between gap-4">
                                <span className="font-semibold">Strip commentary</span>
                                <input
                                    type="checkbox"
                                    className="h-4 w-4 accent-plex"
                                    disabled={!enabled || !integrityEnabled || !qcTrimEnabled}
                                    checked={qcTrimStripCommentary}
                                    onChange={(event) => onQcTrimStripCommentaryChange(event.target.checked)}
                                />
                            </label>
                            <label className="flex items-center justify-between gap-4">
                                <span className="font-semibold">Strip lower-channel dupes</span>
                                <input
                                    type="checkbox"
                                    className="h-4 w-4 accent-plex"
                                    disabled={!enabled || !integrityEnabled || !qcTrimEnabled}
                                    checked={qcTrimStripLowerChannels}
                                    onChange={(event) => onQcTrimStripLowerChannelsChange(event.target.checked)}
                                />
                            </label>
                            <label className="flex items-center justify-between gap-4">
                                <span className="font-semibold">Clear MKV title</span>
                                <input
                                    type="checkbox"
                                    className="h-4 w-4 accent-plex"
                                    disabled={!enabled || !integrityEnabled || !qcTrimEnabled}
                                    checked={qcTrimDeleteMetadataTitle}
                                    onChange={(event) => onQcTrimDeleteMetadataTitleChange(event.target.checked)}
                                />
                            </label>
                        </div>

                        <div className="rounded-xl border border-border/60 bg-white/[0.02] p-5 space-y-4">
                            <h4 className="text-sm font-bold uppercase tracking-wide text-muted">Limits</h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                <label className="text-sm font-semibold">
                                    Fingerprint concurrency
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
                                    Playback concurrency
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
                                    Trim remux concurrency
                                    <input
                                        type="number"
                                        min="1"
                                        max="2"
                                        className="mt-2 w-full p-2.5 rounded-lg border border-border bg-background text-text"
                                        value={integrityTrimConcurrency}
                                        disabled={!enabled || !integrityEnabled}
                                        title="Parallel mkvmerge remuxes (max 2). Keep at 1 on Unraid."
                                        onChange={(event) => onIntegrityTrimConcurrencyChange(Math.max(1, Math.min(2, Number(event.target.value) || 1)))}
                                    />
                                </label>
                                <label className="text-sm font-semibold">
                                    Nightly hour
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
                                    Sample (sec)
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
                                    Timeout (ms)
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
                                    Retries
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
                                    Pause at viewers
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
                                    Max bad files
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
                                    Max bad %
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
