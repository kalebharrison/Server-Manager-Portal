import { discordEmbed, postDiscordWebhook } from './discord-webhook.js';
import { emailStatusLabel } from '../comms/email-identity.js';
import { isCondemned } from '../upgrader/qc-rules.js';

export const canPostDiscordMemberEvent = (config = {}) => !!config?.discordEnabled && !!(
    String(config.discordMemberChannelId || '').trim()
    || String(config.discordWebhookUrl || '').trim()
);

export const createDiscordNotifier = ({
    fetchImpl = fetch,
    log,
    sendMemberDm = async () => false,
    sendChannelMessage = async () => false,
} = {}) => {
    const buildMemberMessage = ({
        title, description, fields = [], color, content, thumbnail, image, footer, url, author,
    } = {}) => ({
        content: content || undefined,
        embeds: [discordEmbed({
            title, description, fields, color, thumbnail, image, footer, url, author,
        })],
    });

    const postEvent = async (config, payload = {}) => {
        if (!canPostDiscordMemberEvent(config)) return false;
        const message = buildMemberMessage(payload);
        const channelId = String(config.discordMemberChannelId || '').trim();
        if (channelId) {
            const posted = await sendChannelMessage(config, channelId, message);
            if (posted) return true;
        }
        if (!config.discordWebhookUrl) return false;
        return postDiscordWebhook(config.discordWebhookUrl, message, { fetchImpl, log });
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

    const notifyRequestUpdate = async (config, { title, statusLabel, discordId } = {}) => {
        if (config?.discordNotifyRequestUpdates === false) return false;
        if (!config?.discordEnabled) return false;
        const status = emailStatusLabel(statusLabel);
        return sendMemberDm(config, discordId, {
            title: `Request ${status}`,
            description: `Your request for **${title || 'Media'}** is now **${status}**.`,
            color: status.toLowerCase() === 'declined' ? 0xef4444 : 0x22c55e,
        });
    };

    const notifyIssueReply = async (config, { issue, replyAuthor, statusLabel, discordId } = {}) => {
        if (config?.discordNotifyIssueReplies === false) return false;
        if (!config?.discordEnabled) return false;
        const resolved = String(statusLabel || '').toLowerCase() === 'resolved';
        const title = issue?.title || issue?.mediaTitle || 'your issue';
        return sendMemberDm(config, discordId, {
            title: resolved ? 'Issue Resolved' : 'Issue Reply',
            description: resolved
                ? `Your issue **${title}** was marked resolved.`
                : `New reply on **${title}**${replyAuthor ? ` from **${replyAuthor}**` : ''}.`,
            color: resolved ? 0x22c55e : 0x5865f2,
        });
    };

    const notifyWatchlistAvailable = async (config, { title, discordId } = {}) => {
        if (config?.discordNotifyWatchlistAvailable === false) return false;
        if (!config?.discordEnabled) return false;
        return sendMemberDm(config, discordId, {
            title: 'Now Available',
            description: `**${title || 'A requested title'}** is ready on the server.`,
            color: 0x5865f2,
        });
    };

    const notifyAnnouncement = async (config, { text } = {}) => {
        if (config?.discordNotifyAnnouncements === false) return false;
        const body = String(text || '').trim();
        if (!body) return false;
        return postEvent(config, {
            title: 'Server Announcement',
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
