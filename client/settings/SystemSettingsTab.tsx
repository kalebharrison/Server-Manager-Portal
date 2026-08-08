import React from 'react';
import { BackupRestorePanel } from './BackupRestorePanel';
import { SystemDiagnosticsPanel } from './SystemDiagnosticsPanel';
import { SystemHealthPanel } from './SystemHealthPanel';

type SystemSettingsTabProps = {
    systemHealth: any;
    checkInterval: number;
    autoBackupEnabled: boolean;
    autoBackupIntervalDays: number;
    autoBackupRetentionCount: number;
    backupRestoreText: string;
    backupFiles: any[];
    isRestoringBackup: boolean;
    diagnostics: any;
    mediaServerType: 'plex' | 'jellyfin';
    isLoadingDiagnostics: boolean;
    onCheckIntervalChange: (minutes: number) => void;
    onAutoBackupEnabledChange: (value: boolean) => void;
    onAutoBackupIntervalDaysChange: (value: number) => void;
    onAutoBackupRetentionCountChange: (value: number) => void;
    onBackupRestoreTextChange: (value: string) => void;
    onDownloadBackup: () => void;
    onCreateBackupFile: () => void;
    onRestoreBackup: () => void;
    onRestoreFromFile: (filename: string) => void;
    onRefreshDiagnostics: () => void;
};

export const SystemSettingsTab: React.FC<SystemSettingsTabProps> = ({
    systemHealth,
    checkInterval,
    autoBackupEnabled,
    autoBackupIntervalDays,
    autoBackupRetentionCount,
    backupRestoreText,
    backupFiles,
    isRestoringBackup,
    diagnostics,
    mediaServerType,
    isLoadingDiagnostics,
    onCheckIntervalChange,
    onAutoBackupEnabledChange,
    onAutoBackupIntervalDaysChange,
    onAutoBackupRetentionCountChange,
    onBackupRestoreTextChange,
    onDownloadBackup,
    onCreateBackupFile,
    onRestoreBackup,
    onRestoreFromFile,
    onRefreshDiagnostics,
}) => (
    <div className="mb-8 animate-fade-in space-y-6">
        <SystemHealthPanel systemHealth={systemHealth} />

        <section className="rounded-xl border border-border/60 bg-surface/20 p-4 space-y-2">
            <h4 className="text-sm font-bold uppercase tracking-wide text-muted">Scheduler</h4>
            <label htmlFor="checkInterval" className="font-semibold block">Scheduled task interval (minutes)</label>
            <input
                className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex"
                id="checkInterval"
                type="number"
                min="1"
                value={checkInterval}
                onChange={(event) => onCheckIntervalChange(Math.max(1, Number(event.target.value) || 1))}
            />
            <p className="text-xs text-muted">Drives user sync, expiry mail, newsletter poll, and inactive member cleanup.</p>
        </section>

        <BackupRestorePanel
            autoBackupEnabled={autoBackupEnabled}
            autoBackupIntervalDays={autoBackupIntervalDays}
            autoBackupRetentionCount={autoBackupRetentionCount}
            backupRestoreText={backupRestoreText}
            backupFiles={backupFiles}
            isRestoringBackup={isRestoringBackup}
            onAutoBackupEnabledChange={onAutoBackupEnabledChange}
            onAutoBackupIntervalDaysChange={onAutoBackupIntervalDaysChange}
            onAutoBackupRetentionCountChange={onAutoBackupRetentionCountChange}
            onBackupRestoreTextChange={onBackupRestoreTextChange}
            onDownloadBackup={onDownloadBackup}
            onCreateBackupFile={onCreateBackupFile}
            onRestoreBackup={onRestoreBackup}
            onRestoreFromFile={onRestoreFromFile}
        />

        <SystemDiagnosticsPanel
            diagnostics={diagnostics}
            mediaServerType={mediaServerType}
            isLoadingDiagnostics={isLoadingDiagnostics}
            onRefresh={onRefreshDiagnostics}
        />

    </div>
);
