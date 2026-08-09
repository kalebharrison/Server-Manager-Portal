import {
    Client,
    GatewayIntentBits,
    Partials,
    REST,
    Routes,
} from 'discord.js';
import { buildDiscordSlashCommands } from './discord-commands.js';
import { assertDiscordMemberChannelAccess } from './discord-channel-access.js';
import { createDiscordMemberResolver } from './discord-member.js';
import { createDiscordRequestHandlers } from './discord-bot-requests.js';
import { createDiscordIssueHandlers } from './discord-bot-issues.js';
import { createDiscordOpsHandlers } from './discord-bot-ops.js';
import { createDiscordNlParser } from './discord-nl.js';
import { createDiscordMediaAgent, isDiscordAgentReady, OUT_OF_SCOPE_ANSWER } from './discord-media-agent.js';
import { ensureDeferredReply } from './discord-interaction.js';

export const createDiscordBotRuntime = ({
    loadFile,
    saveFile,
    configPath,
    usersPath,
    getRequestAppService,
    getPlexConnectionUri = async () => null,
    getHealthData = () => ({}),
    getStatusConfig = () => ({}),
    resolveCurrentAdmin = async () => false,
    appendAuditLog = async () => {},
    fetchImpl = fetch,
    log,
}) => {
    let client = null;
    let starting = null;
    let startedToken = '';
    let startedGuildId = '';
    let startedMentionNl = false;
    let startedMemberChannelId = '';

    const member = createDiscordMemberResolver({
        loadFile,
        usersPath,
        configPath,
        resolveCurrentAdmin,
    });
    const requests = createDiscordRequestHandlers({ member, getRequestAppService, log });
    const issues = createDiscordIssueHandlers({
        member, loadFile, saveFile, appendAuditLog, log,
    });
    const ops = createDiscordOpsHandlers({
        member,
        getRequestAppService,
        presentTitleActions: (...args) => requests.presentTitleActions(...args),
        getPlexConnectionUri,
        getHealthData,
        getStatusConfig,
        fetchImpl,
        log,
    });
    const nl = createDiscordNlParser({ fetchImpl, log });
    const mediaAgent = createDiscordMediaAgent({ fetchImpl, getRequestAppService, log });

    const dispatchIntent = async (interaction, config, intentPayload) => {
        const { intent, params = {} } = intentPayload || {};
        switch (intent) {
        case 'agent.discover':
            await requests.runMediaAgent(interaction, config, {
                query: params.query || params.text || '',
                agent: mediaAgent,
            });
            return;
        case 'agent.out_of_scope':
            await interaction.editReply({ content: OUT_OF_SCOPE_ANSWER });
            return;
        case 'request.search':
            await requests.runSearch(interaction, config, {
                query: params.query,
                mediaType: params.mediaType || 'all',
            });
            return;
        case 'request.person':
            await requests.runPersonFilmography(interaction, config, {
                query: params.query,
                mediaType: params.mediaType || 'all',
                creditType: params.creditType || 'cast',
            });
            return;
        case 'request.discover_theme':
            await requests.runDiscoverTheme(interaction, config, {
                theme: params.theme,
                mediaType: params.mediaType || 'movie',
                recent: params.recent !== false,
            });
            return;
        case 'requests.list':
            // Fabricate options getter for shared handler
            interaction.options = {
                getString: (name) => (name === 'filter' ? (params.filter || 'all') : null),
            };
            await requests.handleMyRequestsCommand(interaction, config);
            return;
        case 'issue.list':
            interaction.options = {
                getSubcommand: () => 'list',
                getString: () => null,
            };
            await issues.handleIssueCommand(interaction);
            return;
        case 'issue.create':
            interaction.options = {
                getSubcommand: () => 'report',
                getString: (name) => {
                    if (name === 'title') return params.title || 'Issue';
                    if (name === 'details') return params.details || params.query || '';
                    if (name === 'type') return '4';
                    return null;
                },
            };
            await issues.handleIssueCommand(interaction);
            return;
        case 'stats.me':
            await ops.handleStatsCommand(interaction, config);
            return;
        case 'live.sessions':
            await ops.handleLiveCommand(interaction, config);
            return;
        case 'queue.list':
            await ops.handleQueueCommand(interaction, config);
            return;
        case 'status.summary':
            await ops.handleStatusCommand(interaction);
            return;
        case 'discover.trending':
            interaction.options = {
                getString: (name) => (name === 'category' ? (params.category || 'trending') : null),
            };
            await ops.handleDiscoverCommand(interaction, config);
            return;
        case 'help':
        default:
            await ops.handleHelpCommand(interaction);
        }
    };

    const stop = async () => {
        if (client) {
            try { client.destroy(); } catch { /* ignore */ }
            client = null;
        }
        startedToken = '';
        startedGuildId = '';
        startedMentionNl = false;
        startedMemberChannelId = '';
        starting = null;
    };

    const registerCommands = async (token, guildId, clientId) => {
        const rest = new REST({ version: '10' }).setToken(token);
        const body = buildDiscordSlashCommands();
        // Guild sync for instant in-server updates; global so DMs can see commands.
        await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body });
        await rest.put(Routes.applicationCommands(clientId), { body });
    };

    const gateDmAccess = async (interactionOrMessage, config, { isInteraction = true } = {}) => {
        const inGuild = !!(interactionOrMessage.guildId || interactionOrMessage.guild);
        const userId = interactionOrMessage.user?.id || interactionOrMessage.author?.id;
        const access = await assertDiscordMemberChannelAccess({
            client: interactionOrMessage.client,
            userId,
            guildId: config.discordGuildId,
            memberChannelId: config.discordMemberChannelId,
            inGuild,
        });
        if (access.ok) return true;
        if (isInteraction) {
            if (interactionOrMessage.deferred || interactionOrMessage.replied) {
                await interactionOrMessage.followUp({ content: access.message, ephemeral: true }).catch(() => {});
            } else {
                await interactionOrMessage.reply({ content: access.message, ephemeral: true }).catch(() => {});
            }
        } else {
            await interactionOrMessage.reply({ content: access.message }).catch(() => {});
        }
        return false;
    };

    const handleChatCommand = async (interaction, config) => {
        switch (interaction.commandName) {
        case 'request':
            return requests.handleRequestCommand(interaction, config);
        case 'myrequests':
            return requests.handleMyRequestsCommand(interaction, config);
        case 'issue':
            return issues.handleIssueCommand(interaction);
        case 'stats':
            return ops.handleStatsCommand(interaction, config);
        case 'live':
            return ops.handleLiveCommand(interaction, config);
        case 'queue':
            return ops.handleQueueCommand(interaction, config);
        case 'status':
            return ops.handleStatusCommand(interaction);
        case 'discover':
            return ops.handleDiscoverCommand(interaction, config);
        case 'ask': {
            await ensureDeferredReply(interaction);
            const text = interaction.options.getString('text');
            const intent = await nl.routeAskIntent(config, text, {
                agentReady: isDiscordAgentReady(config),
            });
            return dispatchIntent(interaction, config, intent);
        }
        case 'help':
            return ops.handleHelpCommand(interaction);
        default:
            return interaction.reply({ content: 'Unknown command.', ephemeral: true });
        }
    };

    const start = async (config = {}) => {
        const enabled = !!config.discordEnabled && !!config.discordBotEnabled;
        const token = String(config.discordBotToken || '').trim();
        const guildId = String(config.discordGuildId || '').trim();
        const mentionNl = !!config.discordLlmEnabled && !!config.discordMentionNl;
        const memberChannelId = String(config.discordMemberChannelId || '').trim();
        if (!enabled || !token || !guildId) {
            await stop();
            return { running: false };
        }
        if (
            client
            && startedToken === token
            && startedGuildId === guildId
            && startedMentionNl === mentionNl
            && startedMemberChannelId === memberChannelId
        ) {
            return { running: true };
        }
        if (starting) return starting;

        starting = (async () => {
            await stop();
            const intents = [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.DirectMessages,
                GatewayIntentBits.MessageContent,
            ];
            if (mentionNl) {
                intents.push(GatewayIntentBits.GuildMessages);
            }
            const next = new Client({
                intents,
                partials: [Partials.Channel],
            });
            next.once('ready', async () => {
                try {
                    await registerCommands(token, guildId, next.user.id);
                    log?.(`Discord bot ready as ${next.user.tag}; commands registered for guild ${guildId} (+ global/DM).`);
                } catch (error) {
                    log?.(`Discord command registration failed: ${error.message}`);
                }
            });
            next.on('interactionCreate', async (interaction) => {
                try {
                    const liveConfig = await loadFile(configPath, {});
                    if (!(await gateDmAccess(interaction, liveConfig, { isInteraction: true }))) {
                        return;
                    }
                    if (interaction.isChatInputCommand()) {
                        await handleChatCommand(interaction, liveConfig);
                        return;
                    }
                    if (interaction.isStringSelectMenu()) {
                        if (requests.isRequestSelect(interaction.customId)) {
                            await requests.handleRequestSelect(interaction, liveConfig);
                            return;
                        }
                        if (requests.isPersonSelect(interaction.customId)) {
                            await requests.handlePersonSelect(interaction, liveConfig);
                            return;
                        }
                        if (requests.isSeasonSelect(interaction.customId)) {
                            await requests.handleSeasonSelect(interaction, liveConfig);
                            return;
                        }
                    }
                    if (interaction.isButton()) {
                        if (ops.isDiscoverPage(interaction.customId)) {
                            await ops.handleDiscoverPage(interaction, liveConfig);
                            return;
                        }
                        if (ops.isDiscoverPick(interaction.customId)) {
                            await ops.handleDiscoverPick(interaction, liveConfig);
                            return;
                        }
                        if (requests.isConfirmButton(interaction.customId)) {
                            await requests.handleConfirmButton(interaction, liveConfig);
                            return;
                        }
                        if (requests.isCancelButton(interaction.customId)) {
                            await requests.handleCancelButton(interaction);
                        }
                    }
                } catch (error) {
                    log?.(`Discord interaction failed: ${error.message}`);
                    if (interaction.deferred || interaction.replied) {
                        await interaction.followUp({ content: 'Something went wrong handling that Discord action.', ephemeral: true }).catch(() => {});
                    } else {
                        await interaction.reply({ content: 'Something went wrong handling that Discord action.', ephemeral: true }).catch(() => {});
                    }
                }
            });
            next.on('messageCreate', async (message) => {
                try {
                    if (message.author?.bot) return;
                    const isDm = !message.guildId;
                    const mentioned = !!(next.user && message.mentions?.has(next.user));
                    if (!isDm) {
                        if (!mentionNl || !mentioned) return;
                        if (String(message.guildId || '') !== guildId) return;
                    }

                    const liveConfig = await loadFile(configPath, {});
                    if (!(await gateDmAccess(message, liveConfig, { isInteraction: false }))) {
                        return;
                    }
                    if (isDm && !liveConfig.discordLlmEnabled) {
                        if (!String(message.content || '').trim()) return;
                        await message.reply({ content: 'Use slash commands in this DM (for example `/help`).' });
                        return;
                    }

                    let text = String(message.content || '').trim();
                    if (mentioned && next.user) {
                        text = text.replace(new RegExp(`<@!?${next.user.id}>`, 'g'), '').trim();
                    }
                    if (!text) {
                        await message.reply({ content: 'Ask me something, or try `/help`.' });
                        return;
                    }
                    const bridge = {
                        user: message.author,
                        deferred: false,
                        replied: false,
                        options: { getString: () => null, getSubcommand: () => 'list' },
                        reply: async (payload) => {
                            bridge.replied = true;
                            return message.reply({
                                content: payload.content,
                                embeds: payload.embeds,
                                components: payload.components,
                                allowedMentions: { repliedUser: false },
                            });
                        },
                        deferReply: async () => {
                            bridge.deferred = true;
                            await message.channel.sendTyping().catch(() => {});
                        },
                        editReply: async (payload) => message.reply({
                            content: payload.content,
                            embeds: payload.embeds,
                            components: payload.components,
                            allowedMentions: { repliedUser: false },
                        }),
                        followUp: async (payload) => message.reply({
                            content: payload.content,
                            embeds: payload.embeds,
                            allowedMentions: { repliedUser: false },
                        }),
                    };
                    await bridge.deferReply();
                    const intent = await nl.routeAskIntent(liveConfig, text, {
                        agentReady: isDiscordAgentReady(liveConfig),
                    });
                    await dispatchIntent(bridge, liveConfig, intent);
                } catch (error) {
                    log?.(`Discord message NL failed: ${error.message}`);
                }
            });
            next.on('error', (error) => log?.(`Discord client error: ${error.message}`));
            await next.login(token);
            client = next;
            startedToken = token;
            startedGuildId = guildId;
            startedMentionNl = mentionNl;
            startedMemberChannelId = memberChannelId;
            return { running: true };
        })().finally(() => { starting = null; });

        return starting;
    };

    const syncFromConfig = async (config) => {
        try {
            return await start(config);
        } catch (error) {
            log?.(`Discord bot failed to start: ${error.message}`);
            await stop();
            return { running: false, error: error.message };
        }
    };

    const sendChannelMessage = async (_config = {}, channelId, payload = {}) => {
        if (!client) return false;
        const id = String(channelId || '').trim();
        if (!/^\d{5,32}$/.test(id)) return false;
        const content = payload?.content ? String(payload.content).slice(0, 1900) : '';
        const embeds = Array.isArray(payload?.embeds) ? payload.embeds.slice(0, 10) : [];
        if (!content && !embeds.length) return false;
        try {
            const channel = await client.channels.fetch(id);
            if (!channel || typeof channel.send !== 'function') return false;
            await channel.send({
                ...(content ? { content } : {}),
                ...(embeds.length ? { embeds } : {}),
            });
            return true;
        } catch (error) {
            log?.(`[Discord] channel post failed: ${error.message}`);
            return false;
        }
    };

    const sendMemberDm = async (config = {}, discordUserId, payload = {}) => {
        if (!client) return false;
        const discordId = String(discordUserId || '').trim();
        if (!/^\d{5,32}$/.test(discordId)) return false;
        const access = await assertDiscordMemberChannelAccess({
            client,
            userId: discordId,
            guildId: String(config.discordGuildId || startedGuildId || '').trim(),
            memberChannelId: String(config.discordMemberChannelId || startedMemberChannelId || '').trim(),
            inGuild: false,
        });
        if (!access.ok) {
            log?.(`[Discord] member DM skipped: ${access.message}`);
            return false;
        }
        try {
            const user = await client.users.fetch(discordId);
            const embed = {
                title: String(payload.title || 'Portal').slice(0, 256),
                description: String(payload.description || '').slice(0, 4000),
                color: Number.isFinite(Number(payload.color)) ? Number(payload.color) : 0xe5a00d,
            };
            if (Array.isArray(payload.fields) && payload.fields.length) {
                embed.fields = payload.fields.slice(0, 25).map((field) => ({
                    name: String(field.name || '').slice(0, 256),
                    value: String(field.value || '').slice(0, 1024),
                    inline: !!field.inline,
                }));
            }
            await user.send({ embeds: [embed] });
            return true;
        } catch (error) {
            log?.(`[Discord] member DM failed: ${error.message}`);
            return false;
        }
    };

    return {
        start,
        stop,
        syncFromConfig,
        isRunning: () => !!client,
        sendMemberDm,
        sendChannelMessage,
    };
};
