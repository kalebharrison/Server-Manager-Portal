import { createDiscordWebSearch } from './discord-web-search.js';

const MAX_ROUNDS = 6;
const MAX_CANDIDATES = 5;
const AGENT_LIMIT = 8;

const TOOLS = [
    {
        type: 'function',
        function: {
            name: 'web_search',
            description: 'Search the web for movie/TV recommendations, plot facts, or title identification. Uses configured search backends or a free DuckDuckGo fallback. Use before Seerr for multi-constraint or “what’s that film” questions.',
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
    'Only help with movies, TV shows, and watch recommendations for this server. Refuse shopping, product advice, general web Q&A, and other non-media topics by calling finish with a short redirect (no candidates).',
    'You MUST use tools for every media user message. Never reply with plain text only.',
    'Do not invent titles or TMDB ids.',
    'For plot/setting/theme questions (e.g. zombie movie set in a casino), call web_search first, identify real titles from results, then search_titles or lookup_title to resolve them on Seerr.',
    'For follow-ups about a specific title (e.g. “what about Remains 2011?”), call search_titles or lookup_title, then finish.',
    'For actor/director filmography, use person_filmography.',
    'For simple known titles (e.g. Dune), search_titles is enough.',
    'End every successful turn by calling the finish tool with JSON arguments only.',
    'Never write finish.answer, finish.candidates, or the word Finish in message content — those belong only in the finish tool call.',
    'finish.answer must be a short clean sentence for Discord. finish.candidates are titles you verified via Seerr tools (up to 5), each with mediaType and tmdbId.',
    'Mention which are already available vs requestable when you know.',
].join(' ');

const MEDIA_SCOPE_RE = /\b(movie|movies|film|films|tv|show|shows|series|watch|watching|watched|plex|seerr|request|requestable|actor|actress|director|cast|cinema|anime|documentary|season|episode|trailer|netflix|hulu|disney\+?|recommend|recommendation|horror|comedy|thriller|zombie|sci-?fi|drama|rom-?com|starring|directed|what should i watch|something to watch)\b/i;
const OFF_TOPIC_RE = /\b(trash\s*cans?|buy|purchase|amazon|shopping|recipe|recipes|weather|stock(?:s)?|crypto|bitcoin|homework|programming|javascript|python|code this)\b/i;
const OFF_TOPIC_WEB_RE = /\b(?:best|top)\b.+\b(?:on the internet|on amazon|on reddit)\b|\bwhat does reddit say\b/i;

export const OUT_OF_SCOPE_ANSWER = 'I only help with movies and TV on this server — ask for a title, genre, actor, or “what should I watch?” Use `/help` for commands.';

/** True when the ask is about watchable media (or a short title-like query). */
export const isMediaScopedQuery = (text = '') => {
    const input = String(text || '').trim();
    if (!input) return false;
    if (MEDIA_SCOPE_RE.test(input)) return true;
    if (OFF_TOPIC_RE.test(input) || OFF_TOPIC_WEB_RE.test(input)) return false;
    // Short queries are usually title searches ("Dune", "Remains 2011").
    const words = input.split(/\s+/).filter(Boolean);
    if (words.length <= 8) return true;
    return false;
};

const stripFinishProtocol = (text = '') => String(text || '')
    .replace(/(?:^|\n)\s*finish\.candidates\s*[:\-]\s*\[[\s\S]*?\]\s*/gi, '\n')
    .replace(/(?:^|\n)\s*finish\.candidates\s*[:\-]\s*.+$/gim, '\n')
    .replace(/(?:^|\n)\s*finish\.answer\s*[:\-]\s*.+$/gim, '\n')
    .replace(/(?:^|\n)\s*finish\.[a-zA-Z]+\s*[:\-]\s*.+$/gim, '\n')
    .replace(/^\s*(?:Finish|finish)\s*[:\-]\s*/i, '')
    .replace(/\n+\s*(?:Finish|finish)\s*[:\-]\s*/g, '\n')
    .replace(/\s*•\s*Finish\b[\s\S]*$/i, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

export const cleanAgentAnswer = (answer = '') => {
    const text = String(answer || '');
    if (!text.trim()) return '';
    if (/finish\.answer\s*[:\-]/i.test(text)) {
        const prose = text.split(/\n\s*finish\./i)[0].trim();
        const field = text.match(/finish\.answer\s*[:\-]\s*([^\n]+)/i);
        if (prose.length >= 20) return stripFinishProtocol(prose);
        if (field?.[1]) return stripFinishProtocol(field[1]);
    }
    return stripFinishProtocol(text);
};

export const extractFinishFromContent = (content = '') => {
    const text = String(content || '').trim();
    if (!text) return null;
    try {
        const parsed = JSON.parse(text);
        if (parsed && (parsed.answer || Array.isArray(parsed.candidates))) {
            return {
                answer: cleanAgentAnswer(parsed.answer || 'Here are some titles that may match.'),
                candidates: Array.isArray(parsed.candidates) ? parsed.candidates : [],
            };
        }
    } catch {
        /* not JSON */
    }
    if (/finish\.(answer|candidates)\b/i.test(text)) {
        const answer = cleanAgentAnswer(text);
        if (!answer) return null;
        return { answer, candidates: [] };
    }
    const finishMatch = text.match(/(?:^|\n)\s*(?:Finish|finish)\s*[:\-]\s*([\s\S]+)$/);
    if (finishMatch) {
        return { answer: cleanAgentAnswer(finishMatch[1]), candidates: [] };
    }
    return null;
};

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
    return !!(llmUrl && apiKey);
};

export const createDiscordMediaAgent = ({
    fetchImpl = fetch,
    getRequestAppService,
    log,
} = {}) => {
    const webSearch = createDiscordWebSearch({ fetchImpl, log });

    const runTool = async (config, name, args = {}) => {
        const requestAppService = typeof getRequestAppService === 'function' ? getRequestAppService() : null;
        if (name === 'web_search') {
            const outcome = await webSearch.searchWeb(config, args.query, { limit: AGENT_LIMIT });
            return { results: outcome.results, provider: outcome.provider };
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

    const chat = async (config, messages, { toolChoice = 'auto' } = {}) => {
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
                tool_choice: toolChoice,
            }),
        });
        if (!response.ok) {
            const body = await response.text().catch(() => '');
            throw new Error(`LLM HTTP ${response.status}${body ? `: ${body.slice(0, 200)}` : ''}`);
        }
        const payload = await response.json();
        return payload?.choices?.[0]?.message || null;
    };

    const chatWithFallback = async (config, messages, { preferRequired = false } = {}) => {
        if (preferRequired) {
            try {
                return await chat(config, messages, { toolChoice: 'required' });
            } catch (error) {
                log?.(`Discord media agent tool_choice=required failed, retrying auto: ${error.message}`);
            }
        }
        return chat(config, messages, { toolChoice: 'auto' });
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

    const mergeCandidates = (existing = [], incoming = []) => normalizeCandidates([
        ...(Array.isArray(existing) ? existing : []),
        ...(Array.isArray(incoming) ? incoming : []),
    ]);

    const candidatesFromToolResult = (name, toolResult = {}) => {
        if (name === 'search_titles' || name === 'person_filmography') {
            return Array.isArray(toolResult.results) ? toolResult.results : [];
        }
        if (name === 'lookup_title' && toolResult.result) {
            return [toolResult.result];
        }
        return [];
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
                answer: 'Media agent needs Discord LLM settings (URL, API key, model) with the discovery agent enabled.',
                results: [],
            };
        }

        const query = String(userText || '').slice(0, 800);
        if (!isMediaScopedQuery(query)) {
            return { ok: true, answer: OUT_OF_SCOPE_ANSWER, results: [] };
        }

        const messages = [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: query },
        ];

        let usedTools = false;
        let finishPayload = null;
        let nudgedForTools = false;
        let foundCandidates = [];

        for (let round = 0; round < MAX_ROUNDS; round += 1) {
            let message;
            try {
                message = await chatWithFallback(config, messages, {
                    preferRequired: !usedTools && round < 3,
                });
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
                const content = String(message.content || '');
                const cleaned = cleanAgentAnswer(content);
                const fromContent = extractFinishFromContent(content);
                // Ollama often dumps finish.* or plain prose instead of calling finish.
                // Prefer Seerr titles we already resolved over burning more rounds.
                if (usedTools && (fromContent || cleaned || foundCandidates.length)) {
                    const fromTool = normalizeCandidates(fromContent?.candidates);
                    finishPayload = {
                        answer: (fromContent?.answer || cleaned || 'Here are some titles that may match.'),
                        candidates: fromTool.length ? fromTool : foundCandidates,
                    };
                    break;
                }
                if (!usedTools && !nudgedForTools) {
                    nudgedForTools = true;
                    messages.push({
                        role: 'user',
                        content: 'You must call tools now. Use web_search or search_titles, then call finish. Do not answer in plain text.',
                    });
                    continue;
                }
                if (!usedTools) {
                    return {
                        ok: false,
                        answer: 'This model did not use discovery tools. Try a tool-capable model (e.g. qwen2.5:7b / qwen2.5:14b on Ollama, or GPT-4o via an OpenAI-compatible URL).',
                        results: [],
                    };
                }
                finishPayload = {
                    answer: cleaned || 'Here are some titles that may match.',
                    candidates: foundCandidates,
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
                foundCandidates = mergeCandidates(foundCandidates, candidatesFromToolResult(name, toolResult));
                if (toolResult?.finished) {
                    const fromFinish = normalizeCandidates(toolResult.candidates);
                    finishPayload = {
                        answer: cleanAgentAnswer(toolResult.answer) || 'Here are some titles that may match.',
                        candidates: fromFinish.length ? fromFinish : foundCandidates,
                    };
                }
                messages.push({
                    role: 'tool',
                    tool_call_id: call.id || `call_${round}_${name}`,
                    content: JSON.stringify(toolResult),
                });
            }
            if (finishPayload) break;

            // Last round and still no finish: stop looping and synthesize below.
            if (round === MAX_ROUNDS - 1 && foundCandidates.length) {
                finishPayload = {
                    answer: 'Here are some titles that may match.',
                    candidates: foundCandidates,
                };
                break;
            }
        }

        if (!finishPayload && foundCandidates.length) {
            finishPayload = {
                answer: 'Here are some titles that may match.',
                candidates: foundCandidates,
            };
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
