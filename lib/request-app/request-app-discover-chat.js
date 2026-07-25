import {
    createDiscordMediaAgent,
    isDiscordAgentReady,
    normalizeAgentHistory,
} from '../discord/discord-media-agent.js';

export const createRequestAppDiscoverChat = ({
    requestAppService,
    fetchImpl = fetch,
    log,
} = {}) => {
    const agent = createDiscordMediaAgent({
        fetchImpl,
        getRequestAppService: () => requestAppService,
        log,
    });

    const runDiscoverChat = async (config, { query, history = [] } = {}) => {
        if (!isDiscordAgentReady(config)) {
            return {
                ok: false,
                ready: false,
                answer: 'Media discovery chat needs Discord LLM settings (Settings → Discord) with the discovery agent enabled.',
                results: [],
            };
        }
        const message = String(query || '').trim();
        if (!message) {
            return { ok: false, ready: true, answer: 'Ask about a movie or show to get started.', results: [] };
        }
        const outcome = await agent.run(config, message, {
            history: normalizeAgentHistory(history),
        });
        return {
            ok: outcome?.ok !== false,
            ready: true,
            answer: String(outcome?.answer || '').trim() || 'No answer.',
            results: Array.isArray(outcome?.results) ? outcome.results : [],
        };
    };

    return {
        isReady: isDiscordAgentReady,
        runDiscoverChat,
    };
};
