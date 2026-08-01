import React, { useState } from 'react';

import { apiFetch } from '../shared/api';
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

const PortalOwnershipImportPanel: React.FC<{
    addToast: (message: string, type?: 'success' | 'error') => void;
}> = ({ addToast }) => {
    const [busy, setBusy] = useState(false);

    const runNormalize = async () => {
        setBusy(true);
        try {
            const data = await apiFetch('/api/portal-request/admin/import/arr-tags', {
                method: 'POST',
                body: JSON.stringify({}),
            });
            if (data?.error) throw new Error(data.error);
            const s = data?.summary || {};
            addToast(
                `Arr tags: ${s.itemsUpdated || 0} titles updated, ${s.tagsCreated || 0} portal tags added (${s.tagsAlreadyPresent || 0} already ok, ${s.scannedItems || 0} scanned).`,
                'success',
            );
        } catch (error: any) {
            addToast(error?.message || 'Arr tag normalize failed', 'error');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="mb-6 rounded-lg border border-border/50 bg-surface/40 p-4">
            <h3 className="font-bold text-text">Normalize Arr requester tags</h3>
            <div className="mt-1 mb-4">
                <SettingHint>
                    Production Seerr wrote tags like <code className="text-xs">16-i2ach</code>. This scan maps those (and bare usernames) to portal members and adds missing portal tags (<code className="text-xs">{'{id}-{username}'}</code>) on the Radarr/Sonarr items. It does not copy history into the portal JSON store.
                </SettingHint>
            </div>
            <button
                type="button"
                disabled={busy}
                onClick={runNormalize}
                className="px-4 py-2 rounded-lg bg-plex text-white font-medium disabled:opacity-50"
            >
                {busy ? 'Scanning Arr…' : 'Normalize Arr tags'}
            </button>
        </div>
    );
};

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
    ombiUrl,
    ombiApiKey,
    onRequestAppTypeChange,
    onRequestAppUrlChange,
    onRequestAppApiKeyChange,
    onRequestAppMembershipSyncChange,
    onOmbiUrlChange,
    onOmbiApiKeyChange,
    addToast,
}) => (
    <>
        <IntegrationHeading
            app={requestAppType === 'none' ? 'seerr' : requestAppType}
            title="Discover & requests"
            subtitle="Portal-native Discover (TMDB) and requests. Seerr below is only for Discord/Ask glue."
            className="mt-8"
        />
        <div className="mb-4 rounded-lg border border-border/40 bg-surface/30 p-3 text-xs text-muted">
            Request engine and discovery are locked to <strong className="text-text">Portal + TMDB</strong>. There is no Seerr UI path on this release.
        </div>
        <PortalOwnershipImportPanel addToast={addToast} />
        <div className="mb-4">
            <label htmlFor="requestAppType">Legacy Seerr (Discord / Ask)</label>
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
                        ? 'This legacy configuration remains usable for connection testing and status.'
                        : 'Optional. Kept so Discord alerts and Ask can still talk to Seerr until those flows move fully onto the portal.'}
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
