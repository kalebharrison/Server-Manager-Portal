import React from 'react';

import { IntegrationTestButton } from '../shared/IntegrationTestButton';
import { CustomSelect } from '../shared/ui';
import { SettingHint } from './SettingHint';
import { IntegrationHeading, hasIntegrationCredentials } from './integrationDisplay';

const MembershipSyncSwitch: React.FC<{
    checked: boolean;
    onChange: (value: boolean) => void;
}> = ({ checked, onChange }) => (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-4 mt-4 border-t border-border/40">
        <div>
            <h3 className="font-bold text-text">Sync membership with Seerr</h3>
            <div className="mt-1">
                <SettingHint>
                    Import members into Seerr when access becomes active, and remove them on revoke. Discord media alerts stay tied to real members. Members never use the Seerr UI.
                </SettingHint>
            </div>
        </div>
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label="Sync membership with Seerr"
            onClick={() => onChange(!checked)}
            className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? 'bg-plex' : 'bg-border'}`}
        >
            <span className={`h-4 w-4 mt-1 rounded-full bg-white transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
    </div>
);

export const MediaStackRequestAppSection: React.FC<{
    initialSettings: any;
    requestAppType: string;
    requestAppUrl: string;
    requestAppApiKey: string;
    requestAppMembershipSync: boolean;
    requestEngine: 'portal' | 'seerr';
    discoverySource: 'tmdb' | 'seerr';
    ombiUrl: string;
    ombiApiKey: string;
    onRequestAppTypeChange: (value: string) => void;
    onRequestAppUrlChange: (value: string) => void;
    onRequestAppApiKeyChange: (value: string) => void;
    onRequestAppMembershipSyncChange: (value: boolean) => void;
    onRequestEngineChange: (value: 'portal' | 'seerr') => void;
    onDiscoverySourceChange: (value: 'tmdb' | 'seerr') => void;
    onOmbiUrlChange: (value: string) => void;
    onOmbiApiKeyChange: (value: string) => void;
    addToast: (message: string, type?: 'success' | 'error') => void;
}> = ({
    initialSettings,
    requestAppType,
    requestAppUrl,
    requestAppApiKey,
    requestAppMembershipSync,
    requestEngine,
    discoverySource,
    ombiUrl,
    ombiApiKey,
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
    <>
        <IntegrationHeading
            app={requestAppType === 'none' ? 'seerr' : requestAppType}
            title="Primary Movie & TV Requester"
            subtitle="Seerr or Jellyseerr powers the embedded request experience"
            className="mt-8"
        />
        <div className="grid gap-4 md:grid-cols-2 mb-4">
            <div>
                <label htmlFor="requestEngine">Request Engine</label>
                <CustomSelect
                    id="requestEngine"
                    value={requestEngine}
                    onChange={(value) => onRequestEngineChange(value === 'portal' ? 'portal' : 'seerr')}
                    options={[
                        { label: 'Seerr (default)', value: 'seerr' },
                        { label: 'Portal-native (opt-in)', value: 'portal' },
                    ]}
                />
            </div>
            <div>
                <label htmlFor="discoverySource">Discovery Source</label>
                <CustomSelect
                    id="discoverySource"
                    value={discoverySource}
                    onChange={(value) => onDiscoverySourceChange(value === 'tmdb' ? 'tmdb' : 'seerr')}
                    options={[
                        { label: 'Seerr (default)', value: 'seerr' },
                        { label: 'TMDB (Portal discovery)', value: 'tmdb' },
                    ]}
                />
            </div>
        </div>
        {requestEngine === 'portal' && (
            <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
                Portal-native Discover uses TMDB. With auto-approve enabled, requests push straight to Radarr/Sonarr; otherwise they wait in the admin queue. Discord and Ask still use Seerr until those flows migrate.
            </div>
        )}
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
        {['seerr', 'jellyseerr', 'overseerr'].includes(requestAppType) && (
            <MembershipSyncSwitch checked={requestAppMembershipSync} onChange={onRequestAppMembershipSyncChange} />
        )}

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
    </>
);
