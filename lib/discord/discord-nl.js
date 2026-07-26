import { normalizeThemeQuery } from '../request-app/request-app-catalog-theme.js';
import { isMediaScopedQuery } from './discord-media-agent.js';

const INTENT_HELP = { intent: 'help', params: {} };

/** Fixed handlers that stay outside the media discovery agent. */
export const OPS_INTENTS = new Set([
    'help',
    'stats.me',
    'live.sessions',
    'queue.list',
    'status.summary',
    'requests.list',
    'issue.list',
    'issue.create',
    'discover.trending',
]);

const LEADING_ARTICLE = /^(?:the|a|an)\s+/i;
const TRAILING_SEARCH_FILLER = /\s+(?:movie|movies|film|films|tv\s+show|tv\s+series|show|shows|series)\s*$/i;
const PERSON_QUERY_FILLER = /\s+(?:was in|appeared in|starred in|acted in)\s*$/i;

/** Strip articles and trailing media-type words that break Seerr/TMDB multi-search (e.g. "Brad Pitt movie" → "Brad Pitt"). */
export const normalizeDiscordSearchQuery = (query = '') => {
    let q = String(query || '').trim();
    if (!q) return q;
    q = q.replace(LEADING_ARTICLE, '');
    q = q.replace(TRAILING_SEARCH_FILLER, '');
    return q.trim();
};

/** Strip filmography phrasing so person search gets a clean name. */
export const normalizePersonQuery = (query = '') => {
    let q = normalizeDiscordSearchQuery(query);
    q = q.replace(PERSON_QUERY_FILLER, '');
    q = q.replace(/^(?:actor|actress|director)\s+/i, '');
    return q.trim();
};

const PERSON_PHRASES = [
    {
        re: /(?:what(?:'s| is)\s+the\s+)?(?:latest|recent|newest|last)\s+(?:movie|movies|film|films|show|shows|tv\s+show)?\s*(?:(?:that|which)\s+)?(.+?)\s+(?:was\s+)?(?:in|appeared\s+in|starred\s+in)\b/i,
        capture: 'query',
        creditType: 'cast',
    },
    {
        re: /(?:latest|recent|newest|last)\s+(?:movie|movies|film|films|show|shows|tv\s+show)\s+(?:by|from|with|starring|featuring)\s+(.+)/i,
        capture: 'query',
        creditType: 'cast',
    },
    {
        re: /(?:movies?|films?|shows?|tv\s+shows?)\s+(?:with|starring|featuring)\s+(.+)/i,
        capture: 'query',
        creditType: 'cast',
    },
    {
        re: /(?:directed\s+by|films?\s+by|movies?\s+by)\s+(.+)/i,
        capture: 'query',
        creditType: 'crew',
    },
];

export const isPersonFilmographyQuery = (text = '') => PERSON_PHRASES.some((rule) => rule.re.test(String(text || '').trim()));

const THEME_DISCOVER_PHRASES = [
    {
        re: /(?:what(?:'s| is)\s+the\s+)?(?:latest|recent|newest|last|new)\s+(.+?)\s+(?:movie|movies|film|films)\b/i,
        capture: 'theme',
        mediaType: 'movie',
    },
    {
        re: /(?:what(?:'s| is)\s+the\s+)?(?:latest|recent|newest|last|new)\s+(.+?)\s+(?:show|shows|tv\s+show|tv\s+series|series)\b/i,
        capture: 'theme',
        mediaType: 'tv',
    },
    {
        re: /(?:what(?:'s| is)\s+the\s+)?(?:latest|recent|newest|last|new)\s+(?:movie|movies|film|films|show|shows|tv\s+show|series)\s+(?:about|with|on|featuring)\s+(.+)/i,
        capture: 'theme',
    },
];

export const isThemeDiscoverQuery = (text = '') => THEME_DISCOVER_PHRASES.some((rule) => rule.re.test(String(text || '').trim()));

const PHRASES = [
    { re: /^(help|commands|what can you do)\b/i, intent: 'help' },
    { re: /^(my\s+)?stats?\b|watch\s+history|how\s+much\s+have\s+i\s+watched/i, intent: 'stats.me' },
    { re: /\b(live|who'?s\s+watching|active\s+streams?|streaming\s+now)\b/i, intent: 'live.sessions' },
    { re: /\b(queue|downloads?|downloading|on\s+the\s+way|grabbing)\b/i, intent: 'queue.list' },
    { re: /\b(status|health|is\s+.+\s+up)\b/i, intent: 'status.summary' },
    { re: /\b(discover|trending|popular|what'?s\s+new)\b/i, intent: 'discover.trending' },
    { re: /\b(my\s+requests?|request\s+status)\b/i, intent: 'requests.list' },
    { re: /\b(list\s+issues?|my\s+issues?|open\s+issues?)\b/i, intent: 'issue.list' },
    ...PERSON_PHRASES.map((rule) => ({ ...rule, intent: 'request.person' })),
    ...THEME_DISCOVER_PHRASES.map((rule) => ({ ...rule, intent: 'request.discover_theme' })),
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
        if (rule.intent === 'request.person') {
            params.query = normalizePersonQuery(params.query || '');
            params.mediaType = /\b(tv|show|series)\b/i.test(input) ? 'tv' : /\bmovie\b/i.test(input) ? 'movie' : 'all';
            if (rule.creditType) params.creditType = rule.creditType;
        }
        if (rule.intent === 'request.discover_theme') {
            params.theme = normalizeThemeQuery(params.theme || '');
            params.mediaType = rule.mediaType
                || (/\b(tv|show|series)\b/i.test(input) ? 'tv' : /\bmovie\b/i.test(input) ? 'movie' : 'movie');
            params.recent = true;
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
            'You map operational Discord bot messages into JSON only (not open-ended media discovery).',
            'Return {"intent":"...","params":{...}} with one of:',
            'help, requests.list, issue.list, issue.create, stats.me, live.sessions, queue.list, status.summary, discover.trending, agent.discover',
            'Use agent.discover for media discovery / recommendation / “what should I watch” / multi-constraint title questions (include params.query as the full user text).',
            'For shopping, product advice, or other non-media topics return {"intent":"help","params":{}}.',
            'For issue.create include params.title and params.details.',
            'For discover.trending optional params.category: trending|popular|upcoming|movies|tv.',
            'If unclear but could be media, return {"intent":"agent.discover","params":{"query":"<user text>"}}.',
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
                    think: false,
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

    /**
     * /ask router: ops phrases stay on fixed handlers; discovery uses the media agent when ready.
     * Falls back to legacy phrase/LLM intents when the agent is not configured.
     */
    const routeAskIntent = async (config, text, { agentReady = false } = {}) => {
        const input = String(text || '').trim();
        const phrase = matchPhraseIntent(input);
        if (phrase && OPS_INTENTS.has(phrase.intent)) {
            return phrase;
        }
        if (agentReady) {
            if (!isMediaScopedQuery(input)) {
                return { intent: 'agent.out_of_scope', params: { query: input } };
            }
            return { intent: 'agent.discover', params: { query: input } };
        }
        if (phrase) return phrase;
        const llm = await parseWithLlm(config, input);
        if (llm) {
            if (llm.intent === 'agent.discover' && !agentReady) {
                return INTENT_HELP;
            }
            return llm;
        }
        return INTENT_HELP;
    };

    return {
        matchPhraseIntent,
        parseIntent,
        routeAskIntent,
        OPS_INTENTS,
    };
};
