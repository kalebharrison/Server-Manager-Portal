import React from 'react';

type BackgroundTasksTabProps = {
    tasks: any[];
    onRunTask: (taskId: string) => void;
};

export const BackgroundTasksTab: React.FC<BackgroundTasksTabProps> = ({ tasks, onRunTask }) => (
    <div className="mb-8 animate-fade-in">
        <h3 className="text-xl font-bold text-plex mb-4 border-b border-border pb-2">Background Tasks</h3>
        <div className="flex flex-col gap-4">
            {tasks.map(task => (
                <div key={task.id} className="py-4 border-b border-border/40 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                            <h4 className="font-bold text-lg">{task.name}</h4>
                            {task.running ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 shadow-[0_0_10px_rgba(59,130,246,0.15)] animate-pulse">
                                    <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-ping" />
                                    Running
                                </span>
                            ) : task.lastError ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-500/10 text-red-400 border border-red-500/20">
                                    <span className="w-1.5 h-1.5 bg-red-400 rounded-full" />
                                    Failed
                                </span>
                            ) : (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-500/10 text-muted border border-border">
                                    Idle
                                </span>
                            )}
                        </div>
                        <p className="text-sm text-muted mb-2">{task.description}</p>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                            <span><strong className="text-text">Last Run:</strong> {task.lastRun ? new Date(task.lastRun).toLocaleString() : 'Never'}</span>
                            <span><strong className="text-text">Next Run:</strong> {task.nextRun ? new Date(task.nextRun).toLocaleString() : 'Not Scheduled'}</span>
                            {task.lastDurationMs !== null && <span><strong className="text-text">Duration:</strong> {Math.round(task.lastDurationMs / 1000)}s</span>}
                            {task.lastError && <span className="bg-red-500/20 text-red-300 px-2 py-1 rounded"><strong>Error:</strong> {task.lastError}</span>}
                        </div>
                    </div>
                    <button
                        className={`px-4 py-2 rounded-md font-bold transition-all flex items-center justify-center gap-2 whitespace-nowrap ${
                            task.running
                                ? 'bg-slate-800 text-muted border border-border cursor-not-allowed opacity-60'
                                : 'bg-plex text-background hover:bg-plex-hover'
                        }`}
                        disabled={task.running}
                        onClick={() => onRunTask(task.id)}
                    >
                        {task.running ? (
                            <>
                                <svg className="animate-spin h-4 w-4 text-muted" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                <span>Running...</span>
                            </>
                        ) : (
                            'Run Now'
                        )}
                    </button>
                </div>
            ))}
        </div>
    </div>
);
