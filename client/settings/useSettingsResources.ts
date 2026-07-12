import { useCallback, useEffect, useState } from 'react';

import { apiFetch } from '../shared/api';
import type { User } from '../shared/types';
import type { SettingsTabId } from './settingsTabs';

export const useSettingsResources = ({
    activeTab,
    addToast,
}: {
    activeTab: SettingsTabId;
    addToast: (message: string, type?: 'success' | 'error') => void;
}) => {
    const [statusConfig, setStatusConfig] = useState<any>({});
    const [users, setUsers] = useState<User[]>([]);
    const [libraries, setLibraries] = useState<any[]>([]);

    const fetchStatusConfig = useCallback(async () => {
        const data = await apiFetch('/api/status/config');
        setStatusConfig(data || { groups: [], services: [] });
    }, []);

    useEffect(() => {
        if (activeTab === 'broadcast' && users.length === 0) {
            apiFetch('/api/users').then(data => setUsers(Array.isArray(data) ? data : [])).catch(() => addToast('Failed to load users', 'error'));
        }
        if (activeTab === 'status' && !statusConfig.services) {
            fetchStatusConfig().catch(() => addToast('Failed to load status configuration', 'error'));
        }
        if (activeTab === 'plex' && libraries.length === 0) {
            apiFetch('/api/plex/libraries').then(data => setLibraries(Array.isArray(data) ? data : [])).catch(() => setLibraries([]));
        }
    }, [activeTab, addToast, fetchStatusConfig, libraries.length, statusConfig.services, users.length]);

    return {
        statusConfig,
        setStatusConfig,
        users,
        libraries,
        setLibraries,
        fetchStatusConfig,
    };
};
