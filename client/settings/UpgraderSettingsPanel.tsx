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
    minSizeGB: number;
    maxActionsPerHour: number;
    minScoreDelta: number;
    preferences: Prefs;
    qcCleanupAutomationEnabled: boolean;
    qcMetaDlMinutes: number;
    qcStalledHours: number;
    qcCompletedNotImportingMinutes: number;
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
    onMinSizeGBChange: (value: number) => void;
    onMaxActionsPerHourChange: (value: number) => void;
    onMinScoreDeltaChange: (value: number) => void;
    onPreferencesChange: (value: Prefs) => void;
    onQcCleanupAutomationEnabledChange: (value: boolean) => void;
    onQcMetaDlMinutesChange: (value: number) => void;
    onQcStalledHoursChange: (value: number) => void;
    onQcCompletedNotImportingMinutesChange: (value: number) => void;
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
    minSizeGB,
    maxActionsPerHour,
    minScoreDelta,
    preferences,
    qcCleanupAutomationEnabled,
    qcMetaDlMinutes,
    qcStalledHours,
    qcCompletedNotImportingMinutes,
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
    onMinSizeGBChange,
    onMaxActionsPerHourChange,
    onMinScoreDeltaChange,
    onPreferencesChange,
    onQcCleanupAutomationEnabledChange,
    onQcMetaDlMinutesChange,
    onQcStalledHoursChange,
    onQcCompletedNotImportingMinutesChange,
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
                        <label className="text-sm font-semibold">MetaDL minutes
                            <span className="block text-xs font-normal text-muted mt-1">
                                qBit stuck fetching metadata this long before cleanup can remove it.
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
                        <label className="text-sm font-semibold">Stalled hours
                            <span className="block text-xs font-normal text-muted mt-1">
                                How long a download must stay stalled before it is actionable. Skipped while qBit/SAB
                                network health looks down.
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
                        <label className="text-sm font-semibold">Completed not importing (min)
                            <span className="block text-xs font-normal text-muted mt-1">
                                Finished in the client but Arr still has not imported after this many minutes.
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
};
