import React from 'react';

import { IntegrationTestButton } from '../shared/IntegrationTestButton';
import type { ArrInstance } from '../shared/types';
import { CustomSelect } from '../shared/ui';
import { ArrInstancesPanel } from './ArrInstancesPanel';
import { IntegrationHeading, hasIntegrationCredentials } from './integrationDisplay';
import { SettingHint } from './SettingHint';

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

        {mediaServerType === 'plex' && <>
        <IntegrationHeading app="tautulli" title="Tautulli Integration" subtitle="Plex activity and analytics" className="mt-8" />
        <div className="mb-4">
            <label htmlFor="tautulliUrl">Tautulli URL</label>
            <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="tautulliUrl" type="text" value={tautulliUrl} onChange={(e) => onTautulliUrlChange(e.target.value)} placeholder="http://localhost:8181" />
        </div>
        <div className="mb-8">
            <label htmlFor="tautulliApiKey">Tautulli API Key</label>
            <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="tautulliApiKey" type="password" value={tautulliApiKey} onChange={(e) => onTautulliApiKeyChange(e.target.value)} placeholder="Enter Tautulli API Key" />
        </div>
        <IntegrationTestButton
            type="tautulli"
            payload={{ tautulliUrl, tautulliApiKey }}
            disabled={!hasIntegrationCredentials(tautulliUrl, tautulliApiKey, initialSettings.tautulliUrl, initialSettings.tautulliApiKey)}
            className="mb-6"
            onMessage={(msg, ok) => addToast(msg, ok ? 'success' : 'error')}
        />
        </>}

        {mediaServerType === 'jellyfin' && <>
        <IntegrationHeading app="jellystat" title="Jellystat Integration" subtitle="Jellyfin activity and analytics" className="mt-8" />
        <div className="mb-4">
            <label htmlFor="jellystatUrl">Jellystat URL</label>
            <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="jellystatUrl" type="text" value={jellystatUrl} onChange={(e) => onJellystatUrlChange(e.target.value)} placeholder="http://localhost:3000" />
            <div className="mt-2">
                <SettingHint>The URL to your Jellystat instance. Jellystat is the Jellyfin analytics companion, similar to Tautulli for Plex.</SettingHint>
            </div>
        </div>
        <div className="mb-8">
            <label htmlFor="jellystatApiKey">Jellystat API Key</label>
            <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="jellystatApiKey" type="password" value={jellystatApiKey} onChange={(e) => onJellystatApiKeyChange(e.target.value)} placeholder="API key from Jellystat Settings" />
        </div>
        <IntegrationTestButton
            type="jellystat"
            payload={{ jellystatUrl, jellystatApiKey }}
            disabled={!hasIntegrationCredentials(jellystatUrl, jellystatApiKey, initialSettings.jellystatUrl, initialSettings.jellystatApiKey)}
            className="mb-6"
            onMessage={(msg, ok) => addToast(msg, ok ? 'success' : 'error')}
        />
        </>}

        <IntegrationHeading
            app={requestAppType === 'none' ? 'seerr' : requestAppType}
            title="Primary Movie & TV Requester"
            subtitle="Seerr or Jellyseerr powers the embedded request experience"
            className="mt-8"
        />
        <div className="mb-4">
            <label htmlFor="requestAppType">Request App Type</label>
            <CustomSelect
                id="requestAppType"
                value={requestAppType}
                onChange={(val) => onRequestAppTypeChange(val)}
                options={[
                    { label: 'Disabled', value: 'none' },
                    { label: 'Seerr', value: 'seerr' },
                    { label: 'Jellyseerr', value: 'jellyseerr' },
                    ...(requestAppType === 'ombi' ? [{ label: 'Ombi (legacy external mode)', value: 'ombi' }] : [])
                ]}
            />
            <div className="mt-2">
                <SettingHint>
                    {requestAppType === 'ombi'
                        ? 'This legacy configuration remains usable for connection testing and status. Choose Seerr or Jellyseerr for embedded browsing and requests.'
                        : 'Powers the embedded Request tab, request status, and issue reporting.'}
                </SettingHint>
            </div>
        </div>
        <div className="mb-4">
            <label htmlFor="requestAppUrl">Request App URL</label>
            <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="requestAppUrl" type="text" value={requestAppUrl} onChange={(e) => onRequestAppUrlChange(e.target.value)} placeholder="http://localhost:5055" />
        </div>
        <div className="mb-8">
            <label htmlFor="requestAppApiKey">Request App API Key</label>
            <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="requestAppApiKey" type="password" value={requestAppApiKey} onChange={(e) => onRequestAppApiKeyChange(e.target.value)} placeholder="API key from request app settings" />
        </div>
        <IntegrationTestButton
            type="requestApp"
            payload={{ requestAppType, requestAppUrl, requestAppApiKey }}
            disabled={requestAppType === 'none' || !hasIntegrationCredentials(requestAppUrl, requestAppApiKey, initialSettings.requestAppUrl, initialSettings.requestAppApiKey)}
            onMessage={(msg, ok) => addToast(msg, ok ? 'success' : 'error')}
        />

        {requestAppType !== 'ombi' && <>
            <IntegrationHeading app="ombi" title="Ombi Music Requests" subtitle="Optional secondary requester for Lidarr workflows" className="mt-8" />
            <div className="mb-4">
                <label htmlFor="ombiUrl">Ombi URL</label>
                <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="ombiUrl" type="text" value={ombiUrl} onChange={(event) => onOmbiUrlChange(event.target.value)} placeholder="http://localhost:3579" />
                <div className="mt-2"><SettingHint>Runs alongside Seerr for music requests. It does not replace the embedded movie and TV requester.</SettingHint></div>
            </div>
            <div className="mb-4">
                <label htmlFor="ombiApiKey">Ombi API Key</label>
                <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="ombiApiKey" type="password" value={ombiApiKey} onChange={(event) => onOmbiApiKeyChange(event.target.value)} placeholder="API key from Ombi settings" />
            </div>
            <IntegrationTestButton
                type="requestApp"
                payload={{ requestAppType: 'ombi', ombiUrl, ombiApiKey }}
                disabled={!hasIntegrationCredentials(ombiUrl, ombiApiKey, initialSettings.ombiUrl, initialSettings.ombiApiKey)}
                onMessage={(message, ok) => addToast(message, ok ? 'success' : 'error')}
            />
        </>}
    </div>
);
