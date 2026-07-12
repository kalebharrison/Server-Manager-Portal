import React from 'react';

import { formatAuditDateTime } from './auditLogFormat';
import { SystemAuditLogViewer } from './SystemAuditLogViewer';

type LogsAuditTabProps = {
    deletedUsersLog: any[];
    pagedAuditEntries: any[];
    pagedEmailEntries: any[];
    emailLogPage: number;
    totalEmailLogPages: number;
    auditLogPage: number;
    totalAuditLogPages: number;
    isLoadingAuditLog: boolean;
    onRefreshAuditLog: () => void;
    onUnblockDeletedUser: (deletedUser: any) => void;
    onEmailLogPageChange: (updater: (page: number) => number) => void;
    onAuditLogPageChange: React.Dispatch<React.SetStateAction<number>>;
};

export const LogsAuditTab: React.FC<LogsAuditTabProps> = ({
    deletedUsersLog,
    pagedAuditEntries,
    pagedEmailEntries,
    emailLogPage,
    totalEmailLogPages,
    auditLogPage,
    totalAuditLogPages,
    isLoadingAuditLog,
    onRefreshAuditLog,
    onUnblockDeletedUser,
    onEmailLogPageChange,
    onAuditLogPageChange,
}) => (
    <div className="mb-8 animate-fade-in space-y-8">
        <h3 className="text-xl font-bold text-plex mb-4 border-b border-border pb-2">Logs & Audit</h3>

        <SystemAuditLogViewer
            pagedAuditEntries={pagedAuditEntries}
            auditLogPage={auditLogPage}
            totalAuditLogPages={totalAuditLogPages}
            isLoadingAuditLog={isLoadingAuditLog}
            onRefresh={onRefreshAuditLog}
            onAuditLogPageChange={onAuditLogPageChange}
        />

        <section className="space-y-3">
            <div className="flex items-center justify-between">
                <h4 className="font-bold text-text">Deleted User Blocklist</h4>
                <span className="px-2 py-1 rounded text-xs font-semibold bg-red-500/20 text-red-300">{deletedUsersLog.length}</span>
            </div>
            <div className="space-y-2">
                {deletedUsersLog.length === 0 ? (
                    <p className="text-sm text-muted">No deleted users are currently blocked.</p>
                ) : (
                    deletedUsersLog.map((deletedUser) => (
                        <div key={deletedUser.blockId} className="py-3 border-b border-border/40 flex items-center justify-between gap-3 last:border-b-0">
                            <div className="min-w-0">
                                <p className="text-sm font-semibold text-text truncate">{deletedUser.username || 'Unknown user'}</p>
                                <p className="text-xs text-muted truncate">{deletedUser.email || deletedUser.plexId || deletedUser.id || 'No identifier'}</p>
                                <p className="text-[11px] text-muted/80">Deleted {formatAuditDateTime(deletedUser.deletedAt)} by {deletedUser.deletedBy || 'admin'}</p>
                            </div>
                            <button
                                className="px-3 py-1.5 bg-border text-text rounded text-xs font-semibold hover:bg-opacity-80"
                                onClick={() => onUnblockDeletedUser(deletedUser)}
                            >
                                Unblock
                            </button>
                        </div>
                    ))
                )}
            </div>
        </section>

        <section className="space-y-3">
            <div className="flex items-center justify-between">
                <h4 className="font-bold text-text">Email Log</h4>
                <button className="px-3 py-1.5 bg-border text-text rounded-md font-semibold hover:bg-opacity-80" onClick={onRefreshAuditLog}>
                    {isLoadingAuditLog ? 'Refreshing...' : 'Refresh'}
                </button>
            </div>
            {pagedEmailEntries.length === 0 ? (
                <p className="text-sm text-muted">No system emails have been logged yet.</p>
            ) : (
                <div className="space-y-2">
                    {pagedEmailEntries.map((entry) => (
                        <div key={entry.id} className="py-3 border-b border-border/40 last:border-b-0">
                            <div className="flex items-start justify-between gap-3">
                                <p className="text-sm font-semibold text-text line-clamp-1">{entry.details?.subject || 'System Email'}</p>
                                <span className="text-[11px] text-muted whitespace-nowrap">{formatAuditDateTime(entry.timestamp)}</span>
                            </div>
                            <p className="text-xs text-muted mt-1">To: {entry.target?.username || entry.target?.email || 'Unknown user'}</p>
                        </div>
                    ))}
                    {totalEmailLogPages > 1 && (
                        <div className="flex items-center justify-between pt-1">
                            <button
                                className="px-3 py-1.5 bg-border text-text rounded-md font-semibold hover:bg-opacity-80 disabled:opacity-50"
                                disabled={emailLogPage === 1}
                                onClick={() => onEmailLogPageChange(p => Math.max(1, p - 1))}
                            >
                                Previous
                            </button>
                            <span className="text-xs text-muted">Page {emailLogPage} of {totalEmailLogPages}</span>
                            <button
                                className="px-3 py-1.5 bg-border text-text rounded-md font-semibold hover:bg-opacity-80 disabled:opacity-50"
                                disabled={emailLogPage === totalEmailLogPages}
                                onClick={() => onEmailLogPageChange(p => Math.min(totalEmailLogPages, p + 1))}
                            >
                                Next
                            </button>
                        </div>
                    )}
                </div>
            )}
        </section>
    </div>
);
