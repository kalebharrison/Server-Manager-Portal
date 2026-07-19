import {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder,
} from 'discord.js';
import { createDiscordRequestHandlers } from './discord-bot-requests.js';

const buildCommands = () => ([
    new SlashCommandBuilder()
        .setName('request')
        .setDescription('Search and request media through the portal')
        .addStringOption((option) => option.setName('query').setDescription('Title to search').setRequired(true))
        .addStringOption((option) => option
            .setName('type')
            .setDescription('Movie or TV')
            .addChoices(
                { name: 'Movie', value: 'movie' },
                { name: 'TV', value: 'tv' },
                { name: 'All', value: 'all' },
            ))
        .toJSON(),
]);

export const createDiscordBotRuntime = ({
    loadFile,
    configPath,
    usersPath,
    getRequestAppService,
    log,
}) => {
    let client = null;
    let starting = null;
    let startedToken = '';
    let startedGuildId = '';

    const handlers = createDiscordRequestHandlers({
        loadFile,
        usersPath,
        getRequestAppService,
        log,
    });

    const stop = async () => {
        if (client) {
            try { client.destroy(); } catch { /* ignore */ }
            client = null;
        }
        startedToken = '';
        startedGuildId = '';
        starting = null;
    };

    const registerCommands = async (token, guildId, clientId) => {
        const rest = new REST({ version: '10' }).setToken(token);
        await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: buildCommands() });
    };

    const start = async (config = {}) => {
        const enabled = !!config.discordEnabled && !!config.discordBotEnabled;
        const token = String(config.discordBotToken || '').trim();
        const guildId = String(config.discordGuildId || '').trim();
        if (!enabled || !token || !guildId) {
            await stop();
            return { running: false };
        }
        if (client && startedToken === token && startedGuildId === guildId) {
            return { running: true };
        }
        if (starting) return starting;

        starting = (async () => {
            await stop();
            const next = new Client({ intents: [GatewayIntentBits.Guilds] });
            next.once('ready', async () => {
                try {
                    await registerCommands(token, guildId, next.user.id);
                    log?.(`Discord bot ready as ${next.user.tag}; commands registered for guild ${guildId}.`);
                } catch (error) {
                    log?.(`Discord command registration failed: ${error.message}`);
                }
            });
            next.on('interactionCreate', async (interaction) => {
                try {
                    const liveConfig = await loadFile(configPath, {});
                    if (interaction.isChatInputCommand() && interaction.commandName === 'request') {
                        await handlers.handleRequestCommand(interaction, liveConfig);
                        return;
                    }
                    if (interaction.isStringSelectMenu() && handlers.isRequestSelect(interaction.customId)) {
                        await handlers.handleRequestSelect(interaction, liveConfig);
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
            next.on('error', (error) => log?.(`Discord client error: ${error.message}`));
            await next.login(token);
            client = next;
            startedToken = token;
            startedGuildId = guildId;
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

    return {
        start,
        stop,
        syncFromConfig,
        isRunning: () => !!client,
    };
};
