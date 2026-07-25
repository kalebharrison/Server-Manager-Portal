import { createSearxngClient } from './discord-searxng.js';

const MAX_ROUNDS = 6;
const MAX_CANDIDATES = 5;
const AGENT_LIMIT = 8;

const TOOLS = [
    {
        type: 'function',
        function: {
            name: 'web_search',
            description: 'Search the web for movie/TV recommendations, plot facts, or title identification. Use this before Seerr for multi-constraint or “what’s that film” questions.',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Search query' },
                },
                required: ['query'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'search_titles',
            description: 'Search the media server catalog (Seerr/TMDB) by title or person name. Returns requestable titles with availability.',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string' },
                    mediaType: { type: 'string', enum: ['movie', 'tv', 'all'] },
                },
                required: ['query'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'person_filmography',
            description: 'Resolve an actor/director and list their newest credits from TMDB via Seerr.',
            parameters: {
                type: 'object',
                properties: {
                    name: { type: 'string' },
                    mediaType: { type: 'string', enum: ['movie', 'tv', 'all'] },
                    creditType: { type: 'string', enum: ['cast', 'crew'] },
                },
                required: ['name'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'lookup_title',
            description: 'Load one title by TMDB id with availability / requestable state.',
            parameters: {
                type: 'object',
                properties: {
                    mediaType: { type: 'string', enum: ['movie', 'tv'] },
                    tmdbId: { type: 'integer' },
                },
                required: ['mediaType', 'tmdbId'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'finish',
            description: 'End the turn with a short answer for Discord and optional title candidates to show with request buttons.',
            parameters: {
                type: 'object',
                properties: {
                    answer: { type: 'string', description: 'Short helpful reply for the user' },
                    candidates: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                mediaType: { type: 'string', enum: ['movie', 'tv'] },
                                tmdbId: { type: 'integer' },
                                title: { type: 'string' },
                                year: { type: 'string' },
                            },
                            required: ['mediaType', 'tmdbId'],
                        },
                    },
                },
                required: ['answer'],
            },
        },
    },
];

const SYSTEM_PROMPT = [
    'You are Requesty, a helpful media discovery butler for a private Plex/Seerr Discord server.',
    'Use tools. Do not invent titles or TMDB ids.',
    'For plot/setting/theme questions (e.g. zombie movie set in a casino), call web_search first, identify real titles from results, then search_titles or lookup_title to resolve them on Seerr.',
    'For actor/director filmography, use person_filmography.',
    'For simple known titles (e.g. Dune), search_titles is enough.',
    'Always finish with the finish tool: a concise answer plus up to 5 candidates that you verified via Seerr tools.',
    'Mention which are already available vs requestable when you know.',
].join(' ');

const summarizeItem = (item) => ({
    mediaType: item.mediaType,
    tmdbId: item.tmdbId,
    title: item.title || item.name || '',
    year: item.year || item.releaseDate || item.firstAirDate || '',
    available: !!item.available,
    requested: !!(item.requested || item.pending || item.approved),
    canRequest: item.canRequest !== false && !item.available && !(item.requested || item.pending),
    status: item.available
        ? 'available'
        : (item.processing ? 'processing' : (item.requested || item.pending ? 'requested' : 'requestable')),
});

export const isDiscordAgentReady = (config = {}) => {
    if (config.discordAgentEnabled === false || config.discordAgentEnabled === 'false') return false;
    if (!config.discordLlmEnabled) return false;
    const llmUrl = String(config.discordLlmUrl || '').trim();
    const apiKey = String(config.discordLlmApiKey || '').trim();
    const searx = String(config.discordSearxngUrl || '').trim();
    return !!(llmUrl && apiKey && searx);
};

export const createDiscordMediaAgent = ({
    fetchImpl = fetch,
    getRequestAppService,
    log,
} = {}) => {
    const searx = createSearxngClient({ fetchImpl, log });

    const runTool = async (config, name, args = {}) => {
        const requestAppService = typeof getRequestAppService === 'function' ? getRequestAppService() : null;
        if (name === 'web_search') {
            const results = await searx.search(config.discordSearxngUrl, args.query, { limit: AGENT_LIMIT });
            return { results };
        }
        if (!requestAppService) {
            return { error: 'Request app is not configured.' };
        }
        if (name === 'search_titles') {
            const mediaType = ['movie', 'tv'].includes(args.mediaType) ? args.mediaType : 'all';
            const page = await requestAppService.search(config, {
                query: String(args.query || '').trim(),
                mediaType,
                page: 1,
            });
            const results = (Array.isArray(page?.results) ? page.results : [])
                .filter((item) => item?.tmdbId && (item.mediaType === 'movie' || item.mediaType === 'tv'))
                .slice(0, AGENT_LIMIT)
                .map(summarizeItem);
            return { results };
        }
        if (name === 'person_filmography') {
            const people = await requestAppService.searchPeople(config, {
                query: String(args.name || '').trim(),
                page: 1,
            });
            const person = (Array.isArray(people?.results) ? people.results : [])[0];
            if (!person?.personId && !person?.id) {
                return { results: [], person: null, error: 'Person not found' };
            }
            const personId = person.personId || person.id;
            const filmography = await requestAppService.getPersonFilmography(config, {
                personId,
                mediaType: ['movie', 'tv'].includes(args.mediaType) ? args.mediaType : 'all',
                creditType: args.creditType === 'crew' ? 'crew' : 'cast',
                limit: MAX_CANDIDATES,
            });
            return {
                person: { personId, name: filmography.person?.name || person.name || args.name },
                results: (Array.isArray(filmography.results) ? filmography.results : [])
                    .filter((item) => item?.tmdbId)
                    .slice(0, MAX_CANDIDATES)
                    .map(summarizeItem),
            };
        }
        if (name === 'lookup_title') {
            const mediaType = args.mediaType === 'tv' ? 'tv' : 'movie';
            const tmdbId = Number(args.tmdbId);
            if (!Number.isFinite(tmdbId)) return { error: 'Invalid tmdbId' };
            const detail = await requestAppService.getMediaDetails(config, { mediaType, tmdbId });
            if (!detail) return { error: 'Title not found' };
            return { result: summarizeItem(detail) };
        }
        if (name === 'finish') {
            return { finished: true, answer: String(args.answer || '').trim(), candidates: args.candidates || [] };
        }
        return { error: `Unknown tool: ${name}` };
    };

    const chat = async (config, messages) => {
        const baseUrl = String(config.discordLlmUrl || '').replace(/\/$/, '');
        const apiKey = String(config.discordLlmApiKey || '').trim();
        const model = String(config.discordLlmModel || 'gpt-4o-mini').trim();
        const response = await fetchImpl(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                temperature: 0.2,
                messages,
                tools: TOOLS,
                tool_choice: 'auto',
            }),
        });
        if (!response.ok) {
            const body = await response.text().catch(() => '');
            throw new Error(`LLM HTTP ${response.status}${body ? `: ${body.slice(0, 200)}` : ''}`);
        }
        const payload = await response.json();
        return payload?.choices?.[0]?.message || null;
    };

    const normalizeCandidates = (raw = []) => {
        const seen = new Set();
        const out = [];
        for (const entry of Array.isArray(raw) ? raw : []) {
            const mediaType = entry?.mediaType === 'tv' ? 'tv' : entry?.mediaType === 'movie' ? 'movie' : '';
            const tmdbId = Number(entry?.tmdbId);
            if (!mediaType || !Number.isFinite(tmdbId)) continue;
            const key = `${mediaType}:${tmdbId}`;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push({
                mediaType,
                tmdbId,
                title: String(entry.title || '').trim(),
                year: entry.year != null ? String(entry.year) : '',
            });
            if (out.length >= MAX_CANDIDATES) break;
        }
        return out;
    };

    const hydrateCandidates = async (config, candidates) => {
        const requestAppService = typeof getRequestAppService === 'function' ? getRequestAppService() : null;
        if (!requestAppService || !candidates.length) return [];
        const details = await Promise.all(candidates.map(async (entry) => {
            try {
                const detail = await requestAppService.getMediaDetails(config, {
                    mediaType: entry.mediaType,
                    tmdbId: entry.tmdbId,
                });
                return detail?.tmdbId ? detail : null;
            } catch {
                return null;
            }
        }));
        return details.filter(Boolean);
    };

    const run = async (config, userText) => {
        if (!isDiscordAgentReady(config)) {
            return {
                ok: false,
                answer: 'Media agent needs LLM settings and a SearXNG URL configured in portal Discord settings.',
                results: [],
            };
        }

        const messages = [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: String(userText || '').slice(0, 800) },
        ];

        let usedTools = false;
        let finishPayload = null;

        for (let round = 0; round < MAX_ROUNDS; round += 1) {
            let message;
            try {
                message = await chat(config, messages);
            } catch (error) {
                log?.(`Discord media agent LLM failed: ${error.message}`);
                return {
                    ok: false,
                    answer: `I couldn’t reach the language model (${error.message}).`,
                    results: [],
                };
            }
            if (!message) {
                return { ok: false, answer: 'The language model returned an empty response.', results: [] };
            }

            messages.push(message);
            const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
            if (!toolCalls.length) {
                if (!usedTools) {
                    return {
                        ok: false,
                        answer: 'This model did not use discovery tools. Try a tool-capable model (e.g. qwen2.5:7b on Ollama, or GPT-4o via an OpenAI-compatible URL).',
                        results: [],
                    };
                }
                const content = String(message.content || '').trim();
                finishPayload = {
                    answer: content || 'Here are some titles that may match.',
                    candidates: [],
                };
                break;
            }

            usedTools = true;
            for (const call of toolCalls) {
                const name = call?.function?.name || call?.name || '';
                let args = {};
                try {
                    const raw = call?.function?.arguments ?? call?.arguments ?? '{}';
                    args = typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw || {});
                } catch {
                    args = {};
                }
                const toolResult = await runTool(config, name, args);
                if (toolResult?.finished) {
                    finishPayload = {
                        answer: toolResult.answer || 'Here are some titles that may match.',
                        candidates: normalizeCandidates(toolResult.candidates),
                    };
                }
                messages.push({
                    role: 'tool',
                    tool_call_id: call.id || `call_${round}_${name}`,
                    content: JSON.stringify(toolResult),
                });
            }
            if (finishPayload) break;
        }

        if (!finishPayload) {
            return {
                ok: false,
                answer: 'I ran out of discovery steps before finishing. Try a clearer ask, or use `/request` with a title.',
                results: [],
            };
        }

        const results = await hydrateCandidates(config, finishPayload.candidates);
        return {
            ok: true,
            answer: finishPayload.answer.slice(0, 1800) || 'Here are some titles that may match.',
            results,
        };
    };

    return {
        run,
        isReady: isDiscordAgentReady,
        tools: TOOLS,
    };
};
