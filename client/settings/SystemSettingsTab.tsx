import React from 'react';
import { BackupRestorePanel } from './BackupRestorePanel';
import { SystemAuditLogViewer } from './SystemAuditLogViewer';
import { SystemDiagnosticsPanel } from './SystemDiagnosticsPanel';
import { SystemHealthPanel } from './SystemHealthPanel';
import { SystemJobQueuePanel } from './SystemJobQueuePanel';

type SystemSettingsTabProps = {
    systemHealth: any;
    highlightMaintenanceToggle: boolean;
    maintenanceExperimentalEnabled: boolean;
    autoBackupEnabled: boolean;
    autoBackupIntervalDays: number;
    autoBackupRetentionCount: number;
    backupRestoreText: string;
    backupFiles: any[];
    isRestoringBackup: boolean;
    diagnostics: any;
    mediaServerType: 'plex' | 'jellyfin';
    isLoadingDiagnostics: boolean;
    tasks: any[];
    pagedAuditEntries: any[];
    auditLogPage: number;
    totalAuditLogPages: number;
    isLoadingAuditLog: boolean;
    onMaintenanceExperimentalEnabledChange: (value: boolean) => void;
    onAutoBackupEnabledChange: (value: boolean) => void;
    onAutoBackupIntervalDaysChange: (value: number) => void;
    onAutoBackupRetentionCountChange: (value: number) => void;
    onBackupRestoreTextChange: (value: string) => void;
    onDownloadBackup: () => void;
    onCreateBackupFile: () => void;
    onRestoreBackup: () => void;
    onRestoreFromFile: (filename: string) => void;
    onRefreshDiagnostics: () => void;
    onRefreshAuditLog: () => void;
    onAuditLogPageChange: React.Dispatch<React.SetStateAction<number>>;
};

export const SystemSettingsTab: React.FC<SystemSettingsTabProps> = ({
    systemHealth,
    highlightMaintenanceToggle,
    maintenanceExperimentalEnabled,
    autoBackupEnabled,
    autoBackupIntervalDays,
    autoBackupRetentionCount,
    backupRestoreText,
    backupFiles,
    isRestoringBackup,
    diagnostics,
    mediaServerType,
    isLoadingDiagnostics,
    tasks,
    pagedAuditEntries,
    auditLogPage,
    totalAuditLogPages,
    isLoadingAuditLog,
    onMaintenanceExperimentalEnabledChange,
    onAutoBackupEnabledChange,
    onAutoBackupIntervalDaysChange,
    onAutoBackupRetentionCountChange,
    onBackupRestoreTextChange,
    onDownloadBackup,
    onCreateBackupFile,
    onRestoreBackup,
    onRestoreFromFile,
    onRefreshDiagnostics,
    onRefreshAuditLog,
    onAuditLogPageChange,
}) => (
    <div className="mb-8 animate-fade-in space-y-6">
        <h3 className="text-xl font-bold text-plex mb-4 border-b border-border pb-2">System</h3>
        <SystemHealthPanel systemHealth={systemHealth} />
        <section className={`space-y-3 mb-8 transition-all duration-300 ${highlightMaintenanceToggle ? 'ring-2 ring-plex/50 rounded-lg p-3 -m-3' : ''}`}>
            <h4 className="font-bold text-text">Cleaner Experimental Mode</h4>
            <div className="flex items-center justify-between gap-3 py-2">
                <div>
                    <p className="font-semibold text-text">Enable Cleaner Module</p>
                    <p className="text-xs text-muted mt-1">Single global toggle for the main `Cleaner` navigation section. OFF by default.</p>
                </div>
                <button
                    type="button"
                    onClick={() => onMaintenanceExperimentalEnabledChange(!maintenanceExperimentalEnabled)}
                    className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors ${maintenanceExperimentalEnabled ? 'bg-plex' : 'bg-border'}`}
                >
                    <span className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform ${maintenanceExperimentalEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
            </div>
            <p className={`text-xs mt-2 font-semibold ${maintenanceExperimentalEnabled ? 'text-green-300' : 'text-yellow-300'}`}>
                Current status: {maintenanceExperimentalEnabled ? 'ON' : 'OFF'}
            </p>
            <p className="text-[11px] text-muted mt-1">After changing this toggle, click the main Save Settings button.</p>
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

        <SystemJobQueuePanel tasks={tasks} />

        <SystemAuditLogViewer
            pagedAuditEntries={pagedAuditEntries}
            auditLogPage={auditLogPage}
            totalAuditLogPages={totalAuditLogPages}
            isLoadingAuditLog={isLoadingAuditLog}
            onRefresh={onRefreshAuditLog}
            onAuditLogPageChange={onAuditLogPageChange}
        />
    </div>
);
