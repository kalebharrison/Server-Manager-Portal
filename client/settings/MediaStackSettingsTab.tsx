import React from 'react';

import type { ArrInstance } from '../shared/types';
import { ArrInstancesPanel } from './ArrInstancesPanel';
import { MediaStackAnalyticsSection } from './MediaStackAnalyticsSection';
import { MediaStackRequestAppSection } from './MediaStackRequestAppSection';

type MediaStackSettingsTabProps = {
    initialSettings: any;
    mediaServerType: 'plex' | 'jellyfin';
    arrInstances: ArrInstance[];
    tautulliUrl: string;
    tautulliApiKey: string;
    jellystatUrl: string;
    jellystatApiKey: string;
    requestAppType: string;
    requestAppUrl: string;
    requestAppApiKey: string;
    requestAppMembershipSync: boolean;
    requestEngine: 'portal' | 'seerr';
    discoverySource: 'tmdb' | 'seerr';
    ombiUrl: string;
    ombiApiKey: string;
    onArrInstancesChange: (value: ArrInstance[]) => void;
    onTautulliUrlChange: (value: string) => void;
    onTautulliApiKeyChange: (value: string) => void;
    onJellystatUrlChange: (value: string) => void;
    onJellystatApiKeyChange: (value: string) => void;
    onRequestAppTypeChange: (value: string) => void;
    onRequestAppUrlChange: (value: string) => void;
    onRequestAppApiKeyChange: (value: string) => void;
    onRequestAppMembershipSyncChange: (value: boolean) => void;
    onRequestEngineChange: (value: 'portal' | 'seerr') => void;
    onDiscoverySourceChange: (value: 'tmdb' | 'seerr') => void;
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
    requestAppType,
    requestAppUrl,
    requestAppApiKey,
    requestAppMembershipSync,
    requestEngine,
    discoverySource,
    ombiUrl,
    ombiApiKey,
    onArrInstancesChange,
    onTautulliUrlChange,
    onTautulliApiKeyChange,
    onJellystatUrlChange,
    onJellystatApiKeyChange,
    onRequestAppTypeChange,
    onRequestAppUrlChange,
    onRequestAppApiKeyChange,
    onRequestAppMembershipSyncChange,
    onRequestEngineChange,
    onDiscoverySourceChange,
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

        <MediaStackRequestAppSection
            initialSettings={initialSettings}
            requestAppType={requestAppType}
            requestAppUrl={requestAppUrl}
            requestAppApiKey={requestAppApiKey}
            requestAppMembershipSync={requestAppMembershipSync}
            requestEngine={requestEngine}
            discoverySource={discoverySource}
            ombiUrl={ombiUrl}
            ombiApiKey={ombiApiKey}
            onRequestAppTypeChange={onRequestAppTypeChange}
            onRequestAppUrlChange={onRequestAppUrlChange}
            onRequestAppApiKeyChange={onRequestAppApiKeyChange}
            onRequestAppMembershipSyncChange={onRequestAppMembershipSyncChange}
            onRequestEngineChange={onRequestEngineChange}
            onDiscoverySourceChange={onDiscoverySourceChange}
            onOmbiUrlChange={onOmbiUrlChange}
            onOmbiApiKeyChange={onOmbiApiKeyChange}
            addToast={addToast}
        />
    </div>
);
