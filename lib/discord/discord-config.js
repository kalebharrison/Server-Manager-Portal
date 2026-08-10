import { sanitizeHttpUrl } from '../http/public-url.js';
import { sanitizeSearxngUrl } from './discord-searxng.js';

const snowflake = (value) => {
    const next = String(value || '').trim();
    if (!next) return '';
    if (!/^\d{5,32}$/.test(next)) throw new Error('Discord IDs must be numeric snowflakes.');
    return next;
};

export const sanitizeDiscordInviteUrl = (raw) => {
    const value = String(raw || '').trim();
    if (!value) return '';
    const url = sanitizeHttpUrl(value, { field: 'discordInviteUrl' });
    const host = new URL(url).hostname.toLowerCase();
    if (!['discord.gg', 'discord.com', 'www.discord.com', 'discordapp.com'].includes(host)) {
        throw new Error('Discord invite URL must use discord.gg or discord.com.');
    }
    return url;
};

export const sanitizeDiscordWebhookUrl = (raw) => {
    const value = String(raw || '').trim();
    if (!value) return '';
    const url = sanitizeHttpUrl(value, { field: 'discordWebhookUrl' });
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith('discord.com') && !parsed.hostname.endsWith('discordapp.com')) {
        throw new Error('Discord webhook URL must point at Discord.');
    }
    if (!parsed.pathname.includes('/api/webhooks/')) {
        throw new Error('Discord webhook URL path is invalid.');
    }
    return url;
};

export const buildDiscordConfigFields = ({
    body = {},
    existingConfig = {},
    resolveSecret,
}) => {
    try {
        const inviteProvided = 'discordInviteUrl' in body;
        const webhookProvided = 'discordWebhookUrl' in body;
        const adminWebhookProvided = 'discordAdminWebhookUrl' in body;
        const tokenProvided = 'discordBotToken' in body;

        return {
            discordEnabled: body.discordEnabled === true || body.discordEnabled === 'true',
            discordInviteUrl: inviteProvided
                ? sanitizeDiscordInviteUrl(body.discordInviteUrl)
                : (existingConfig.discordInviteUrl || ''),
            discordChatChannelLabel: String(body.discordChatChannelLabel ?? existingConfig.discordChatChannelLabel ?? '')
                .trim()
                .slice(0, 80),
            discordMediaChannelLabel: String(body.discordMediaChannelLabel ?? existingConfig.discordMediaChannelLabel ?? '')
                .trim()
                .slice(0, 80),
            discordGuildId: snowflake(body.discordGuildId ?? existingConfig.discordGuildId ?? ''),
            discordMemberChannelId: snowflake(
                body.discordMemberChannelId ?? existingConfig.discordMemberChannelId ?? '',
            ),
            discordBotToken: tokenProvided
                ? resolveSecret(body.discordBotToken, existingConfig.discordBotToken)
                : (existingConfig.discordBotToken || ''),
            discordBotEnabled: body.discordBotEnabled === true || body.discordBotEnabled === 'true',
            discordWebhookUrl: (() => {
                if (!webhookProvided) return existingConfig.discordWebhookUrl || '';
                const raw = String(body.discordWebhookUrl || '').trim();
                if (!raw) return '';
                const preserved = resolveSecret(raw, existingConfig.discordWebhookUrl || '');
                if (!preserved) return '';
                return sanitizeDiscordWebhookUrl(preserved);
            })(),
            discordAdminWebhookUrl: (() => {
                if (!adminWebhookProvided) return existingConfig.discordAdminWebhookUrl || '';
                const raw = String(body.discordAdminWebhookUrl || '').trim();
                if (!raw) return '';
                const preserved = resolveSecret(raw, existingConfig.discordAdminWebhookUrl || '');
                if (!preserved) return '';
                return sanitizeDiscordWebhookUrl(preserved);
            })(),
            discordNotifyRequestUpdates: body.discordNotifyRequestUpdates !== false && body.discordNotifyRequestUpdates !== 'false',
            discordNotifyIssueReplies: body.discordNotifyIssueReplies !== false && body.discordNotifyIssueReplies !== 'false',
            discordNotifyWatchlistAvailable: body.discordNotifyWatchlistAvailable !== false && body.discordNotifyWatchlistAvailable !== 'false',
            discordNotifyAnnouncements: body.discordNotifyAnnouncements !== false && body.discordNotifyAnnouncements !== 'false',
            discordNotifyBroadcasts: body.discordNotifyBroadcasts !== false && body.discordNotifyBroadcasts !== 'false',
            discordNotifyNewsletters: body.discordNotifyNewsletters !== false && body.discordNotifyNewsletters !== 'false',
            discordNotifyMediaReady: body.discordNotifyMediaReady !== false && body.discordNotifyMediaReady !== 'false',
            discordMediaAnnounceDebounceMinutes: Math.max(
                1,
                Math.min(
                    180,
                    Number(
                        body.discordMediaAnnounceDebounceMinutes
                        ?? existingConfig.discordMediaAnnounceDebounceMinutes
                        ?? 60,
                    ) || 60,
                ),
            ),
            discordLlmEnabled: body.discordLlmEnabled === true || body.discordLlmEnabled === 'true',
            discordLlmUrl: String(body.discordLlmUrl ?? existingConfig.discordLlmUrl ?? '').trim().slice(0, 300),
            discordLlmApiKey: (() => {
                if (!('discordLlmApiKey' in body)) return existingConfig.discordLlmApiKey || '';
                return resolveSecret(body.discordLlmApiKey, existingConfig.discordLlmApiKey || '');
            })(),
            discordLlmModel: String(body.discordLlmModel ?? existingConfig.discordLlmModel ?? 'gpt-4o-mini').trim().slice(0, 120) || 'gpt-4o-mini',
            discordMentionNl: body.discordMentionNl === true || body.discordMentionNl === 'true',
            discordAgentEnabled: body.discordAgentEnabled !== false && body.discordAgentEnabled !== 'false',
            discordSearxngUrl: (() => {
                if (!('discordSearxngUrl' in body)) return existingConfig.discordSearxngUrl || '';
                return sanitizeSearxngUrl(body.discordSearxngUrl);
            })(),
            discordBraveSearchApiKey: (() => {
                if (!('discordBraveSearchApiKey' in body)) return existingConfig.discordBraveSearchApiKey || '';
                return resolveSecret(body.discordBraveSearchApiKey, existingConfig.discordBraveSearchApiKey || '');
            })(),
            discordTavilyApiKey: (() => {
                if (!('discordTavilyApiKey' in body)) return existingConfig.discordTavilyApiKey || '';
                return resolveSecret(body.discordTavilyApiKey, existingConfig.discordTavilyApiKey || '');
            })(),
        };
    } catch (error) {
        throw new Error(`Invalid Discord settings: ${error.message}`);
    }
};

export const buildPublicDiscordConfig = (config = {}) => {
    if (!config.discordEnabled || !config.discordInviteUrl) {
        return {
            discordEnabled: false,
            discordInviteUrl: '',
            discordChatChannelLabel: '',
            discordMediaChannelLabel: '',
        };
    }
    return {
        discordEnabled: true,
        discordInviteUrl: config.discordInviteUrl || '',
        discordChatChannelLabel: config.discordChatChannelLabel || '',
        discordMediaChannelLabel: config.discordMediaChannelLabel || '',
    };
};

export const sanitizeDiscordUserId = (raw) => {
    const value = String(raw || '').trim();
    if (!value) return '';
    if (!/^\d{5,32}$/.test(value)) return null;
    return value;
};
