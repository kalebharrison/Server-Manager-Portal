import { useCallback, useState } from 'react';

import { apiFetch } from '../shared/api';
import { portalUrl } from '../shared/basePath';
import { appConfirm } from '../shared/confirm';

type UseSettingsAdminPanelBackupsOptions = {
    addToast: (message: string, type?: 'success' | 'error') => void;
    fetchDiagnostics: () => Promise<void>;
    fetchTasks: () => Promise<void>;
};

export const useSettingsAdminPanelBackups = ({
    addToast,
    fetchDiagnostics,
    fetchTasks,
}: UseSettingsAdminPanelBackupsOptions) => {
    const [backupRestoreText, setBackupRestoreText] = useState('');
    const [isRestoringBackup, setIsRestoringBackup] = useState(false);
    const [autoBackupEnabled, setAutoBackupEnabled] = useState(false);
    const [autoBackupIntervalDays, setAutoBackupIntervalDays] = useState(2);
    const [autoBackupRetentionCount, setAutoBackupRetentionCount] = useState(10);
    const [backupFiles, setBackupFiles] = useState<any[]>([]);

    const fetchBackupFiles = useCallback(async () => {
        try {
            const data = await apiFetch('/api/admin/backups');
            setBackupFiles(Array.isArray(data) ? data : []);
        } catch (e) {
            addToast('Failed to load backup files', 'error');
        }
    }, [addToast]);

    const handleDownloadBackup = useCallback(async () => {
        try {
            const response = await fetch(portalUrl('/api/admin/backup'));
            if (!response.ok) throw new Error('Backup download failed');
            const text = await response.text();
            const blob = new Blob([text], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `portal-backup-${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            addToast('Backup downloaded successfully.');
        } catch (e: any) {
            addToast(e.message || 'Backup download failed', 'error');
        }
    }, [addToast]);

    const handleCreateBackupFile = useCallback(async () => {
        try {
            const res = await apiFetch('/api/admin/backups/create', { method: 'POST' });
            addToast(res?.filename ? `Backup created: ${res.filename}` : 'Backup created successfully.');
            await fetchBackupFiles();
            await fetchDiagnostics();
        } catch (e: any) {
            addToast(e.message || 'Failed to create backup file', 'error');
        }
    }, [addToast, fetchBackupFiles, fetchDiagnostics]);

    const handleRestoreBackup = useCallback(async () => {
        if (!backupRestoreText.trim()) {
            addToast('Paste a backup JSON payload before restoring.', 'error');
            return;
        }
        appConfirm('Restore backup now? This overwrites current data files.', async () => {
            setIsRestoringBackup(true);
            try {
                const response = await fetch(portalUrl('/api/admin/backup/restore?confirm=true'), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'text/plain',
                        'x-confirm-restore': 'true',
                    },
                    body: backupRestoreText,
                });
                const data = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(data.error || 'Backup restore failed');
                addToast(data.message || 'Backup restored successfully.');
                await Promise.all([fetchDiagnostics(), fetchTasks()]);
            } catch (e: any) {
                addToast(e.message || 'Backup restore failed', 'error');
            } finally {
                setIsRestoringBackup(false);
            }
        });
    }, [addToast, backupRestoreText, fetchDiagnostics, fetchTasks]);

    const handleRestoreFromFile = useCallback(async (filename: string) => {
        appConfirm(`Restore from backup file "${filename}"? This will overwrite current data.`, async () => {
            try {
                const res = await apiFetch('/api/admin/backups/restore-file', {
                    method: 'POST',
                    body: JSON.stringify({ filename, confirm: true }),
                });
                addToast(res?.message || 'Backup restored from file successfully.');
                await Promise.all([fetchDiagnostics(), fetchTasks(), fetchBackupFiles()]);
            } catch (e: any) {
                addToast(e.message || 'Failed to restore backup file', 'error');
            }
        });
    }, [addToast, fetchBackupFiles, fetchDiagnostics, fetchTasks]);

    return {
        backupRestoreText,
        setBackupRestoreText,
        isRestoringBackup,
        autoBackupEnabled,
        setAutoBackupEnabled,
        autoBackupIntervalDays,
        setAutoBackupIntervalDays,
        autoBackupRetentionCount,
        setAutoBackupRetentionCount,
        backupFiles,
        fetchBackupFiles,
        handleDownloadBackup,
        handleCreateBackupFile,
        handleRestoreBackup,
        handleRestoreFromFile,
    };
};
