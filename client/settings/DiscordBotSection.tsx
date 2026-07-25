import React from 'react';

export type DiscordBotSectionProps = {
    discordEnabled: boolean;
    discordBotEnabled: boolean;
    discordGuildId: string;
    discordBotToken: string;
    onDiscordBotEnabledChange: (value: boolean) => void;
    onDiscordGuildIdChange: (value: string) => void;
    onDiscordBotTokenChange: (value: string) => void;
};

export const DiscordBotSection: React.FC<DiscordBotSectionProps> = ({
    discordEnabled,
    discordBotEnabled,
    discordGuildId,
    discordBotToken,
    onDiscordBotEnabledChange,
    onDiscordGuildIdChange,
    onDiscordBotTokenChange,
}) => (
    <div className="mb-8">
        <h3 className="text-xl font-bold text-plex mb-4 border-b border-border pb-2">Member bot</h3>
        <p className="text-sm text-muted mb-6">
            Slash commands for requests, issues, stats, queue, discover, and `/ask`. Members link their Discord user ID under Preferences.
        </p>
        <label className="flex items-center gap-3 mb-4 cursor-pointer">
            <input type="checkbox" checked={discordBotEnabled} onChange={(event) => onDiscordBotEnabledChange(event.target.checked)} disabled={!discordEnabled} />
            <span className="text-sm text-text">Enable Discord member bot</span>
        </label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
                <label htmlFor="discordGuildId">Guild (server) ID</label>
                <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="discordGuildId" type="text" value={discordGuildId} onChange={(event) => onDiscordGuildIdChange(event.target.value)} placeholder="Discord server snowflake" disabled={!discordEnabled || !discordBotEnabled} />
            </div>
            <div>
                <label htmlFor="discordBotToken">Bot token</label>
                <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="discordBotToken" type="password" value={discordBotToken} onChange={(event) => onDiscordBotTokenChange(event.target.value)} placeholder="Bot token from Discord Developer Portal" disabled={!discordEnabled || !discordBotEnabled} autoComplete="off" />
            </div>
        </div>
    </div>
);
