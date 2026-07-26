import {
    createDiscordMediaAgent,
    isDiscordAgentReady,
    normalizeAgentHistory,
    OUT_OF_SCOPE_ANSWER,
} from '../discord/discord-media-agent.js';
import { createDiscordNlParser, OPS_INTENTS } from '../discord/discord-nl.js';
import { createRequestAppChatOps } from './request-app-chat-ops.js';

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
    const nl = createDiscordNlParser({ fetchImpl, log });
    const ops = createRequestAppChatOps({ requestAppService, log });

    const runDiscoverChat = async (config, { query, history = [], sessionUser = null } = {}) => {
        if (!isDiscordAgentReady(config)) {
            return {
                ok: false,
                ready: false,
                answer: 'Ask Requesty needs Discord LLM settings (Settings → Discord) with the discovery agent enabled.',
                results: [],
            };
        }
        const message = String(query || '').trim();
        if (!message) {
            return {
                ok: false,
                ready: true,
                answer: 'Ask about a movie/show, your stats, the download queue, or say help.',
                results: [],
            };
        }

        const intentPayload = await nl.routeAskIntent(config, message, {
            agentReady: isDiscordAgentReady(config),
        });
        const intent = intentPayload?.intent || 'agent.discover';

        if (intent === 'agent.out_of_scope') {
            return { ok: true, ready: true, answer: OUT_OF_SCOPE_ANSWER, results: [] };
        }

        if (OPS_INTENTS.has(intent)) {
            const opsOutcome = await ops.runOpsIntent(config, intentPayload, { sessionUser });
            if (opsOutcome) {
                return {
                    ok: opsOutcome.ok !== false,
                    ready: true,
                    answer: String(opsOutcome.answer || '').trim() || 'No answer.',
                    results: Array.isArray(opsOutcome.results) ? opsOutcome.results : [],
                    intent,
                };
            }
        }

        // Media discovery (and person/theme intents that still use the agent tools).
        const discoverQuery = intent === 'agent.discover'
            ? String(intentPayload?.params?.query || message)
            : message;
        const outcome = await agent.run(config, discoverQuery, {
            history: normalizeAgentHistory(history),
        });
        return {
            ok: outcome?.ok !== false,
            ready: true,
            answer: String(outcome?.answer || '').trim() || 'No answer.',
            results: Array.isArray(outcome?.results) ? outcome.results : [],
            intent: 'agent.discover',
        };
    };

    return {
        isReady: isDiscordAgentReady,
        runDiscoverChat,
    };
};
