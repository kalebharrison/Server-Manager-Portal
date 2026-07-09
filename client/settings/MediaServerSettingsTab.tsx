import React from 'react';
import { Check } from 'lucide-react';
import { CustomSelect } from '../shared/ui';
import { SettingHint } from './SettingHint';
import { IntegrationTestButton } from '../shared/IntegrationTestButton';
import type { PlexServer } from '../shared/types';
import { hasIntegrationCredentials } from './integrationDisplay';

type MediaServerType = 'plex' | 'jellyfin';

type LibraryOption = {
    id: string;
    title: string;
};

type MediaServerSettingsTabProps = {
    initialSettings: any;
    mediaServerType: MediaServerType;
    token: string;
    plexServerUrl: string;
    jellyfinUrl: string;
    jellyfinApiKey: string;
    servers: PlexServer[];
    selectedServer: string;
    checkInterval: number;
    libraries: LibraryOption[];
    defaultLibraryIds: string[];
    hideStreamUsers: string;
    showUsernamesInAnalytics: boolean;
    requestUrl: string;
    contactUrl: string;
    onMediaServerTypeChange: (value: MediaServerType) => void;
    onTokenChange: (value: string) => void;
    onPlexServerUrlChange: (value: string) => void;
    onJellyfinUrlChange: (value: string) => void;
    onJellyfinApiKeyChange: (value: string) => void;
    onSelectedServerChange: (value: string) => void;
    onCheckIntervalChange: (value: number) => void;
    onDefaultLibraryIdsChange: (value: string[]) => void;
    onHideStreamUsersChange: (value: string) => void;
    onShowUsernamesInAnalyticsChange: (value: boolean) => void;
    onRequestUrlChange: (value: string) => void;
    onContactUrlChange: (value: string) => void;
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
    checkInterval,
    libraries,
    defaultLibraryIds,
    hideStreamUsers,
    showUsernamesInAnalytics,
    requestUrl,
    contactUrl,
    onMediaServerTypeChange,
    onTokenChange,
    onPlexServerUrlChange,
    onJellyfinUrlChange,
    onJellyfinApiKeyChange,
    onSelectedServerChange,
    onCheckIntervalChange,
    onDefaultLibraryIdsChange,
    onHideStreamUsersChange,
    onShowUsernamesInAnalyticsChange,
    onRequestUrlChange,
    onContactUrlChange,
    onFetchServers,
    addToast,
}) => {
    const savedServerId = selectedServer || initialSettings.serverIdentifier;

    return (
        <div className="mb-8">
            <h3 className="text-xl font-bold text-plex mb-4 border-b border-border pb-2">Media Server Integration</h3>
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
                <div className="mt-2">
                    <SettingHint>
                        Choose the media server used for portal authentication and server-specific integrations.
                    </SettingHint>
                </div>
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
                        <div className="mt-3">
                            <SettingHint>
                                Saved server: <strong>{savedServerId}</strong>
                            </SettingHint>
                        </div>
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
                                <div className="mt-2">
                                    <SettingHint>
                                        Currently saved server ID: <strong>{initialSettings.serverIdentifier}</strong>
                                    </SettingHint>
                                </div>
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
                    <div className="mb-4" style={{ marginTop: '1rem' }}>
                        <label htmlFor="checkInterval">Check Interval (minutes)</label>
                        <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="checkInterval" type="number" value={checkInterval} onChange={e => onCheckIntervalChange(Number(e.target.value))} min="1" />
                        <div className="mt-2">
                            <SettingHint>How often to check for expired users in the background.</SettingHint>
                        </div>
                    </div>

                    {libraries.length > 0 && (
                        <div className="mb-4 mt-4">
                            <label className="block mb-2 font-medium">Default Temporary Access/Automated Libraries</label>
                            <div className="mb-2">
                                <SettingHint>Libraries to share automatically when users request temporary access or link their account. Leave empty to share ALL libraries.</SettingHint>
                            </div>
                            <div className="flex flex-wrap gap-3">
                                {libraries.map(lib => {
                                    const isSelected = defaultLibraryIds.includes(lib.id);
                                    return (
                                        <label key={lib.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer transition-all border shadow-sm select-none ${isSelected ? 'bg-plex/10 border-plex text-plex font-bold' : 'bg-background border-border/50 text-muted hover:border-white/20 hover:text-text font-medium'}`}>
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={(e) => {
                                                    if (e.target.checked) onDefaultLibraryIdsChange([...defaultLibraryIds, lib.id]);
                                                    else onDefaultLibraryIdsChange(defaultLibraryIds.filter(id => id !== lib.id));
                                                }}
                                                className="hidden"
                                            />
                                            {isSelected && <Check className="w-3.5 h-3.5" />}
                                            <span className="text-sm">{lib.title}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </>
            )}

            <div className="mb-4 mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-4 border-b border-border/40">
                <div>
                    <h4 className="font-bold text-text">Stream User Privacy</h4>
                    <p className="text-sm text-muted">Control how stream users are displayed to non-admins (e.g. on the public status page).</p>
                </div>
                <div className="w-56 ml-4 flex-shrink-0">
                    <CustomSelect
                        value={String(hideStreamUsers)}
                        onChange={onHideStreamUsersChange}
                        options={[
                            { label: 'Show Names', value: 'false' },
                            { label: 'Show as Anonymous', value: 'anonymous' },
                            { label: 'Hide Completely', value: 'hidden' }
                        ]}
                    />
                </div>
            </div>

            <div className="mb-4 mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-4 border-b border-border/40">
                <div>
                    <h4 className="font-bold text-text">Show Usernames in Analytics</h4>
                    <p className="text-sm text-muted">Allow non-admin users to see real usernames on the Analytics dashboard. If disabled, usernames are shown as Viewer 1, Viewer 2, etc.</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer ml-4 flex-shrink-0">
                    <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={showUsernamesInAnalytics}
                        onChange={e => onShowUsernamesInAnalyticsChange(e.target.checked)}
                    />
                    <div className="w-11 h-6 bg-background peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-text after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-plex"></div>
                </label>
            </div>

            <div className="mb-4" style={{ marginTop: '1rem' }}>
                <label htmlFor="requestUrl">Request URL</label>
                <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="requestUrl" type="text" value={requestUrl} onChange={e => onRequestUrlChange(e.target.value)} placeholder="https://yourdomain.com" />
                <div className="mt-2">
                    <SettingHint>The URL users are redirected to when they click the Request Content button.</SettingHint>
                </div>
            </div>
            <div className="mb-4" style={{ marginTop: '1rem' }}>
                <label htmlFor="contactUrl">Contact URL / Email</label>
                <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="contactUrl" type="text" value={contactUrl} onChange={e => onContactUrlChange(e.target.value)} placeholder="mailto:youremail@example.com OR https://wa.me/123456" />
                <div className="mt-2">
                    <SettingHint>Used for the "Request Extension" button in expiry emails. Defaults to sending an email to the SMTP User.</SettingHint>
                </div>
            </div>
        </div>
    );
};
