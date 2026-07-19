import { createDiscordNotifier } from './discord-notify.js';
import { createDiscordBotRuntime } from './discord-bot.js';

export const createDiscordService = ({
    loadFile,
    configPath,
    usersPath,
    getRequestAppService,
    fetchImpl = fetch,
    log,
}) => {
    const notifier = createDiscordNotifier({ fetchImpl, log });
    const bot = createDiscordBotRuntime({
        loadFile,
        configPath,
        usersPath,
        getRequestAppService,
        log,
    });

    return {
        notifier,
        bot,
        syncBot: (config) => bot.syncFromConfig(config),
        stopBot: () => bot.stop(),
    };
};
