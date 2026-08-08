import React, { useEffect } from 'react';

import type { ArrInstance } from '../shared/types';
import { ArrInstancesPanel } from './ArrInstancesPanel';
import { MediaStackAnalyticsSection } from './MediaStackAnalyticsSection';
import { MediaStackRequestSection } from './MediaStackRequestSection';
import { QcDownloadClientsSection } from './QcDownloadClientsSection';
import { SettingsCollapseSection } from './SettingsCollapseSection';

type MediaStackSettingsTabProps = {
    initialSettings: any;
    mediaServerType: 'plex' | 'jellyfin';
    arrInstances: ArrInstance[];
    tautulliUrl: string;
    tautulliApiKey: string;
    jellystatUrl: string;
    jellystatApiKey: string;
    qcQbitUrl: string;
    qcQbitUsername: string;
    qcQbitPassword: string;
    qcSabUrl: string;
    qcSabApiKey: string;
    onArrInstancesChange: (value: ArrInstance[]) => void;
    onTautulliUrlChange: (value: string) => void;
    onTautulliApiKeyChange: (value: string) => void;
    onJellystatUrlChange: (value: string) => void;
    onJellystatApiKeyChange: (value: string) => void;
    onQcQbitUrlChange: (value: string) => void;
    onQcQbitUsernameChange: (value: string) => void;
    onQcQbitPasswordChange: (value: string) => void;
    onQcSabUrlChange: (value: string) => void;
    onQcSabApiKeyChange: (value: string) => void;
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
    qcQbitUrl,
    qcQbitUsername,
    qcQbitPassword,
    qcSabUrl,
    qcSabApiKey,
    onArrInstancesChange,
    onTautulliUrlChange,
    onTautulliApiKeyChange,
    onJellystatUrlChange,
    onJellystatApiKeyChange,
    onQcQbitUrlChange,
    onQcQbitUsernameChange,
    onQcQbitPasswordChange,
    onQcSabUrlChange,
    onQcSabApiKeyChange,
    addToast,
}) => {
    useEffect(() => {
        const anchor = window.location.hash.replace(/^#/, '');
        if (anchor !== 'qbittorrent' && anchor !== 'sabnzbd') return;
        const frame = requestAnimationFrame(() => {
            document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        return () => cancelAnimationFrame(frame);
    }, []);

    return (
    <div className="mb-8 animate-fade-in space-y-4">
        {(['sonarr', 'radarr', 'lidarr'] as const).map((type) => (
            <ArrInstancesPanel
                key={type}
                type={type}
                instances={arrInstances.filter((instance) => instance.type === type)}
                onChange={(typedInstances) => onArrInstancesChange([
                    ...arrInstances.filter((instance) => instance.type !== type),
                    ...typedInstances,
                ])}
                onMessage={(message, ok) => addToast(message, ok ? 'success' : 'error')}
            />
        ))}

        <QcDownloadClientsSection
            qcQbitUrl={qcQbitUrl}
            qcQbitUsername={qcQbitUsername}
            qcQbitPassword={qcQbitPassword}
            qcSabUrl={qcSabUrl}
            qcSabApiKey={qcSabApiKey}
            onQcQbitUrlChange={onQcQbitUrlChange}
            onQcQbitUsernameChange={onQcQbitUsernameChange}
            onQcQbitPasswordChange={onQcQbitPasswordChange}
            onQcSabUrlChange={onQcSabUrlChange}
            onQcSabApiKeyChange={onQcSabApiKeyChange}
        />

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

        <SettingsCollapseSection
            title="Maintenance"
            subtitle="One-shot migration and normalization tools"
            defaultOpen={false}
        >
            <MediaStackRequestSection addToast={addToast} />
        </SettingsCollapseSection>
    </div>
    );
};
