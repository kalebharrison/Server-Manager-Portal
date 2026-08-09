import React, { useEffect, useState } from 'react';
import { Loader2, CheckCircle2, XCircle, Search, ArrowUpFromLine, Trash2, Ban, Settings2 } from 'lucide-react';
import { apiFetch } from '../shared/api';
import type { UpgraderAuditEntry } from './types';
import { SettingHint } from '../settings/SettingHint';
import { QC_SECTION, QC_SECTION_FLUSH } from './qcUi';

const entryTime = (entry: UpgraderAuditEntry) => entry.timestamp || entry.at || null;

const friendlyFailureReason = (reason?: string | null) => {
    const text = String(reason || '').trim();
    if (!text) return '';
    if (/SABnzbd/i.test(text) || /Error response received from SAB/i.test(text)) {
        return 'SABnzbd rejected the grab — check that SAB is up and Radarr can reach it.';
    }
    if (/qBittorrent|qbit/i.test(text) && /Error response received from/i.test(text)) {
        return 'qBittorrent rejected the grab — check the download client connection in Radarr/Sonarr.';
    }
    const messageMatch = text.match(/"message"\s*:\s*"([^"]+)"/);
    if (messageMatch?.[1]) {
        const msg = messageMatch[1].replace(/\\n/g, ' ').trim();
        if (/SABnzbd/i.test(msg)) {
            return 'SABnzbd rejected the grab — check that SAB is up and Radarr can reach it.';
        }
        return msg.length > 180 ? `${msg.slice(0, 180)}…` : msg;
    }
    const firstLine = text.split(/\n|\bat\s/)[0]
        .replace(/^Radarr returned \d+:\s*/i, '')
        .replace(/^Sonarr returned \d+:\s*/i, '')
        .trim();
    return firstLine.length > 180 ? `${firstLine.slice(0, 180)}…` : firstLine;
};

const actionLabel = (entry: UpgraderAuditEntry) => {
    const failed = entry.success === false;
    switch (entry.action) {
        case 'upgrade': return failed ? 'Grab failed' : 'Grabbed better release';
        case 'missing_search': return failed ? 'Missing search failed' : 'Grabbed missing';
        case 'qc_integrity_scan': return 'Integrity scan';
        case 'qc_integrity_replace': return 'Integrity replace';
        case 'profile_change': return 'Profile change';
        case 'series_search': return 'Series search';
        case 'episode_search': return 'Episode search';
        case 'movie_search': return 'Movie search';
        case 'index_rebuilt': return 'Index rebuilt';
        case 'qc_cleanup': return 'Cleanup removed download';
        case 'qc_cleanup_live': return 'Live cleanup run';
        case 'qc_cleanup_dry_run': return 'Cleanup dry run';
        case 'qc_snooze': return 'Snoozed download';
        case 'qc_clear_snooze': return 'Cleared download snooze';
        case 'qc_extension_policy': return 'Updated blocked extensions';
        case 'qc_arr_alignment': return 'Optimized Arr Connect hooks';
        default:
            if (entry.targetProfileId) return 'Profile change';
            if (entry.triggerSearch) return 'Search';
            if (String(entry.action || '').startsWith('qc_')) return String(entry.action).replace(/^qc_/, 'QC ').replace(/_/g, ' ');
            return entry.action || 'Action';
    }
};

const entryTitle = (entry: UpgraderAuditEntry & { key?: string; count?: number; killed?: number; extensions?: string[] }) => {
    if (entry.title) return entry.title;
    if (entry.ratingKey) return entry.ratingKey;
    if (entry.key) return entry.key;
    if (entry.action === 'qc_extension_policy' && Array.isArray(entry.extensions)) {
        return `${entry.extensions.length} extension${entry.extensions.length === 1 ? '' : 's'}`;
    }
    if (entry.action === 'qc_cleanup_live' || entry.action === 'qc_cleanup_dry_run') {
        const killed = entry.killed ?? entry.count;
        if (killed != null) return `${killed} item${Number(killed) === 1 ? '' : 's'}`;
    }
    return 'Untitled';
};

const ActionIcon: React.FC<{ entry: UpgraderAuditEntry }> = ({ entry }) => {
    const failed = entry.success === false;
    if (failed) return <XCircle className="w-4 h-4 text-red-400 shrink-0" />;
    if (entry.action === 'qc_cleanup' || entry.action === 'qc_cleanup_live') {
        return <Trash2 className="w-4 h-4 text-amber-300 shrink-0" />;
    }
    if (entry.action === 'qc_snooze' || entry.action === 'qc_clear_snooze') {
        return <Ban className="w-4 h-4 text-plex shrink-0" />;
    }
    if (entry.action === 'qc_extension_policy') {
        return <Settings2 className="w-4 h-4 text-plex shrink-0" />;
    }
    if (entry.action?.includes('search') || entry.triggerSearch) return <Search className="w-4 h-4 text-plex shrink-0" />;
    if (entry.action === 'upgrade' || entry.action === 'profile_change' || entry.targetProfileId) {
        return <ArrowUpFromLine className="w-4 h-4 text-green-400 shrink-0" />;
    }
    return <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />;
};

export const UpgraderHistoryPanel: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [entries, setEntries] = useState<UpgraderAuditEntry[]>([]);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        apiFetch('/api/upgrader/audit?limit=100')
            .then((data) => {
                if (!cancelled) setEntries(Array.isArray(data?.entries) ? data.entries : []);
            })
            .catch(() => {
                if (!cancelled) setEntries([]);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => { cancelled = true; };
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center gap-2 py-16 text-muted">
                <Loader2 className="w-5 h-5 animate-spin" />
                Loading activity…
            </div>
        );
    }

    const visible = entries.filter((entry) => !entry.dryRun && entry.action !== 'index_rebuilt');

    if (!visible.length) {
        return (
            <div className={`${QC_SECTION} p-8 text-center space-y-2`}>
                <p className="text-sm font-semibold text-text">No activity yet</p>
                <p className="text-sm text-muted max-w-md mx-auto inline-flex items-center justify-center flex-wrap gap-x-1">
                    Live hunt grabs and QC cleanups appear here.
                    <SettingHint>
                        This log shows live hunt grabs/searches and download cleanups (remove + blocklist + re-search).
                        Dry-run previews stay on Overview / Downloads.
                    </SettingHint>
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <p className="text-xs text-muted px-1 inline-flex items-center flex-wrap gap-x-1">
                Live hunt grabs and Quality Control cleanups.
                <SettingHint>Dry runs are not listed here.</SettingHint>
            </p>
            <div className={QC_SECTION_FLUSH}>
                <div className="divide-y divide-border/50">
                    {visible.map((entry) => {
                        const when = entryTime(entry);
                        const hasScores = entry.currentScore != null && entry.candidateScore != null;
                        const detail = entry as UpgraderAuditEntry & { key?: string; researched?: boolean; wastedBytes?: number };
                        return (
                            <div key={entry.id} className="px-4 py-3">
                                <div className="flex items-start gap-3">
                                    <ActionIcon entry={entry} />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div className="text-sm font-semibold text-text">{entryTitle(detail)}</div>
                                            <div className="text-[11px] text-muted">
                                                {when ? new Date(when).toLocaleString() : ''}
                                            </div>
                                        </div>
                                        <div className="text-xs text-muted mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
                                            <span className="font-semibold text-text/80">{actionLabel(entry)}</span>
                                            {entry.reason && entry.action?.startsWith('qc_') && (
                                                <span className="uppercase tracking-wide">{entry.reason}</span>
                                            )}
                                            {entry.arrInstanceName && <span>{entry.arrInstanceName}</span>}
                                            {entry.arrType && entry.action?.startsWith('qc_') && <span>{entry.arrType}</span>}
                                            {detail.researched ? <span>re-searched</span> : null}
                                            {hasScores && (
                                                <span>
                                                    score {entry.currentScore} → {entry.candidateScore}
                                                    {entry.candidateScore! > entry.currentScore!
                                                        ? ` (+${entry.candidateScore! - entry.currentScore!})`
                                                        : ''}
                                                </span>
                                            )}
                                            {entry.seasonNumber != null && <span>S{entry.seasonNumber}</span>}
                                            {entry.fullSeason ? <span>season pack</span> : null}
                                            {entry.releaseTitle && <span className="truncate max-w-[240px]">{entry.releaseTitle}</span>}
                                            {entry.currentProfileName && entry.targetProfileName && (
                                                <span>
                                                    {entry.currentProfileName} → {entry.targetProfileName}
                                                </span>
                                            )}
                                            {!entry.currentProfileName && entry.targetProfileName && (
                                                <span>→ {entry.targetProfileName}</span>
                                            )}
                                            {entry.episodeIds?.length ? (
                                                <span>{entry.episodeIds.length} episode{entry.episodeIds.length === 1 ? '' : 's'}</span>
                                            ) : null}
                                            {entry.commandId ? <span>cmd {entry.commandId}</span> : null}
                                            {entry.actor?.username ? <span>by {entry.actor.username}</span> : null}
                                        </div>
                                        {entry.success === false && entry.reason && !entry.action?.startsWith('qc_') && (
                                            <p className="text-[11px] text-red-300 mt-1" title={String(entry.reason)}>
                                                {friendlyFailureReason(entry.reason)}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
