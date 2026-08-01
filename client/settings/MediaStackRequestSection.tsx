import React, { useState } from 'react';

import { apiFetch } from '../shared/api';
import { SettingHint } from './SettingHint';
import { SettingsCollapseSection } from './SettingsCollapseSection';

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
        <div className="rounded-lg border border-border/50 bg-surface/40 p-4">
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
    addToast: (message: string, type?: 'success' | 'error') => void;
}> = ({ addToast }) => (
    <SettingsCollapseSection
        defaultOpen={false}
        title="Discover & requests"
        subtitle="Portal-native TMDB Discover + Arr requester tag tools"
    >
        <p className="text-sm text-muted mb-4">
            Members use Discover powered by TMDB and your Radarr/Sonarr instances. No separate request app is required.
        </p>
        <PortalOwnershipImportPanel addToast={addToast} />
    </SettingsCollapseSection>
);
