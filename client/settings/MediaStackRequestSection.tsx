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
                `Arr tags: ${s.itemsUpdated || 0} titles updated, ${s.tagsCreated || 0} added, ${s.tagsCorrected || 0} legacy corrected (Seerr untouched). Already ok: ${s.tagsAlreadyPresent || 0}. Notify JSON→Arr: ${s.notifyTagsMigrated || 0}. Pruned portal rows: ${s.prunedPortalRows || 0}.`,
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
            <h3 className="font-bold text-text inline-flex items-center flex-wrap gap-0">
                Normalize Arr requester tags
                <SettingHint>
                    Arr is the source of truth for ownership and Notify. This scan adds rename-safe
                    portal tags (<code className="text-xs">user id</code> /{' '}
                    <code className="text-xs">n-{'{user id}'}</code>) and corrects portal/media
                    legacy <code className="text-xs">{'{id}-{username}'}</code> labels onto that form.
                    Seerr tags (<code className="text-xs">1-2 digits</code> then{' '}
                    <code className="text-xs">-username</code>, e.g. <code className="text-xs">16-alice</code>)
                    are hard-excluded and never removed or rewritten.
                </SettingHint>
            </h3>
            <div className="mt-4">
            <button
                type="button"
                disabled={busy}
                onClick={runNormalize}
                className="px-4 py-2 rounded-lg bg-plex text-white font-medium disabled:opacity-50"
            >
                {busy ? 'Scanning Arr…' : 'Normalize Arr tags'}
            </button>
            </div>
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
        <div className="mb-4">
            <SettingHint>
                Portal JSON only holds pending/approval work. Available ownership and Notify subscribers live on Radarr/Sonarr tags.
            </SettingHint>
        </div>
        <PortalOwnershipImportPanel addToast={addToast} />
    </SettingsCollapseSection>
);
