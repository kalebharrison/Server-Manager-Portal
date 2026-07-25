import { normalizeThemeQuery } from '../request-app/request-app-catalog-theme.js';

const INTENT_HELP = { intent: 'help', params: {} };

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
            'You map user messages for a media server Discord bot into JSON only.',
            'Return {"intent":"...","params":{...}} with one of:',
            'help, request.search, request.person, request.discover_theme, requests.list, issue.list, issue.create, stats.me, live.sessions, queue.list, status.summary, discover.trending',
            'Use request.person for filmography queries (latest movie by an actor, movies starring X, directed by Y). Include params.query as the person name only (no words like movie, latest, starring) and optional params.mediaType (movie|tv|all) and params.creditType (cast|crew).',
            'Use request.discover_theme for latest/newest/recent themed discovery (e.g. latest zombie movie, newest comedy shows). Include params.theme (theme only — no words like latest, movie, show) and optional params.mediaType (movie|tv|all) and params.recent (true when user asks for latest/newest/recent).',
            'Use request.search for title/franchise lookups (e.g. Dune, The Matrix). Include params.query (title only — no trailing words like movie, film, tv show, or latest) and optional params.mediaType (movie|tv|all).',
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
