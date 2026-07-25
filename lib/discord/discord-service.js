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
    appendAuditLog = async () => {},
    fetchImpl = fetch,
    log,
}) => {
    const notifier = createDiscordNotifier({ fetchImpl, log });
    const bot = createDiscordBotRuntime({
        loadFile,
        saveFile,
        configPath,
        usersPath,
        getRequestAppService,
        getPlexConnectionUri,
        getHealthData,
        getStatusConfig,
        appendAuditLog,
        fetchImpl,
        log,
    });

    return {
        notifier,
        bot,
        syncBot: (config) => bot.syncFromConfig(config),
        stopBot: () => bot.stop(),
    };
};
