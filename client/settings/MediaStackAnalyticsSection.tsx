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
    const tautulliConfigured = hasIntegrationCredentials(
        tautulliUrl,
        tautulliApiKey,
        initialSettings.tautulliUrl,
        initialSettings.tautulliApiKey,
    );
    const jellystatConfigured = hasIntegrationCredentials(
        jellystatUrl,
        jellystatApiKey,
        initialSettings.jellystatUrl,
        initialSettings.jellystatApiKey,
    );
    const plexActive = mediaServerType !== 'jellyfin';

    return (
        <>
            <SettingsCollapseSection
                title={<IntegrationTitle app="tautulli" title="Tautulli" subtitle="Plex activity and analytics" />}
                subtitle={[
                    tautulliConfigured ? 'Configured' : 'Not configured',
                    plexActive ? 'Active' : null,
                ].filter(Boolean).join(' · ')}
            >
                {!plexActive && (
                    <div className="mb-4">
                        <SettingHint>
                            Media server is set to Jellyfin, so portal analytics use Jellystat. Keep Tautulli configured if you still run Plex or may switch back.
                        </SettingHint>
                    </div>
                )}
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
                    disabled={!tautulliConfigured && !hasIntegrationCredentials(tautulliUrl, tautulliApiKey)}
                    onMessage={(msg, ok) => addToast(msg, ok ? 'success' : 'error')}
                />
            </SettingsCollapseSection>

            <SettingsCollapseSection
                title={<IntegrationTitle app="jellystat" title="Jellystat" subtitle="Jellyfin activity and analytics" />}
                subtitle={[
                    jellystatConfigured ? 'Configured' : 'Not configured',
                    !plexActive ? 'Active' : null,
                ].filter(Boolean).join(' · ')}
            >
                {plexActive && (
                    <div className="mb-4">
                        <SettingHint>
                            Media server is set to Plex, so portal analytics use Tautulli. Keep Jellystat configured if you also run Jellyfin or may switch.
                        </SettingHint>
                    </div>
                )}
                <div className="mb-4">
                    <label htmlFor="jellystatUrl">Jellystat URL</label>
                    <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="jellystatUrl" type="text" value={jellystatUrl} onChange={(e) => onJellystatUrlChange(e.target.value)} placeholder="http://localhost:3000" />
                </div>
                <div className="mb-4">
                    <label htmlFor="jellystatApiKey">Jellystat API Key</label>
                    <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="jellystatApiKey" type="password" value={jellystatApiKey} onChange={(e) => onJellystatApiKeyChange(e.target.value)} placeholder="API key from Jellystat Settings" />
                </div>
                <IntegrationTestButton
                    type="jellystat"
                    payload={{ jellystatUrl, jellystatApiKey }}
                    disabled={!jellystatConfigured && !hasIntegrationCredentials(jellystatUrl, jellystatApiKey)}
                    onMessage={(msg, ok) => addToast(msg, ok ? 'success' : 'error')}
                />
            </SettingsCollapseSection>
        </>
    );
};
