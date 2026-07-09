import React from 'react';

type SystemJobQueuePanelProps = {
    tasks: any[];
};

export const SystemJobQueuePanel: React.FC<SystemJobQueuePanelProps> = ({ tasks }) => (
    <section className="space-y-4 mb-8">
        <h4 className="font-bold text-text">Job Queue</h4>
        <div className="flex flex-col gap-3">
            {tasks.map(task => (
                <div key={`system-${task.id}`} className="py-3 border-b border-border/40 last:border-b-0 flex items-center justify-between gap-4">
                    <div>
                        <p className="font-semibold text-text">{task.name}</p>
                        <div className="text-xs text-muted mt-1">
                            Last: {task.lastRun ? new Date(task.lastRun).toLocaleString() : 'Never'} · Next: {task.nextRun ? new Date(task.nextRun).toLocaleString() : 'Not Scheduled'}
                            {task.lastDurationMs !== null ? ` · Duration: ${Math.round(task.lastDurationMs / 1000)}s` : ''}
                        </div>
                        {task.lastError && <div className="text-xs text-red-300 mt-1">Last error: {task.lastError}</div>}
                    </div>
                    {task.running ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 shadow-[0_0_10px_rgba(59,130,246,0.15)] animate-pulse whitespace-nowrap">
                            <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-ping" />
                            Running
                        </span>
                    ) : task.lastError ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-500/10 text-red-400 border border-red-500/20 whitespace-nowrap">
                            <span className="w-1.5 h-1.5 bg-red-400 rounded-full" />
                            Failed
                        </span>
                    ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-500/10 text-muted border border-border whitespace-nowrap">
                            Idle
                        </span>
                    )}
                </div>
            ))}
        </div>
    </section>
);
