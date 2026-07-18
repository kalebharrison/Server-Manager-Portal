import type React from 'react';

import type { SettingsTabPanelProps } from './SettingsTabPanel';
import type { SettingsFormState, SettingsFormValues } from './useSettingsFormState';
import type { useSettingsAdminPanel } from './useSettingsAdminPanel';
import type { useSettingsEmailActions } from './useSettingsEmailActions';
import type { useSettingsResources } from './useSettingsResources';
import type { useSettingsTabs } from './useSettingsTabs';

export type SettingsTabPanelPropsInput = {
    addToast: SettingsTabPanelProps['addToast'];
    streamRulesSaveHandlerRef: SettingsTabPanelProps['streamRulesSaveHandlerRef'];
    initialSettings: any;
    form: SettingsFormState;
    tabs: ReturnType<typeof useSettingsTabs>;
    resources: ReturnType<typeof useSettingsResources>;
    emailActions: ReturnType<typeof useSettingsEmailActions>;
    admin: ReturnType<typeof useSettingsAdminPanel>;
    handleFetchServers: () => Promise<void>;
    setStatusDraft: React.Dispatch<React.SetStateAction<any>>;
    handlePushAnnouncement: () => Promise<void>;
    isPushingAnnouncement: boolean;
};

export type SettingsTabPanelOnChange = <K extends keyof SettingsFormValues>(key: K) => (value: SettingsFormValues[K]) => void;

export const createSettingsTabPanelOnChange = (form: SettingsFormState): SettingsTabPanelOnChange => {
    return <K extends keyof SettingsFormValues>(key: K) => (value: SettingsFormValues[K]) => {
        form.setField(key, value);
    };
};
