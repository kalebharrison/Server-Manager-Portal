import { EmbedBuilder } from 'discord.js';

export const DISCORD_COLORS = {
    accent: 0xe5a00d,
    good: 0x22c55e,
    warn: 0xf59e0b,
    bad: 0xef4444,
    info: 0x5865f2,
    muted: 0x64748b,
};

export const statusColor = (item = {}) => {
    if (item.available) return DISCORD_COLORS.good;
    if (item.processing) return DISCORD_COLORS.warn;
    if (item.requested || item.pending || item.approved) return DISCORD_COLORS.warn;
    if (item.error) return DISCORD_COLORS.bad;
    return DISCORD_COLORS.accent;
};

export const statusLabel = (item = {}) => {
    if (item.available) return 'Available';
    if (item.processing) return 'Processing';
    if (item.pending) return 'Pending';
    if (item.approved) return 'Approved';
    if (item.requested) return 'Requested';
    if (item.canRequest === false) return 'Unavailable';
    return 'Requestable';
};

export const truncate = (value, max = 200) => {
    const text = String(value || '').trim();
    if (text.length <= max) return text;
    return `${text.slice(0, max - 1)}…`;
};

export const mediaEmbed = (item = {}, { footer } = {}) => {
    const embed = new EmbedBuilder()
        .setColor(statusColor(item))
        .setTitle(truncate(item.title || 'Untitled', 250))
        .setDescription(truncate(item.overview || 'No overview available.', 400));

    const fields = [
        item.year ? { name: 'Year', value: String(item.year), inline: true } : null,
        item.mediaType ? { name: 'Type', value: String(item.mediaType).toUpperCase(), inline: true } : null,
        { name: 'Status', value: statusLabel(item), inline: true },
        item.rating != null ? { name: 'Rating', value: String(Number(item.rating).toFixed(1)), inline: true } : null,
    ].filter(Boolean);
    if (fields.length) embed.addFields(fields);

    if (item.posterUrl && /^https:\/\//i.test(item.posterUrl)) {
        embed.setThumbnail(item.posterUrl);
    }
    if (footer) embed.setFooter({ text: truncate(footer, 200) });
    return embed;
};

export const listEmbed = ({ title, description, lines = [], color = DISCORD_COLORS.info, footer } = {}) => {
    const body = lines.length
        ? lines.map((line, index) => `**${index + 1}.** ${line}`).join('\n').slice(0, 3900)
        : '_Nothing to show._';
    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(truncate(title || 'Results', 250))
        .setDescription(description ? `${truncate(description, 200)}\n\n${body}` : body);
    if (footer) embed.setFooter({ text: truncate(footer, 200) });
    return embed;
};

export const helpEmbed = () => new EmbedBuilder()
    .setColor(DISCORD_COLORS.accent)
    .setTitle('Portal Discord bot')
    .setDescription('Member commands mirror the portal web UI. Link your Discord ID under Preferences first.')
    .addFields(
        { name: '/request', value: 'Search and request movies or TV', inline: false },
        { name: '/myrequests', value: 'See your recent request status', inline: false },
        { name: '/issue', value: 'Report, list, view, or comment on issues', inline: false },
        { name: '/stats', value: 'Your watch stats summary', inline: false },
        { name: '/live', value: 'Who is streaming now', inline: false },
        { name: '/queue', value: 'Downloads / on the way', inline: false },
        { name: '/status', value: 'Service status snapshot', inline: false },
        { name: '/discover', value: 'Browse trending or popular titles', inline: false },
        { name: '/ask', value: 'Natural language shortcut (optional LLM)', inline: false },
        { name: '/help', value: 'Show this guide', inline: false },
    );

export const parseCustomId = (customId = '') => {
    const parts = String(customId || '').split(':');
    return {
        kind: parts[0] || '',
        parts: parts.slice(1),
        raw: String(customId || ''),
    };
};
