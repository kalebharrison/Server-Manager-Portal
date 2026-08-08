import React, { useCallback, useEffect, useRef, useState } from 'react';

import { apiFetch } from '../shared/api';
import { pushToast, type ToastMessage } from '../shared/toast';
import { SettingsPageLayout } from './SettingsPageLayout';
import { buildSettingsTabPanelProps } from './settingsTabPanelProps';
import { usePlexServerDiscovery } from './usePlexServerDiscovery';
import { useSettingsAdminPanel } from './useSettingsAdminPanel';
import { useSettingsDashboardSave } from './useSettingsDashboardSave';
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

    const { handleSave } = useSettingsDashboardSave({
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
    });

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
        inboundRepliesEnabled: form.values.inboundRepliesEnabled,
        inboundReplyDomain: form.values.inboundReplyDomain,
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
