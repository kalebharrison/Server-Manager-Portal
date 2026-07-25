const INTENT_HELP = { intent: 'help', params: {} };

const PHRASES = [
    { re: /^(help|commands|what can you do)\b/i, intent: 'help' },
    { re: /^(my\s+)?stats?\b|watch\s+history|how\s+much\s+have\s+i\s+watched/i, intent: 'stats.me' },
    { re: /\b(live|who'?s\s+watching|active\s+streams?|streaming\s+now)\b/i, intent: 'live.sessions' },
    { re: /\b(queue|downloads?|downloading|on\s+the\s+way|grabbing)\b/i, intent: 'queue.list' },
    { re: /\b(status|health|is\s+.+\s+up)\b/i, intent: 'status.summary' },
    { re: /\b(discover|trending|popular|what'?s\s+new)\b/i, intent: 'discover.trending' },
    { re: /\b(my\s+requests?|request\s+status)\b/i, intent: 'requests.list' },
    { re: /\b(list\s+issues?|my\s+issues?|open\s+issues?)\b/i, intent: 'issue.list' },
    { re: /^(?:please\s+)?(?:request|add|get)\s+(.+)/i, intent: 'request.search', capture: 'query' },
    { re: /^(?:search\s+for|find)\s+(.+)/i, intent: 'request.search', capture: 'query' },
];

export const matchPhraseIntent = (text = '') => {
    const input = String(text || '').trim();
    if (!input) return null;
    for (const rule of PHRASES) {
        const matched = input.match(rule.re);
        if (!matched) continue;
        const params = {};
        if (rule.capture && matched[1]) params[rule.capture] = matched[1].trim();
        if (rule.intent === 'discover.trending') {
            if (/\bpopular\b/i.test(input)) params.category = 'popular';
            else if (/\bupcoming\b/i.test(input)) params.category = 'upcoming';
            else params.category = 'trending';
        }
        if (rule.intent === 'request.search') {
            params.mediaType = /\b(tv|show|series)\b/i.test(input) ? 'tv' : /\bmovie\b/i.test(input) ? 'movie' : 'all';
        }
        return { intent: rule.intent, params };
    }
    return null;
};

export const createDiscordNlParser = ({
    fetchImpl = fetch,
    log,
} = {}) => {
    const parseWithLlm = async (config, text) => {
        if (!config?.discordLlmEnabled) return null;
        const baseUrl = String(config.discordLlmUrl || '').replace(/\/$/, '');
        const apiKey = String(config.discordLlmApiKey || '').trim();
        const model = String(config.discordLlmModel || 'gpt-4o-mini').trim();
        if (!baseUrl || !apiKey) return null;

        const system = [
            'You map user messages for a media server Discord bot into JSON only.',
            'Return {"intent":"...","params":{...}} with one of:',
            'help, request.search, requests.list, issue.list, issue.create, stats.me, live.sessions, queue.list, status.summary, discover.trending',
            'For request.search include params.query and optional params.mediaType (movie|tv|all).',
            'For issue.create include params.title and params.details.',
            'For discover.trending optional params.category: trending|popular|upcoming|movies|tv.',
            'If unclear, return {"intent":"help","params":{}}.',
        ].join(' ');

        try {
            const response = await fetchImpl(`${baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model,
                    temperature: 0,
                    response_format: { type: 'json_object' },
                    messages: [
                        { role: 'system', content: system },
                        { role: 'user', content: String(text || '').slice(0, 500) },
                    ],
                }),
            });
            if (!response.ok) {
                log?.(`Discord NL LLM HTTP ${response.status}`);
                return null;
            }
            const payload = await response.json();
            const content = payload?.choices?.[0]?.message?.content;
            const parsed = typeof content === 'string' ? JSON.parse(content) : content;
            if (!parsed?.intent) return null;
            return {
                intent: String(parsed.intent),
                params: parsed.params && typeof parsed.params === 'object' ? parsed.params : {},
            };
        } catch (error) {
            log?.(`Discord NL LLM failed: ${error.message}`);
            return null;
        }
    };

    const parseIntent = async (config, text) => {
        const phrase = matchPhraseIntent(text);
        if (phrase) return phrase;
        const llm = await parseWithLlm(config, text);
        if (llm) return llm;
        return INTENT_HELP;
    };

    return {
        matchPhraseIntent,
        parseIntent,
    };
};
