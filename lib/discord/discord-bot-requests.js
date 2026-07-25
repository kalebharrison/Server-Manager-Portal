import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
} from 'discord.js';
import { mediaEmbed, mediaGalleryEmbeds, mediaTypeLabel, parseCustomId, truncate } from './discord-embeds.js';
import { ensureDeferredReply, replyOrEdit } from './discord-interaction.js';
import { isPersonFilmographyQuery, normalizeDiscordSearchQuery, normalizePersonQuery } from './discord-nl.js';

const SELECT = 'dreq-select';
const PERSON_SELECT = 'dperson-select';
const SEASON = 'dreq-season';
const CONFIRM = 'dreq-confirm';
const CANCEL = 'dreq-cancel';
const FILMO_PICK = 'ddisc-pick';
const ALL_SEASONS = 'all';
const FILMOGRAPHY_LIMIT = 5;

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

    const buildFilmographyGallery = (portalUser, person, results) => {
        const embeds = mediaGalleryEmbeds(results, {
            limit: FILMOGRAPHY_LIMIT,
            compact: true,
            footer: `${person.name} · latest credits · tap a number to request`,
        });
        const pickRow = new ActionRowBuilder().addComponents(results.map((item, index) => new ButtonBuilder()
            .setCustomId(`${FILMO_PICK}:${portalUser.id}:${item.mediaType}:${item.tmdbId}`)
            .setLabel(truncate(`${index + 1}. ${(item.title || 'Title').slice(0, 60)}`, 80))
            .setStyle(ButtonStyle.Primary)));
        return {
            content: `Latest titles for **${person.name}** as **${member.displayName(portalUser)}** — pick one to request:`,
            embeds,
            components: [pickRow],
        };
    };

    const buildThemeDiscoverGallery = (portalUser, theme, results) => {
        const embeds = mediaGalleryEmbeds(results, {
            limit: FILMOGRAPHY_LIMIT,
            compact: true,
            footer: `${theme} · newest first · tap a number to request`,
        });
        const pickRow = new ActionRowBuilder().addComponents(results.map((item, index) => new ButtonBuilder()
            .setCustomId(`${FILMO_PICK}:${portalUser.id}:${item.mediaType}:${item.tmdbId}`)
            .setLabel(truncate(`${index + 1}. ${(item.title || 'Title').slice(0, 60)}`, 80))
            .setStyle(ButtonStyle.Primary)));
        return {
            content: `Latest **${theme}** titles for **${member.displayName(portalUser)}** — pick one to request:`,
            embeds,
            components: [pickRow],
        };
    };

    const buildAgentGallery = (portalUser, answer, results) => {
        const embeds = mediaGalleryEmbeds(results, {
            limit: FILMOGRAPHY_LIMIT,
            compact: true,
            footer: 'Media agent · tap a number to request',
        });
        const pickRow = results.length
            ? new ActionRowBuilder().addComponents(results.map((item, index) => new ButtonBuilder()
                .setCustomId(`${FILMO_PICK}:${portalUser.id}:${item.mediaType}:${item.tmdbId}`)
                .setLabel(truncate(`${index + 1}. ${(item.title || 'Title').slice(0, 60)}`, 80))
                .setStyle(ButtonStyle.Primary)))
            : null;
        return {
            content: truncate(answer || 'Here are some titles that may match.', 1900),
            embeds,
            components: pickRow ? [pickRow] : [],
        };
    };

    const runMediaAgent = async (interaction, config, { query, agent }) => {
        await ensureDeferredReply(interaction);
        const portalUser = await member.requirePortalMember(interaction);
        if (!portalUser) return;
        const requestAppService = await ensureReady(interaction, config);
        if (!requestAppService) return;
        if (!agent?.run) {
            await interaction.editReply({ content: 'Media agent is not available.' });
            return;
        }
        try {
            const outcome = await agent.run(config, query);
            const results = (Array.isArray(outcome?.results) ? outcome.results : [])
                .filter((item) => item?.tmdbId && item?.mediaType)
                .slice(0, FILMOGRAPHY_LIMIT);
            const payload = buildAgentGallery(portalUser, outcome?.answer || 'No answer.', results);
            await interaction.editReply(payload);
        } catch (error) {
            log?.(`Discord media agent failed: ${error.message}`);
            await interaction.editReply({ content: `Discovery failed: ${error.message}` });
        }
    };

    const presentPersonFilmography = async (interaction, config, {
        portalUser, personId, personName, mediaType = 'all', creditType = 'cast',
    }) => {
        const requestAppService = await ensureReady(interaction, config);
        if (!requestAppService) return;

        const filmography = await requestAppService.getPersonFilmography(config, {
            personId,
            mediaType,
            creditType,
            limit: FILMOGRAPHY_LIMIT,
        });
        const person = filmography.person || { personId, name: personName || 'Unknown' };
        const results = (Array.isArray(filmography.results) ? filmography.results : [])
            .filter((item) => item?.tmdbId && item?.mediaType);
        if (!results.length) {
            await interaction.editReply({
                content: `No recent ${mediaType === 'all' ? 'titles' : `${mediaType}s`} found for **${person.name}**.`,
                embeds: [],
                components: [],
            });
            return;
        }
        await interaction.editReply(buildFilmographyGallery(portalUser, person, results));
    };

    const resolvePersonMatches = async (config, rawQuery) => {
        const q = normalizePersonQuery(rawQuery);
        const peoplePage = await requestApp().searchPeople(config, { query: q, page: 1 });
        return {
            query: q,
            people: (Array.isArray(peoplePage?.results) ? peoplePage.results : []).filter((item) => item?.personId),
        };
    };

    const presentPersonFilmographyFromQuery = async (interaction, config, {
        portalUser, rawQuery, mediaType = 'all', creditType = 'cast',
    }) => {
        const requestAppService = await ensureReady(interaction, config);
        if (!requestAppService) return;
        const { query, people } = await resolvePersonMatches(config, rawQuery);
        if (!people.length) {
            await interaction.editReply({ content: `No person found for “${rawQuery}”.` });
            return;
        }
        if (people.length === 1) {
            await presentPersonFilmography(interaction, config, {
                portalUser,
                personId: people[0].personId,
                personName: people[0].name,
                mediaType,
                creditType,
            });
            return;
        }
        const menu = new StringSelectMenuBuilder()
            .setCustomId(`${PERSON_SELECT}:${portalUser.id}:${mediaType}:${creditType}`)
            .setPlaceholder('Pick the person you meant')
            .addOptions(people.slice(0, 10).map((item) => ({
                label: truncate(item.name || 'Unknown', 100),
                description: truncate(item.knownFor?.length ? `Known for ${item.knownFor.join(', ')}` : 'Select this person', 100),
                value: String(item.personId),
            })));
        await interaction.editReply({
            content: `Multiple people match “${query || rawQuery}”. Choose one as **${member.displayName(portalUser)}**:`,
            embeds: [],
            components: [new ActionRowBuilder().addComponents(menu)],
        });
    };

    const runPersonFilmography = async (interaction, config, {
        query, mediaType = 'all', creditType = 'cast',
    }) => {
        const portalUser = await member.requirePortalMember(interaction);
        if (!portalUser) return;
        const requestAppService = await ensureReady(interaction, config);
        if (!requestAppService) return;

        const rawQuery = String(query || '').trim();
        const q = normalizePersonQuery(rawQuery);
        if (q.length < 2) {
            await replyOrEdit(interaction, { content: 'Person name is too short.', ephemeral: true });
            return;
        }

        await ensureDeferredReply(interaction);
        try {
            await presentPersonFilmographyFromQuery(interaction, config, {
                portalUser,
                rawQuery,
                mediaType: String(mediaType || 'all'),
                creditType: ['cast', 'crew', 'all'].includes(String(creditType || '').toLowerCase())
                    ? String(creditType).toLowerCase()
                    : 'cast',
            });
        } catch (error) {
            log?.(`Discord person filmography failed: ${error.message}`);
            await interaction.editReply({ content: `Person search failed: ${error.message}` });
        }
    };

    const runDiscoverTheme = async (interaction, config, {
        theme, mediaType = 'movie', recent = true,
    }) => {
        const portalUser = await member.requirePortalMember(interaction);
        if (!portalUser) return;
        const requestAppService = await ensureReady(interaction, config);
        if (!requestAppService) return;

        const rawTheme = String(theme || '').trim();
        if (rawTheme.length < 2) {
            await replyOrEdit(interaction, { content: 'Theme is too short.', ephemeral: true });
            return;
        }

        await ensureDeferredReply(interaction);
        try {
            const payload = await requestAppService.discoverByTheme(config, {
                theme: rawTheme,
                mediaType: String(mediaType || 'movie'),
                recent: recent !== false,
                limit: FILMOGRAPHY_LIMIT,
            });
            const results = (Array.isArray(payload?.results) ? payload.results : [])
                .filter((item) => item?.tmdbId && item?.mediaType);
            const label = payload?.theme || rawTheme;
            if (!results.length) {
                await interaction.editReply({
                    content: `No recent ${mediaType === 'all' ? 'titles' : `${mediaType}s`} found for **${label}**.`,
                    embeds: [],
                    components: [],
                });
                return;
            }
            await interaction.editReply(buildThemeDiscoverGallery(portalUser, label, results));
        } catch (error) {
            log?.(`Discord theme discover failed: ${error.message}`);
            await interaction.editReply({ content: `Theme discovery failed: ${error.message}` });
        }
    };

    const runSearch = async (interaction, config, { query, mediaType = 'all' }) => {
        const portalUser = await member.requirePortalMember(interaction);
        if (!portalUser) return;
        const requestAppService = await ensureReady(interaction, config);
        if (!requestAppService) return;

        const rawQuery = String(query || '').trim();
        const q = normalizeDiscordSearchQuery(rawQuery);
        const type = String(mediaType || 'all');
        if (q.length < 2) {
            await replyOrEdit(interaction, { content: 'Search query is too short.', ephemeral: true });
            return;
        }

        await ensureDeferredReply(interaction);
        try {
            const filterResults = (page, mediaFilter = type) => (Array.isArray(page?.results) ? page.results : [])
                .filter((item) => item?.tmdbId)
                .filter((item) => mediaFilter === 'all' || item.mediaType === mediaFilter)
                .slice(0, 10);

            let page = await requestAppService.search(config, { query: q, mediaType: type, page: 1 });
            let results = filterResults(page);
            if (!results.length && type !== 'all') {
                page = await requestAppService.search(config, { query: q, mediaType: 'all', page: 1 });
                results = filterResults(page, type);
            }
            if (!results.length && isPersonFilmographyQuery(rawQuery)) {
                await presentPersonFilmographyFromQuery(interaction, config, {
                    portalUser,
                    rawQuery,
                    mediaType: type,
                    creditType: 'cast',
                });
                return;
            }
            if (!results.length) {
                await interaction.editReply({ content: `No results for “${rawQuery}”.` });
                return;
            }

            const menu = new StringSelectMenuBuilder()
                .setCustomId(`${SELECT}:${portalUser.id}`)
                .setPlaceholder('Pick a title from the posters below')
                .addOptions(results.map((item) => ({
                    label: truncate(item.title || 'Untitled', 100),
                    description: truncate([item.year, mediaTypeLabel(item.mediaType), item.canRequest === false ? statusHint(item) : 'Requestable'].filter(Boolean).join(' · '), 100),
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

    const handlePersonSelect = async (interaction, config) => {
        const { parts } = parseCustomId(interaction.customId);
        const [portalUserId, mediaType, creditType] = parts;
        const personId = Number(interaction.values?.[0]);
        if (!personId || !portalUserId) {
            await interaction.reply({ content: 'Invalid person selection.', ephemeral: true });
            return;
        }
        const portalUser = await member.findUserById(portalUserId);
        if (!portalUser || String(portalUser.discordId || '') !== String(interaction.user.id) || !member.isMemberAllowed(portalUser)) {
            await interaction.reply({ content: 'You are not allowed to complete this request.', ephemeral: true });
            return;
        }
        await interaction.deferUpdate();
        try {
            await presentPersonFilmography(interaction, config, {
                portalUser,
                personId,
                mediaType: mediaType || 'all',
                creditType: creditType || 'cast',
            });
        } catch (error) {
            log?.(`Discord person select failed: ${error.message}`);
            await interaction.editReply({ content: `Could not load filmography: ${error.message}`, components: [], embeds: [] });
        }
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
        await ensureDeferredReply(interaction);
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
        runPersonFilmography,
        runDiscoverTheme,
        runMediaAgent,
        handleRequestCommand,
        handleRequestSelect,
        handlePersonSelect,
        handleSeasonSelect,
        handleConfirmButton,
        handleCancelButton,
        handleMyRequestsCommand,
        presentTitleActions,
        isRequestSelect: (customId) => String(customId || '').startsWith(`${SELECT}:`),
        isPersonSelect: (customId) => String(customId || '').startsWith(`${PERSON_SELECT}:`),
        isSeasonSelect: (customId) => String(customId || '').startsWith(`${SEASON}:`),
        isConfirmButton: (customId) => String(customId || '').startsWith(`${CONFIRM}:`),
        isCancelButton: (customId) => String(customId || '').startsWith(`${CANCEL}:`),
    };
};
