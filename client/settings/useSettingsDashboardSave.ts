import { useCallback, type MutableRefObject } from 'react';

import { apiFetch } from '../shared/api';
import { portalUrl } from '../shared/basePath';
import { hasIntegrationCredentials } from './integrationDisplay';

type SettingsDashboardSaveArgs = {
    addToast: (message: string, type?: 'success' | 'error') => void;
    setLoading: (loading: boolean) => void;
    setInitialSettings: (settings: any) => void;
    initialSettings: any;
    form: any;
    admin: any;
    tabs: { activeTab: string };
    resources: { setStatusConfig: (config: any) => void };
    statusDraft: any;
    streamRulesSaveHandlerRef: MutableRefObject<(() => Promise<boolean>) | null>;
};

export const useSettingsDashboardSave = ({
    addToast,
    setLoading,
    setInitialSettings,
    initialSettings,
    form,
    admin,
    tabs,
    resources,
    statusDraft,
    streamRulesSaveHandlerRef,
}: SettingsDashboardSaveArgs) => {
    const handleSaveConfig = useCallback(async (newConfig: any) => {
        setLoading(true);
        try {
            await apiFetch('/api/config', { method: 'POST', body: JSON.stringify(newConfig) });
            const configData = await apiFetch('/api/config');
            if (configData.settings) {
                setInitialSettings(configData.settings);
            }
            window.dispatchEvent(new CustomEvent('portal-public-config-updated'));
            addToast('Settings Saved!');
        } catch (error: any) {
            addToast(error.message || 'Failed to save config', 'error');
        } finally {
            setLoading(false);
        }
    }, [addToast, setInitialSettings, setLoading]);

    const handleSave = useCallback(async () => {
        const settings = form.values;
        if (tabs.activeTab === 'stream-rules' && streamRulesSaveHandlerRef.current) {
            await streamRulesSaveHandlerRef.current();
            return;
        }
        if (settings.mediaServerType === 'plex' && (!settings.token || !settings.selectedServer)) {
            addToast('Token and server must be selected.', 'error');
            return;
        }
        if (settings.mediaServerType === 'jellyfin' && (
            !settings.jellyfinUrl
            || !hasIntegrationCredentials(
                settings.jellyfinUrl,
                settings.jellyfinApiKey,
                initialSettings.jellyfinUrl,
                initialSettings.jellyfinApiKey,
            )
        )) {
            addToast('Jellyfin URL and API key must be set.', 'error');
            return;
        }

        let nextCustomLogoUrl = settings.customLogoUrl;
        if (settings.logoFile) {
            try {
                await fetch(portalUrl('/api/config/logo'), { method: 'POST', body: settings.logoFile });
                nextCustomLogoUrl = `/static/logo.png?v=${Date.now()}`;
                form.setField('customLogoUrl', nextCustomLogoUrl);
                form.setField('logoFile', null);
            } catch (error) {
                addToast('Failed to upload logo', 'error');
                return;
            }
        }

        if (statusDraft) {
            try {
                await apiFetch('/api/status/config', { method: 'POST', body: JSON.stringify(statusDraft) });
                resources.setStatusConfig(statusDraft);
            } catch (error: any) {
                addToast('Failed to save status monitor configuration', 'error');
            }
        }

        await handleSaveConfig(form.createSavePayload({
            customLogoUrl: nextCustomLogoUrl,
            autoBackupEnabled: admin.autoBackupEnabled,
            autoBackupIntervalDays: admin.autoBackupIntervalDays,
            autoBackupRetentionCount: admin.autoBackupRetentionCount,
        }));
    }, [
        addToast,
        admin.autoBackupEnabled,
        admin.autoBackupIntervalDays,
        admin.autoBackupRetentionCount,
        form,
        handleSaveConfig,
        initialSettings.jellyfinApiKey,
        initialSettings.jellyfinUrl,
        resources,
        statusDraft,
        streamRulesSaveHandlerRef,
        tabs.activeTab,
    ]);

    return { handleSave, handleSaveConfig };
};
