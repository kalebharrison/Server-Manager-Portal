import React from 'react';
import { Settings as SettingsIcon } from 'lucide-react';
import { portalUrl } from '../shared/basePath';
import { QcKpiTile } from './QcKpiTile';
import type { UpgraderStatus } from './types';

type TimingRow = {
    id: string;
    label: string;
    perStrike: string;
    effective: string;
    note?: string;
    killKeys: string[];
    immediate?: boolean;
};

const formatMinutes = (minutes: number) => {
    const n = Math.max(0, Number(minutes) || 0);
    if (n >= 60 && n % 60 === 0) return `${n / 60}h`;
    if (n >= 60) {
        const hours = Math.floor(n / 60);
        const remnant = n % 60;
        return remnant ? `${hours}h ${remnant}m` : `${hours}h`;
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
            note: 'qBit stuck fetching torrent metadata',
            killKeys: ['metaDL'],
        },
        {
            id: 'stalled',
            label: 'Stalled',
            perStrike: `${stalledHours}h`,
            effective: `${stalledHours * strikes}h`,
            note: 'Held if qBit/SAB network looks down',
            killKeys: ['stalled'],
        },
        {
            id: 'slowDownload',
            label: 'Slow download',
            perStrike: `${stalledHours}h`,
            effective: `${stalledHours * strikes}h`,
            note: `Below ${Math.max(0, Number(t?.slowDownloadFloorKbps ?? 100) || 0)} KB/s after ${Math.max(0, Number(t?.slowDownloadMinAgeHours ?? 6) || 0)}h`,
            killKeys: ['slowDownload'],
        },
        {
            id: 'cni',
            label: 'Waiting to import',
            perStrike: formatMinutes(cni),
            effective: formatMinutes(cni * strikes),
            note: 'Finished in client, Arr still waiting',
            killKeys: ['completedNotImporting'],
        },
        {
            id: 'orphan',
            label: 'Orphan',
            perStrike: formatMinutes(orphan || 15),
            effective: formatMinutes((orphan || 15) * strikes),
            note: 'In client with no Arr queue row',
            killKeys: ['orphan'],
        },
        {
            id: 'import',
            label: 'Doomed import / duplicate',
            perStrike: formatMinutes(orphan || 15),
            effective: formatMinutes((orphan || 15) * strikes),
            note: 'Failed import or duplicate grab',
            killKeys: ['failedImport', 'duplicate'],
        },
        {
            id: 'qualityDowngrade',
            label: 'Resolution downgrade',
            perStrike: 'immediate',
            effective: 'next cycle',
            note: 'e.g. existing 2160p vs new 1080p',
            killKeys: ['qualityDowngrade'],
            immediate: true,
        },
        {
            id: 'blockedExt',
            label: 'Blocked extension',
            perStrike: 'immediate',
            effective: 'next cycle',
            note: 'Uses the Clients blocked-extension list',
            killKeys: ['blockedExtension'],
            immediate: true,
        },
    ];
};

type Props = {
    status: UpgraderStatus | null;
};

export const QcPolicySummary: React.FC<Props> = ({ status }) => {
    const rows = buildTimingRows(status);
    const strikes = Math.max(1, Number(status?.qcThresholds?.maxStrikes) || 3);
    const maxDownloads = Math.max(1, Number(status?.maxDownloadsPerLibrary) || 5);
    const maxActions = Math.max(1, Number(status?.maxActionsPerHour) || 25);
    const minDelta = Math.max(0, Number(status?.minScoreDelta ?? 10) || 0);
    const killsByReason = status?.qcMetrics?.killsByReason || {};
    const killCount = (keys: string[]) => keys.reduce((sum, key) => sum + (Number(killsByReason[key]) || 0), 0);
    const totalKills = Object.values(killsByReason).reduce((sum, n) => sum + (Number(n) || 0), 0);
    const cleanupLabel = status?.qcCleanupAggression && status.qcCleanupAggression !== 'custom'
        ? (status.qcCleanupAggressionLabel || status.qcCleanupAggression)
        : null;
    const huntLabel = status?.upgraderHuntIntensity && status.upgraderHuntIntensity !== 'custom'
        ? (status.upgraderHuntIntensityLabel || status.upgraderHuntIntensity)
        : null;

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Cleanup windows</h2>
                    <p className="text-xs text-muted mt-1 max-w-2xl">
                        {strikes} strikes × each window = wait before a kill.
                        Change strike counts and timers in Settings — this page is the live cheat sheet.
                    </p>
                    {(cleanupLabel || huntLabel) && (
                        <p className="text-xs text-text mt-1.5">
                            {cleanupLabel && (
                                <span>Cleanup: <span className="font-bold text-plex">{cleanupLabel}</span></span>
                            )}
                            {cleanupLabel && huntLabel && <span className="text-muted"> · </span>}
                            {huntLabel && (
                                <span>Hunt: <span className="font-bold text-plex">{huntLabel}</span></span>
                            )}
                        </p>
                    )}
                </div>
                <a
                    href={portalUrl('/settings#qc-downloads')}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-xs font-bold text-text no-underline hover:border-plex/40"
                >
                    <SettingsIcon className="w-3.5 h-3.5" />
                    Edit strikes in Settings
                </a>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <QcKpiTile label="Strikes to kill" value={strikes} detail="Then the download is removed" />
                <QcKpiTile label="DL cap / library" value={maxDownloads} detail="In-flight hunt downloads" />
                <QcKpiTile label="Hunt grabs / hour" value={maxActions} />
                <QcKpiTile label="Min score delta" value={minDelta} detail="Upgrade must beat this" />
            </div>

            <div className="overflow-x-auto rounded-xl border border-border/50">
                <table className="w-full text-left text-xs">
                    <thead className="bg-background/60 text-muted uppercase tracking-wide">
                        <tr>
                            <th className="px-3 py-2 font-semibold">Reason</th>
                            <th className="px-3 py-2 font-semibold">Per strike</th>
                            <th className="px-3 py-2 font-semibold">Before kill</th>
                            <th className="px-3 py-2 font-semibold">Kills</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => {
                            const kills = killCount(row.killKeys);
                            return (
                                <tr key={row.id} className="border-t border-border/40 align-top">
                                    <td className="px-3 py-2">
                                        <div className="font-semibold text-text">{row.label}</div>
                                        <div className="text-[11px] text-muted mt-0.5">{row.note}</div>
                                    </td>
                                    <td className="px-3 py-2 text-text tabular-nums">{row.perStrike}</td>
                                    <td className={`px-3 py-2 font-bold tabular-nums ${row.immediate ? 'text-amber-200' : 'text-plex'}`}>
                                        {row.effective}
                                    </td>
                                    <td className={`px-3 py-2 font-bold tabular-nums ${kills > 0 ? 'text-text' : 'text-muted'}`}>
                                        {kills}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
                <span>{totalKills} cleanup kill{totalKills === 1 ? '' : 's'} recorded</span>
                {status?.qcMetrics?.lastCleanupAt && (
                    <span>Last cleanup {new Date(status.qcMetrics.lastCleanupAt).toLocaleString()}</span>
                )}
            </div>
        </div>
    );
};
