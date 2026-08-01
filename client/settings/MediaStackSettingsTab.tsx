import React from 'react';

import type { ArrInstance } from '../shared/types';
import { ArrInstancesPanel } from './ArrInstancesPanel';
import { MediaStackAnalyticsSection } from './MediaStackAnalyticsSection';
import { MediaStackRequestSection } from './MediaStackRequestSection';

type MediaStackSettingsTabProps = {
    initialSettings: any;
    mediaServerType: 'plex' | 'jellyfin';
    arrInstances: ArrInstance[];
    tautulliUrl: string;
    tautulliApiKey: string;
    jellystatUrl: string;
    jellystatApiKey: string;
    ombiUrl: string;
    ombiApiKey: string;
    onArrInstancesChange: (value: ArrInstance[]) => void;
    onTautulliUrlChange: (value: string) => void;
    onTautulliApiKeyChange: (value: string) => void;
    onJellystatUrlChange: (value: string) => void;
    onJellystatApiKeyChange: (value: string) => void;
    onOmbiUrlChange: (value: string) => void;
    onOmbiApiKeyChange: (value: string) => void;
    addToast: (message: string, type?: 'success' | 'error') => void;
};

export const MediaStackSettingsTab: React.FC<MediaStackSettingsTabProps> = ({
    initialSettings,
    mediaServerType,
    arrInstances,
    tautulliUrl,
    tautulliApiKey,
    jellystatUrl,
    jellystatApiKey,
    ombiUrl,
    ombiApiKey,
    onArrInstancesChange,
    onTautulliUrlChange,
    onTautulliApiKeyChange,
    onJellystatUrlChange,
    onJellystatApiKeyChange,
    onOmbiUrlChange,
    onOmbiApiKeyChange,
    addToast,
}) => (
    <div className="mb-8 animate-fade-in">
        {(['sonarr', 'radarr', 'lidarr'] as const).map((type, index) => (
            <ArrInstancesPanel
                key={type}
                type={type}
                instances={arrInstances.filter((instance) => instance.type === type)}
                onChange={(typedInstances) => onArrInstancesChange([
                    ...arrInstances.filter((instance) => instance.type !== type),
                    ...typedInstances,
                ])}
                onMessage={(message, ok) => addToast(message, ok ? 'success' : 'error')}
                className={index === 0 ? '' : 'mt-8'}
            />
        ))}

        <MediaStackAnalyticsSection
            mediaServerType={mediaServerType}
            initialSettings={initialSettings}
            tautulliUrl={tautulliUrl}
            tautulliApiKey={tautulliApiKey}
            jellystatUrl={jellystatUrl}
            jellystatApiKey={jellystatApiKey}
            onTautulliUrlChange={onTautulliUrlChange}
            onTautulliApiKeyChange={onTautulliApiKeyChange}
            onJellystatUrlChange={onJellystatUrlChange}
            onJellystatApiKeyChange={onJellystatApiKeyChange}
            addToast={addToast}
        />

        <MediaStackRequestSection
            initialSettings={initialSettings}
            ombiUrl={ombiUrl}
            ombiApiKey={ombiApiKey}
            onOmbiUrlChange={onOmbiUrlChange}
            onOmbiApiKeyChange={onOmbiApiKeyChange}
            addToast={addToast}
        />
    </div>
);
