import {
    ActionRowBuilder,
    StringSelectMenuBuilder,
} from 'discord.js';
import { getDaysUntilExpiry } from '../core/date-utils.js';

const ACTIVE_SELECT = 'discord-request-select';

const isMemberAllowed = (user) => {
    if (!user) return false;
    if (user.plexAccessStatus === 'revoked') return false;
    const days = getDaysUntilExpiry(user.expiryDate);
    if (days !== null && days < 0) return false;
    return true;
};

export const createDiscordRequestHandlers = ({
    loadFile,
    usersPath,
    getRequestAppService,
    log,
}) => {
    const requestApp = () => (typeof getRequestAppService === 'function' ? getRequestAppService() : null);

    const findUserByDiscordId = async (discordId) => {
        const users = await loadFile(usersPath, []);
        return users.find((user) => String(user.discordId || '') === String(discordId)) || null;
    };

    const handleRequestCommand = async (interaction, config) => {
        const requestAppService = requestApp();
        const gate = requestAppService?.getRequestAppGate?.(config);
        if (!gate?.ready) {
            await interaction.reply({ content: 'Requests are not configured on this portal yet.', ephemeral: true });
            return;
        }

        const portalUser = await findUserByDiscordId(interaction.user.id);
        if (!portalUser || !isMemberAllowed(portalUser)) {
            await interaction.reply({
                content: 'Link your Discord user ID under **Preferences** in the portal (Developer Mode → Copy User ID), and make sure your membership is active.',
                ephemeral: true,
            });
            return;
        }

        const query = String(interaction.options.getString('query') || '').trim();
        const mediaType = String(interaction.options.getString('type') || 'movie');
        if (query.length < 2) {
            await interaction.reply({ content: 'Search query is too short.', ephemeral: true });
            return;
        }

        await interaction.deferReply({ ephemeral: true });
        try {
            const page = await requestAppService.search(config, {
                query,
                mediaType,
                page: 1,
            });
            const results = (Array.isArray(page?.results) ? page.results : [])
                .filter((item) => item?.tmdbId && item?.canRequest !== false)
                .filter((item) => mediaType === 'all' || item.mediaType === mediaType)
                .slice(0, 10);
            if (!results.length) {
                await interaction.editReply({ content: `No requestable results for “${query}”.` });
                return;
            }

            const menu = new StringSelectMenuBuilder()
                .setCustomId(`${ACTIVE_SELECT}:${portalUser.id}`)
                .setPlaceholder('Pick a title to request')
                .addOptions(results.map((item) => ({
                    label: String(item.title || 'Untitled').slice(0, 100),
                    description: [item.year, item.mediaType].filter(Boolean).join(' · ').slice(0, 100) || 'Request',
                    value: `${item.mediaType}:${item.tmdbId}`,
                })));

            await interaction.editReply({
                content: `Select a title to request as **${portalUser.username || portalUser.displayName || 'member'}**:`,
                components: [new ActionRowBuilder().addComponents(menu)],
            });
        } catch (error) {
            log?.(`Discord /request search failed: ${error.message}`);
            await interaction.editReply({ content: `Search failed: ${error.message}` });
        }
    };

    const handleRequestSelect = async (interaction, config) => {
        const [, portalUserId] = String(interaction.customId || '').split(':');
        const [mediaType, tmdbRaw] = String(interaction.values?.[0] || '').split(':');
        const tmdbId = Number(tmdbRaw);
        if (!tmdbId || !portalUserId || !['movie', 'tv'].includes(mediaType)) {
            await interaction.reply({ content: 'Invalid selection.', ephemeral: true });
            return;
        }

        const users = await loadFile(usersPath, []);
        const portalUser = users.find((user) => String(user.id) === String(portalUserId)) || null;
        if (!portalUser || String(portalUser.discordId || '') !== String(interaction.user.id) || !isMemberAllowed(portalUser)) {
            await interaction.reply({ content: 'You are not allowed to complete this request.', ephemeral: true });
            return;
        }

        await interaction.deferUpdate();
        try {
            const requestAppService = requestApp();
            if (!requestAppService) throw new Error('Request service is unavailable.');
            const sessionUser = {
                id: portalUser.id,
                username: portalUser.username,
                email: portalUser.email,
                plexId: portalUser.plexId,
                jellyfinId: portalUser.jellyfinId,
                isAdmin: false,
            };
            let seasons = [];
            if (mediaType === 'tv') {
                const details = await requestAppService.getMediaDetails(config, { mediaType, tmdbId });
                const available = Array.isArray(details?.seasons)
                    ? details.seasons.map((season) => Number(season.seasonNumber ?? season)).filter((n) => Number.isFinite(n) && n >= 0)
                    : [];
                seasons = available.length ? available.filter((n) => n > 0) : [];
                if (!seasons.length) seasons = [1];
            }
            await requestAppService.requestMedia(config, {
                mediaType,
                tmdbId,
                seasons,
                sessionUser,
            });
            const title = String(interaction.component?.options?.find((opt) => opt.value === `${mediaType}:${tmdbId}`)?.label || tmdbId);
            await interaction.editReply({
                content: `Request submitted for **${title}**. Check the portal Requests tab for status.`,
                components: [],
            });
        } catch (error) {
            log?.(`Discord request submit failed: ${error.message}`);
            await interaction.editReply({
                content: `Could not submit request: ${error.message}`,
                components: [],
            });
        }
    };

    return {
        handleRequestCommand,
        handleRequestSelect,
        isRequestSelect: (customId) => String(customId || '').startsWith(`${ACTIVE_SELECT}:`),
    };
};
