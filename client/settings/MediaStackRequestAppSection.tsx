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
    seerrConfigured: boolean;
}> = ({ addToast, seerrConfigured }) => {
    const [arrBusy, setArrBusy] = useState(false);
    const [seerrBusy, setSeerrBusy] = useState(false);

    const runArrImport = async () => {
        setArrBusy(true);
        try {
            const data = await apiFetch('/api/portal-request/admin/import/arr-tags', {
                method: 'POST',
                body: JSON.stringify({}),
            });
            if (data?.error) throw new Error(data.error);
            const s = data?.summary || {};
            addToast(
                `Arr tag import: ${s.imported || 0} added (${s.skippedExisting || 0} already present, ${s.scannedItems || 0} scanned).`,
                'success',
            );
        } catch (error: any) {
            addToast(error?.message || 'Arr tag import failed', 'error');
        } finally {
            setArrBusy(false);
        }
    };

    const runSeerrImport = async () => {
        setSeerrBusy(true);
        try {
            const data = await apiFetch('/api/portal-request/admin/import/seerr-history', {
                method: 'POST',
                body: JSON.stringify({}),
            });
            if (data?.error) throw new Error(data.error);
            const requests = data?.summary?.requests || {};
            addToast(
                `Seerr history import: ${requests.imported || 0} requests added (${requests.skippedExisting || 0} already present).`,
                'success',
            );
        } catch (error: any) {
            addToast(error?.message || 'Seerr history import failed', 'error');
        } finally {
            setSeerrBusy(false);
        }
    };

    return (
        <div className="mb-6 rounded-lg border border-border/50 bg-surface/40 p-4">
            <h3 className="font-bold text-text">Ownership backfill</h3>
            <div className="mt-1 mb-4">
                <SettingHint>
                    Populate My Requests from existing Radarr/Sonarr requester tags, and optionally import open Seerr history. Safe to re-run — existing portal rows are skipped.
                </SettingHint>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
                <button
                    type="button"
                    disabled={arrBusy}
                    onClick={runArrImport}
                    className="px-4 py-2 rounded-lg bg-plex text-white font-medium disabled:opacity-50"
                >
                    {arrBusy ? 'Scanning Arr…' : 'Import from Arr tags'}
                </button>
                <button
                    type="button"
                    disabled={seerrBusy || !seerrConfigured}
                    onClick={runSeerrImport}
                    className="px-4 py-2 rounded-lg border border-border bg-background text-text font-medium disabled:opacity-50"
                    title={seerrConfigured ? undefined : 'Configure Seerr URL and API key first'}
                >
                    {seerrBusy ? 'Importing Seerr…' : 'Import Seerr history'}
                </button>
            </div>
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
        {requestEngine === 'portal' && (
            <PortalOwnershipImportPanel
                addToast={addToast}
                seerrConfigured={['seerr', 'jellyseerr', 'overseerr'].includes(requestAppType)
                    && !!String(requestAppUrl || '').trim()
                    && !!String(requestAppApiKey || initialSettings?.requestAppApiKey || '').trim()}
            />
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
