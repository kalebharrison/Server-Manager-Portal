import React from 'react';
import { Settings as SettingsIcon } from 'lucide-react';
import { portalUrl } from '../shared/basePath';
import type { UpgraderStatus } from './types';

type TimingRow = {
    id: string;
    label: string;
    perStrike: string;
    effective: string;
    note?: string;
    killKeys: string[];
};

const formatMinutes = (minutes: number) => {
    const n = Math.max(0, Number(minutes) || 0);
    if (n >= 60 && n % 60 === 0) return `${n / 60}h`;
    if (n >= 60) {
        const hours = Math.floor(n / 60);
        const rem = n % 60;
        return rem ? `${hours}h ${rem}m` : `${hours}h`;
    }
    return `${n}m`;
};

export const buildTimingRows = (status: UpgraderStatus | null): TimingRow[] => {
    const t = status?.qcThresholds;
    const strikes = Math.max(1, Number(t?.maxStrikes) || 3);
    const meta = Math.max(1, Number(t?.metaDlMinutes) || 10);
    const stalledHours = Math.max(1, Number(t?.stalledHours) || 2);
    const cni = Math.max(1, Number(t?.completedNotImportingMinutes) || 90);
    const orphan = Math.max(0, Number(t?.orphanGraceMinutes ?? 15) || 0);
    return [
        {
            id: 'metadl',
            label: 'MetaDL',
            perStrike: formatMinutes(meta),
            effective: formatMinutes(meta * strikes),
            note: 'qBit stuck fetching metadata',
            killKeys: ['metaDL'],
        },
        {
            id: 'stalled',
            label: 'Stalled',
            perStrike: `${stalledHours}h`,
            effective: `${stalledHours * strikes}h`,
            note: 'Held during client/network outages',
            killKeys: ['stalled'],
        },
        {
            id: 'slowDownload',
            label: 'Slow download',
            perStrike: `${stalledHours}h`,
            effective: `${stalledHours * strikes}h`,
            note: `qBit below ${Math.max(0, Number(t?.slowDownloadFloorKbps ?? 100) || 0)} KB/s after ${Math.max(0, Number(t?.slowDownloadMinAgeHours ?? 6) || 0)}h — seeder count is not a hold`,
            killKeys: ['slowDownload'],
        },
        {
            id: 'cni',
            label: 'Completed, not importing',
            perStrike: formatMinutes(cni),
            effective: formatMinutes(cni * strikes),
            note: 'Finished in client, Arr waiting — held while Arr is copying or queued behind an active import',
            killKeys: ['completedNotImporting'],
        },
        {
            id: 'orphan',
            label: 'Orphan (no Arr link)',
            perStrike: formatMinutes(orphan || 15),
            effective: formatMinutes((orphan || 15) * strikes),
            note: 'Not held for seeding — only fresh hunt grabs / grace window',
            killKeys: ['orphan'],
        },
        {
            id: 'qualityDowngrade',
            label: 'Resolution downgrade',
            perStrike: 'immediate',
            effective: '1 cleanup cycle',
            note: 'Arr “not an upgrade” when new file is lower res (e.g. 2160p → 1080p)',
            killKeys: ['qualityDowngrade'],
        },
        {
            id: 'blockedExt',
            label: 'Blocked extension (early)',
            perStrike: 'immediate',
            effective: '1 cleanup cycle',
            note: 'Uses Settings blocked-extension list; probes qBit/SAB file names mid-download',
            killKeys: ['blockedExtension'],
        },
        {
            id: 'import',
            label: 'Doomed import / duplicate',
            perStrike: formatMinutes(orphan || 15),
            effective: formatMinutes((orphan || 15) * strikes),
            note: 'Uses orphan gap as strike window',
            killKeys: ['failedImport', 'duplicate'],
        },
    ];
};

type Props = {
    status: UpgraderStatus | null;
    compact?: boolean;
    showSettingsLink?: boolean;
};

export const QcPolicySummary: React.FC<Props> = ({
    status,
    compact = false,
    showSettingsLink = true,
}) => {
    const rows = buildTimingRows(status);
    const strikes = Math.max(1, Number(status?.qcThresholds?.maxStrikes) || 3);
    const maxDownloads = Math.max(1, Number(status?.maxDownloadsPerLibrary) || 5);
    const maxActions = Math.max(1, Number(status?.maxActionsPerHour) || 25);
    const minDelta = Math.max(0, Number(status?.minScoreDelta ?? 10) || 0);
    const prefs = status?.preferences;
    const killsByReason = status?.qcMetrics?.killsByReason || {};
    const killCount = (keys: string[]) => keys.reduce((sum, key) => sum + (Number(killsByReason[key]) || 0), 0);
    const totalKills = Object.values(killsByReason).reduce((sum, n) => sum + (Number(n) || 0), 0);

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Cleanup policy</h2>
                    <p className="text-xs text-muted mt-1">
                        {strikes} strikes × each window = wait before a kill. Kill counts are lifetime totals for this portal.
                    </p>
                </div>
                {showSettingsLink && (
                    <a
                        href={portalUrl('/settings#upgrader')}
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-xs font-bold text-text no-underline hover:border-plex/40"
                    >
                        <SettingsIcon className="w-3.5 h-3.5" />
                        Edit in Settings
                    </a>
                )}
            </div>

            <div className="overflow-x-auto rounded-xl border border-border/50">
                <table className="w-full text-left text-xs">
                    <thead className="bg-background/60 text-muted uppercase tracking-wide">
                        <tr>
                            <th className="px-3 py-2 font-semibold">Type</th>
                            <th className="px-3 py-2 font-semibold">Per strike</th>
                            <th className="px-3 py-2 font-semibold">Effective ({strikes}×)</th>
                            <th className="px-3 py-2 font-semibold">Kills</th>
                            {!compact && <th className="px-3 py-2 font-semibold">Notes</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => {
                            const kills = killCount(row.killKeys);
                            return (
                                <tr key={row.id} className="border-t border-border/40">
                                    <td className="px-3 py-2 font-semibold text-text">{row.label}</td>
                                    <td className="px-3 py-2 text-text">{row.perStrike}</td>
                                    <td className="px-3 py-2 font-bold text-plex">{row.effective}</td>
                                    <td className={`px-3 py-2 font-bold ${kills > 0 ? 'text-text' : 'text-muted'}`}>
                                        {kills}
                                    </td>
                                    {!compact && (
                                        <td className="px-3 py-2 text-muted">{row.note || '—'}</td>
                                    )}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
                <span>{totalKills} total cleanup kills recorded</span>
                {status?.qcMetrics?.lastCleanupAt && (
                    <span>Last cleanup {new Date(status.qcMetrics.lastCleanupAt).toLocaleString()}</span>
                )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-xl border border-border/50 bg-background/40 px-3 py-3">
                    <div className="text-[11px] uppercase tracking-wide text-muted">Max strikes</div>
                    <div className="mt-1 text-lg font-bold text-text">{strikes}</div>
                </div>
                <div className="rounded-xl border border-border/50 bg-background/40 px-3 py-3">
                    <div className="text-[11px] uppercase tracking-wide text-muted">DL cap / library</div>
                    <div className="mt-1 text-lg font-bold text-text">{maxDownloads}</div>
                </div>
                <div className="rounded-xl border border-border/50 bg-background/40 px-3 py-3">
                    <div className="text-[11px] uppercase tracking-wide text-muted">Hunt grabs / hour</div>
                    <div className="mt-1 text-lg font-bold text-text">{maxActions}</div>
                </div>
                <div className="rounded-xl border border-border/50 bg-background/40 px-3 py-3">
                    <div className="text-[11px] uppercase tracking-wide text-muted">Min score delta</div>
                    <div className="mt-1 text-lg font-bold text-text">{minDelta}</div>
                </div>
            </div>

            {!compact && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div className="rounded-xl border border-border/50 bg-background/40 px-3 py-3 space-y-1.5">
                        <div className="text-[11px] uppercase tracking-wide text-muted font-semibold">Hunt targets</div>
                        <p className="text-text">
                            Missing aired episodes:{' '}
                            <span className="font-bold">{status?.huntMissingEpisodes === false ? 'Off' : 'On'}</span>
                        </p>
                        <p className="text-text">
                            Digitally available movies:{' '}
                            <span className="font-bold">{status?.huntAvailableMovies === false ? 'Off' : 'On'}</span>
                        </p>
                        <p className="text-text">
                            Min file size:{' '}
                            <span className="font-bold">{Number(status?.minSizeGB) || 0} GB</span>
                        </p>
                    </div>
                    <div className="rounded-xl border border-border/50 bg-background/40 px-3 py-3 space-y-1.5">
                        <div className="text-[11px] uppercase tracking-wide text-muted font-semibold">Other policy</div>
                        <p className="text-text">
                            Research throttle:{' '}
                            <span className="font-bold">{status?.qcThresholds?.researchThrottleHours ?? 24}h</span>
                        </p>
                        <p className="text-text">
                            Snooze default:{' '}
                            <span className="font-bold">{status?.qcThresholds?.snoozeDefaultHours ?? 24}h</span>
                        </p>
                        <p className="text-text">
                            Discord cleanup digest:{' '}
                            <span className="font-bold">{status?.discordDigestEnabled ? 'On' : 'Off'}</span>
                        </p>
                        <p className="text-text">
                            Prefer import Discord-only:{' '}
                            <span className="font-bold">{status?.preferImportDiscordOnly === false ? 'Off' : 'On'}</span>
                        </p>
                        <p className="text-muted pt-1">
                            Boosts:{' '}
                            {[
                                prefs?.preferDolbyVisionHdr !== false ? 'DV/HDR' : null,
                                prefs?.preferAtmos !== false ? 'Atmos' : null,
                                prefs?.preferRemux !== false ? 'Remux' : null,
                                prefs?.preferSeasonPacks !== false ? 'Season packs' : null,
                            ].filter(Boolean).join(' · ') || 'none'}
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};
