import { createDiscordNotifier } from './discord-notify.js';
import { createDiscordBotRuntime } from './discord-bot.js';

export const createDiscordService = ({
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
    const bot = createDiscordBotRuntime({
        loadFile,
        saveFile,
        configPath,
        usersPath,
        getRequestAppService,
        getPlexConnectionUri,
        getHealthData,
        getStatusConfig,
        resolveCurrentAdmin,
        appendAuditLog,
        fetchImpl,
        log,
    });
    const notifier = createDiscordNotifier({
        fetchImpl,
        log,
        sendMemberDm: (config, discordId, payload) => bot.sendMemberDm(config, discordId, payload),
    });

    return {
        notifier,
        bot,
        syncBot: (config) => bot.syncFromConfig(config),
        stopBot: () => bot.stop(),
    };
};
