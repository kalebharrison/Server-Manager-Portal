import React from 'react';
import { CustomSelect } from '../shared/ui';
import { SettingHint } from './SettingHint';
import { IntegrationTestButton } from '../shared/IntegrationTestButton';
import type { PlexServer } from '../shared/types';
import { hasIntegrationCredentials } from './integrationDisplay';

type MediaServerType = 'plex' | 'jellyfin';

type MediaServerSettingsTabProps = {
    initialSettings: any;
    mediaServerType: MediaServerType;
    token: string;
    plexServerUrl: string;
    jellyfinUrl: string;
    jellyfinApiKey: string;
    servers: PlexServer[];
    selectedServer: string;
    onMediaServerTypeChange: (value: MediaServerType) => void;
    onTokenChange: (value: string) => void;
    onPlexServerUrlChange: (value: string) => void;
    onJellyfinUrlChange: (value: string) => void;
    onJellyfinApiKeyChange: (value: string) => void;
    onSelectedServerChange: (value: string) => void;
    onFetchServers: () => void;
    addToast: (message: string, type?: 'success' | 'error') => void;
};

export const MediaServerSettingsTab: React.FC<MediaServerSettingsTabProps> = ({
    initialSettings,
    mediaServerType,
    token,
    plexServerUrl,
    jellyfinUrl,
    jellyfinApiKey,
    servers,
    selectedServer,
    onMediaServerTypeChange,
    onTokenChange,
    onPlexServerUrlChange,
    onJellyfinUrlChange,
    onJellyfinApiKeyChange,
    onSelectedServerChange,
    onFetchServers,
    addToast,
}) => {
    const savedServerId = selectedServer || initialSettings.serverIdentifier;

    return (
        <div className="mb-8">
            <div className="mb-4">
                <label htmlFor="mediaServerType">Media Server Type</label>
                <CustomSelect
                    id="mediaServerType"
                    value={mediaServerType}
                    onChange={(val) => onMediaServerTypeChange(val === 'jellyfin' ? 'jellyfin' : 'plex')}
                    options={[
                        { label: 'Plex', value: 'plex' },
                        { label: 'Jellyfin', value: 'jellyfin' }
                    ]}
                />
            </div>

            {mediaServerType === 'jellyfin' && (
                <div className="mb-6 p-4 rounded-lg border border-border bg-background/40">
                    <h4 className="font-bold text-text mb-3">Jellyfin Connection</h4>
                    <div className="mb-4">
                        <label htmlFor="jellyfinUrl">Jellyfin URL</label>
                        <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="jellyfinUrl" type="url" value={jellyfinUrl} onChange={(e) => onJellyfinUrlChange(e.target.value)} placeholder="http://192.168.1.6:8096" />
                    </div>
                    <div className="mb-4">
                        <label htmlFor="jellyfinApiKey">Jellyfin API Key</label>
                        <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="jellyfinApiKey" type="password" value={jellyfinApiKey} onChange={(e) => onJellyfinApiKeyChange(e.target.value)} placeholder="API key from Jellyfin dashboard" />
                    </div>
                    <IntegrationTestButton
                        type="jellyfin"
                        payload={{ jellyfinUrl, jellyfinApiKey }}
                        disabled={!hasIntegrationCredentials(jellyfinUrl, jellyfinApiKey, initialSettings.jellyfinUrl, initialSettings.jellyfinApiKey)}
                        onMessage={(msg, ok) => addToast(msg, ok ? 'success' : 'error')}
                    />
                </div>
            )}

            {mediaServerType === 'plex' && (
                <>
                    <h4 className="text-lg font-bold text-text mb-4">Plex Connection</h4>
                    <div className="mb-4">
                        <label htmlFor="plexToken">Plex Token</label>
                        <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="plexToken" type="password" value={token} onChange={(e) => onTokenChange(e.target.value)} placeholder="Enter your X-Plex-Token" />
                        <div className="mt-2">
                            <SettingHint>
                                Needed to fetch users and manage access. <a href="https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/" target="_blank" rel="noopener noreferrer">How to find your token.</a>
                            </SettingHint>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-start gap-3">
                        <button className="px-4 py-2 bg-border text-text rounded-md font-medium hover:bg-opacity-80 transition-colors flex items-center justify-center gap-2" onClick={onFetchServers} disabled={!token}>Fetch Servers</button>
                        <IntegrationTestButton
                            type="plex"
                            payload={{
                                token,
                                serverIdentifier: savedServerId,
                                plexServerUrl: plexServerUrl || undefined,
                            }}
                            disabled={!token || !savedServerId}
                            onMessage={(msg, ok) => addToast(msg, ok ? 'success' : 'error')}
                        />
                    </div>
                    {savedServerId && servers.length === 0 && (
                        <p className="mt-3 text-xs text-muted">Saved server: <strong className="text-text">{savedServerId}</strong></p>
                    )}
                    {servers.length > 0 && (
                        <div className="mb-4" style={{ marginTop: '1rem' }}>
                            <label htmlFor="serverSelect">Select Server</label>
                            <CustomSelect
                                id="serverSelect"
                                value={selectedServer}
                                onChange={onSelectedServerChange}
                                options={servers.map(s => ({ label: `${s.name} (${s.identifier})`, value: s.identifier }))}
                            />
                            {initialSettings.serverIdentifier && (
                                <p className="mt-2 text-xs text-muted">
                                    Currently saved server ID: <strong className="text-text">{initialSettings.serverIdentifier}</strong>
                                </p>
                            )}
                        </div>
                    )}
                    <div className="mb-4" style={{ marginTop: '1rem' }}>
                        <label htmlFor="plexServerUrl">
                            Direct Plex URL{' '}
                            <span className="text-muted font-normal normal-case">(required in Docker)</span>
                        </label>
                        <input
                            className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all"
                            id="plexServerUrl"
                            type="url"
                            value={plexServerUrl}
                            onChange={(e) => onPlexServerUrlChange(e.target.value)}
                            placeholder="http://192.168.1.6:32400"
                        />
                        <div className="mt-2">
                            <SettingHint>
                                Your Plex server&apos;s LAN address. Use this when Plex.tv discovery fails from inside the container (e.g. <code className="text-xs">getaddrinfo EAI_AGAIN ...plex.direct</code> errors).
                            </SettingHint>
                        </div>
                    </div>
                </>
            )}

        </div>
    );
};
