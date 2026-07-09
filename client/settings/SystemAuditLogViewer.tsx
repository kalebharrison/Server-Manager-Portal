import React from 'react';

import { formatAuditDateTime, formatAuditEventName, getAuditDiffRows, stringifyAuditValue } from './auditLogFormat';

type SystemAuditLogViewerProps = {
    pagedAuditEntries: any[];
    auditLogPage: number;
    totalAuditLogPages: number;
    isLoadingAuditLog: boolean;
    onRefresh: () => void;
    onAuditLogPageChange: React.Dispatch<React.SetStateAction<number>>;
};

export const SystemAuditLogViewer: React.FC<SystemAuditLogViewerProps> = ({
    pagedAuditEntries,
    auditLogPage,
    totalAuditLogPages,
    isLoadingAuditLog,
    onRefresh,
    onAuditLogPageChange,
}) => (
    <section className="space-y-4 mb-8">
        <div className="flex items-center justify-between">
            <h4 className="font-bold text-text">Audit Log Viewer</h4>
            <button className="px-3 py-1.5 bg-border text-text rounded-md font-semibold hover:bg-opacity-80" onClick={onRefresh}>
                {isLoadingAuditLog ? 'Refreshing...' : 'Refresh'}
            </button>
        </div>
        {pagedAuditEntries.length === 0 ? (
            <p className="text-sm text-muted">No audit events found.</p>
        ) : (
            <div className="space-y-3">
                {pagedAuditEntries.map((entry) => {
                    const diffRows = getAuditDiffRows(entry.details);
                    const detailKeys = entry.details && typeof entry.details === 'object'
                        ? Object.entries(entry.details).filter(([key]) => !diffRows.some(row => key.toLowerCase().includes(row.field.toLowerCase())))
                        : [];
                    return (
                        <details key={entry.id} className="py-3 border-b border-border/40 last:border-b-0">
                            <summary className="cursor-pointer list-none">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="font-semibold text-text text-sm">{formatAuditEventName(entry.event || 'event')}</p>
                                    <span className="text-[11px] text-muted">{formatAuditDateTime(entry.timestamp)}</span>
                                </div>
                                <p className="text-xs text-muted mt-1">
                                    Target: {entry.target?.username || entry.target?.email || 'System'}
                                    {entry.actor?.username || entry.actor?.email ? ` · Actor: ${entry.actor.username || entry.actor.email}` : ''}
                                </p>
                            </summary>
                            <div className="mt-3 space-y-2">
                                {diffRows.length > 0 && (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-xs border border-border/60 rounded-lg overflow-hidden">
                                            <thead className="bg-black/30 text-muted">
                                                <tr>
                                                    <th className="text-left px-2 py-1">Field</th>
                                                    <th className="text-left px-2 py-1">Before</th>
                                                    <th className="text-left px-2 py-1">After</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {diffRows.map((row, rowIdx) => (
                                                    <tr key={`${entry.id}-diff-${rowIdx}`} className="border-t border-border/50">
                                                        <td className="px-2 py-1 text-text">{row.field}</td>
                                                        <td className="px-2 py-1 text-red-300">{row.before}</td>
                                                        <td className="px-2 py-1 text-green-300">{row.after}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                                {detailKeys.length > 0 && (
                                    <div className="text-xs text-muted bg-black/30 rounded p-2 space-y-1">
                                        {detailKeys.map(([key, value]) => (
                                            <p key={`${entry.id}-${key}`}>
                                                <span className="text-text">{key}:</span> {stringifyAuditValue(value)}
                                            </p>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </details>
                    );
                })}
                {totalAuditLogPages > 1 && (
                    <div className="flex items-center justify-between pt-1">
                        <button
                            className="px-3 py-1.5 bg-border text-text rounded-md font-semibold hover:bg-opacity-80 disabled:opacity-50"
                            disabled={auditLogPage === 1}
                            onClick={() => onAuditLogPageChange(p => Math.max(1, p - 1))}
                        >
                            Previous
                        </button>
                        <span className="text-xs text-muted">Page {auditLogPage} of {totalAuditLogPages}</span>
                        <button
                            className="px-3 py-1.5 bg-border text-text rounded-md font-semibold hover:bg-opacity-80 disabled:opacity-50"
                            disabled={auditLogPage === totalAuditLogPages}
                            onClick={() => onAuditLogPageChange(p => Math.min(totalAuditLogPages, p + 1))}
                        >
                            Next
                        </button>
                    </div>
                )}
            </div>
        )}
    </section>
);
