import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
} from 'discord.js';
import { mediaEmbed, mediaGalleryEmbeds, parseCustomId, truncate } from './discord-embeds.js';

const SELECT = 'dreq-select';
const SEASON = 'dreq-season';
const CONFIRM = 'dreq-confirm';
const CANCEL = 'dreq-cancel';
const ALL_SEASONS = 'all';

export const createDiscordRequestHandlers = ({
    member,
    getRequestAppService,
    log,
}) => {
    const requestApp = () => (typeof getRequestAppService === 'function' ? getRequestAppService() : null);

    const ensureReady = async (interaction, config) => {
        const requestAppService = requestApp();
        const gate = requestAppService?.getRequestAppGate?.(config);
        if (!gate?.ready) {
            const msg = 'Requests are not configured on this portal yet.';
            if (interaction.deferred || interaction.replied) await interaction.editReply({ content: msg, components: [], embeds: [] });
            else await interaction.reply({ content: msg, ephemeral: true });
            return null;
        }
        return requestAppService;
    };

    const statusHint = (item) => {
        if (item.available) return 'Available';
        if (item.processing) return 'Processing';
        if (item.requested || item.pending) return 'Requested';
        return 'Unavailable';
    };

    const runSearch = async (interaction, config, { query, mediaType = 'all' }) => {
        const portalUser = await member.requirePortalMember(interaction);
        if (!portalUser) return;
        const requestAppService = await ensureReady(interaction, config);
        if (!requestAppService) return;

        const q = String(query || '').trim();
        const type = String(mediaType || 'all');
        if (q.length < 2) {
            await interaction.reply({ content: 'Search query is too short.', ephemeral: true });
            return;
        }

        await interaction.deferReply({ ephemeral: true });
        try {
            const page = await requestAppService.search(config, { query: q, mediaType: type, page: 1 });
            const results = (Array.isArray(page?.results) ? page.results : [])
                .filter((item) => item?.tmdbId)
                .filter((item) => type === 'all' || item.mediaType === type)
                .slice(0, 10);
            if (!results.length) {
                await interaction.editReply({ content: `No results for “${q}”.` });
                return;
            }

            const menu = new StringSelectMenuBuilder()
                .setCustomId(`${SELECT}:${portalUser.id}`)
                .setPlaceholder('Pick a title from the posters below')
                .addOptions(results.map((item) => ({
                    label: truncate(item.title || 'Untitled', 100),
                    description: truncate([item.year, item.mediaType, item.canRequest === false ? statusHint(item) : 'Requestable'].filter(Boolean).join(' · '), 100),
                    value: `${item.mediaType}:${item.tmdbId}`,
                })));

            const embeds = mediaGalleryEmbeds(results, {
                limit: 5,
                compact: true,
                footer: `Searching as ${member.displayName(portalUser)} · ${results.length} result(s) · pick from the menu`,
            });
            await interaction.editReply({
                content: `Select a title to continue as **${member.displayName(portalUser)}**:`,
                embeds,
                components: [new ActionRowBuilder().addComponents(menu)],
            });
        } catch (error) {
            log?.(`Discord /request search failed: ${error.message}`);
            await interaction.editReply({ content: `Search failed: ${error.message}` });
        }
    };

    const handleRequestCommand = async (interaction, config) => {
        await runSearch(interaction, config, {
            query: interaction.options.getString('query'),
            mediaType: interaction.options.getString('type') || 'all',
        });
    };

    const presentTitleActions = async (interaction, config, { portalUser, mediaType, tmdbId }) => {
        const requestAppService = await ensureReady(interaction, config);
        if (!requestAppService) return;

        const detail = await requestAppService.getMediaDetails(config, { mediaType, tmdbId });
        const item = detail || { tmdbId, mediaType, title: String(tmdbId) };
        const embed = mediaEmbed(item, {
            footer: `Acting as ${member.displayName(portalUser)}`,
            largeImage: true,
        });

        if (item.canRequest === false) {
            await interaction.editReply({
                content: `**${item.title || tmdbId}** is ${statusHint(item).toLowerCase()}.`,
                embeds: [embed],
                components: [],
            });
            return;
        }

        if (mediaType === 'tv') {
            const seasons = (Array.isArray(item.seasons) ? item.seasons : [])
                .map((season) => Number(season.seasonNumber ?? season))
                .filter((n) => Number.isFinite(n) && n > 0)
                .slice(0, 20);
            const rows = [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`${CONFIRM}:${portalUser.id}:${mediaType}:${tmdbId}:${ALL_SEASONS}`)
                        .setLabel('Request all seasons')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`${CANCEL}:${portalUser.id}`)
                        .setLabel('Cancel')
                        .setStyle(ButtonStyle.Secondary),
                ),
            ];
            if (seasons.length) {
                const menu = new StringSelectMenuBuilder()
                    .setCustomId(`${SEASON}:${portalUser.id}:${mediaType}:${tmdbId}`)
                    .setPlaceholder('Or pick specific seasons')
                    .setMinValues(1)
                    .setMaxValues(Math.min(seasons.length, 25))
                    .addOptions(seasons.map((n) => ({
                        label: `Season ${n}`,
                        value: String(n),
                    })));
                rows.unshift(new ActionRowBuilder().addComponents(menu));
            }
            await interaction.editReply({
                content: `Choose seasons for **${item.title || tmdbId}**:`,
                embeds: [embed],
                components: rows,
            });
            return;
        }

        await interaction.editReply({
            content: `Request **${item.title || tmdbId}**?`,
            embeds: [embed],
            components: [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`${CONFIRM}:${portalUser.id}:${mediaType}:${tmdbId}:`)
                        .setLabel('Confirm request')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`${CANCEL}:${portalUser.id}`)
                        .setLabel('Cancel')
                        .setStyle(ButtonStyle.Secondary),
                ),
            ],
        });
    };

    const handleRequestSelect = async (interaction, config) => {
        const { parts } = parseCustomId(interaction.customId);
        const portalUserId = parts[0];
        const [mediaType, tmdbRaw] = String(interaction.values?.[0] || '').split(':');
        const tmdbId = Number(tmdbRaw);
        if (!tmdbId || !portalUserId || !['movie', 'tv'].includes(mediaType)) {
            await interaction.reply({ content: 'Invalid selection.', ephemeral: true });
            return;
        }
        const portalUser = await member.findUserById(portalUserId);
        if (!portalUser || String(portalUser.discordId || '') !== String(interaction.user.id) || !member.isMemberAllowed(portalUser)) {
            await interaction.reply({ content: 'You are not allowed to complete this request.', ephemeral: true });
            return;
        }
        await interaction.deferUpdate();
        try {
            await presentTitleActions(interaction, config, { portalUser, mediaType, tmdbId });
        } catch (error) {
            log?.(`Discord request detail failed: ${error.message}`);
            await interaction.editReply({ content: `Could not load title: ${error.message}`, components: [], embeds: [] });
        }
    };

    const submitRequest = async (interaction, config, {
        portalUser, mediaType, tmdbId, seasons,
    }) => {
        const requestAppService = await ensureReady(interaction, config);
        if (!requestAppService) return;
        const sessionUser = member.toSessionUser(portalUser);
        await requestAppService.requestMedia(config, {
            mediaType,
            tmdbId,
            seasons: mediaType === 'tv' ? seasons : [],
            sessionUser,
        });
        const detail = await requestAppService.getMediaDetails(config, { mediaType, tmdbId }).catch(() => null);
        const title = detail?.title || String(tmdbId);
        const seasonNote = mediaType === 'tv'
            ? (seasons === ALL_SEASONS || seasons === 'all' ? ' (all seasons)' : ` (seasons ${[].concat(seasons).join(', ')})`)
            : '';
        await interaction.editReply({
            content: `Requested **${title}**${seasonNote} as **${member.displayName(portalUser)}**.`,
            embeds: detail ? [mediaEmbed({ ...detail, requested: true, canRequest: false }, { largeImage: true })] : [],
            components: [],
        });
    };

    const handleSeasonSelect = async (interaction, config) => {
        const { parts } = parseCustomId(interaction.customId);
        const [portalUserId, mediaType, tmdbRaw] = parts;
        const tmdbId = Number(tmdbRaw);
        const seasons = (interaction.values || []).map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0);
        const portalUser = await member.findUserById(portalUserId);
        if (!portalUser || String(portalUser.discordId || '') !== String(interaction.user.id) || !member.isMemberAllowed(portalUser)) {
            await interaction.reply({ content: 'You are not allowed to complete this request.', ephemeral: true });
            return;
        }
        if (!seasons.length) {
            await interaction.reply({ content: 'Select at least one season.', ephemeral: true });
            return;
        }
        await interaction.deferUpdate();
        try {
            await submitRequest(interaction, config, { portalUser, mediaType, tmdbId, seasons });
        } catch (error) {
            log?.(`Discord season request failed: ${error.message}`);
            await interaction.editReply({ content: `Could not submit request: ${error.message}`, components: [], embeds: [] });
        }
    };

    const handleConfirmButton = async (interaction, config) => {
        const { parts } = parseCustomId(interaction.customId);
        const [portalUserId, mediaType, tmdbRaw, seasonToken] = parts;
        const tmdbId = Number(tmdbRaw);
        const portalUser = await member.findUserById(portalUserId);
        if (!portalUser || String(portalUser.discordId || '') !== String(interaction.user.id) || !member.isMemberAllowed(portalUser)) {
            await interaction.reply({ content: 'You are not allowed to complete this request.', ephemeral: true });
            return;
        }
        await interaction.deferUpdate();
        try {
            const seasons = mediaType === 'tv'
                ? (seasonToken === ALL_SEASONS || !seasonToken ? 'all' : seasonToken.split(',').map(Number).filter(Boolean))
                : [];
            await submitRequest(interaction, config, { portalUser, mediaType, tmdbId, seasons });
        } catch (error) {
            log?.(`Discord confirm request failed: ${error.message}`);
            await interaction.editReply({ content: `Could not submit request: ${error.message}`, components: [], embeds: [] });
        }
    };

    const handleCancelButton = async (interaction) => {
        await interaction.deferUpdate();
        await interaction.editReply({ content: 'Cancelled.', embeds: [], components: [] });
    };

    const handleMyRequestsCommand = async (interaction, config) => {
        const portalUser = await member.requirePortalMember(interaction);
        if (!portalUser) return;
        const requestAppService = await ensureReady(interaction, config);
        if (!requestAppService) return;
        const filter = String(interaction.options.getString('filter') || 'all');
        await interaction.deferReply({ ephemeral: true });
        try {
            const filters = filter === 'all' ? ['pending', 'processing', 'available'] : [filter];
            const pages = await Promise.all(filters.map((entry) => requestAppService.listRequests(config, {
                filter: entry,
                take: 20,
                skip: 0,
            }).catch(() => ({ results: [] }))));
            const sessionHint = String(portalUser.username || '').toLowerCase();
            const seen = new Set();
            const results = pages.flatMap((page) => (Array.isArray(page?.results) ? page.results : []))
                .filter((item) => {
                    const key = `${item.mediaType}:${item.tmdbId || item.id || item.title}`;
                    if (seen.has(key)) return false;
                    seen.add(key);
                    const requestedBy = String(item.requestedBy || item.userName || item.user?.displayName || item.user?.username || '').toLowerCase();
                    if (!sessionHint) return true;
                    return !requestedBy || requestedBy.includes(sessionHint) || sessionHint.includes(requestedBy);
                })
                .slice(0, 10);
            if (!results.length) {
                await interaction.editReply({ content: 'No matching requests found.' });
                return;
            }
            const cards = results.slice(0, 5).map((item) => ({
                ...item,
                overview: item.requestStatusLabel || item.mediaStatusLabel || statusHint(item),
            }));
            await interaction.editReply({
                content: `Your requests for **${member.displayName(portalUser)}** (showing ${Math.min(results.length, 5)} of ${results.length}):`,
                embeds: mediaGalleryEmbeds(cards, {
                    limit: 5,
                    compact: true,
                    footer: 'Full history is in the portal Requests tab',
                }),
            });
        } catch (error) {
            log?.(`Discord /myrequests failed: ${error.message}`);
            await interaction.editReply({ content: `Could not load requests: ${error.message}` });
        }
    };

    return {
        runSearch,
        handleRequestCommand,
        handleRequestSelect,
        handleSeasonSelect,
        handleConfirmButton,
        handleCancelButton,
        handleMyRequestsCommand,
        presentTitleActions,
        isRequestSelect: (customId) => String(customId || '').startsWith(`${SELECT}:`),
        isSeasonSelect: (customId) => String(customId || '').startsWith(`${SEASON}:`),
        isConfirmButton: (customId) => String(customId || '').startsWith(`${CONFIRM}:`),
        isCancelButton: (customId) => String(customId || '').startsWith(`${CANCEL}:`),
    };
};
