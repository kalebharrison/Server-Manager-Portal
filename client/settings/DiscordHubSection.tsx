import React from 'react';

import { SettingHint } from './SettingHint';

export type DiscordHubSectionProps = {
    discordEnabled: boolean;
    discordInviteUrl: string;
    discordChatChannelLabel: string;
    discordMediaChannelLabel: string;
    discordWebhookUrl: string;
    discordNotifyRequestUpdates: boolean;
    discordNotifyIssueReplies: boolean;
    discordNotifyWatchlistAvailable: boolean;
    onDiscordEnabledChange: (value: boolean) => void;
    onDiscordInviteUrlChange: (value: string) => void;
    onDiscordChatChannelLabelChange: (value: string) => void;
    onDiscordMediaChannelLabelChange: (value: string) => void;
    onDiscordWebhookUrlChange: (value: string) => void;
    onDiscordNotifyRequestUpdatesChange: (value: boolean) => void;
    onDiscordNotifyIssueRepliesChange: (value: boolean) => void;
    onDiscordNotifyWatchlistAvailableChange: (value: boolean) => void;
};

export const DiscordHubSection: React.FC<DiscordHubSectionProps> = ({
    discordEnabled,
    discordInviteUrl,
    discordChatChannelLabel,
    discordMediaChannelLabel,
    discordWebhookUrl,
    discordNotifyRequestUpdates,
    discordNotifyIssueReplies,
    discordNotifyWatchlistAvailable,
    onDiscordEnabledChange,
    onDiscordInviteUrlChange,
    onDiscordChatChannelLabelChange,
    onDiscordMediaChannelLabelChange,
    onDiscordWebhookUrlChange,
    onDiscordNotifyRequestUpdatesChange,
    onDiscordNotifyIssueRepliesChange,
    onDiscordNotifyWatchlistAvailableChange,
}) => (
    <div className="mb-8">
        <h3 className="text-xl font-bold text-plex mb-4 border-b border-border pb-2">Hub &amp; notifications</h3>
        <p className="text-sm text-muted mb-6">
            Show a Join Discord button to members and optionally post portal events to a channel webhook. Leave the webhook blank if Notifiarr already owns media posts.
        </p>
        <label className="flex items-center gap-3 mb-4 cursor-pointer">
            <input type="checkbox" checked={discordEnabled} onChange={(event) => onDiscordEnabledChange(event.target.checked)} />
            <span className="text-sm text-text">Enable Discord integration</span>
        </label>
        <div className="mb-4">
            <label htmlFor="discordInviteUrl">Invite URL</label>
            <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="discordInviteUrl" type="url" value={discordInviteUrl} onChange={(event) => onDiscordInviteUrlChange(event.target.value)} placeholder="https://discord.gg/your-invite" disabled={!discordEnabled} />
            <div className="mt-2"><SettingHint>Shown to members as Join Discord. Use a discord.gg or discord.com invite.</SettingHint></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
                <label htmlFor="discordChatChannelLabel">Chat / bot channel label</label>
                <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="discordChatChannelLabel" type="text" value={discordChatChannelLabel} onChange={(event) => onDiscordChatChannelLabelChange(event.target.value)} placeholder="#requests" disabled={!discordEnabled} />
            </div>
            <div>
                <label htmlFor="discordMediaChannelLabel">Media notification channel label</label>
                <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="discordMediaChannelLabel" type="text" value={discordMediaChannelLabel} onChange={(event) => onDiscordMediaChannelLabelChange(event.target.value)} placeholder="#media-ready" disabled={!discordEnabled} />
            </div>
        </div>
        <div className="mb-4">
            <label htmlFor="discordWebhookUrl">Channel webhook URL (optional)</label>
            <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="discordWebhookUrl" type="password" value={discordWebhookUrl} onChange={(event) => onDiscordWebhookUrlChange(event.target.value)} placeholder="https://discord.com/api/webhooks/..." disabled={!discordEnabled} autoComplete="off" />
        </div>
        <div className="flex flex-col gap-2">
            <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={discordNotifyRequestUpdates} onChange={(event) => onDiscordNotifyRequestUpdatesChange(event.target.checked)} disabled={!discordEnabled} /><span className="text-sm">Post request approve / decline</span></label>
            <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={discordNotifyIssueReplies} onChange={(event) => onDiscordNotifyIssueRepliesChange(event.target.checked)} disabled={!discordEnabled} /><span className="text-sm">Post issue replies</span></label>
            <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={discordNotifyWatchlistAvailable} onChange={(event) => onDiscordNotifyWatchlistAvailableChange(event.target.checked)} disabled={!discordEnabled} /><span className="text-sm">Post newly available requests (when portal emails fire)</span></label>
        </div>
    </div>
);
