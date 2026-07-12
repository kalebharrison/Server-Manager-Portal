import React from 'react';

import { IntegrationTestButton } from '../shared/IntegrationTestButton';
import { CustomSelect } from '../shared/ui';
import { IntegrationHeading, hasIntegrationCredentials } from './integrationDisplay';
import { SettingHint } from './SettingHint';

type MediaStackSettingsTabProps = {
    initialSettings: any;
    mediaServerType: 'plex' | 'jellyfin';
    sonarrUrl: string;
    sonarrApiKey: string;
    radarrUrl: string;
    radarrApiKey: string;
    lidarrUrl: string;
    lidarrApiKey: string;
    tmdbApiKey: string;
    tvdbApiKey: string;
    tvdbPin: string;
    tautulliUrl: string;
    tautulliApiKey: string;
    jellystatUrl: string;
    jellystatApiKey: string;
    requestAppType: string;
    requestAppUrl: string;
    requestAppApiKey: string;
    onSonarrUrlChange: (value: string) => void;
    onSonarrApiKeyChange: (value: string) => void;
    onRadarrUrlChange: (value: string) => void;
    onRadarrApiKeyChange: (value: string) => void;
    onLidarrUrlChange: (value: string) => void;
    onLidarrApiKeyChange: (value: string) => void;
    onTmdbApiKeyChange: (value: string) => void;
    onTvdbApiKeyChange: (value: string) => void;
    onTvdbPinChange: (value: string) => void;
    onTautulliUrlChange: (value: string) => void;
    onTautulliApiKeyChange: (value: string) => void;
    onJellystatUrlChange: (value: string) => void;
    onJellystatApiKeyChange: (value: string) => void;
    onRequestAppTypeChange: (value: string) => void;
    onRequestAppUrlChange: (value: string) => void;
    onRequestAppApiKeyChange: (value: string) => void;
    addToast: (message: string, type?: 'success' | 'error') => void;
};

export const MediaStackSettingsTab: React.FC<MediaStackSettingsTabProps> = ({
    initialSettings,
    mediaServerType,
    sonarrUrl,
    sonarrApiKey,
    radarrUrl,
    radarrApiKey,
    lidarrUrl,
    lidarrApiKey,
    tmdbApiKey,
    tvdbApiKey,
    tvdbPin,
    tautulliUrl,
    tautulliApiKey,
    jellystatUrl,
    jellystatApiKey,
    requestAppType,
    requestAppUrl,
    requestAppApiKey,
    onSonarrUrlChange,
    onSonarrApiKeyChange,
    onRadarrUrlChange,
    onRadarrApiKeyChange,
    onLidarrUrlChange,
    onLidarrApiKeyChange,
    onTmdbApiKeyChange,
    onTvdbApiKeyChange,
    onTvdbPinChange,
    onTautulliUrlChange,
    onTautulliApiKeyChange,
    onJellystatUrlChange,
    onJellystatApiKeyChange,
    onRequestAppTypeChange,
    onRequestAppUrlChange,
    onRequestAppApiKeyChange,
    addToast,
}) => (
    <div className="mb-8 animate-fade-in">
        <IntegrationHeading app="sonarr" title="Sonarr Integration" subtitle="TV series automation" />
        <div className="mb-4">
            <label htmlFor="sonarrUrl">Sonarr URL</label>
            <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="sonarrUrl" type="text" value={sonarrUrl} onChange={(e) => onSonarrUrlChange(e.target.value)} placeholder="http://localhost:8989" />
            <div className="mt-2">
                <SettingHint>The URL to your Sonarr instance.</SettingHint>
            </div>
        </div>
        <div className="mb-4">
            <label htmlFor="sonarrApiKey">Sonarr API Key</label>
            <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="sonarrApiKey" type="password" value={sonarrApiKey} onChange={(e) => onSonarrApiKeyChange(e.target.value)} placeholder="API Key from Sonarr Settings -> General" />
        </div>
        <IntegrationTestButton
            type="sonarr"
            payload={{ sonarrUrl, sonarrApiKey }}
            disabled={!hasIntegrationCredentials(sonarrUrl, sonarrApiKey, initialSettings.sonarrUrl, initialSettings.sonarrApiKey)}
            className="mb-6"
            onMessage={(msg, ok) => addToast(msg, ok ? 'success' : 'error')}
        />

        <IntegrationHeading app="radarr" title="Radarr Integration" subtitle="Movie automation" className="mt-8" />
        <div className="mb-4">
            <label htmlFor="radarrUrl">Radarr URL</label>
            <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="radarrUrl" type="text" value={radarrUrl} onChange={(e) => onRadarrUrlChange(e.target.value)} placeholder="http://localhost:7878" />
            <div className="mt-2">
                <SettingHint>The URL to your Radarr instance.</SettingHint>
            </div>
        </div>
        <div className="mb-4">
            <label htmlFor="radarrApiKey">Radarr API Key</label>
            <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="radarrApiKey" type="password" value={radarrApiKey} onChange={(e) => onRadarrApiKeyChange(e.target.value)} placeholder="Enter Radarr API Key" />
        </div>
        <IntegrationTestButton
            type="radarr"
            payload={{ radarrUrl, radarrApiKey }}
            disabled={!hasIntegrationCredentials(radarrUrl, radarrApiKey, initialSettings.radarrUrl, initialSettings.radarrApiKey)}
            className="mb-6"
            onMessage={(msg, ok) => addToast(msg, ok ? 'success' : 'error')}
        />

        <IntegrationHeading app="lidarr" title="Lidarr Integration" subtitle="Music automation and download status" className="mt-8" />
        <div className="mb-4">
            <label htmlFor="lidarrUrl">Lidarr URL</label>
            <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="lidarrUrl" type="text" value={lidarrUrl} onChange={(e) => onLidarrUrlChange(e.target.value)} placeholder="http://localhost:8686" />
        </div>
        <div className="mb-4">
            <label htmlFor="lidarrApiKey">Lidarr API Key</label>
            <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="lidarrApiKey" type="password" value={lidarrApiKey} onChange={(e) => onLidarrApiKeyChange(e.target.value)} placeholder="API Key from Lidarr Settings -> General" />
        </div>
        <IntegrationTestButton
            type="lidarr"
            payload={{ lidarrUrl, lidarrApiKey }}
            disabled={!hasIntegrationCredentials(lidarrUrl, lidarrApiKey, initialSettings.lidarrUrl, initialSettings.lidarrApiKey)}
            className="mb-6"
            onMessage={(msg, ok) => addToast(msg, ok ? 'success' : 'error')}
        />

        <IntegrationHeading app="tmdb" title="TMDB Integration" subtitle="Request discovery and trending artwork" className="mt-8" />
        <div className="mb-4">
            <label htmlFor="tmdbApiKey">TMDB API Key</label>
            <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="tmdbApiKey" type="password" value={tmdbApiKey} onChange={(e) => onTmdbApiKeyChange(e.target.value)} placeholder="Enter TMDB API Key" />
            <div className="mt-2">
                <SettingHint>Provides request discovery metadata and optional trending portal artwork.</SettingHint>
            </div>
        </div>

        <IntegrationHeading app="tvdb" title="TVDB Integration" subtitle="Optional TV metadata fallback" className="mt-8" />
        <div className="mb-4">
            <label htmlFor="tvdbApiKey">TVDB API Key</label>
            <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="tvdbApiKey" type="password" value={tvdbApiKey} onChange={(e) => onTvdbApiKeyChange(e.target.value)} placeholder="TVDB v4 API key" />
            <div className="mt-2"><SettingHint>Fills missing TV summaries, air dates, status, network, and genres when a TVDB ID is available.</SettingHint></div>
        </div>
        <div className="mb-4">
            <label htmlFor="tvdbPin">TVDB Subscriber PIN (optional)</label>
            <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="tvdbPin" type="password" value={tvdbPin} onChange={(e) => onTvdbPinChange(e.target.value)} placeholder="Only required for subscriber-supported keys" />
        </div>
        <IntegrationTestButton
            type="tvdb"
            payload={{ tvdbApiKey, tvdbPin }}
            disabled={!String(tvdbApiKey || initialSettings.tvdbApiKey || '').trim()}
            className="mb-6"
            onMessage={(msg, ok) => addToast(msg, ok ? 'success' : 'error')}
        />

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
            title="Request App Integration"
            subtitle="Seerr or Jellyseerr for embedded requests; Ombi for external request workflows"
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
                    { label: 'Ombi', value: 'ombi' }
                ]}
            />
            <div className="mt-2">
                <SettingHint>
                    {requestAppType === 'ombi'
                        ? 'Ombi connection testing and status are supported. Embedded browsing and request actions currently require Seerr or Jellyseerr.'
                        : 'Powers the embedded Request tab, request status, issue reporting, and maintenance request history.'}
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
    </div>
);
