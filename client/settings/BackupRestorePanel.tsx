import React from 'react';

type BackupRestorePanelProps = {
    autoBackupEnabled: boolean;
    autoBackupIntervalDays: number;
    autoBackupRetentionCount: number;
    backupRestoreText: string;
    backupFiles: any[];
    isRestoringBackup: boolean;
    onAutoBackupEnabledChange: (enabled: boolean) => void;
    onAutoBackupIntervalDaysChange: (days: number) => void;
    onAutoBackupRetentionCountChange: (count: number) => void;
    onBackupRestoreTextChange: (text: string) => void;
    onDownloadBackup: () => void;
    onCreateBackupFile: () => void;
    onRestoreBackup: () => void;
    onRestoreFromFile: (filename: string) => void;
};

export const BackupRestorePanel: React.FC<BackupRestorePanelProps> = ({
    autoBackupEnabled,
    autoBackupIntervalDays,
    autoBackupRetentionCount,
    backupRestoreText,
    backupFiles,
    isRestoringBackup,
    onAutoBackupEnabledChange,
    onAutoBackupIntervalDaysChange,
    onAutoBackupRetentionCountChange,
    onBackupRestoreTextChange,
    onDownloadBackup,
    onCreateBackupFile,
    onRestoreBackup,
    onRestoreFromFile,
}) => (
    <section className="space-y-4 mb-8">
        <h4 className="font-bold text-text">Backup & Restore</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
                <label className="font-semibold text-sm block mb-2">Auto Backup Enabled</label>
                <button
                    type="button"
                    onClick={() => onAutoBackupEnabledChange(!autoBackupEnabled)}
                    className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors ${autoBackupEnabled ? 'bg-plex' : 'bg-border'}`}
                >
                    <span className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform ${autoBackupEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
            </div>
            <div>
                <label className="font-semibold text-sm block mb-2">Interval (Days)</label>
                <input
                    type="number"
                    min={1}
                    className="w-full p-2 rounded border border-border bg-background text-text"
                    value={autoBackupIntervalDays}
                    onChange={(e) => onAutoBackupIntervalDaysChange(Math.max(1, Number(e.target.value) || 1))}
                />
            </div>
            <div>
                <label className="font-semibold text-sm block mb-2">Rolling Backups Kept</label>
                <input
                    type="number"
                    min={1}
                    className="w-full p-2 rounded border border-border bg-background text-text"
                    value={autoBackupRetentionCount}
                    onChange={(e) => onAutoBackupRetentionCountChange(Math.max(1, Number(e.target.value) || 1))}
                />
            </div>
        </div>
        <div className="flex flex-wrap gap-3 mb-4">
            <button className="px-4 py-2 bg-plex text-background rounded-md font-bold hover:bg-plex-hover transition-colors" onClick={onDownloadBackup}>Download Backup</button>
            <button className="px-4 py-2 bg-indigo-600 text-white rounded-md font-bold hover:bg-indigo-500 transition-colors" onClick={onCreateBackupFile}>Create Backup File</button>
            <button className="px-4 py-2 bg-red-600 text-white rounded-md font-bold hover:bg-red-500 transition-colors disabled:opacity-50" onClick={onRestoreBackup} disabled={isRestoringBackup}>
                {isRestoringBackup ? 'Restoring...' : 'Restore Backup'}
            </button>
        </div>
        <textarea
            className="w-full min-h-[140px] p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex"
            placeholder="Paste backup JSON here before clicking Restore Backup..."
            value={backupRestoreText}
            onChange={(e) => onBackupRestoreTextChange(e.target.value)}
        />
        <div className="mt-4">
            <h5 className="font-semibold text-sm text-text mb-2">Auto Backup Files</h5>
            <div className="flex flex-col gap-2 max-h-56 overflow-y-auto pr-1">
                {backupFiles.length === 0 ? (
                    <p className="text-xs text-muted">No backup files found in backup folder.</p>
                ) : backupFiles.map(file => (
                    <div key={file.filename} className="py-2 border-b border-border/40 flex items-center justify-between gap-2 last:border-b-0">
                        <div className="text-xs">
                            <p className="font-semibold text-text">{file.filename}</p>
                            <p className="text-muted">{file.createdAt ? new Date(file.createdAt).toLocaleString() : 'Unknown date'} · {(file.size / 1024).toFixed(1)} KB</p>
                        </div>
                        <button className="px-3 py-1.5 bg-red-600/80 text-white rounded text-xs font-bold hover:bg-red-500" onClick={() => onRestoreFromFile(file.filename)}>
                            Restore
                        </button>
                    </div>
                ))}
            </div>
        </div>
    </section>
);
