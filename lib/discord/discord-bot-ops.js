import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} from 'discord.js';
import { createPublicStatusPayload } from '../status/status-public-payload.js';
import { createPlexSessionsSnapshot } from '../plex/plex-sessions-snapshot.js';
import {
    DISCORD_COLORS,
    helpEmbed,
    listEmbed,
    mediaGalleryEmbeds,
    parseCustomId,
    truncate,
} from './discord-embeds.js';
import { ensureDeferredReply, replyOrEdit } from './discord-interaction.js';

const DISCOVER_PICK = 'ddisc-pick';
const DISCOVER_PAGE = 'ddisc-page';
const DISCOVER_PAGE_SIZE = 5;
const DISCOVER_CATEGORIES = new Set(['trending', 'popular', 'upcoming', 'movies', 'tv']);

export const createDiscordOpsHandlers = ({
    member,
    getRequestAppService,
    presentTitleActions = null,
    getPlexConnectionUri = async () => null,
    getHealthData = () => ({}),
    getStatusConfig = () => ({}),
    fetchImpl = fetch,
    log,
}) => {
    const requestApp = () => (typeof getRequestAppService === 'function' ? getRequestAppService() : null);
    const sessionsSnapshot = createPlexSessionsSnapshot({ fetchImpl });

    const normalizeDiscoverCategory = (raw) => {
        const category = String(raw || 'trending');
        return DISCOVER_CATEGORIES.has(category) ? category : 'trending';
    };

    // customId uses apiPage + chunkIndex so "Next 5" walks a catalog page before fetching the next.
    const fetchDiscoverChunk = async (config, category, apiPage, chunkIndex) => {
        const requestAppService = requestApp();
        let page = Math.max(1, Number(apiPage) || 1);
        let chunk = Math.max(0, Number(chunkIndex) || 0);
        let payload = await requestAppService.discover(config, {
            category,
            mediaType: 'all',
            page,
        });
        let all = (Array.isArray(payload?.results) ? payload.results : [])
            .filter((item) => item?.tmdbId && item?.mediaType);

        // If this chunk is past the end of the current API page, advance.
        while (chunk * DISCOVER_PAGE_SIZE >= all.length && payload?.pageInfo?.hasNextPage) {
            page += 1;
            chunk = 0;
            payload = await requestAppService.discover(config, {
                category,
                mediaType: 'all',
                page,
            });
            all = (Array.isArray(payload?.results) ? payload.results : [])
                .filter((item) => item?.tmdbId && item?.mediaType);
        }

        const start = chunk * DISCOVER_PAGE_SIZE;
        const results = all.slice(start, start + DISCOVER_PAGE_SIZE);
        const hasMoreInPage = start + DISCOVER_PAGE_SIZE < all.length;
        const hasNextPage = results.length > 0 && (hasMoreInPage || payload?.pageInfo?.hasNextPage === true);
        const hasPrevPage = page > 1 || chunk > 0;
        const displayPage = chunk + 1 + ((page - 1) * Math.max(1, Math.ceil((all.length || DISCOVER_PAGE_SIZE) / DISCOVER_PAGE_SIZE)));
        return {
            results,
            apiPage: page,
            chunkIndex: chunk,
            displayPage,
            hasNextPage,
            hasPrevPage,
            nextApiPage: hasMoreInPage ? page : page + 1,
            nextChunkIndex: hasMoreInPage ? chunk + 1 : 0,
            // chunkIndex -1 means "last chunk of that API page" when going backward across pages
            prevApiPage: chunk > 0 ? page : Math.max(1, page - 1),
            prevChunkIndex: chunk > 0 ? chunk - 1 : -1,
        };
    };

    const buildDiscoverGallery = (portalUser, category, gallery) => {
        const {
            results, apiPage, chunkIndex, displayPage, hasNextPage, hasPrevPage,
            nextApiPage, nextChunkIndex, prevApiPage, prevChunkIndex,
        } = gallery;
        const embeds = mediaGalleryEmbeds(results, {
            limit: DISCOVER_PAGE_SIZE,
            compact: true,
            footer: `${category} · set ${displayPage} · tap a number to request`,
        });
        const pickRow = new ActionRowBuilder().addComponents(results.map((item, index) => new ButtonBuilder()
            .setCustomId(`${DISCOVER_PICK}:${portalUser.id}:${item.mediaType}:${item.tmdbId}`)
            .setLabel(truncate(`${index + 1}. ${(item.title || 'Title').slice(0, 60)}`, 80))
            .setStyle(item.canRequest === false ? ButtonStyle.Secondary : ButtonStyle.Primary)
            .setDisabled(item.canRequest === false)));
        const navRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`${DISCOVER_PAGE}:${portalUser.id}:${category}:${prevApiPage}:${prevChunkIndex}`)
                .setLabel('◀ Previous 5')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(!hasPrevPage),
            new ButtonBuilder()
                .setCustomId(`${DISCOVER_PAGE}:${portalUser.id}:${category}:${apiPage}:${chunkIndex}`)
                .setLabel(`Set ${displayPage}`)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true),
            new ButtonBuilder()
                .setCustomId(`${DISCOVER_PAGE}:${portalUser.id}:${category}:${nextApiPage}:${nextChunkIndex}`)
                .setLabel('Next 5 ▶')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(!hasNextPage),
        );
        return {
            content: `**${category}** for **${member.displayName(portalUser)}** — set ${displayPage}:`,
            embeds,
            components: [pickRow, navRow],
        };
    };

    const handleHelpCommand = async (interaction) => {
        await replyOrEdit(interaction, { embeds: [helpEmbed()], ephemeral: true });
    };

    const handleStatsCommand = async (interaction, config) => {
        const portalUser = await member.requirePortalMember(interaction);
        if (!portalUser) return;
        await ensureDeferredReply(interaction);
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
                    lines,
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
        await ensureDeferredReply(interaction);
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
                    ? (session.User?.title || session.user?.title || session.username || session.account || 'Someone')
                    : 'Member';
                const player = session.Player?.title || session.Player?.product || session.player || '';
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
        if (!requestAppService) {
            await interaction.reply({ content: 'Request service unavailable.', ephemeral: true });
            return;
        }
        await ensureDeferredReply(interaction);
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
            const cards = items.slice(0, 5).map((item) => ({
                ...item,
                overview: `${item._bucket}${item.requestedBy ? ` · ${item.requestedBy}` : ''}`,
            }));
            await interaction.editReply({
                content: `On the way — **${member.displayName(portalUser)}** view (${items.length} item(s)):`,
                embeds: mediaGalleryEmbeds(cards, {
                    limit: 5,
                    compact: true,
                    footer: 'Pending + processing requests',
                }),
            });
        } catch (error) {
            log?.(`Discord /queue failed: ${error.message}`);
            await interaction.editReply({ content: `Could not load queue: ${error.message}` });
        }
    };

    const handleStatusCommand = async (interaction) => {
        const portalUser = await member.requirePortalMember(interaction);
        if (!portalUser) return;
        await ensureDeferredReply(interaction);
        try {
            const payload = createPublicStatusPayload(getStatusConfig(), getHealthData());
            const services = Array.isArray(payload?.config?.services) ? payload.config.services : [];
            const health = payload?.healthData && typeof payload.healthData === 'object' ? payload.healthData : {};
            if (!services.length) {
                await interaction.editReply({ content: 'No status services configured.' });
                return;
            }
            const lines = services.slice(0, 20).map((service) => {
                const record = health[service.id] || {};
                const state = record.currentStatus
                    || service.status
                    || service.state
                    || (service.up === false ? 'down' : 'unknown');
                return truncate(`${service.name || service.id}: ${state}`, 100);
            });
            const announcement = payload?.config?.announcement;
            await interaction.editReply({
                embeds: [listEmbed({
                    title: 'Service status',
                    lines,
                    color: DISCORD_COLORS.info,
                    footer: announcement ? truncate(String(announcement), 180) : undefined,
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
        if (!requestAppService) {
            await interaction.reply({ content: 'Request service unavailable.', ephemeral: true });
            return;
        }
        const category = normalizeDiscoverCategory(interaction.options.getString('category'));
        await ensureDeferredReply(interaction);
        try {
            const gallery = await fetchDiscoverChunk(config, category, 1, 0);
            if (!gallery.results.length) {
                await interaction.editReply({ content: 'No discover results right now.' });
                return;
            }
            await interaction.editReply(buildDiscoverGallery(portalUser, category, gallery));
        } catch (error) {
            log?.(`Discord /discover failed: ${error.message}`);
            await interaction.editReply({ content: `Could not load discover: ${error.message}` });
        }
    };

    const handleDiscoverPage = async (interaction, config) => {
        const portalUser = await member.requirePortalMember(interaction);
        if (!portalUser) return;
        const parsed = parseCustomId(interaction.customId);
        const [userId, rawCategory, rawApiPage, rawChunk] = parsed.parts;
        if (String(userId) !== String(portalUser.id)) {
            await interaction.reply({ content: 'That discover page belongs to someone else.', ephemeral: true });
            return;
        }
        const category = normalizeDiscoverCategory(rawCategory);
        let apiPage = Math.max(1, Number(rawApiPage) || 1);
        let chunkIndex = Number(rawChunk);
        if (!Number.isFinite(chunkIndex)) chunkIndex = 0;
        await interaction.deferUpdate();
        try {
            if (chunkIndex < 0) {
                const probe = await requestApp().discover(config, {
                    category,
                    mediaType: 'all',
                    page: apiPage,
                });
                const all = (Array.isArray(probe?.results) ? probe.results : [])
                    .filter((item) => item?.tmdbId && item?.mediaType);
                chunkIndex = Math.max(0, Math.ceil(all.length / DISCOVER_PAGE_SIZE) - 1);
            }
            const gallery = await fetchDiscoverChunk(config, category, apiPage, chunkIndex);
            if (!gallery.results.length) {
                await interaction.editReply({
                    content: 'No more results. Try Previous 5 or go back to the start.',
                    embeds: [],
                    components: [
                        new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId(`${DISCOVER_PAGE}:${portalUser.id}:${category}:1:0`)
                                .setLabel('Back to start')
                                .setStyle(ButtonStyle.Secondary),
                        ),
                    ],
                });
                return;
            }
            await interaction.editReply(buildDiscoverGallery(portalUser, category, gallery));
        } catch (error) {
            log?.(`Discord /discover page failed: ${error.message}`);
            await interaction.editReply({ content: `Could not load page: ${error.message}`, embeds: [], components: [] });
        }
    };

    const handleDiscoverPick = async (interaction, config) => {
        const portalUser = await member.requirePortalMember(interaction);
        if (!portalUser) return;
        const parsed = parseCustomId(interaction.customId);
        const [userId, mediaType, tmdbId] = parsed.parts;
        if (String(userId) !== String(portalUser.id)) {
            await interaction.reply({ content: 'That discover pick belongs to someone else.', ephemeral: true });
            return;
        }
        if (typeof presentTitleActions !== 'function') {
            await interaction.reply({ content: 'Request actions are unavailable right now.', ephemeral: true });
            return;
        }
        await interaction.deferUpdate();
        await presentTitleActions(interaction, config, {
            portalUser,
            mediaType,
            tmdbId: Number(tmdbId),
        });
    };

    return {
        handleHelpCommand,
        handleStatsCommand,
        handleLiveCommand,
        handleQueueCommand,
        handleStatusCommand,
        handleDiscoverCommand,
        handleDiscoverPage,
        handleDiscoverPick,
        isDiscoverPick: (customId) => String(customId || '').startsWith(`${DISCOVER_PICK}:`),
        isDiscoverPage: (customId) => String(customId || '').startsWith(`${DISCOVER_PAGE}:`),
    };
};
