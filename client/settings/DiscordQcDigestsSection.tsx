import React from 'react';

import { SettingHint } from './SettingHint';
import { SettingsCollapseSection } from './SettingsCollapseSection';

type DiscordQcDigestsSectionProps = {
    discordEnabled: boolean;
    qcDiscordDigestEnabled: boolean;
    integrityDiscordDigestEnabled: boolean;
    onQcDiscordDigestEnabledChange: (value: boolean) => void;
    onIntegrityDiscordDigestEnabledChange: (value: boolean) => void;
};

export const DiscordQcDigestsSection: React.FC<DiscordQcDigestsSectionProps> = ({
    discordEnabled,
    qcDiscordDigestEnabled,
    integrityDiscordDigestEnabled,
    onQcDiscordDigestEnabledChange,
    onIntegrityDiscordDigestEnabledChange,
}) => (
    <SettingsCollapseSection
        title="Quality Control digests"
        subtitle="Download cleanup and library integrity summaries via Discord"
        defaultOpen={false}
    >
        <div className={`space-y-4 ${!discordEnabled ? 'opacity-50 pointer-events-none' : ''}`}>
            <label className="flex items-center justify-between gap-4">
                <span className="min-w-0">
                    <span className="font-semibold">Download cleanup digest</span>
                    <p className="text-xs text-muted mt-1">Posted when cleanup actually removes stalled/failed downloads.</p>
                </span>
                <input
                    type="checkbox"
                    className="h-4 w-4 accent-plex"
                    checked={qcDiscordDigestEnabled && discordEnabled}
                    onChange={(event) => onQcDiscordDigestEnabledChange(event.target.checked)}
                />
            </label>
            <label className="flex items-center justify-between gap-4">
                <span className="min-w-0">
                    <span className="font-semibold">Library integrity digest</span>
                    <p className="text-xs text-muted mt-1">Posted after integrity findings.</p>
                </span>
                <input
                    type="checkbox"
                    className="h-4 w-4 accent-plex"
                    checked={integrityDiscordDigestEnabled && discordEnabled}
                    onChange={(event) => onIntegrityDiscordDigestEnabledChange(event.target.checked)}
                />
            </label>
            <SettingHint>
                These two digests post to the admin webhook only (cleanup when a download is removed, integrity when a check fails).
                If admin webhook is blank they fall back onto the member channel — keep admin set.
                New/upgraded media cards still use the member webhook after Integrity passes.
            </SettingHint>
        </div>
    </SettingsCollapseSection>
);
