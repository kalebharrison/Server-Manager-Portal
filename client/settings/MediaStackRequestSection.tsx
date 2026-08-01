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
                `Arr tags: ${s.itemsUpdated || 0} titles updated, ${s.tagsCreated || 0} added, ${s.tagsRemoved || 0} legacy removed (${s.tagsAlreadyPresent || 0} already ok). Notify JSON→Arr: ${s.notifyTagsMigrated || 0}. Pruned portal rows: ${s.prunedPortalRows || 0}.`,
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
                    Arr is the source of truth for ownership and Notify. This scan migrates legacy
                    tags (e.g. <code className="text-xs">16-i2ach</code>,{' '}
                    <code className="text-xs">{'{id}-{username}'}</code>) to one rename-safe portal
                    tag per user (<code className="text-xs">user id</code> /{' '}
                    <code className="text-xs">n-{'{user id}'}</code>), removes the superseded labels
                    from each title, and migrates portal Notify lists onto Arr. Unrelated Arr tags
                    are left alone.
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
        title="Discover & requests"
        subtitle="TMDB Discover; Arr tags own requester + notify"
    >
        <p className="text-sm text-muted mb-4">
            Portal JSON only holds pending/approval work. Available ownership and Notify subscribers live on Radarr/Sonarr tags.
        </p>
        <PortalOwnershipImportPanel addToast={addToast} />
    </SettingsCollapseSection>
);
