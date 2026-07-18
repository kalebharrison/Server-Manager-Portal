import React from 'react';
import { BackupRestorePanel } from './BackupRestorePanel';
import { SystemDiagnosticsPanel } from './SystemDiagnosticsPanel';
import { SystemHealthPanel } from './SystemHealthPanel';

type SystemSettingsTabProps = {
    systemHealth: any;
    autoBackupEnabled: boolean;
    autoBackupIntervalDays: number;
    autoBackupRetentionCount: number;
    backupRestoreText: string;
    backupFiles: any[];
    isRestoringBackup: boolean;
    diagnostics: any;
    mediaServerType: 'plex' | 'jellyfin';
    isLoadingDiagnostics: boolean;
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
    autoBackupEnabled,
    autoBackupIntervalDays,
    autoBackupRetentionCount,
    backupRestoreText,
    backupFiles,
    isRestoringBackup,
    diagnostics,
    mediaServerType,
    isLoadingDiagnostics,
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
        <h3 className="text-xl font-bold text-plex mb-4 border-b border-border pb-2">System</h3>
        <SystemHealthPanel systemHealth={systemHealth} />
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
