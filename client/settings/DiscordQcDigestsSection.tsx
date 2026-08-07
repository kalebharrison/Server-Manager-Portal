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
        <div className="mb-4">
            <SettingHint>
                Requires Discord integration enabled and a webhook URL above. Tune QC itself under Settings → Quality Control.
            </SettingHint>
        </div>
        <div className={`space-y-4 ${!discordEnabled ? 'opacity-50 pointer-events-none' : ''}`}>
            <label className="flex items-center justify-between gap-4">
                <span className="min-w-0">
                    <span className="font-semibold">Cleanup digest</span>
                    <div className="mt-1">
                        <SettingHint>Post a digest after automated download cleanup runs.</SettingHint>
                    </div>
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
                    <span className="font-semibold">Integrity digest</span>
                    <div className="mt-1">
                        <SettingHint>Post a summary of integrity findings.</SettingHint>
                    </div>
                </span>
                <input
                    type="checkbox"
                    className="h-4 w-4 accent-plex"
                    checked={integrityDiscordDigestEnabled && discordEnabled}
                    onChange={(event) => onIntegrityDiscordDigestEnabledChange(event.target.checked)}
                />
            </label>
            <SettingHint>Digests use the admin webhook (falls back to member webhook).</SettingHint>
        </div>
    </SettingsCollapseSection>
);
