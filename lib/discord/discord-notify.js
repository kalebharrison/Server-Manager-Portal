import { discordEmbed, postDiscordWebhook } from './discord-webhook.js';
import { isCondemned } from '../upgrader/qc-rules.js';

export const createDiscordNotifier = ({ fetchImpl = fetch, log } = {}) => {
    const postEvent = async (config, { title, description, fields = [], color } = {}) => {
        if (!config?.discordEnabled || !config?.discordWebhookUrl) return false;
        return postDiscordWebhook(config.discordWebhookUrl, {
            embeds: [discordEmbed({ title, description, fields, color })],
        }, { fetchImpl, log });
    };

    const postAdminEvent = async (config, { title, description, fields = [], color } = {}) => {
        if (!config?.discordEnabled) return false;
        const adminUrl = config.discordAdminWebhookUrl || config.discordWebhookUrl;
        if (!adminUrl) return false;
        return postDiscordWebhook(adminUrl, {
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

    const notifyAnnouncement = async (config, { text } = {}) => {
        if (config?.discordNotifyAnnouncements === false) return false;
        const body = String(text || '').trim();
        if (!body) return false;
        return postEvent(config, {
            title: 'Server announcement',
            description: body.slice(0, 3500),
            color: 0xe5a00d,
        });
    };

    const notifyBroadcast = async (config, { subject, body } = {}) => {
        if (config?.discordNotifyBroadcasts === false) return false;
        const title = String(subject || 'Broadcast').trim().slice(0, 200) || 'Broadcast';
        const plain = String(body || '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 1500);
        return postEvent(config, {
            title,
            description: plain || '_Broadcast email sent to members._',
            color: 0x5865f2,
        });
    };

    const notifyNewsletter = async (config, { subject, recipientCount } = {}) => {
        if (config?.discordNotifyNewsletters === false) return false;
        const title = String(subject || 'Server newsletter').trim().slice(0, 200) || 'Server newsletter';
        const count = Number(recipientCount);
        return postEvent(config, {
            title,
            description: Number.isFinite(count) && count > 0
                ? `Newsletter is going out to ${count} member${count === 1 ? '' : 's'}.`
                : 'Newsletter is going out to members.',
            color: 0x22c55e,
        });
    };

    const notifyMediaReady = async (config, payload = {}) => {
        if (config?.discordNotifyMediaReady === false) return false;
        return postEvent(config, payload);
    };

    return {
        postEvent,
        postAdminEvent,
        notifyIfNotCondemned,
        notifyRequestUpdate,
        notifyIssueReply,
        notifyWatchlistAvailable,
        notifyAnnouncement,
        notifyBroadcast,
        notifyNewsletter,
        notifyMediaReady,
    };
};
