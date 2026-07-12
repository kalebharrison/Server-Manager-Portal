const PROBE_TTL_MS = 5 * 60 * 1000;

export const createMetadataHealthProbe = ({ loadConfig, fetchWithTimeout, tvdbService, now = () => Date.now() }) => {
    const cache = new Map();

    const probeTmdb = async (config) => {
        const response = await fetchWithTimeout(`https://api.themoviedb.org/3/configuration?api_key=${encodeURIComponent(config.tmdbApiKey || '')}`, {
            headers: { Accept: 'application/json' },
        }, 12000);
        if (!response.ok) return { ok: false, httpCode: response.status };
        const data = await response.json().catch(() => ({}));
        return { ok: !!data?.images?.secure_base_url, httpCode: response.status };
    };

    const runProbe = async (serviceId) => {
        const startedAt = now();
        try {
            const config = await loadConfig();
            const result = serviceId === 'tmdb'
                ? await probeTmdb(config)
                : await tvdbService.checkHealth(config);
            return {
                status: result.ok ? 'online' : (result.httpCode >= 500 ? 'degraded' : 'offline'),
                latency: Math.max(0, Math.round(now() - startedAt)),
                httpCode: result.httpCode || 0,
            };
        } catch {
            return { status: 'offline', latency: 0, httpCode: 0 };
        }
    };

    return async (service) => {
        if (!['tmdb', 'tvdb'].includes(service?.id)) return null;
        const cached = cache.get(service.id);
        if (cached?.expiresAt > now()) return cached.result;
        const result = await runProbe(service.id);
        cache.set(service.id, { result, expiresAt: now() + PROBE_TTL_MS });
        return result;
    };
};
