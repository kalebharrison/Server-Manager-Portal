import { sanitizeHttpUrl } from '../http/public-url.js';

export const sanitizeSearxngUrl = (raw) => {
    const value = String(raw || '').trim();
    if (!value) return '';
    return sanitizeHttpUrl(value, { field: 'discordSearxngUrl' }).replace(/\/+$/, '');
};

export const createSearxngClient = ({
    fetchImpl = fetch,
    log,
} = {}) => {
    const search = async (baseUrl, query, {
        limit = 8,
        categories = 'general',
    } = {}) => {
        const root = sanitizeSearxngUrl(baseUrl);
        const q = String(query || '').trim();
        if (!root || !q) return [];

        const url = new URL('/search', `${root}/`);
        url.searchParams.set('q', q.slice(0, 300));
        url.searchParams.set('format', 'json');
        if (categories) url.searchParams.set('categories', categories);

        try {
            const response = await fetchImpl(url.toString(), {
                method: 'GET',
                headers: { Accept: 'application/json' },
            });
            if (!response.ok) {
                log?.(`SearXNG HTTP ${response.status}`);
                return [];
            }
            const payload = await response.json();
            const results = Array.isArray(payload?.results) ? payload.results : [];
            return results.slice(0, Math.max(1, Math.min(20, Number(limit) || 8))).map((item) => ({
                title: String(item.title || '').trim(),
                url: String(item.url || '').trim(),
                content: String(item.content || item.snippet || '').trim().slice(0, 400),
                engine: Array.isArray(item.engines) ? item.engines.join(',') : String(item.engine || ''),
            })).filter((item) => item.title || item.content);
        } catch (error) {
            log?.(`SearXNG failed: ${error.message}`);
            return [];
        }
    };

    return { search, sanitizeSearxngUrl };
};
