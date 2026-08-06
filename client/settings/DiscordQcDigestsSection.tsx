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
        subtitle="Cleanup and integrity summaries posted via the Discord webhook"
        defaultOpen={false}
    >
        <p className="text-sm text-muted mb-4">
            Requires Discord integration enabled and a webhook URL above. Tune QC itself under Settings → Quality Control.
        </p>
        <div className={`space-y-4 ${!discordEnabled ? 'opacity-50 pointer-events-none' : ''}`}>
            <label className="flex items-center justify-between gap-4">
                <span>
                    <span className="block font-semibold">Cleanup digest</span>
                    <span className="block text-xs text-muted mt-1">Post a digest after automated download cleanup runs.</span>
                </span>
                <input
                    type="checkbox"
                    className="h-4 w-4 accent-plex"
                    checked={qcDiscordDigestEnabled && discordEnabled}
                    onChange={(event) => onQcDiscordDigestEnabledChange(event.target.checked)}
                />
            </label>
            <label className="flex items-center justify-between gap-4">
                <span>
                    <span className="block font-semibold">Integrity digest</span>
                    <span className="block text-xs text-muted mt-1">Post a summary of integrity findings.</span>
                </span>
                <input
                    type="checkbox"
                    className="h-4 w-4 accent-plex"
                    checked={integrityDiscordDigestEnabled && discordEnabled}
                    onChange={(event) => onIntegrityDiscordDigestEnabledChange(event.target.checked)}
                />
            </label>
            <SettingHint>Uses the same Discord webhook as hub notifications.</SettingHint>
        </div>
    </SettingsCollapseSection>
);
