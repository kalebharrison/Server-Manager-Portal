import React from 'react';

import { portalUrl } from '../shared/basePath';
import type { ArrInstance } from '../shared/types';
import { ArrInstancesPanel } from './ArrInstancesPanel';
import { MediaStackAnalyticsSection } from './MediaStackAnalyticsSection';
import { MediaStackRequestSection } from './MediaStackRequestSection';
import { SettingHint } from './SettingHint';
import { SettingsCollapseSection } from './SettingsCollapseSection';

type MediaStackSettingsTabProps = {
    initialSettings: any;
    mediaServerType: 'plex' | 'jellyfin';
    arrInstances: ArrInstance[];
    tautulliUrl: string;
    tautulliApiKey: string;
    jellystatUrl: string;
    jellystatApiKey: string;
    onArrInstancesChange: (value: ArrInstance[]) => void;
    onTautulliUrlChange: (value: string) => void;
    onTautulliApiKeyChange: (value: string) => void;
    onJellystatUrlChange: (value: string) => void;
    onJellystatApiKeyChange: (value: string) => void;
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
    onArrInstancesChange,
    onTautulliUrlChange,
    onTautulliApiKeyChange,
    onJellystatUrlChange,
    onJellystatApiKeyChange,
    addToast,
}) => (
    <div className="mb-8 animate-fade-in space-y-4">
        <div className="mb-4">
            <h3 className="text-xl font-bold text-plex mb-2 border-b border-border pb-2 inline-flex items-center flex-wrap gap-0">
                Arr &amp; Analytics
                <SettingHint>Sonarr, Radarr, Lidarr instances and watch-stats apps (Tautulli or Jellystat).</SettingHint>
            </h3>
        </div>

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

        <div className="rounded-xl border border-border/60 bg-white/[0.02] p-4">
            <SettingHint>
                qBittorrent and SABnzbd credentials live under{' '}
                <a href={portalUrl('/settings#upgrader/downloads')} className="text-plex font-semibold hover:underline">
                    Quality Control → Downloads
                </a>
                .
            </SettingHint>
        </div>

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
