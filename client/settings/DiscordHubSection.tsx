import React, { useState } from 'react';

import { apiFetch } from '../shared/api';
import { SettingHint } from './SettingHint';

export type DiscordHubSectionProps = {
    discordEnabled: boolean;
    discordInviteUrl: string;
    discordChatChannelLabel: string;
    discordMediaChannelLabel: string;
    discordMemberChannelId: string;
    discordWebhookUrl: string;
    discordAdminWebhookUrl: string;
    discordNotifyRequestUpdates: boolean;
    discordNotifyIssueReplies: boolean;
    discordNotifyWatchlistAvailable: boolean;
    discordNotifyAnnouncements: boolean;
    discordNotifyBroadcasts: boolean;
    discordNotifyNewsletters: boolean;
    discordNotifyMediaReady: boolean;
    discordMediaAnnounceDebounceMinutes: number;
    integrityWebhookUsername: string;
    integrityWebhookPassword: string;
    onDiscordEnabledChange: (value: boolean) => void;
    onDiscordInviteUrlChange: (value: string) => void;
    onDiscordChatChannelLabelChange: (value: string) => void;
    onDiscordMediaChannelLabelChange: (value: string) => void;
    onDiscordMemberChannelIdChange: (value: string) => void;
    onDiscordWebhookUrlChange: (value: string) => void;
    onDiscordAdminWebhookUrlChange: (value: string) => void;
    onDiscordNotifyRequestUpdatesChange: (value: boolean) => void;
    onDiscordNotifyIssueRepliesChange: (value: boolean) => void;
    onDiscordNotifyWatchlistAvailableChange: (value: boolean) => void;
    onDiscordNotifyAnnouncementsChange: (value: boolean) => void;
    onDiscordNotifyBroadcastsChange: (value: boolean) => void;
    onDiscordNotifyNewslettersChange: (value: boolean) => void;
    onDiscordNotifyMediaReadyChange: (value: boolean) => void;
    onDiscordMediaAnnounceDebounceMinutesChange: (value: number) => void;
    onIntegrityWebhookUsernameChange: (value: string) => void;
    onIntegrityWebhookPasswordChange: (value: string) => void;
    addToast?: (message: string, type?: 'success' | 'error') => void;
};

export const DiscordHubSection: React.FC<DiscordHubSectionProps> = ({
    discordEnabled,
    discordInviteUrl,
    discordChatChannelLabel,
    discordMediaChannelLabel,
    discordMemberChannelId,
    discordWebhookUrl,
    discordAdminWebhookUrl,
    discordNotifyRequestUpdates,
    discordNotifyIssueReplies,
    discordNotifyWatchlistAvailable,
    discordNotifyAnnouncements,
    discordNotifyBroadcasts,
    discordNotifyNewsletters,
    discordNotifyMediaReady,
    discordMediaAnnounceDebounceMinutes,
    integrityWebhookUsername,
    integrityWebhookPassword,
    onDiscordEnabledChange,
    onDiscordInviteUrlChange,
    onDiscordChatChannelLabelChange,
    onDiscordMediaChannelLabelChange,
    onDiscordMemberChannelIdChange,
    onDiscordWebhookUrlChange,
    onDiscordAdminWebhookUrlChange,
    onDiscordNotifyRequestUpdatesChange,
    onDiscordNotifyIssueRepliesChange,
    onDiscordNotifyWatchlistAvailableChange,
    onDiscordNotifyAnnouncementsChange,
    onDiscordNotifyBroadcastsChange,
    onDiscordNotifyNewslettersChange,
    onDiscordNotifyMediaReadyChange,
    onDiscordMediaAnnounceDebounceMinutesChange,
    onIntegrityWebhookUsernameChange,
    onIntegrityWebhookPasswordChange,
    addToast,
}) => {
    const [isTestingMedia, setIsTestingMedia] = useState(false);
    const [isSyncingHooks, setIsSyncingHooks] = useState(false);

    const handleTestMediaAnnounce = async () => {
        setIsTestingMedia(true);
        try {
            const result = await apiFetch('/api/discord/test-media-announce', { method: 'POST' });
            addToast?.(result.message || 'Test media posts sent.', 'success');
        } catch (error) {
            addToast?.(error instanceof Error ? error.message : 'Test media posts failed.', 'error');
        } finally {
            setIsTestingMedia(false);
        }
    };

    const handleSyncArrHooks = async () => {
        setIsSyncingHooks(true);
        try {
            const result = await apiFetch('/api/upgrader/qc/arr-alignment', {
                method: 'POST',
                body: '{}',
            });
            addToast?.(result.message || 'Arr hooks synced.', 'success');
        } catch (error) {
            addToast?.(error instanceof Error ? error.message : 'Arr hook sync failed.', 'error');
        } finally {
            setIsSyncingHooks(false);
        }
    };

    return (
    <div className="mb-8">
        <h3 className="text-xl font-bold text-plex mb-4 border-b border-border pb-2 inline-flex items-center flex-wrap gap-0">
            Hub &amp; notifications
            <SettingHint>
                Requests and issues always email the member (approved, available, issue reply/resolved) — no opt-out.
                Linked Discord IDs get the same notices as bot DMs. The member webhook posts New media cards after Integrity, plus announcement mirrors.
                Admin webhook is QC cleanup + integrity failures only.
            </SettingHint>
        </h3>
        <label className="flex items-center gap-3 mb-4 cursor-pointer">
            <input type="checkbox" checked={discordEnabled} onChange={(event) => onDiscordEnabledChange(event.target.checked)} />
            <span className="text-sm text-text">Enable Discord integration</span>
        </label>
        <div className="mb-4">
            <label htmlFor="discordInviteUrl">Invite URL</label>
            <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="discordInviteUrl" type="url" value={discordInviteUrl} onChange={(event) => onDiscordInviteUrlChange(event.target.value)} placeholder="https://discord.gg/your-invite" disabled={!discordEnabled} />
            <div className="mt-2"><SettingHint>Shown to members as Join Discord. Use a discord.gg or discord.com invite that lands in the member channel.</SettingHint></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
                <label htmlFor="discordChatChannelLabel">Chat / bot channel label</label>
                <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="discordChatChannelLabel" type="text" value={discordChatChannelLabel} onChange={(event) => onDiscordChatChannelLabelChange(event.target.value)} placeholder="#announcements" disabled={!discordEnabled} />
            </div>
            <div>
                <label htmlFor="discordMediaChannelLabel">Media channel label</label>
                <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="discordMediaChannelLabel" type="text" value={discordMediaChannelLabel} onChange={(event) => onDiscordMediaChannelLabelChange(event.target.value)} placeholder="#announcements" disabled={!discordEnabled} />
            </div>
        </div>
        <div className="mb-4">
            <label htmlFor="discordMemberChannelId">Member channel ID</label>
            <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="discordMemberChannelId" type="text" value={discordMemberChannelId} onChange={(event) => onDiscordMemberChannelIdChange(event.target.value)} placeholder="Discord channel snowflake" disabled={!discordEnabled} />
            <div className="mt-2"><SettingHint>Bot DMs are only allowed for people who can view this channel.</SettingHint></div>
        </div>
        <div className="mb-4">
            <label htmlFor="discordWebhookUrl">Member notifications webhook URL</label>
            <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="discordWebhookUrl" type="password" value={discordWebhookUrl} onChange={(event) => onDiscordWebhookUrlChange(event.target.value)} placeholder="https://discord.com/api/webhooks/..." disabled={!discordEnabled} autoComplete="off" />
            <div className="mt-2"><SettingHint>Channel posts for media cards and server-wide announcements only. Request updates go out as bot DMs.</SettingHint></div>
        </div>
        <div className="mb-4">
            <label htmlFor="discordAdminWebhookUrl">Admin issues webhook URL</label>
            <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="discordAdminWebhookUrl" type="password" value={discordAdminWebhookUrl} onChange={(event) => onDiscordAdminWebhookUrlChange(event.target.value)} placeholder="https://discord.com/api/webhooks/..." disabled={!discordEnabled} autoComplete="off" />
            <div className="mt-2"><SettingHint>Only QC cleanup removals and integrity failures. Falls back to the member webhook if blank — set this so ops noise stays out of the member channel.</SettingHint></div>
        </div>
        <div className="flex flex-col gap-2 mb-4">
            <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={discordNotifyRequestUpdates} onChange={(event) => onDiscordNotifyRequestUpdatesChange(event.target.checked)} disabled={!discordEnabled} /><span className="text-sm">DM members about request approve / decline</span></label>
            <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={discordNotifyIssueReplies} onChange={(event) => onDiscordNotifyIssueRepliesChange(event.target.checked)} disabled={!discordEnabled} /><span className="text-sm">DM members about issue replies</span></label>
            <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={discordNotifyWatchlistAvailable} onChange={(event) => onDiscordNotifyWatchlistAvailableChange(event.target.checked)} disabled={!discordEnabled} /><span className="text-sm">DM members when a requested title is ready to watch</span></label>
            <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={discordNotifyAnnouncements} onChange={(event) => onDiscordNotifyAnnouncementsChange(event.target.checked)} disabled={!discordEnabled} /><span className="text-sm">Mirror portal announcements</span></label>
            <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={discordNotifyBroadcasts} onChange={(event) => onDiscordNotifyBroadcastsChange(event.target.checked)} disabled={!discordEnabled} /><span className="text-sm">Mirror broadcast emails</span></label>
            <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={discordNotifyNewsletters} onChange={(event) => onDiscordNotifyNewslettersChange(event.target.checked)} disabled={!discordEnabled} /><span className="text-sm">Mirror newsletters</span></label>
            <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={discordNotifyMediaReady} onChange={(event) => onDiscordNotifyMediaReadyChange(event.target.checked)} disabled={!discordEnabled} /><span className="text-sm">Post new media / upgrades after Integrity verifies</span></label>
        </div>
        <div className="mb-2 max-w-xs">
            <label htmlFor="discordMediaAnnounceDebounceMinutes">Media announce wait (minutes)</label>
            <input
                className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all"
                id="discordMediaAnnounceDebounceMinutes"
                type="number"
                min={1}
                max={120}
                value={discordMediaAnnounceDebounceMinutes}
                disabled={!discordEnabled || !discordNotifyMediaReady}
                onChange={(event) => onDiscordMediaAnnounceDebounceMinutesChange(Math.max(1, Math.min(120, Number(event.target.value) || 10)))}
            />
            <div className="mt-2"><SettingHint>Groups TV season episodes into one post after the last episode arrives.</SettingHint></div>
        </div>
        <div className="mb-4">
            <button
                type="button"
                className="px-4 py-2 bg-border text-text rounded-md font-medium hover:bg-opacity-80 transition-colors disabled:opacity-50"
                onClick={handleTestMediaAnnounce}
                disabled={!discordEnabled || isTestingMedia}
            >
                {isTestingMedia ? 'Posting…' : 'Post test movie + TV announce'}
            </button>
            <div className="mt-2">
                <SettingHint>
                    Uses a real library title when QC index has one, otherwise sample titles. Posts immediately to the saved member webhook and labels them as a test.
                </SettingHint>
            </div>
        </div>

        <h4 className="text-sm font-bold uppercase tracking-wide text-muted mt-6 mb-3">Arr import hooks</h4>
        <p className="text-xs text-muted mb-3">
            Same job as Quality Control → Integrity → Optimize Arrs: write the Connect webhook so imports reach Integrity.
            Prefer that button when you are already in QC.
        </p>
        <div className="mb-4">
            <button
                type="button"
                className="px-4 py-2 bg-border text-text rounded-md font-medium hover:bg-opacity-80 transition-colors disabled:opacity-50"
                onClick={handleSyncArrHooks}
                disabled={isSyncingHooks}
            >
                {isSyncingHooks ? 'Syncing…' : 'Sync hooks to Arr'}
            </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-2">
            <div>
                <label htmlFor="integrityWebhookUsername">Hook username</label>
                <input
                    className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all"
                    id="integrityWebhookUsername"
                    type="text"
                    value={integrityWebhookUsername}
                    autoComplete="off"
                    onChange={(event) => onIntegrityWebhookUsernameChange(event.target.value)}
                />
            </div>
            <div>
                <label htmlFor="integrityWebhookPassword">Hook password</label>
                <input
                    className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all"
                    id="integrityWebhookPassword"
                    type="password"
                    value={integrityWebhookPassword}
                    autoComplete="new-password"
                    placeholder="••••••••"
                    onChange={(event) => onIntegrityWebhookPasswordChange(event.target.value)}
                />
                <p className="text-xs text-muted mt-1">Leave blank to keep the current password. Generated automatically if missing. Sync pushes these into Arr so you do not paste them by hand.</p>
            </div>
        </div>
    </div>
    );
};
