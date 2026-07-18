import React, { useCallback, useEffect, useRef, useState } from 'react';

import { apiFetch } from '../shared/api';
import { portalUrl } from '../shared/basePath';
import { pushToast, type ToastMessage } from '../shared/toast';
import { hasIntegrationCredentials } from './integrationDisplay';
import { SettingsPageLayout } from './SettingsPageLayout';
import { buildSettingsTabPanelProps } from './settingsTabPanelProps';
import { usePlexServerDiscovery } from './usePlexServerDiscovery';
import { useSettingsAdminPanel } from './useSettingsAdminPanel';
import { useSettingsEmailActions } from './useSettingsEmailActions';
import { useSettingsFormState } from './useSettingsFormState';
import { useSettingsHydration } from './useSettingsHydration';
import { useSettingsResources } from './useSettingsResources';
import { useSettingsTabs } from './useSettingsTabs';

export const SettingsDashboard: React.FC = () => {
    const [statusDraft, setStatusDraft] = useState<any>(null);
    const [isLoading, setLoading] = useState(true);
    const [configLoadError, setConfigLoadError] = useState<string | null>(null);
    const [initialSettings, setInitialSettings] = useState<any>({});
    const [isConfigLoaded, setIsConfigLoaded] = useState(false);
    const [toasts, setToasts] = useState<ToastMessage[]>([]);
    const [isPushingAnnouncement, setIsPushingAnnouncement] = useState(false);
    const streamRulesSaveHandlerRef = useRef<(() => Promise<boolean>) | null>(null);

    const addToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
        setToasts(current => pushToast(current, message, type));
    }, []);

    const tabs = useSettingsTabs();
    const resources = useSettingsResources({ activeTab: tabs.activeTab, addToast });
    const form = useSettingsFormState();
    const admin = useSettingsAdminPanel({
        activeTab: tabs.activeTab,
        addToast,
        setLoading,
        mediaServerType: form.values.mediaServerType,
    });

    useSettingsHydration({
        initialSettings,
        isConfigLoaded,
        form,
        admin,
    });

    useEffect(() => {
        const fetchConfig = async () => {
            setLoading(true);
            setConfigLoadError(null);
            try {
                const configData = await apiFetch('/api/config');
                if (configData.settings) {
                    setInitialSettings(configData.settings);
                }
                setIsConfigLoaded(true);
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Failed to load config';
                setConfigLoadError(message);
                addToast(message, 'error');
            } finally {
                setLoading(false);
            }
        };
        fetchConfig();
    }, [addToast]);

    const handleSaveConfig = async (newConfig: any) => {
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
    };

    const handleFetchServers = usePlexServerDiscovery({
        token: form.values.token,
        plexServerUrl: form.values.plexServerUrl,
        selectedServer: form.values.selectedServer,
        addToast,
        setLoading,
        setServers: servers => form.setField('servers', servers),
        setSelectedServer: serverId => form.setField('selectedServer', serverId),
    });

    const emailActions = useSettingsEmailActions({
        addToast,
        smtpHost: form.values.smtpHost,
        smtpPort: form.values.smtpPort,
        smtpUser: form.values.smtpUser,
        smtpPass: form.values.smtpPass,
        smtpFrom: form.values.smtpFrom,
        smtpSecure: form.values.smtpSecure,
        testRecipient: form.values.testRecipient,
    });

    const handlePushAnnouncement = async () => {
        setIsPushingAnnouncement(true);
        try {
            const response = await apiFetch('/api/announcements/push', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: form.values.announcement, sendEmail: true }),
            });
            if (response.error) throw new Error(response.error);
            addToast('Announcement saved and email push started (staggered over 30 mins).');
        } catch (error: any) {
            addToast(error.message || 'Failed to push announcement', 'error');
        } finally {
            setIsPushingAnnouncement(false);
        }
    };

    const handleSave = async () => {
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
    };

    const settingsTabPanelProps = buildSettingsTabPanelProps({
        addToast,
        streamRulesSaveHandlerRef,
        initialSettings,
        form,
        tabs,
        resources,
        emailActions,
        admin,
        handleFetchServers,
        setStatusDraft,
        handlePushAnnouncement,
        isPushingAnnouncement,
    });

    return <SettingsPageLayout
        activeTab={tabs.activeTab}
        isLoading={isLoading}
        configLoadError={configLoadError}
        toasts={toasts}
        setToasts={setToasts}
        settingsSearch={tabs.settingsSearch}
        settingsTabs={tabs.settingsTabsFlat}
        visibleTabGroups={tabs.visibleTabGroups}
        panelProps={settingsTabPanelProps}
        onSearchChange={tabs.setSettingsSearch}
        onTabChange={tabs.setActiveTab}
        onSave={handleSave}
    />;
};
