import React from 'react';

export const MaintenanceRunLogsSection: React.FC<{ runs: any[] }> = ({ runs }) => (
    <div className="glass-card-sm p-5 space-y-3">
        <h3 className="text-xl font-bold text-plex">Logs</h3>
        <div className="space-y-2 max-h-[620px] overflow-y-auto custom-scrollbar pr-1">
            {runs.map((run: any) => (
                <details key={`run-${run.id}`} className="bg-background/30 border border-white/5 rounded-lg p-3">
                    <summary className="cursor-pointer list-none">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-sm font-semibold text-text">{run.ruleName}</p>
                                <p className="text-xs text-muted">{new Date(run.startedAt).toLocaleString()} · {run.dryRun ? 'Dry-run' : 'Destructive'}</p>
                            </div>
                            <span className="text-[11px] px-2 py-1 rounded bg-border text-muted">{run.status}</span>
                        </div>
                    </summary>
                    <div className="mt-3 text-xs text-muted">
                        Matched {run.totals?.matched || 0} · Processed {run.totals?.processed || 0} · Deleted {run.totals?.deleted || 0} · Skipped {run.totals?.skipped || 0} · Failed {run.totals?.failed || 0}
                    </div>
                    {Array.isArray(run.preflight?.warnings) && run.preflight.warnings.length > 0 && (
                        <div className="mt-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-1">
                            {run.preflight.warnings.join(' ')}
                        </div>
                    )}
                    <div className="mt-2 max-h-52 overflow-y-auto custom-scrollbar pr-1 space-y-1">
                        {(run.outcomes || []).slice(0, 120).map((outcome: any, idx: number) => (
                            <div key={`outcome-${run.id}-${idx}`} className="text-xs bg-background/30 border border-white/5 rounded px-2 py-1">
                                {(outcome.title || outcome.type || 'Item')} · {outcome.status || (outcome.success ? 'success' : 'info')}
                                {outcome.reason ? ` · ${outcome.reason}` : ''}
                            </div>
                        ))}
                    </div>
                </details>
            ))}
            {!runs.length && <p className="text-sm text-muted">No runs recorded yet.</p>}
        </div>
    </div>
);
