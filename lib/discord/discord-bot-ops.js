import { createPublicStatusPayload } from '../status/status-public-payload.js';
import { createPlexSessionsSnapshot } from '../plex/plex-sessions-snapshot.js';
import {
    DISCORD_COLORS,
    helpEmbed,
    listEmbed,
    mediaEmbed,
    truncate,
} from './discord-embeds.js';

export const createDiscordOpsHandlers = ({
    member,
    getRequestAppService,
    getPlexConnectionUri = async () => null,
    getHealthData = () => ({}),
    getStatusConfig = () => ({}),
    fetchImpl = fetch,
    log,
}) => {
    const requestApp = () => (typeof getRequestAppService === 'function' ? getRequestAppService() : null);
    const sessionsSnapshot = createPlexSessionsSnapshot({ fetchImpl });

    const handleHelpCommand = async (interaction) => {
        await interaction.reply({ embeds: [helpEmbed()], ephemeral: true });
    };

    const handleStatsCommand = async (interaction, config) => {
        const portalUser = await member.requirePortalMember(interaction);
        if (!portalUser) return;
        await interaction.deferReply({ ephemeral: true });
        try {
            const requestAppService = requestApp();
            const counts = requestAppService
                ? await requestAppService.getRequestCounts(config).catch(() => null)
                : null;
            const lines = [
                `Portal user: **${member.displayName(portalUser)}**`,
                portalUser.expiryDate ? `Membership expiry: ${portalUser.expiryDate}` : 'Membership: active',
            ];
            if (counts) {
                lines.push(
                    `Server requests — pending: ${counts.pending || 0}, processing: ${counts.processing || 0}, available: ${counts.available || 0}`,
                );
            }
            lines.push('Open the portal **Analytics** tab for full personal watch history.');
            await interaction.editReply({
                embeds: [listEmbed({
                    title: 'Your stats',
                    description: lines.join('\n'),
                    lines: [],
                    color: DISCORD_COLORS.info,
                })],
            });
        } catch (error) {
            log?.(`Discord /stats failed: ${error.message}`);
            await interaction.editReply({ content: `Could not load stats: ${error.message}` });
        }
    };

    const handleLiveCommand = async (interaction, config) => {
        const portalUser = await member.requirePortalMember(interaction);
        if (!portalUser) return;
        await interaction.deferReply({ ephemeral: true });
        try {
            const uri = await getPlexConnectionUri(config);
            if (!uri || !config.plexToken) {
                await interaction.editReply({ content: 'Live sessions require a configured Plex server.' });
                return;
            }
            const sessions = await sessionsSnapshot.fetchSessionsMetadata(config, uri);
            const isAdmin = portalUser.isAdmin === true;
            if (!Array.isArray(sessions) || !sessions.length) {
                await interaction.editReply({ content: 'Nothing is streaming right now.' });
                return;
            }
            const lines = sessions.slice(0, 12).map((session) => {
                const title = session.grandparentTitle || session.title || session.parentTitle || 'Unknown';
                const user = isAdmin
                    ? (session.User?.title || session.username || 'Someone')
                    : 'Member';
                const player = session.Player?.title || session.Player?.product || '';
                return truncate([title, user, player].filter(Boolean).join(' · '), 100);
            });
            await interaction.editReply({
                embeds: [listEmbed({
                    title: 'Live now',
                    description: `${sessions.length} active stream(s)`,
                    lines,
                    color: DISCORD_COLORS.good,
                    footer: isAdmin ? 'Admin view includes identities' : 'Identities hidden for members',
                })],
            });
        } catch (error) {
            log?.(`Discord /live failed: ${error.message}`);
            await interaction.editReply({ content: `Could not load live sessions: ${error.message}` });
        }
    };

    const handleQueueCommand = async (interaction, config) => {
        const portalUser = await member.requirePortalMember(interaction);
        if (!portalUser) return;
        const requestAppService = requestApp();
        if (!requestAppService?.getRequestAppGate?.(config)?.ready) {
            await interaction.reply({ content: 'Request app is not configured.', ephemeral: true });
            return;
        }
        await interaction.deferReply({ ephemeral: true });
        try {
            const [processing, pending] = await Promise.all([
                requestAppService.listRequests(config, { filter: 'processing', take: 15, skip: 0 }).catch(() => ({ results: [] })),
                requestAppService.listRequests(config, { filter: 'pending', take: 10, skip: 0 }).catch(() => ({ results: [] })),
            ]);
            const items = [
                ...(processing.results || []).map((item) => ({ ...item, _bucket: 'processing' })),
                ...(pending.results || []).map((item) => ({ ...item, _bucket: 'pending' })),
            ].slice(0, 15);
            if (!items.length) {
                await interaction.editReply({ content: 'Queue is clear — nothing pending or processing.' });
                return;
            }
            await interaction.editReply({
                embeds: [listEmbed({
                    title: 'On the way',
                    description: `As seen by **${member.displayName(portalUser)}**`,
                    lines: items.map((item) => truncate(`${item.title || 'Untitled'} · ${item._bucket}`, 100)),
                    color: DISCORD_COLORS.warn,
                })],
            });
        } catch (error) {
            log?.(`Discord /queue failed: ${error.message}`);
            await interaction.editReply({ content: `Could not load queue: ${error.message}` });
        }
    };

    const handleStatusCommand = async (interaction) => {
        const portalUser = await member.requirePortalMember(interaction);
        if (!portalUser) return;
        await interaction.deferReply({ ephemeral: true });
        try {
            const payload = createPublicStatusPayload(getStatusConfig(), getHealthData());
            const services = Array.isArray(payload?.services) ? payload.services : [];
            if (!services.length) {
                await interaction.editReply({ content: 'No status services configured.' });
                return;
            }
            const lines = services.slice(0, 20).map((service) => {
                const state = service.status || service.state || (service.up === false ? 'down' : 'up');
                return truncate(`${service.name || service.id}: ${state}`, 100);
            });
            await interaction.editReply({
                embeds: [listEmbed({
                    title: 'Service status',
                    lines,
                    color: DISCORD_COLORS.info,
                    footer: payload?.announcement ? truncate(payload.announcement, 180) : undefined,
                })],
            });
        } catch (error) {
            log?.(`Discord /status failed: ${error.message}`);
            await interaction.editReply({ content: `Could not load status: ${error.message}` });
        }
    };

    const handleDiscoverCommand = async (interaction, config) => {
        const portalUser = await member.requirePortalMember(interaction);
        if (!portalUser) return;
        const requestAppService = requestApp();
        if (!requestAppService?.getRequestAppGate?.(config)?.ready) {
            await interaction.reply({ content: 'Request app is not configured.', ephemeral: true });
            return;
        }
        const category = String(interaction.options.getString('category') || 'trending');
        await interaction.deferReply({ ephemeral: true });
        try {
            const page = await requestAppService.discover(config, { category, mediaType: 'all', page: 1 });
            const results = (Array.isArray(page?.results) ? page.results : []).slice(0, 8);
            if (!results.length) {
                await interaction.editReply({ content: 'No discover results right now.' });
                return;
            }
            const embeds = results.slice(0, 5).map((item) => mediaEmbed(item));
            await interaction.editReply({
                content: `**${category}** picks for **${member.displayName(portalUser)}** — use \`/request\` to grab one.`,
                embeds,
            });
        } catch (error) {
            log?.(`Discord /discover failed: ${error.message}`);
            await interaction.editReply({ content: `Could not load discover: ${error.message}` });
        }
    };

    return {
        handleHelpCommand,
        handleStatsCommand,
        handleLiveCommand,
        handleQueueCommand,
        handleStatusCommand,
        handleDiscoverCommand,
    };
};
