import React from 'react';

import { DiscordBotSection } from './DiscordBotSection';
import { DiscordHubSection } from './DiscordHubSection';
import { DiscordLlmSection } from './DiscordLlmSection';
import { DiscordQcDigestsSection } from './DiscordQcDigestsSection';
import { DiscordSearchSection } from './DiscordSearchSection';

export type DiscordSettingsTabProps = {
    discordEnabled: boolean;
    discordInviteUrl: string;
    discordChatChannelLabel: string;
    discordMediaChannelLabel: string;
    discordGuildId: string;
    discordMemberChannelId: string;
    discordBotToken: string;
    discordBotEnabled: boolean;
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
    discordLlmEnabled: boolean;
    discordLlmUrl: string;
    discordLlmApiKey: string;
    discordLlmModel: string;
    discordAgentEnabled: boolean;
    discordSearxngUrl: string;
    discordBraveSearchApiKey: string;
    discordTavilyApiKey: string;
    discordMentionNl: boolean;
    qcDiscordDigestEnabled: boolean;
    integrityDiscordDigestEnabled: boolean;
    onDiscordEnabledChange: (value: boolean) => void;
    onDiscordInviteUrlChange: (value: string) => void;
    onDiscordChatChannelLabelChange: (value: string) => void;
    onDiscordMediaChannelLabelChange: (value: string) => void;
    onDiscordGuildIdChange: (value: string) => void;
    onDiscordMemberChannelIdChange: (value: string) => void;
    onDiscordBotTokenChange: (value: string) => void;
    onDiscordBotEnabledChange: (value: boolean) => void;
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
    onDiscordLlmEnabledChange: (value: boolean) => void;
    onDiscordLlmUrlChange: (value: string) => void;
    onDiscordLlmApiKeyChange: (value: string) => void;
    onDiscordLlmModelChange: (value: string) => void;
    onDiscordAgentEnabledChange: (value: boolean) => void;
    onDiscordSearxngUrlChange: (value: string) => void;
    onDiscordBraveSearchApiKeyChange: (value: string) => void;
    onDiscordTavilyApiKeyChange: (value: string) => void;
    onDiscordMentionNlChange: (value: boolean) => void;
    onQcDiscordDigestEnabledChange: (value: boolean) => void;
    onIntegrityDiscordDigestEnabledChange: (value: boolean) => void;
};

export const DiscordSettingsTab: React.FC<DiscordSettingsTabProps> = (props) => (
    <div className="mb-8">
        <DiscordHubSection
            discordEnabled={props.discordEnabled}
            discordInviteUrl={props.discordInviteUrl}
            discordChatChannelLabel={props.discordChatChannelLabel}
            discordMediaChannelLabel={props.discordMediaChannelLabel}
            discordMemberChannelId={props.discordMemberChannelId}
            discordWebhookUrl={props.discordWebhookUrl}
            discordAdminWebhookUrl={props.discordAdminWebhookUrl}
            discordNotifyRequestUpdates={props.discordNotifyRequestUpdates}
            discordNotifyIssueReplies={props.discordNotifyIssueReplies}
            discordNotifyWatchlistAvailable={props.discordNotifyWatchlistAvailable}
            discordNotifyAnnouncements={props.discordNotifyAnnouncements}
            discordNotifyBroadcasts={props.discordNotifyBroadcasts}
            discordNotifyNewsletters={props.discordNotifyNewsletters}
            discordNotifyMediaReady={props.discordNotifyMediaReady}
            discordMediaAnnounceDebounceMinutes={props.discordMediaAnnounceDebounceMinutes}
            onDiscordEnabledChange={props.onDiscordEnabledChange}
            onDiscordInviteUrlChange={props.onDiscordInviteUrlChange}
            onDiscordChatChannelLabelChange={props.onDiscordChatChannelLabelChange}
            onDiscordMediaChannelLabelChange={props.onDiscordMediaChannelLabelChange}
            onDiscordMemberChannelIdChange={props.onDiscordMemberChannelIdChange}
            onDiscordWebhookUrlChange={props.onDiscordWebhookUrlChange}
            onDiscordAdminWebhookUrlChange={props.onDiscordAdminWebhookUrlChange}
            onDiscordNotifyRequestUpdatesChange={props.onDiscordNotifyRequestUpdatesChange}
            onDiscordNotifyIssueRepliesChange={props.onDiscordNotifyIssueRepliesChange}
            onDiscordNotifyWatchlistAvailableChange={props.onDiscordNotifyWatchlistAvailableChange}
            onDiscordNotifyAnnouncementsChange={props.onDiscordNotifyAnnouncementsChange}
            onDiscordNotifyBroadcastsChange={props.onDiscordNotifyBroadcastsChange}
            onDiscordNotifyNewslettersChange={props.onDiscordNotifyNewslettersChange}
            onDiscordNotifyMediaReadyChange={props.onDiscordNotifyMediaReadyChange}
            onDiscordMediaAnnounceDebounceMinutesChange={props.onDiscordMediaAnnounceDebounceMinutesChange}
        />
        <DiscordBotSection
            discordEnabled={props.discordEnabled}
            discordBotEnabled={props.discordBotEnabled}
            discordGuildId={props.discordGuildId}
            discordBotToken={props.discordBotToken}
            onDiscordBotEnabledChange={props.onDiscordBotEnabledChange}
            onDiscordGuildIdChange={props.onDiscordGuildIdChange}
            onDiscordBotTokenChange={props.onDiscordBotTokenChange}
        />
        <DiscordLlmSection
            discordEnabled={props.discordEnabled}
            discordBotEnabled={props.discordBotEnabled}
            discordLlmEnabled={props.discordLlmEnabled}
            discordLlmUrl={props.discordLlmUrl}
            discordLlmApiKey={props.discordLlmApiKey}
            discordLlmModel={props.discordLlmModel}
            discordAgentEnabled={props.discordAgentEnabled}
            discordMentionNl={props.discordMentionNl}
            onDiscordLlmEnabledChange={props.onDiscordLlmEnabledChange}
            onDiscordLlmUrlChange={props.onDiscordLlmUrlChange}
            onDiscordLlmApiKeyChange={props.onDiscordLlmApiKeyChange}
            onDiscordLlmModelChange={props.onDiscordLlmModelChange}
            onDiscordAgentEnabledChange={props.onDiscordAgentEnabledChange}
            onDiscordMentionNlChange={props.onDiscordMentionNlChange}
        />
        <DiscordSearchSection
            discordEnabled={props.discordEnabled}
            discordBotEnabled={props.discordBotEnabled}
            discordLlmEnabled={props.discordLlmEnabled}
            discordAgentEnabled={props.discordAgentEnabled}
            discordSearxngUrl={props.discordSearxngUrl}
            discordBraveSearchApiKey={props.discordBraveSearchApiKey}
            discordTavilyApiKey={props.discordTavilyApiKey}
            onDiscordSearxngUrlChange={props.onDiscordSearxngUrlChange}
            onDiscordBraveSearchApiKeyChange={props.onDiscordBraveSearchApiKeyChange}
            onDiscordTavilyApiKeyChange={props.onDiscordTavilyApiKeyChange}
        />
        <div className="mt-4">
            <DiscordQcDigestsSection
                discordEnabled={props.discordEnabled}
                qcDiscordDigestEnabled={props.qcDiscordDigestEnabled}
                integrityDiscordDigestEnabled={props.integrityDiscordDigestEnabled}
                onQcDiscordDigestEnabledChange={props.onQcDiscordDigestEnabledChange}
                onIntegrityDiscordDigestEnabledChange={props.onIntegrityDiscordDigestEnabledChange}
            />
        </div>
    </div>
);
