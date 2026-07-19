import React from 'react';

import { SettingHint } from './SettingHint';

type ContactSettingsTabProps = {
    contactWhatsApp: string;
    contactEmail: string;
    contactUrl: string;
    discordEnabled: boolean;
    discordInviteUrl: string;
    discordChatChannelLabel: string;
    discordMediaChannelLabel: string;
    discordGuildId: string;
    discordBotToken: string;
    discordBotEnabled: boolean;
    discordWebhookUrl: string;
    discordNotifyRequestUpdates: boolean;
    discordNotifyIssueReplies: boolean;
    discordNotifyWatchlistAvailable: boolean;
    announcement: string;
    isPushingAnnouncement: boolean;
    onContactWhatsAppChange: (value: string) => void;
    onContactEmailChange: (value: string) => void;
    onContactUrlChange: (value: string) => void;
    onDiscordEnabledChange: (value: boolean) => void;
    onDiscordInviteUrlChange: (value: string) => void;
    onDiscordChatChannelLabelChange: (value: string) => void;
    onDiscordMediaChannelLabelChange: (value: string) => void;
    onDiscordGuildIdChange: (value: string) => void;
    onDiscordBotTokenChange: (value: string) => void;
    onDiscordBotEnabledChange: (value: boolean) => void;
    onDiscordWebhookUrlChange: (value: string) => void;
    onDiscordNotifyRequestUpdatesChange: (value: boolean) => void;
    onDiscordNotifyIssueRepliesChange: (value: boolean) => void;
    onDiscordNotifyWatchlistAvailableChange: (value: boolean) => void;
    onAnnouncementChange: (value: string) => void;
    onPushAnnouncement: () => void;
};

export const ContactSettingsTab: React.FC<ContactSettingsTabProps> = ({
    contactWhatsApp,
    contactEmail,
    contactUrl,
    discordEnabled,
    discordInviteUrl,
    discordChatChannelLabel,
    discordMediaChannelLabel,
    discordGuildId,
    discordBotToken,
    discordBotEnabled,
    discordWebhookUrl,
    discordNotifyRequestUpdates,
    discordNotifyIssueReplies,
    discordNotifyWatchlistAvailable,
    announcement,
    isPushingAnnouncement,
    onContactWhatsAppChange,
    onContactEmailChange,
    onContactUrlChange,
    onDiscordEnabledChange,
    onDiscordInviteUrlChange,
    onDiscordChatChannelLabelChange,
    onDiscordMediaChannelLabelChange,
    onDiscordGuildIdChange,
    onDiscordBotTokenChange,
    onDiscordBotEnabledChange,
    onDiscordWebhookUrlChange,
    onDiscordNotifyRequestUpdatesChange,
    onDiscordNotifyIssueRepliesChange,
    onDiscordNotifyWatchlistAvailableChange,
    onAnnouncementChange,
    onPushAnnouncement,
}) => (
    <div className="mb-8">
        <h3 className="text-xl font-bold text-plex mb-4 border-b border-border pb-2">Contact Details</h3>
        <p className="text-sm text-muted mb-6">
            These details are displayed in the &quot;Need Help?&quot; box on the User Dashboard. Users can click these buttons to contact you directly if they need to extend their access, report an issue, or request support.
        </p>
        <div className="mb-4">
            <label htmlFor="contactWhatsApp">WhatsApp Number (Optional)</label>
            <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="contactWhatsApp" type="text" value={contactWhatsApp} onChange={(e) => onContactWhatsAppChange(e.target.value)} placeholder="e.g. 447303647923" />
            <div className="mt-2">
                <SettingHint>Enter your phone number including country code, without any '+', spaces, or dashes. If left blank, the WhatsApp button will be hidden.</SettingHint>
            </div>
        </div>
        <div className="mb-4">
            <label htmlFor="contactEmail">Email Address (Optional)</label>
            <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="contactEmail" type="email" value={contactEmail} onChange={(e) => onContactEmailChange(e.target.value)} placeholder="e.g. admin@example.com" />
            <div className="mt-2">
                <SettingHint>The email address users should contact. If left blank, the Email button will be hidden.</SettingHint>
            </div>
        </div>
        <div className="mb-4">
            <label htmlFor="contactUrl">Access Extension Link (Optional)</label>
            <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="contactUrl" type="text" value={contactUrl} onChange={(event) => onContactUrlChange(event.target.value)} placeholder="mailto:admin@example.com or https://example.com/support" />
            <div className="mt-2"><SettingHint>Destination used by the Request Extension button in expiry emails.</SettingHint></div>
        </div>

        <h3 className="text-xl font-bold text-plex mb-4 border-b border-border pb-2 mt-8">Discord</h3>
        <p className="text-sm text-muted mb-6">
            Show a Join Discord button to members, optionally post portal events to a channel webhook, and run a request slash-command bot (Requestrr replacement). Seerr Discord notifications can stay enabled too.
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
            <div className="mt-2"><SettingHint>Portal posts request updates / issue replies / newly available titles here. Leave blank if Seerr or Notifiarr already own Discord media posts.</SettingHint></div>
        </div>
        <div className="flex flex-col gap-2 mb-6">
            <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={discordNotifyRequestUpdates} onChange={(event) => onDiscordNotifyRequestUpdatesChange(event.target.checked)} disabled={!discordEnabled} /><span className="text-sm">Post request approve / decline</span></label>
            <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={discordNotifyIssueReplies} onChange={(event) => onDiscordNotifyIssueRepliesChange(event.target.checked)} disabled={!discordEnabled} /><span className="text-sm">Post issue replies</span></label>
            <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={discordNotifyWatchlistAvailable} onChange={(event) => onDiscordNotifyWatchlistAvailableChange(event.target.checked)} disabled={!discordEnabled} /><span className="text-sm">Post newly available requests (when portal emails fire)</span></label>
        </div>
        <label className="flex items-center gap-3 mb-4 cursor-pointer">
            <input type="checkbox" checked={discordBotEnabled} onChange={(event) => onDiscordBotEnabledChange(event.target.checked)} disabled={!discordEnabled} />
            <span className="text-sm text-text">Enable Discord request bot (`/request`)</span>
        </label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
                <label htmlFor="discordGuildId">Guild (server) ID</label>
                <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="discordGuildId" type="text" value={discordGuildId} onChange={(event) => onDiscordGuildIdChange(event.target.value)} placeholder="Discord server snowflake" disabled={!discordEnabled || !discordBotEnabled} />
            </div>
            <div>
                <label htmlFor="discordBotToken">Bot token</label>
                <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="discordBotToken" type="password" value={discordBotToken} onChange={(event) => onDiscordBotTokenChange(event.target.value)} placeholder="Bot token from Discord Developer Portal" disabled={!discordEnabled || !discordBotEnabled} autoComplete="off" />
            </div>
        </div>
        <div className="mb-8">
            <SettingHint>
                Members must paste their Discord user ID under Preferences so `/request` can attribute Seerr requests. Invite the bot to your guild with `applications.commands` scope.
            </SettingHint>
        </div>

        <h3 className="text-xl font-bold text-plex mb-4 border-b border-border pb-2 mt-8">Portal Announcement</h3>
        <div className="mb-4">
            <label htmlFor="portalAnnouncement">Announcement Banner</label>
            <textarea id="portalAnnouncement" className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex transition-all" value={announcement} onChange={(event) => onAnnouncementChange(event.target.value)} placeholder="Server maintenance scheduled for Friday..." rows={3} />
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 mt-2">
                <SettingHint>Saving settings publishes the banner. Use the button to also email all eligible members.</SettingHint>
                <button type="button" onClick={onPushAnnouncement} disabled={isPushingAnnouncement || !announcement.trim()} className="bg-plex hover:bg-plex-hover disabled:opacity-50 text-background font-bold py-2 px-4 rounded-lg transition-colors text-sm whitespace-nowrap">
                    {isPushingAnnouncement ? 'Sending...' : 'Publish & Email Members'}
                </button>
            </div>
        </div>
    </div>
);
