import React from 'react';

import { IntegrationTestButton } from '../shared/IntegrationTestButton';
import { SettingHint } from './SettingHint';
import { IntegrationTitle, hasIntegrationCredentials } from './integrationDisplay';
import { SettingsCollapseSection } from './SettingsCollapseSection';

export const MediaStackAnalyticsSection: React.FC<{
    mediaServerType: 'plex' | 'jellyfin';
    initialSettings: any;
    tautulliUrl: string;
    tautulliApiKey: string;
    jellystatUrl: string;
    jellystatApiKey: string;
    onTautulliUrlChange: (value: string) => void;
    onTautulliApiKeyChange: (value: string) => void;
    onJellystatUrlChange: (value: string) => void;
    onJellystatApiKeyChange: (value: string) => void;
    addToast: (message: string, type?: 'success' | 'error') => void;
}> = ({
    mediaServerType,
    initialSettings,
    tautulliUrl,
    tautulliApiKey,
    jellystatUrl,
    jellystatApiKey,
    onTautulliUrlChange,
    onTautulliApiKeyChange,
    onJellystatUrlChange,
    onJellystatApiKeyChange,
    addToast,
}) => {
    if (mediaServerType === 'plex') {
        const configured = hasIntegrationCredentials(
            tautulliUrl,
            tautulliApiKey,
            initialSettings.tautulliUrl,
            initialSettings.tautulliApiKey,
        );
        return (
            <SettingsCollapseSection
                defaultOpen={configured}
                title={<IntegrationTitle app="tautulli" title="Tautulli" subtitle="Plex activity and analytics" />}
                subtitle={configured ? 'Configured' : 'Not configured'}
            >
                <div className="mb-4">
                    <label htmlFor="tautulliUrl">Tautulli URL</label>
                    <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="tautulliUrl" type="text" value={tautulliUrl} onChange={(e) => onTautulliUrlChange(e.target.value)} placeholder="http://localhost:8181" />
                </div>
                <div className="mb-4">
                    <label htmlFor="tautulliApiKey">Tautulli API Key</label>
                    <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="tautulliApiKey" type="password" value={tautulliApiKey} onChange={(e) => onTautulliApiKeyChange(e.target.value)} placeholder="Enter Tautulli API Key" />
                </div>
                <IntegrationTestButton
                    type="tautulli"
                    payload={{ tautulliUrl, tautulliApiKey }}
                    disabled={!configured && !hasIntegrationCredentials(tautulliUrl, tautulliApiKey)}
                    onMessage={(msg, ok) => addToast(msg, ok ? 'success' : 'error')}
                />
            </SettingsCollapseSection>
        );
    }

    const configured = hasIntegrationCredentials(
        jellystatUrl,
        jellystatApiKey,
        initialSettings.jellystatUrl,
        initialSettings.jellystatApiKey,
    );
    return (
        <SettingsCollapseSection
            defaultOpen={configured}
            title={<IntegrationTitle app="jellystat" title="Jellystat" subtitle="Jellyfin activity and analytics" />}
            subtitle={configured ? 'Configured' : 'Not configured'}
        >
            <div className="mb-4">
                <label htmlFor="jellystatUrl">Jellystat URL</label>
                <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="jellystatUrl" type="text" value={jellystatUrl} onChange={(e) => onJellystatUrlChange(e.target.value)} placeholder="http://localhost:3000" />
                <div className="mt-2">
                    <SettingHint>The URL to your Jellystat instance. Jellystat is the Jellyfin analytics companion, similar to Tautulli for Plex.</SettingHint>
                </div>
            </div>
            <div className="mb-4">
                <label htmlFor="jellystatApiKey">Jellystat API Key</label>
                <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="jellystatApiKey" type="password" value={jellystatApiKey} onChange={(e) => onJellystatApiKeyChange(e.target.value)} placeholder="API key from Jellystat Settings" />
            </div>
            <IntegrationTestButton
                type="jellystat"
                payload={{ jellystatUrl, jellystatApiKey }}
                disabled={!configured && !hasIntegrationCredentials(jellystatUrl, jellystatApiKey)}
                onMessage={(msg, ok) => addToast(msg, ok ? 'success' : 'error')}
            />
        </SettingsCollapseSection>
    );
};
