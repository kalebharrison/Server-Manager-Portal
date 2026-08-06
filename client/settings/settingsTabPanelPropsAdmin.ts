import type { SettingsTabPanelProps } from './SettingsTabPanel';
import type { SettingsFormValues } from './useSettingsFormState';
import type { useSettingsAdminPanel } from './useSettingsAdminPanel';
import type { SettingsTabPanelOnChange } from './settingsTabPanelPropsTypes';

type AdminTabPanelPropsInput = {
    values: SettingsFormValues;
    admin: ReturnType<typeof useSettingsAdminPanel>;
    onChange: SettingsTabPanelOnChange;
};

export const buildTasksTabPanelProps = ({
    admin,
}: Pick<AdminTabPanelPropsInput, 'admin'>): SettingsTabPanelProps['tasks'] => ({
    tasks: admin.tasks,
    onRunTask: admin.handleRunTask,
});

export const buildSystemTabPanelProps = ({
    values,
    onChange,
    admin,
}: AdminTabPanelPropsInput): SettingsTabPanelProps['system'] => ({
    systemHealth: admin.systemHealth,
    checkInterval: values.checkInterval,
    autoBackupEnabled: admin.autoBackupEnabled,
    autoBackupIntervalDays: admin.autoBackupIntervalDays,
    autoBackupRetentionCount: admin.autoBackupRetentionCount,
    backupRestoreText: admin.backupRestoreText,
    backupFiles: admin.backupFiles,
    isRestoringBackup: admin.isRestoringBackup,
    diagnostics: admin.diagnostics,
    mediaServerType: values.mediaServerType,
    isLoadingDiagnostics: admin.isLoadingDiagnostics,
    onCheckIntervalChange: onChange('checkInterval'),
    onAutoBackupEnabledChange: admin.setAutoBackupEnabled,
    onAutoBackupIntervalDaysChange: admin.setAutoBackupIntervalDays,
    onAutoBackupRetentionCountChange: admin.setAutoBackupRetentionCount,
    onBackupRestoreTextChange: admin.setBackupRestoreText,
    onDownloadBackup: admin.handleDownloadBackup,
    onCreateBackupFile: admin.handleCreateBackupFile,
    onRestoreBackup: admin.handleRestoreBackup,
    onRestoreFromFile: admin.handleRestoreFromFile,
    onRefreshDiagnostics: admin.fetchDiagnostics,
});

export const buildLogsTabPanelProps = ({
    admin,
}: Pick<AdminTabPanelPropsInput, 'admin'>): SettingsTabPanelProps['logs'] => ({
    deletedUsersLog: admin.deletedUsersLog,
    pagedAuditEntries: admin.pagedAuditEntries,
    pagedEmailEntries: admin.pagedEmailEntries,
    auditLogPage: admin.auditLogPage,
    totalAuditLogPages: admin.totalAuditLogPages,
    emailLogPage: admin.emailLogPage,
    totalEmailLogPages: admin.totalEmailLogPages,
    isLoadingAuditLog: admin.isLoadingAuditLog,
    onRefreshAuditLog: admin.fetchAuditLog,
    onUnblockDeletedUser: admin.handleUnblockDeletedUser,
    onEmailLogPageChange: admin.setEmailLogPage,
    onAuditLogPageChange: admin.setAuditLogPage,
});
