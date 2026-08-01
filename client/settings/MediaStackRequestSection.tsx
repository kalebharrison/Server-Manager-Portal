import React, { useState } from 'react';

import { apiFetch } from '../shared/api';
import { IntegrationTestButton } from '../shared/IntegrationTestButton';
import { SettingHint } from './SettingHint';
import { IntegrationHeading, hasIntegrationCredentials } from './integrationDisplay';

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
                    Older request tooling wrote requester tags like <code className="text-xs">16-i2ach</code>. This scan maps those (and bare usernames) to portal members and adds missing portal tags (<code className="text-xs">{'{id}-{username}'}</code>) on the Radarr/Sonarr items. It does not copy history into the portal JSON store.
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

export const MediaStackRequestSection: React.FC<{
    initialSettings: any;
    ombiUrl: string;
    ombiApiKey: string;
    onOmbiUrlChange: (value: string) => void;
    onOmbiApiKeyChange: (value: string) => void;
    addToast: (message: string, type?: 'success' | 'error') => void;
}> = ({
    initialSettings,
    ombiUrl,
    ombiApiKey,
    onOmbiUrlChange,
    onOmbiApiKeyChange,
    addToast,
}) => (
    <>
        <IntegrationHeading
            app="tmdb"
            title="Discover & requests"
            subtitle="Portal-native Discover and requests, powered by TMDB and your Radarr/Sonarr instances."
            className="mt-8"
        />
        <PortalOwnershipImportPanel addToast={addToast} />

        <IntegrationHeading app="ombi" title="Ombi Music Requests" subtitle="Optional secondary requester for Lidarr workflows" className="mt-8" />
        <div className="mb-4">
            <label htmlFor="ombiUrl">Ombi URL</label>
            <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="ombiUrl" type="text" value={ombiUrl} onChange={(event) => onOmbiUrlChange(event.target.value)} placeholder="http://localhost:3579" />
            <div className="mt-2"><SettingHint>Handles music requests only. It does not replace the portal movie and TV requester.</SettingHint></div>
        </div>
        <div className="mb-4">
            <label htmlFor="ombiApiKey">Ombi API Key</label>
            <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="ombiApiKey" type="password" value={ombiApiKey} onChange={(event) => onOmbiApiKeyChange(event.target.value)} placeholder="API key from Ombi settings" />
        </div>
        <IntegrationTestButton
            type="ombi"
            payload={{ ombiUrl, ombiApiKey }}
            disabled={!hasIntegrationCredentials(ombiUrl, ombiApiKey, initialSettings.ombiUrl, initialSettings.ombiApiKey)}
            onMessage={(message, ok) => addToast(message, ok ? 'success' : 'error')}
        />
    </>
);
