import { useCallback, useEffect, useState } from 'react';

import { apiFetch } from '../shared/api';

export const useStatusMonitorConfig = ({
    config,
    onChange,
    appConfirm,
    addToast,
}: {
    config: any;
    onChange: (cfg: any) => void;
    appConfirm: (msg: string, cb: () => void) => void;
    addToast: (msg: string, type?: 'success' | 'error') => void;
}) => {
    const [localConfig, setLocalConfig] = useState<any>({ groups: [], services: [] });

    useEffect(() => {
        if (config) {
            setLocalConfig({
                groups: config.groups || [],
                services: config.services || []
            });
        }
    }, [config]);

    const updateConfig = useCallback((newConfig: any) => {
        setLocalConfig(newConfig);
        onChange(newConfig);
    }, [onChange]);

    const addGroup = () => {
        const id = `group-${Date.now()}`;
        updateConfig({ ...localConfig, groups: [...localConfig.groups, { id, name: 'New Group', order: localConfig.groups.length }] });
    };

    const addService = () => {
        const id = `service-${Date.now()}`;
        const newService = {
            id,
            name: 'New Service',
            url: '',
            category: 'web',
            type: 'http',
            groupId: null,
            description: ''
        };
        updateConfig({ ...localConfig, services: [...localConfig.services, newService] });
    };

    const updateGroup = (id: string, field: string, value: any) => {
        updateConfig({
            ...localConfig,
            groups: localConfig.groups.map((g: any) => g.id === id ? { ...g, [field]: value } : g)
        });
    };

    const updateService = (id: string, field: string, value: any) => {
        updateConfig({
            ...localConfig,
            services: localConfig.services.map((s: any) => s.id === id ? { ...s, [field]: value } : s)
        });
    };

    const removeGroup = async (id: string) => {
        const groupName = localConfig.groups.find((g: any) => g.id === id)?.name || 'this group';
        appConfirm(`Remove group "${groupName}"? Services inside it won't be deleted but will lose their group.`, () => {
            updateConfig({
                ...localConfig,
                groups: localConfig.groups.filter((g: any) => g.id !== id),
                services: localConfig.services.map((s: any) => s.groupId === id ? { ...s, groupId: null } : s)
            });
        });
    };

    const removeService = async (id: string) => {
        appConfirm(`Remove service ${id}?`, () => {
            updateConfig({
                ...localConfig,
                services: localConfig.services.filter((s: any) => s.id !== id)
            });
        });
    };

    const handleResetStats = () => {
        appConfirm('Are you sure you want to reset all uptime statistics? This will delete all historical status data.', async () => {
            try {
                const res = await apiFetch('/api/status/reset', { method: 'POST' });
                if (res.error) throw new Error(res.error);
                addToast('Status statistics reset successfully.', 'success');
            } catch (e: any) {
                addToast(e.message || 'Failed to reset statistics.', 'error');
            }
        });
    };

    return {
        localConfig,
        addGroup,
        addService,
        updateGroup,
        updateService,
        removeGroup,
        removeService,
        handleResetStats,
    };
};
