import { useCallback, useEffect, useMemo, useState } from 'react';

import { apiFetch } from '../shared/api';
import { calculateSystemHealth } from './settingsSystemHealth';
import type { SettingsTabId } from './settingsTabs';
import { useSettingsAdminPanelBackups } from './useSettingsAdminPanelBackups';
import { useSettingsAdminPanelLogs } from './useSettingsAdminPanelLogs';

type UseSettingsAdminPanelOptions = {
    activeTab: SettingsTabId;
    addToast: (message: string, type?: 'success' | 'error') => void;
    setLoading: (value: boolean) => void;
    mediaServerType: 'plex' | 'jellyfin';
};

export const useSettingsAdminPanel = ({
    activeTab,
    addToast,
    setLoading,
    mediaServerType,
}: UseSettingsAdminPanelOptions) => {
    const [tasks, setTasks] = useState<any[]>([]);
    const [diagnostics, setDiagnostics] = useState<any>(null);
    const [isLoadingDiagnostics, setIsLoadingDiagnostics] = useState(false);

    const fetchTasks = useCallback(async () => {
        try {
            const data = await apiFetch('/api/tasks');
            setTasks(data);
        } catch (e) {
            addToast('Failed to load tasks', 'error');
        }
    }, [addToast]);

    const fetchDiagnostics = useCallback(async () => {
        setIsLoadingDiagnostics(true);
        try {
            const data = await apiFetch('/api/admin/diagnostics');
            setDiagnostics(data);
        } catch (e) {
            addToast('Failed to load diagnostics', 'error');
        } finally {
            setIsLoadingDiagnostics(false);
        }
    }, [addToast]);

    const backups = useSettingsAdminPanelBackups({
        addToast,
        fetchDiagnostics,
        fetchTasks,
    });

    const logs = useSettingsAdminPanelLogs({
        addToast,
        setLoading,
    });

    const handleRunTask = useCallback(async (taskId: string) => {
        setLoading(true);
        try {
            const res = await apiFetch(`/api/tasks/run/${taskId}`, { method: 'POST' });
            addToast(res.message || 'Task executed successfully', 'success');
            await fetchTasks();
        } catch (e) {
            addToast(e instanceof Error ? e.message : 'Task failed', 'error');
        } finally {
            setLoading(false);
        }
    }, [addToast, fetchTasks, setLoading]);

    useEffect(() => {
        if (activeTab === 'tasks' || activeTab === 'system') {
            fetchTasks();
        }
        if (activeTab === 'system') {
            fetchDiagnostics();
            backups.fetchBackupFiles();
            logs.fetchAuditLog();
        }
        if (activeTab === 'logs') {
            logs.fetchDeletedUsersLog();
            logs.fetchAuditLog();
        }
    }, [
        activeTab,
        backups.fetchBackupFiles,
        fetchDiagnostics,
        fetchTasks,
        logs.fetchAuditLog,
        logs.fetchDeletedUsersLog,
    ]);

    const systemHealth = useMemo(() => calculateSystemHealth({
        diagnostics,
        mediaServerType,
    }), [diagnostics, mediaServerType]);

    return {
        tasks,
        diagnostics,
        isLoadingDiagnostics,
        ...backups,
        ...logs,
        fetchDiagnostics,
        handleRunTask,
        systemHealth,
    };
};
