import React from 'react';

import { StatusMonitorSettings } from './StatusMonitorSettings';

type StatusSettingsTabProps = {
    statusConfig: any;
    publicStatusEnabled: boolean;
    appConfirm: typeof import('../shared/confirm').appConfirm;
    fetchStatusConfig: () => Promise<void>;
    addToast: (message: string, type?: 'success' | 'error') => void;
    onPublicStatusEnabledChange: (enabled: boolean) => void;
    onStatusDraftChange: (draft: any) => void;
};

export const StatusSettingsTab: React.FC<StatusSettingsTabProps> = ({
    statusConfig,
    publicStatusEnabled,
    appConfirm,
    addToast,
    onPublicStatusEnabledChange,
    onStatusDraftChange,
}) => (
    <div className="mb-8 animate-fade-in">
        <h3 className="text-xl font-bold text-plex mb-4 border-b border-border pb-2">Status Monitor</h3>
        <StatusMonitorSettings
            config={statusConfig}
            publicStatusEnabled={publicStatusEnabled}
            onPublicStatusEnabledChange={onPublicStatusEnabledChange}
            onChange={onStatusDraftChange}
            appConfirm={appConfirm}
            addToast={addToast}
        />
    </div>
);
