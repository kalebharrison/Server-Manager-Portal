import React, { useCallback, useEffect, useState } from 'react';
import { portalUrl } from '../shared/basePath';
import { MediaStackDownloadClientsSection } from './MediaStackDownloadClientsSection';
import {
    applyCleanupPreset,
    applyHuntPreset,
    CLEANUP_PRESET_LABELS,
    HUNT_PRESET_LABELS,
    type QcPresetId,
} from './qcPresets';
import { SettingHint } from './SettingHint';
import { SettingsCollapseSection } from './SettingsCollapseSection';

const PRESET_IDS: QcPresetId[] = ['relaxed', 'balanced', 'aggressive', 'custom'];

const selectClassName = 'mt-2 w-full p-2.5 rounded-lg border border-border bg-background text-text outline-none focus:border-plex transition-all';

type Prefs = {
    preferDolbyVisionHdr: boolean;
    preferAtmos: boolean;
    preferRemux: boolean;
    preferSeasonPacks: boolean;
};

type UpgraderSubTab = 'overview' | 'hunt' | 'downloads' | 'integrity';

const SUB_TABS: Array<{ id: UpgraderSubTab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'hunt', label: 'Hunt' },
    { id: 'downloads', label: 'Downloads' },
    { id: 'integrity', label: 'Integrity' },
];

const isUpgraderSubTab = (value: string): value is UpgraderSubTab => (
    SUB_TABS.some((tab) => tab.id === value)
);

const parseUpgraderSubTabFromHash = (rawHash: string): { subTab: UpgraderSubTab; scrollTarget?: string } => {
    const raw = String(rawHash || '').replace(/^#/, '').trim();
    if (raw === 'qbittorrent') return { subTab: 'downloads', scrollTarget: 'qbittorrent' };
    if (raw === 'sabnzbd') return { subTab: 'downloads', scrollTarget: 'sabnzbd' };
    if (raw === 'upgrader' || raw === 'upgrader/overview') return { subTab: 'overview' };
    const sub = raw.startsWith('upgrader/') ? raw.slice('upgrader/'.length).split(/[/?]/)[0] : '';
    if (sub && isUpgraderSubTab(sub)) return { subTab: sub };
    return { subTab: 'overview' };
};

const upgraderSubTabHash = (subTab: UpgraderSubTab) => (
    subTab === 'overview' ? '#upgrader' : `#upgrader/${subTab}`
);

type Props = {
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
    integrityDiscordDigestEnabled: boolean;
    integrityDecodeWindowSec: number;
    integrityDecodeTimeoutMs: number;
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
    qcDiscordDigestEnabled: boolean;
    qcQbitUrl: string;
    qcQbitUsername: string;
    qcQbitPassword: string;
    qcSabUrl: string;
    qcSabApiKey: string;
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
    onIntegrityDiscordDigestEnabledChange: (value: boolean) => void;
    onIntegrityDecodeWindowSecChange: (value: number) => void;
    onIntegrityDecodeTimeoutMsChange: (value: number) => void;
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
    onQcDiscordDigestEnabledChange: (value: boolean) => void;
    onQcQbitUrlChange: (value: string) => void;
    onQcQbitUsernameChange: (value: string) => void;
    onQcQbitPasswordChange: (value: string) => void;
    onQcSabUrlChange: (value: string) => void;
    onQcSabApiKeyChange: (value: string) => void;
};

export const UpgraderSettingsPanel: React.FC<Props> = ({
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
    integrityMaxPerCycle,
    integrityConcurrency,
    integrityPlayabilityConcurrency,
    integrityBreakerMaxFindings,
    integrityBreakerMaxPercent,
    integrityPauseWhenSessions,
    integrityNightlyHour,
    integrityDecodeWindowSec,
    integrityDecodeTimeoutMs,
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
    qcQbitUrl,
    qcQbitUsername,
    qcQbitPassword,
    qcSabUrl,
    qcSabApiKey,
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
    onIntegrityMaxPerCycleChange,
    onIntegrityConcurrencyChange,
    onIntegrityPlayabilityConcurrencyChange,
    onIntegrityBreakerMaxFindingsChange,
    onIntegrityBreakerMaxPercentChange,
    onIntegrityPauseWhenSessionsChange,
    onIntegrityNightlyHourChange,
    onIntegrityDecodeWindowSecChange,
    onIntegrityDecodeTimeoutMsChange,
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
    onQcQbitUrlChange,
    onQcQbitUsernameChange,
    onQcQbitPasswordChange,
    onQcSabUrlChange,
    onQcSabApiKeyChange,
}) => {
    const [activeSubTab, setActiveSubTab] = useState<UpgraderSubTab>(() => (
        parseUpgraderSubTabFromHash(window.location.hash).subTab
    ));
    const [scrollTarget, setScrollTarget] = useState<string | undefined>(() => (
        parseUpgraderSubTabFromHash(window.location.hash).scrollTarget
    ));

    const syncFromHash = useCallback(() => {
        const parsed = parseUpgraderSubTabFromHash(window.location.hash);
        setActiveSubTab(parsed.subTab);
        setScrollTarget(parsed.scrollTarget);
    }, []);

    useEffect(() => {
        syncFromHash();
        window.addEventListener('hashchange', syncFromHash);
        return () => window.removeEventListener('hashchange', syncFromHash);
    }, [syncFromHash]);

    useEffect(() => {
        if (!scrollTarget) return;
        const frame = requestAnimationFrame(() => {
            document.getElementById(scrollTarget)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        return () => cancelAnimationFrame(frame);
    }, [scrollTarget, activeSubTab]);

    const handleSubTabChange = (subTab: UpgraderSubTab) => {
        setActiveSubTab(subTab);
        setScrollTarget(undefined);
        const hash = upgraderSubTabHash(subTab);
        if (window.location.hash !== hash) {
            window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}${hash}`);
        }
    };

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

    const subTabButtonClass = (subTab: UpgraderSubTab) => (
        `inline-flex items-center px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${
            activeSubTab === subTab
                ? 'bg-plex text-background shadow-sm'
                : 'text-muted hover:text-text hover:bg-white/5'
        }`
    );

    return (
        <div className="mb-8 animate-fade-in space-y-6">
            <h3 className="text-xl font-bold text-plex mb-4 border-b border-border pb-2 flex items-center gap-3 flex-wrap">
                <span>Quality Control</span>
                <span className="rounded border border-plex/20 bg-plex/10 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-plex">
                    Admin only
                </span>
                <SettingHint>
                    Hunts Sonarr/Radarr/Lidarr for higher custom-format scores and monitors download clients for doomed queues
                    (metaDL, stalled, slow download, failed import, orphans).
                </SettingHint>
            </h3>
            <section id="upgrader" className="space-y-5 scroll-mt-24">
                <div className="inline-flex flex-wrap gap-0.5 p-1 rounded-xl border border-border/60 bg-card/40 w-fit max-w-full">
                    {SUB_TABS.map((tab) => (
                        <button
                            key={tab.id}
                            type="button"
                            className={subTabButtonClass(tab.id)}
                            onClick={() => handleSubTabChange(tab.id)}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {activeSubTab === 'overview' && (
                    <div className="space-y-4">
                        <div className="rounded-xl border border-border/60 bg-white/[0.02] p-5 space-y-4">
                            <h4 className="text-sm font-bold uppercase tracking-wide text-muted">Enable Quality Control</h4>
                            <label className="flex items-center justify-between gap-4">
                                <span className="min-w-0">
                                    <span className="font-semibold">Enable Quality Control</span>
                                    <div className="mt-1">
                                        <SettingHint>Shows the admin Quality Control page and enables its API.</SettingHint>
                                    </div>
                                </span>
                                <input type="checkbox" className="h-4 w-4 accent-plex" checked={enabled} onChange={(event) => onEnabledChange(event.target.checked)} />
                            </label>
                            <label className="flex items-center justify-between gap-4">
                                <span className="min-w-0">
                                    <span className="font-semibold">Enable auto-hunt</span>
                                    <div className="mt-1">
                                        <SettingHint>Background hunt every ~20 minutes, plus manual dry-run on the Hunt tab.</SettingHint>
                                    </div>
                                </span>
                                <input
                                    type="checkbox"
                                    className="h-4 w-4 accent-plex"
                                    disabled={!enabled}
                                    checked={automationEnabled && enabled}
                                    onChange={(event) => onAutomationEnabledChange(event.target.checked)}
                                />
                            </label>
                            <SettingHint>
                                Download cleanup automation is configured under the{' '}
                                <button
                                    type="button"
                                    className="text-plex font-semibold hover:underline"
                                    onClick={() => handleSubTabChange('downloads')}
                                >
                                    Downloads
                                </button>{' '}
                                tab.
                            </SettingHint>
                        </div>

                        <div className="rounded-xl border border-border/60 bg-white/[0.02] p-5 space-y-3">
                            <h4 className="text-sm font-bold uppercase tracking-wide text-muted">Quick links</h4>
                            <ul className="text-sm space-y-2">
                                <li className="flex items-center gap-1 flex-wrap">
                                    <a href={portalUrl('/upgrader')} className="text-plex font-semibold hover:underline">
                                        Quality Control dashboard
                                    </a>
                                    <SettingHint>Hunt preview, download health, integrity scans</SettingHint>
                                </li>
                                <li className="flex items-center gap-1 flex-wrap">
                                    <a href={portalUrl('/settings#mediastack')} className="text-plex font-semibold hover:underline">
                                        Arr &amp; Analytics settings
                                    </a>
                                    <SettingHint>Sonarr, Radarr, Lidarr instances</SettingHint>
                                </li>
                                <li className="flex items-center gap-1 flex-wrap">
                                    <a href={portalUrl('/settings#discord')} className="text-plex font-semibold hover:underline">
                                        Discord digests
                                    </a>
                                    <SettingHint>Cleanup and integrity notification toggles</SettingHint>
                                </li>
                            </ul>
                        </div>
                    </div>
                )}

                {activeSubTab === 'hunt' && (
                    <div className="rounded-xl border border-border/60 bg-white/[0.02] p-5 space-y-4">
                        <h4 className="text-sm font-bold uppercase tracking-wide text-muted">Hunt preferences</h4>
                        <div className="space-y-3">
                            <label className="flex items-center justify-between gap-4">
                                <span className="min-w-0">
                                    <span className="font-semibold">Hunt missing aired episodes</span>
                                    <div className="mt-1">
                                        <SettingHint>
                                            Search monitored TV episodes that have already aired but have no file.
                                        </SettingHint>
                                    </div>
                                </span>
                                <input
                                    type="checkbox"
                                    className="h-4 w-4 accent-plex"
                                    disabled={!enabled}
                                    checked={huntMissingEpisodes && enabled}
                                    onChange={(event) => onHuntMissingEpisodesChange(event.target.checked)}
                                />
                            </label>
                            <label className="flex items-center justify-between gap-4">
                                <span className="min-w-0">
                                    <span className="font-semibold">Hunt digitally available movies</span>
                                    <div className="mt-1">
                                        <SettingHint>
                                            Search monitored movies after digital/streaming release when no file is on disk.
                                        </SettingHint>
                                    </div>
                                </span>
                                <input
                                    type="checkbox"
                                    className="h-4 w-4 accent-plex"
                                    disabled={!enabled}
                                    checked={huntAvailableMovies && enabled}
                                    onChange={(event) => onHuntAvailableMoviesChange(event.target.checked)}
                                />
                            </label>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <label className="text-sm font-semibold">
                                <span className="inline-flex items-center gap-0">
                                    Minimum file size (GB)
                                </span>
                                <input
                                    type="number"
                                    min="0"
                                    className="mt-2 w-full p-2.5 rounded-lg border border-border bg-background text-text"
                                    value={minSizeGB}
                                    disabled={!enabled}
                                    onChange={(event) => onMinSizeGBChange(Number(event.target.value) || 0)}
                                />
                            </label>
                            <label className="text-sm font-semibold">
                                <span className="inline-flex items-center gap-0">
                                    Hunt intensity
                                    <SettingHint>
                                        Relaxed, Balanced, and Aggressive presets set rate limits below. Custom keeps your manual values.
                                    </SettingHint>
                                </span>
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

                        <SettingsCollapseSection title="Advanced" defaultOpen={false}>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <label className="text-sm font-semibold">
                                    <span className="inline-flex items-center gap-0">
                                        Maximum actions per hour
                                    </span>
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
                                    <span className="inline-flex items-center gap-0">
                                        Max downloads per library
                                        <SettingHint>In-flight Arr downloads from hunts (default 5).</SettingHint>
                                    </span>
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
                                    <span className="inline-flex items-center gap-0">
                                        Minimum score delta
                                    </span>
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
                        </SettingsCollapseSection>
                    </div>
                )}

                {activeSubTab === 'downloads' && (
                    <div className="space-y-4">
                        <MediaStackDownloadClientsSection
                            qcQbitUrl={qcQbitUrl}
                            qcQbitUsername={qcQbitUsername}
                            qcQbitPassword={qcQbitPassword}
                            qcSabUrl={qcSabUrl}
                            qcSabApiKey={qcSabApiKey}
                            onQcQbitUrlChange={onQcQbitUrlChange}
                            onQcQbitUsernameChange={onQcQbitUsernameChange}
                            onQcQbitPasswordChange={onQcQbitPasswordChange}
                            onQcSabUrlChange={onQcSabUrlChange}
                            onQcSabApiKeyChange={onQcSabApiKeyChange}
                        />

                        <div className="rounded-xl border border-plex/30 bg-plex/5 px-4 py-3 text-sm">
                            Blocked extensions are managed on the{' '}
                            <a href={portalUrl('/upgrader?tab=clients')} className="text-plex font-semibold hover:underline">
                                Quality Control → Clients
                            </a>{' '}
                            tab (push live to qBit/SAB from there).
                        </div>

                        <div className="rounded-xl border border-border/60 bg-white/[0.02] p-5 space-y-4">
                            <div className="flex items-center gap-1 flex-wrap mb-2">
                                <h4 className="text-sm font-bold uppercase tracking-wide text-muted">Download cleanup</h4>
                                <SettingHint>
                                    Removes doomed queue items from Sonarr/Radarr/Lidarr (blocklist + skip Arr auto-redownload),
                                    deletes them from qBit/SAB, then triggers <span className="text-text">one</span> re-search per title.
                                    Stalls are held when the downloader reports network down. Import failures only auto-clean for
                                    clear junk (sample, blocked extension, invalid media, encrypted archive, etc.) and for
                                    resolution downgrades (e.g. existing 2160p vs new 1080p “not an upgrade”).
                                    Blocked-extension payloads (e.g. single-file <span className="font-mono">.exe</span> torrents) are
                                    probed mid-download via qBit/SAB file lists and killed on the next cleanup cycle.
                                    Manual cleanup on the Downloads tab still works when automation is off.
                                </SettingHint>
                            </div>
                            <label className="flex items-center justify-between gap-4">
                                <span className="min-w-0">
                                    <span className="font-semibold">Enable cleanup automation</span>
                                    <div className="mt-1">
                                        <SettingHint>
                                            Run the cleanup pass on a timer. Leave off if you only want dry-run / manual live cleanup.
                                        </SettingHint>
                                    </div>
                                </span>
                                <input
                                    type="checkbox"
                                    className="h-4 w-4 accent-plex"
                                    disabled={!enabled}
                                    checked={qcCleanupAutomationEnabled && enabled}
                                    onChange={(event) => onQcCleanupAutomationEnabledChange(event.target.checked)}
                                />
                            </label>
                            <label className="text-sm font-semibold block max-w-md">
                                <span className="inline-flex items-center gap-0">
                                    Cleanup aggression
                                    <SettingHint>
                                        Relaxed, Balanced, and Aggressive presets set strike timers below. Custom keeps your manual values.
                                    </SettingHint>
                                </span>
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

                            <SettingsCollapseSection title="Advanced" defaultOpen={false}>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                <label className="text-sm font-semibold">
                                    <span className="inline-flex items-center gap-0">
                                        Max strikes
                                        <SettingHint>
                                            Cleanup needs this many healthy observations of the same problem before a kill. Timers below are per strike.
                                        </SettingHint>
                                    </span>
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
                                    <span className="inline-flex items-center gap-0">
                                        MetaDL minutes / strike
                                        <SettingHint>
                                            qBit stuck in metaDL this long earns one strike (× max strikes ≈ total wait).
                                        </SettingHint>
                                    </span>
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
                                    <span className="inline-flex items-center gap-0">
                                        Stalled hours / strike
                                        <SettingHint>
                                            Stalled this long earns one strike. Skipped while qBit/SAB network health looks down.
                                        </SettingHint>
                                    </span>
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
                                    <span className="inline-flex items-center gap-0">
                                        Slow download floor (KB/s)
                                        <SettingHint>
                                            qBit only. Below this speed (and past min age) earns a slow-download strike.
                                            Seeder counts do not hold — only measured download speed counts as actively pulling.
                                            Uses the same hours/strike gap as stalled.
                                        </SettingHint>
                                    </span>
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
                                    <span className="inline-flex items-center gap-0">
                                        Slow download min age (hours)
                                        <SettingHint>
                                            Don’t judge brand-new grabs until they’ve been downloading at least this long.
                                        </SettingHint>
                                    </span>
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
                                    <span className="inline-flex items-center gap-0">
                                        Completed not importing (min / strike)
                                        <SettingHint>
                                            Finished in the client but Arr still has not imported — per strike window.
                                            Large remuxes get extra time (2 min/GB, capped) and waits behind other imports are held.
                                        </SettingHint>
                                    </span>
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
                                    <span className="inline-flex items-center gap-0">
                                        Orphan grace (min / strike)
                                        <SettingHint>
                                            No Arr link for this long earns one orphan strike (also protects fresh hunt grabs).
                                        </SettingHint>
                                    </span>
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
                                    <span className="inline-flex items-center gap-0">
                                        Research throttle (hours)
                                        <SettingHint>
                                            Minimum wait before QC asks Arr to search the same movie/episode/album again after a cleanup.
                                        </SettingHint>
                                    </span>
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
                                    <span className="inline-flex items-center gap-0">
                                        Snooze default (hours)
                                        <SettingHint>
                                            How long “Snooze” on the Downloads tab hides a row from cleanup.
                                        </SettingHint>
                                    </span>
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
                            <div className="flex items-center gap-1 flex-wrap pt-1">
                                <SettingHint>
                                    Cleanup digests are configured in{' '}
                                    <a href={portalUrl('/settings#discord')} className="text-plex font-semibold hover:underline">
                                        Settings → Discord
                                    </a>.
                                </SettingHint>
                            </div>
                            </SettingsCollapseSection>
                        </div>
                    </div>
                )}

                {activeSubTab === 'integrity' && (
                    <div className="rounded-xl border border-border/60 bg-white/[0.02] p-5 space-y-4">
                        <div className="flex items-center gap-1 flex-wrap mb-2">
                            <h4 className="text-sm font-bold uppercase tracking-wide text-muted">Library integrity</h4>
                            <SettingHint>
                                Validates Arr-known media with a playback check plus a quick fingerprint (and optional full-file hash).
                                Skips files currently playing on Plex. Requires media mounted read-only and Arr→container path maps.
                                For on-import baselining, Arr must POST to the webhook URLs below with this Basic Auth
                                (see docs/integrity-webhooks.md).
                            </SettingHint>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <label className="text-sm font-semibold">
                                <span className="inline-flex items-center gap-0">
                                    Webhook username
                                    <SettingHint>
                                        Arr → Connect → Webhook. Paths: <code className="text-[11px]">/triggers/sonarr</code>,{' '}
                                        <code className="text-[11px]">/triggers/radarr</code>,{' '}
                                        <code className="text-[11px]">/triggers/lidarr</code>. Prefer the portal Docker hostname
                                        (e.g. <code className="text-[11px]">http://server-manager-portal-beta:2121/triggers/sonarr</code>).
                                    </SettingHint>
                                </span>
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
                                <span className="inline-flex items-center gap-0">
                                    Webhook password
                                    <SettingHint>
                                        Required for Arr notifications. Leave blank when saving to keep the existing password.
                                    </SettingHint>
                                </span>
                                <input
                                    type="password"
                                    className="mt-2 w-full p-2.5 rounded-lg border border-border bg-background text-text"
                                    value={integrityWebhookPassword}
                                    disabled={!enabled}
                                    autoComplete="new-password"
                                    placeholder="••••••••"
                                    onChange={(event) => onIntegrityWebhookPasswordChange(event.target.value)}
                                />
                            </label>
                        </div>
                        <label className="flex items-center justify-between gap-4">
                            <span className="min-w-0">
                                <span className="font-semibold">Enable integrity scans</span>
                                <div className="mt-1">
                                    <SettingHint>Unlocks the Integrity tab and API.</SettingHint>
                                </div>
                            </span>
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
                                <span className="font-semibold">Enable integrity automation</span>
                                <div className="mt-1">
                                    <SettingHint>
                                        Background scan can delete bad files and trigger Arr re-search. Default off — use dry-run first.
                                    </SettingHint>
                                </div>
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
                            <span className="text-sm font-semibold">Require audio stream</span>
                            <input
                                type="checkbox"
                                className="h-4 w-4 accent-plex"
                                disabled={!enabled || !integrityEnabled}
                                checked={integrityRequireAudio && integrityEnabled && enabled}
                                onChange={(event) => onIntegrityRequireAudioChange(event.target.checked)}
                            />
                        </label>
                        <div className="flex items-center gap-1 flex-wrap">
                            <SettingHint>
                                Integrity digests are configured in{' '}
                                <a href={portalUrl('/settings#discord')} className="text-plex font-semibold hover:underline">
                                    Settings → Discord
                                </a>.
                            </SettingHint>
                        </div>
                        <label className="text-sm font-semibold block">
                            <span className="inline-flex items-center gap-0">
                                Path maps (Arr path → container path)
                                <SettingHint>
                                    One map per line as <code className="text-text">/arr/movies=/media/movies</code>
                                </SettingHint>
                            </span>
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

                        <SettingsCollapseSection title="Advanced" defaultOpen={false}>
                            <div className="space-y-3 mb-4">
                                <label className="flex items-center justify-between gap-4">
                                    <span className="min-w-0">
                                        <span className="font-semibold">Include music</span>
                                        <div className="mt-1">
                                            <SettingHint>Scan Lidarr/audio library files.</SettingHint>
                                        </div>
                                    </span>
                                    <input
                                        type="checkbox"
                                        className="h-4 w-4 accent-plex"
                                        disabled={!enabled || !integrityEnabled}
                                        checked={integrityIncludeMusic && integrityEnabled && enabled}
                                        onChange={(event) => onIntegrityIncludeMusicChange(event.target.checked)}
                                    />
                                </label>
                                <label className="flex items-center justify-between gap-4">
                                    <span className="min-w-0">
                                        <span className="font-semibold">Enable full-file hash</span>
                                        <div className="mt-1">
                                            <SettingHint>Optional full-file hash mode (slower).</SettingHint>
                                        </div>
                                    </span>
                                    <input
                                        type="checkbox"
                                        className="h-4 w-4 accent-plex"
                                        disabled={!enabled || !integrityEnabled}
                                        checked={integrityXxhashEnabled && integrityEnabled && enabled}
                                        onChange={(event) => onIntegrityXxhashEnabledChange(event.target.checked)}
                                    />
                                </label>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <label className="text-sm font-semibold">Max files per cycle
                                    <input
                                        type="number"
                                        min="1"
                                        className="mt-2 w-full p-2.5 rounded-lg border border-border bg-background text-text"
                                        value={integrityMaxPerCycle}
                                        disabled={!enabled || !integrityEnabled}
                                        onChange={(event) => onIntegrityMaxPerCycleChange(Math.max(1, Number(event.target.value) || 1))}
                                    />
                                </label>
                                <label className="text-sm font-semibold">
                                    <span className="inline-flex items-center gap-0">
                                        Fingerprint / full-hash concurrency
                                        <SettingHint>Workers for quick fingerprint and full-file hash</SettingHint>
                                    </span>
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
                                    <span className="inline-flex items-center gap-0">
                                        Playback-check concurrency
                                        <SettingHint>Decode workers (keep low)</SettingHint>
                                    </span>
                                    <input
                                        type="number"
                                        min="1"
                                        className="mt-2 w-full p-2.5 rounded-lg border border-border bg-background text-text"
                                        value={integrityPlayabilityConcurrency}
                                        disabled={!enabled || !integrityEnabled}
                                        onChange={(event) => onIntegrityPlayabilityConcurrencyChange(Math.max(1, Number(event.target.value) || 1))}
                                    />
                                </label>
                                <label className="text-sm font-semibold">Nightly hour (0–23)
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
                                <label className="text-sm font-semibold">Decode window (sec)
                                    <input
                                        type="number"
                                        min="1"
                                        className="mt-2 w-full p-2.5 rounded-lg border border-border bg-background text-text"
                                        value={integrityDecodeWindowSec}
                                        disabled={!enabled || !integrityEnabled}
                                        onChange={(event) => onIntegrityDecodeWindowSecChange(Math.max(1, Number(event.target.value) || 1))}
                                    />
                                </label>
                                <label className="text-sm font-semibold">Decode timeout (ms)
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
                                    <span className="inline-flex items-center gap-0">
                                        Pause when sessions ≥
                                        <SettingHint>0 = never pause for Plex busy</SettingHint>
                                    </span>
                                    <input
                                        type="number"
                                        min="0"
                                        className="mt-2 w-full p-2.5 rounded-lg border border-border bg-background text-text"
                                        value={integrityPauseWhenSessions}
                                        disabled={!enabled || !integrityEnabled}
                                        onChange={(event) => onIntegrityPauseWhenSessionsChange(Math.max(0, Number(event.target.value) || 0))}
                                    />
                                </label>
                                <label className="text-sm font-semibold">Breaker max findings
                                    <input
                                        type="number"
                                        min="1"
                                        className="mt-2 w-full p-2.5 rounded-lg border border-border bg-background text-text"
                                        value={integrityBreakerMaxFindings}
                                        disabled={!enabled || !integrityEnabled}
                                        onChange={(event) => onIntegrityBreakerMaxFindingsChange(Math.max(1, Number(event.target.value) || 1))}
                                    />
                                </label>
                                <label className="text-sm font-semibold">Breaker max %
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
                        </SettingsCollapseSection>
                    </div>
                )}
            </section>
        </div>
    );
};
