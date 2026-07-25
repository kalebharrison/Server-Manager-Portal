import { createSearxngClient } from './discord-searxng.js';

const normalizeHit = (item = {}, engine = '') => ({
    title: String(item.title || '').trim(),
    url: String(item.url || item.href || '').trim(),
    content: String(item.content || item.description || item.snippet || item.body || '').trim().slice(0, 400),
    engine: String(item.engine || engine || '').trim(),
});

const decodeHtml = (value = '') => String(value)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/');

/** Parse DuckDuckGo HTML search results (zero-config fallback). */
export const parseDuckDuckGoHtml = (html = '', { limit = 8 } = {}) => {
    const results = [];
    const blockRe = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let match = blockRe.exec(html);
    while (match && results.length < Math.max(1, Math.min(20, Number(limit) || 8))) {
        const url = decodeHtml(match[1]);
        const title = decodeHtml(match[2].replace(/<[^>]+>/g, '')).trim();
        if (!url || !title) {
            match = blockRe.exec(html);
            continue;
        }
        const after = html.slice(match.index, match.index + 1200);
        const snippetMatch = after.match(/class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|td|div)>/i);
        const content = snippetMatch
            ? decodeHtml(snippetMatch[1].replace(/<[^>]+>/g, '')).trim()
            : '';
        results.push(normalizeHit({ title, url, content }, 'duckduckgo'));
        match = blockRe.exec(html);
    }
    return results;
};

export const createDiscordWebSearch = ({
    fetchImpl = fetch,
    log,
} = {}) => {
    const searx = createSearxngClient({ fetchImpl, log });

    const searchSearxng = async (config, query, limit) => {
        const url = String(config.discordSearxngUrl || '').trim();
        if (!url) return [];
        return searx.search(url, query, { limit });
    };

    const searchBrave = async (config, query, limit) => {
        const apiKey = String(config.discordBraveSearchApiKey || '').trim();
        if (!apiKey) return [];
        try {
            const endpoint = new URL('https://api.search.brave.com/res/v1/web/search');
            endpoint.searchParams.set('q', String(query || '').slice(0, 300));
            endpoint.searchParams.set('count', String(Math.min(20, Math.max(1, limit))));
            const response = await fetchImpl(endpoint.toString(), {
                headers: {
                    Accept: 'application/json',
                    'X-Subscription-Token': apiKey,
                },
            });
            if (!response.ok) {
                log?.(`Brave Search HTTP ${response.status}`);
                return [];
            }
            const payload = await response.json();
            const rows = Array.isArray(payload?.web?.results) ? payload.web.results : [];
            return rows.slice(0, limit).map((item) => normalizeHit({
                title: item.title,
                url: item.url,
                content: item.description,
            }, 'brave'));
        } catch (error) {
            log?.(`Brave Search failed: ${error.message}`);
            return [];
        }
    };

    const searchTavily = async (config, query, limit) => {
        const apiKey = String(config.discordTavilyApiKey || '').trim();
        if (!apiKey) return [];
        try {
            const response = await fetchImpl('https://api.tavily.com/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    api_key: apiKey,
                    query: String(query || '').slice(0, 300),
                    max_results: Math.min(20, Math.max(1, limit)),
                    include_answer: false,
                }),
            });
            if (!response.ok) {
                log?.(`Tavily Search HTTP ${response.status}`);
                return [];
            }
            const payload = await response.json();
            const rows = Array.isArray(payload?.results) ? payload.results : [];
            return rows.slice(0, limit).map((item) => normalizeHit({
                title: item.title,
                url: item.url,
                content: item.content,
            }, 'tavily'));
        } catch (error) {
            log?.(`Tavily Search failed: ${error.message}`);
            return [];
        }
    };

    const searchDuckDuckGo = async (_config, query, limit) => {
        const q = String(query || '').trim();
        if (!q) return [];
        try {
            const body = new URLSearchParams({ q: q.slice(0, 300), kl: 'us-en' });
            const response = await fetchImpl('https://html.duckduckgo.com/html/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    Accept: 'text/html',
                    'User-Agent': 'ServerManagerPortal/1.0 (+https://github.com/kalebharrison/Server-Manager-Portal)',
                },
                body: body.toString(),
            });
            if (!response.ok) {
                log?.(`DuckDuckGo HTTP ${response.status}`);
                return [];
            }
            const html = await response.text();
            return parseDuckDuckGoHtml(html, { limit });
        } catch (error) {
            log?.(`DuckDuckGo failed: ${error.message}`);
            return [];
        }
    };

    const providers = [
        { name: 'searxng', run: searchSearxng },
        { name: 'brave', run: searchBrave },
        { name: 'tavily', run: searchTavily },
        { name: 'duckduckgo', run: searchDuckDuckGo },
    ];

    const searchWeb = async (config, query, { limit = 8 } = {}) => {
        const capped = Math.max(1, Math.min(20, Number(limit) || 8));
        const q = String(query || '').trim();
        if (!q) return { results: [], provider: '' };

        for (const provider of providers) {
            const results = await provider.run(config, q, capped);
            if (Array.isArray(results) && results.length) {
                return { results, provider: provider.name };
            }
        }
        log?.('Web search returned no results from any provider');
        return { results: [], provider: '' };
    };

    return {
        searchWeb,
        parseDuckDuckGoHtml,
        providers: providers.map((entry) => entry.name),
    };
};
