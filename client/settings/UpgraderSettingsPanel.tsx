import React from 'react';
import { portalUrl } from '../shared/basePath';

type Prefs = {
    preferDolbyVisionHdr: boolean;
    preferAtmos: boolean;
    preferRemux: boolean;
    preferSeasonPacks: boolean;
};

type Props = {
    enabled: boolean;
    automationEnabled: boolean;
    huntMissingEpisodes: boolean;
    huntAvailableMovies: boolean;
    minSizeGB: number;
    maxActionsPerHour: number;
    maxDownloadsPerLibrary: number;
    minScoreDelta: number;
    preferences: Prefs;
    qcCleanupAutomationEnabled: boolean;
    integrityEnabled: boolean;
    integrityAutomationEnabled: boolean;
    integrityRequireAudio: boolean;
    integrityIncludeMusic: boolean;
    integrityXxhashEnabled: boolean;
    integrityPathMaps: Array<{ from: string; to: string }>;
    integrityMaxPerCycle: number;
    integrityConcurrency: number;
    integrityBreakerMaxFindings: number;
    integrityBreakerMaxPercent: number;
    integrityPauseWhenSessions: number;
    integrityNightlyHour: number;
    integrityDiscordDigestEnabled: boolean;
    integrityDecodeWindowSec: number;
    integrityDecodeTimeoutMs: number;
    qcMetaDlMinutes: number;
    qcStalledHours: number;
    qcCompletedNotImportingMinutes: number;
    qcOrphanGraceMinutes: number;
    qcMaxStrikes: number;
    qcResearchThrottleHours: number;
    qcSnoozeDefaultHours: number;
    qcDiscordDigestEnabled: boolean;
    qcPreferImportDiscordOnly: boolean;
    qcQbitUrl: string;
    qcSabUrl: string;
    qcSabApiKey: string;
    qcBlockedExtensions: string[];
    onEnabledChange: (value: boolean) => void;
    onAutomationEnabledChange: (value: boolean) => void;
    onHuntMissingEpisodesChange: (value: boolean) => void;
    onHuntAvailableMoviesChange: (value: boolean) => void;
    onMinSizeGBChange: (value: number) => void;
    onMaxActionsPerHourChange: (value: number) => void;
    onMaxDownloadsPerLibraryChange: (value: number) => void;
    onMinScoreDeltaChange: (value: number) => void;
    onPreferencesChange: (value: Prefs) => void;
    onQcCleanupAutomationEnabledChange: (value: boolean) => void;
    onIntegrityEnabledChange: (value: boolean) => void;
    onIntegrityAutomationEnabledChange: (value: boolean) => void;
    onIntegrityRequireAudioChange: (value: boolean) => void;
    onIntegrityIncludeMusicChange: (value: boolean) => void;
    onIntegrityXxhashEnabledChange: (value: boolean) => void;
    onIntegrityPathMapsChange: (value: Array<{ from: string; to: string }>) => void;
    onIntegrityMaxPerCycleChange: (value: number) => void;
    onIntegrityConcurrencyChange: (value: number) => void;
    onIntegrityBreakerMaxFindingsChange: (value: number) => void;
    onIntegrityBreakerMaxPercentChange: (value: number) => void;
    onIntegrityPauseWhenSessionsChange: (value: number) => void;
    onIntegrityNightlyHourChange: (value: number) => void;
    onIntegrityDiscordDigestEnabledChange: (value: boolean) => void;
    onIntegrityDecodeWindowSecChange: (value: number) => void;
    onIntegrityDecodeTimeoutMsChange: (value: number) => void;
    onQcMetaDlMinutesChange: (value: number) => void;
    onQcStalledHoursChange: (value: number) => void;
    onQcCompletedNotImportingMinutesChange: (value: number) => void;
    onQcOrphanGraceMinutesChange: (value: number) => void;
    onQcMaxStrikesChange: (value: number) => void;
    onQcResearchThrottleHoursChange: (value: number) => void;
    onQcSnoozeDefaultHoursChange: (value: number) => void;
    onQcDiscordDigestEnabledChange: (value: boolean) => void;
    onQcPreferImportDiscordOnlyChange: (value: boolean) => void;
    onQcBlockedExtensionsChange: (value: string[]) => void;
};

const parseExtensionsText = (value: string) => [
    ...new Set(
        value
            .split(/[\s,;]+/)
            .map((entry) => entry.trim().replace(/^\*\./, '').replace(/^\./, '').toLowerCase())
            .filter(Boolean),
    ),
];

export const UpgraderSettingsPanel: React.FC<Props> = ({
    enabled,
    automationEnabled,
    huntMissingEpisodes,
    huntAvailableMovies,
    minSizeGB,
    maxActionsPerHour,
    maxDownloadsPerLibrary,
    minScoreDelta,
    preferences,
    qcCleanupAutomationEnabled,
    integrityEnabled,
    integrityAutomationEnabled,
    integrityRequireAudio,
    integrityIncludeMusic,
    integrityXxhashEnabled,
    integrityPathMaps,
    integrityMaxPerCycle,
    integrityConcurrency,
    integrityBreakerMaxFindings,
    integrityBreakerMaxPercent,
    integrityPauseWhenSessions,
    integrityNightlyHour,
    integrityDiscordDigestEnabled,
    integrityDecodeWindowSec,
    integrityDecodeTimeoutMs,
    qcMetaDlMinutes,
    qcStalledHours,
    qcCompletedNotImportingMinutes,
    qcOrphanGraceMinutes,
    qcMaxStrikes,
    qcResearchThrottleHours,
    qcSnoozeDefaultHours,
    qcDiscordDigestEnabled,
    qcPreferImportDiscordOnly,
    qcQbitUrl,
    qcSabUrl,
    qcSabApiKey,
    qcBlockedExtensions,
    onEnabledChange,
    onAutomationEnabledChange,
    onHuntMissingEpisodesChange,
    onHuntAvailableMoviesChange,
    onMinSizeGBChange,
    onMaxActionsPerHourChange,
    onMaxDownloadsPerLibraryChange,
    onMinScoreDeltaChange,
    onPreferencesChange,
    onQcCleanupAutomationEnabledChange,
    onIntegrityEnabledChange,
    onIntegrityAutomationEnabledChange,
    onIntegrityRequireAudioChange,
    onIntegrityIncludeMusicChange,
    onIntegrityXxhashEnabledChange,
    onIntegrityPathMapsChange,
    onIntegrityMaxPerCycleChange,
    onIntegrityConcurrencyChange,
    onIntegrityBreakerMaxFindingsChange,
    onIntegrityBreakerMaxPercentChange,
    onIntegrityPauseWhenSessionsChange,
    onIntegrityNightlyHourChange,
    onIntegrityDiscordDigestEnabledChange,
    onIntegrityDecodeWindowSecChange,
    onIntegrityDecodeTimeoutMsChange,
    onQcMetaDlMinutesChange,
    onQcStalledHoursChange,
    onQcCompletedNotImportingMinutesChange,
    onQcOrphanGraceMinutesChange,
    onQcMaxStrikesChange,
    onQcResearchThrottleHoursChange,
    onQcSnoozeDefaultHoursChange,
    onQcDiscordDigestEnabledChange,
    onQcPreferImportDiscordOnlyChange,
    onQcBlockedExtensionsChange,
}) => {
    const qbitConfigured = !!String(qcQbitUrl || '').trim();
    const sabConfigured = !!(String(qcSabUrl || '').trim() && String(qcSabApiKey || '').trim());

    return (
        <div className="mb-8 animate-fade-in space-y-6">
            <h3 className="text-xl font-bold text-plex mb-4 border-b border-border pb-2">Quality Control</h3>
            <section id="upgrader" className="space-y-5 scroll-mt-24">
                <p className="text-sm text-muted">
                    Hunts Sonarr/Radarr/Lidarr for higher custom-format scores and monitors download clients for doomed queues
                    (metaDL, stalled, failed import, orphans).
                </p>

                <div className="rounded-xl border border-border/60 bg-white/[0.02] p-5 space-y-4">
                    <h4 className="text-sm font-bold uppercase tracking-wide text-muted">Enable Quality Control</h4>
                    <label className="flex items-center justify-between gap-4">
                        <span>
                            <span className="block font-semibold">Enable Quality Control</span>
                            <span className="block text-xs text-muted mt-1">Shows the admin Quality Control page and enables its API.</span>
                        </span>
                        <input type="checkbox" className="h-4 w-4 accent-plex" checked={enabled} onChange={(event) => onEnabledChange(event.target.checked)} />
                    </label>
                    <label className="flex items-center justify-between gap-4">
                        <span>
                            <span className="block font-semibold">Enable auto-hunt</span>
                            <span className="block text-xs text-muted mt-1">Background hunt every ~20 minutes, plus manual dry-run on the Hunt tab.</span>
                        </span>
                        <input
                            type="checkbox"
                            className="h-4 w-4 accent-plex"
                            disabled={!enabled}
                            checked={automationEnabled && enabled}
                            onChange={(event) => onAutomationEnabledChange(event.target.checked)}
                        />
                    </label>
                </div>

                <div className="rounded-xl border border-border/60 bg-white/[0.02] p-5 space-y-3">
                    <h4 className="text-sm font-bold uppercase tracking-wide text-muted">Download clients</h4>
                    <p className="text-sm text-muted">
                        Connection credentials live in{' '}
                        <a href={portalUrl('/settings#mediastack')} className="text-plex font-semibold hover:underline">
                            Apps &amp; Automation
                        </a>
                        .
                    </p>
                    <ul className="text-sm space-y-1">
                        <li>
                            <span className="font-semibold">qBittorrent:</span>{' '}
                            <span className={qbitConfigured ? 'text-emerald-300' : 'text-amber-200'}>
                                {qbitConfigured ? 'Configured' : 'Not configured'}
                            </span>
                        </li>
                        <li>
                            <span className="font-semibold">SABnzbd:</span>{' '}
                            <span className={sabConfigured ? 'text-emerald-300' : 'text-amber-200'}>
                                {sabConfigured ? 'Configured' : 'Not configured'}
                            </span>
                        </li>
                    </ul>
                    <label className="text-sm font-semibold block pt-2">
                        Default blocked extensions
                        <span className="block text-xs font-normal text-muted mt-1">
                            Stored in config; Clients tab can also push live to qBit/SAB. Comma or newline separated.
                        </span>
                        <textarea
                            className="mt-2 w-full min-h-[80px] p-2.5 rounded-lg border border-border bg-background text-text text-sm font-mono"
                            disabled={!enabled}
                            value={(qcBlockedExtensions || []).join('\n')}
                            placeholder={'exe\nbat\nlnk'}
                            onChange={(event) => onQcBlockedExtensionsChange(parseExtensionsText(event.target.value))}
                        />
                    </label>
                </div>

                <div className="rounded-xl border border-border/60 bg-white/[0.02] p-5 space-y-4">
                    <h4 className="text-sm font-bold uppercase tracking-wide text-muted">Download cleanup</h4>
                    <p className="text-xs text-muted">
                        Removes doomed queue items from Sonarr/Radarr/Lidarr (blocklist + skip Arr auto-redownload),
                        deletes them from qBit/SAB, then triggers <span className="text-text">one</span> re-search per title.
                        Stalls are held when the downloader reports network down. Import failures only auto-clean for
                        clear junk (sample, blocked extension, invalid media, encrypted archive, etc.).
                        Manual cleanup on the Downloads tab still works when automation is off.
                    </p>
                    <label className="flex items-center justify-between gap-4">
                        <span>
                            <span className="block font-semibold">Enable cleanup automation</span>
                            <span className="block text-xs text-muted mt-1">
                                Run the cleanup pass on a timer. Leave off if you only want dry-run / manual live cleanup.
                            </span>
                        </span>
                        <input
                            type="checkbox"
                            className="h-4 w-4 accent-plex"
                            disabled={!enabled}
                            checked={qcCleanupAutomationEnabled && enabled}
                            onChange={(event) => onQcCleanupAutomationEnabledChange(event.target.checked)}
                        />
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        <label className="text-sm font-semibold">Max strikes
                            <span className="block text-xs font-normal text-muted mt-1">
                                Cleanup needs this many healthy observations of the same problem before a kill. Timers below are per strike.
                            </span>
                            <input
                                type="number"
                                min="1"
                                className="mt-2 w-full p-2.5 rounded-lg border border-border bg-background text-text"
                                value={qcMaxStrikes}
                                disabled={!enabled}
                                onChange={(event) => onQcMaxStrikesChange(Math.max(1, Number(event.target.value) || 1))}
                            />
                        </label>
                        <label className="text-sm font-semibold">MetaDL minutes / strike
                            <span className="block text-xs font-normal text-muted mt-1">
                                qBit stuck in metaDL this long earns one strike (× max strikes ≈ total wait).
                            </span>
                            <input
                                type="number"
                                min="1"
                                className="mt-2 w-full p-2.5 rounded-lg border border-border bg-background text-text"
                                value={qcMetaDlMinutes}
                                disabled={!enabled}
                                onChange={(event) => onQcMetaDlMinutesChange(Math.max(1, Number(event.target.value) || 1))}
                            />
                        </label>
                        <label className="text-sm font-semibold">Stalled hours / strike
                            <span className="block text-xs font-normal text-muted mt-1">
                                Stalled this long earns one strike. Skipped while qBit/SAB network health looks down.
                            </span>
                            <input
                                type="number"
                                min="1"
                                className="mt-2 w-full p-2.5 rounded-lg border border-border bg-background text-text"
                                value={qcStalledHours}
                                disabled={!enabled}
                                onChange={(event) => onQcStalledHoursChange(Math.max(1, Number(event.target.value) || 1))}
                            />
                        </label>
                        <label className="text-sm font-semibold">Completed not importing (min / strike)
                            <span className="block text-xs font-normal text-muted mt-1">
                                Finished in the client but Arr still has not imported — per strike window.
                                Large remuxes get extra time (2 min/GB, capped) and waits behind other imports are held.
                            </span>
                            <input
                                type="number"
                                min="1"
                                className="mt-2 w-full p-2.5 rounded-lg border border-border bg-background text-text"
                                value={qcCompletedNotImportingMinutes}
                                disabled={!enabled}
                                onChange={(event) => onQcCompletedNotImportingMinutesChange(Math.max(1, Number(event.target.value) || 1))}
                            />
                        </label>
                        <label className="text-sm font-semibold">Orphan grace (min / strike)
                            <span className="block text-xs font-normal text-muted mt-1">
                                No Arr link for this long earns one orphan strike (also protects fresh hunt grabs).
                            </span>
                            <input
                                type="number"
                                min="0"
                                className="mt-2 w-full p-2.5 rounded-lg border border-border bg-background text-text"
                                value={qcOrphanGraceMinutes}
                                disabled={!enabled}
                                onChange={(event) => onQcOrphanGraceMinutesChange(Math.max(0, Number(event.target.value) || 0))}
                            />
                        </label>
                        <label className="text-sm font-semibold">Research throttle (hours)
                            <span className="block text-xs font-normal text-muted mt-1">
                                Minimum wait before QC asks Arr to search the same movie/episode/album again after a cleanup.
                            </span>
                            <input
                                type="number"
                                min="1"
                                className="mt-2 w-full p-2.5 rounded-lg border border-border bg-background text-text"
                                value={qcResearchThrottleHours}
                                disabled={!enabled}
                                onChange={(event) => onQcResearchThrottleHoursChange(Math.max(1, Number(event.target.value) || 1))}
                            />
                        </label>
                        <label className="text-sm font-semibold">Snooze default (hours)
                            <span className="block text-xs font-normal text-muted mt-1">
                                How long “Snooze” on the Downloads tab hides a row from cleanup.
                            </span>
                            <input
                                type="number"
                                min="1"
                                className="mt-2 w-full p-2.5 rounded-lg border border-border bg-background text-text"
                                value={qcSnoozeDefaultHours}
                                disabled={!enabled}
                                onChange={(event) => onQcSnoozeDefaultHoursChange(Math.max(1, Number(event.target.value) || 1))}
                            />
                        </label>
                    </div>
                </div>

                <div className="rounded-xl border border-border/60 bg-white/[0.02] p-5 space-y-4">
                    <h4 className="text-sm font-bold uppercase tracking-wide text-muted">Discord</h4>
                    <label className="flex items-center justify-between gap-4">
                        <span>
                            <span className="block font-semibold">Prefer import / available only</span>
                            <span className="block text-xs text-muted mt-1">
                                Prefer Notifiarr Import/Available over Grab/Failure so doomed downloads stay quiet.
                            </span>
                        </span>
                        <input
                            type="checkbox"
                            className="h-4 w-4 accent-plex"
                            disabled={!enabled}
                            checked={qcPreferImportDiscordOnly && enabled}
                            onChange={(event) => onQcPreferImportDiscordOnlyChange(event.target.checked)}
                        />
                    </label>
                    <label className="flex items-center justify-between gap-4">
                        <span>
                            <span className="block font-semibold">Cleanup digest</span>
                            <span className="block text-xs text-muted mt-1">Post a Discord digest after automated cleanup runs.</span>
                        </span>
                        <input
                            type="checkbox"
                            className="h-4 w-4 accent-plex"
                            disabled={!enabled}
                            checked={qcDiscordDigestEnabled && enabled}
                            onChange={(event) => onQcDiscordDigestEnabledChange(event.target.checked)}
                        />
                    </label>
                </div>

                <div className="rounded-xl border border-border/60 bg-white/[0.02] p-5 space-y-4">
                    <h4 className="text-sm font-bold uppercase tracking-wide text-muted">Hunt preferences</h4>
                    <div className="space-y-3">
                        <label className="flex items-center justify-between gap-4">
                            <span className="text-sm font-semibold">
                                Hunt missing aired episodes
                                <span className="block text-xs text-muted mt-1 font-normal">
                                    Search monitored TV episodes that have already aired but have no file.
                                </span>
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
                            <span className="text-sm font-semibold">
                                Hunt digitally available movies
                                <span className="block text-xs text-muted mt-1 font-normal">
                                    Search monitored movies after digital/streaming release when no file is on disk.
                                </span>
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
                        <label className="text-sm font-semibold">Max downloads per library
                            <span className="block text-xs text-muted mt-1 font-normal">
                                In-flight Arr downloads from hunts (default 5).
                            </span>
                            <input
                                type="number"
                                min="1"
                                className="mt-2 w-full p-2.5 rounded-lg border border-border bg-background text-text"
                                value={maxDownloadsPerLibrary}
                                disabled={!enabled}
                                onChange={(event) => onMaxDownloadsPerLibraryChange(Math.max(1, Number(event.target.value) || 1))}
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

                <div className="rounded-xl border border-border/60 bg-white/[0.02] p-5 space-y-4">
                    <h4 className="text-sm font-bold uppercase tracking-wide text-muted">Library integrity</h4>
                    <p className="text-xs text-muted">
                        Validates Arr-known media with playability decode plus imohash (and optional xxhash).
                        Skips files currently playing on Plex. Requires media mounted read-only and Arr→container path maps.
                    </p>
                    <label className="flex items-center justify-between gap-4">
                        <span>
                            <span className="block font-semibold">Enable integrity scans</span>
                            <span className="block text-xs text-muted mt-1">Unlocks the Integrity tab and API.</span>
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
                        <span>
                            <span className="block font-semibold">Enable integrity automation</span>
                            <span className="block text-xs text-muted mt-1">
                                Background scan can delete bad files and trigger Arr re-search. Default off — use dry-run first.
                            </span>
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
                    <label className="flex items-center justify-between gap-4">
                        <span>
                            <span className="block font-semibold">Include music</span>
                            <span className="block text-xs text-muted mt-1">Scan Lidarr/audio library files.</span>
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
                        <span>
                            <span className="block font-semibold">Enable xxhash</span>
                            <span className="block text-xs text-muted mt-1">Optional full-file hash mode (slower).</span>
                        </span>
                        <input
                            type="checkbox"
                            className="h-4 w-4 accent-plex"
                            disabled={!enabled || !integrityEnabled}
                            checked={integrityXxhashEnabled && integrityEnabled && enabled}
                            onChange={(event) => onIntegrityXxhashEnabledChange(event.target.checked)}
                        />
                    </label>
                    <label className="flex items-center justify-between gap-4">
                        <span>
                            <span className="block font-semibold">Discord integrity digest</span>
                            <span className="block text-xs text-muted mt-1">Post a summary of integrity findings to Discord.</span>
                        </span>
                        <input
                            type="checkbox"
                            className="h-4 w-4 accent-plex"
                            disabled={!enabled || !integrityEnabled}
                            checked={integrityDiscordDigestEnabled && integrityEnabled && enabled}
                            onChange={(event) => onIntegrityDiscordDigestEnabledChange(event.target.checked)}
                        />
                    </label>
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
                        <label className="text-sm font-semibold">Concurrency
                            <input
                                type="number"
                                min="1"
                                className="mt-2 w-full p-2.5 rounded-lg border border-border bg-background text-text"
                                value={integrityConcurrency}
                                disabled={!enabled || !integrityEnabled}
                                onChange={(event) => onIntegrityConcurrencyChange(Math.max(1, Number(event.target.value) || 1))}
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
                        <label className="text-sm font-semibold">Pause when sessions ≥
                            <span className="block text-xs font-normal text-muted mt-0.5">0 = never pause for Plex busy</span>
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
                    <label className="text-sm font-semibold block">
                        Path maps (Arr path → container path)
                        <span className="block text-xs font-normal text-muted mt-1">
                            One map per line as <code className="text-text">/arr/movies=/media/movies</code>
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
                </div>
            </section>
        </div>
    );
};
