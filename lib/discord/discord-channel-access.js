import { PermissionFlagsBits } from 'discord.js';

/**
 * Allow guild interactions always. For DMs, require ViewChannel on the configured member channel.
 */
export const assertDiscordMemberChannelAccess = async ({
    client,
    userId,
    guildId,
    memberChannelId,
    inGuild,
}) => {
    if (inGuild) return { ok: true };
    const channelId = String(memberChannelId || '').trim();
    const serverId = String(guildId || '').trim();
    if (!serverId || !channelId) {
        return {
            ok: false,
            message: 'Bot DMs are not configured yet. Use the member Discord channel instead.',
        };
    }
    try {
        const guild = await client.guilds.fetch(serverId);
        const member = await guild.members.fetch(String(userId)).catch(() => null);
        if (!member) {
            return {
                ok: false,
                message: 'Join the server member channel first, then you can DM me.',
            };
        }
        const channel = await guild.channels.fetch(channelId).catch(() => null);
        if (!channel) {
            return {
                ok: false,
                message: 'Member channel is misconfigured. Ask an admin to set the Discord member channel ID.',
            };
        }
        const perms = channel.permissionsFor(member);
        if (!perms?.has(PermissionFlagsBits.ViewChannel)) {
            return {
                ok: false,
                message: 'Only members of the announcement channel can DM this bot. Join that channel first.',
            };
        }
        return { ok: true };
    } catch (error) {
        return {
            ok: false,
            message: `Could not verify channel access (${error.message}). Try the member channel instead.`,
        };
    }
};
