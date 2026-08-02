import { discordEmbed, postDiscordWebhook } from './discord-webhook.js';
import { isCondemned } from '../upgrader/qc-rules.js';

export const createDiscordNotifier = ({ fetchImpl = fetch, log } = {}) => {
    const postEvent = async (config, { title, description, fields = [], color } = {}) => {
        if (!config?.discordEnabled || !config?.discordWebhookUrl) return false;
        return postDiscordWebhook(config.discordWebhookUrl, {
            embeds: [discordEmbed({ title, description, fields, color })],
        }, { fetchImpl, log });
    };

    const notifyIfNotCondemned = async (config, prefs, key, payload) => {
        if (key && prefs && isCondemned(prefs, key)) return false;
        return postEvent(config, payload);
    };

    const notifyRequestUpdate = async (config, { title, statusLabel, requestedBy } = {}) => {
        if (config?.discordNotifyRequestUpdates === false) return false;
        const who = requestedBy?.displayName || requestedBy?.username || requestedBy?.email || 'A member';
        return postEvent(config, {
            title: `Request ${statusLabel || 'updated'}`,
            description: `**${title || 'Media'}** is now **${statusLabel || 'updated'}**.`,
            fields: [{ name: 'Requested by', value: String(who), inline: true }],
            color: String(statusLabel || '').toLowerCase() === 'declined' ? 0xef4444 : 0x22c55e,
        });
    };

    const notifyIssueReply = async (config, { issue, replyAuthor } = {}) => {
        if (config?.discordNotifyIssueReplies === false) return false;
        return postEvent(config, {
            title: 'Issue reply',
            description: `New reply on **${issue?.title || issue?.mediaTitle || 'an issue'}**.`,
            fields: [{ name: 'Author', value: String(replyAuthor || 'Admin'), inline: true }],
        });
    };

    const notifyWatchlistAvailable = async (config, { title, requestedBy } = {}) => {
        if (config?.discordNotifyWatchlistAvailable === false) return false;
        const who = requestedBy?.displayName || requestedBy?.username || 'A member';
        return postEvent(config, {
            title: 'Now available',
            description: `**${title || 'A requested title'}** is ready on the server.`,
            fields: [{ name: 'Requested by', value: String(who), inline: true }],
            color: 0x5865f2,
        });
    };

    return {
        postEvent,
        notifyIfNotCondemned,
        notifyRequestUpdate,
        notifyIssueReply,
        notifyWatchlistAvailable,
    };
};
