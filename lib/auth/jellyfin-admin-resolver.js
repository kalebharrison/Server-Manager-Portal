export const createJellyfinAdminResolver = ({
    fetchImpl = fetch,
    resolveIntegrationUrlForFetch,
    jellyfinHeaders,
    log,
    ttlMs = 5_000,
    maxEntries = 100,
    now = () => Date.now(),
}) => {
    const cache = new Map();
    const pending = new Map();

    const cacheResult = (key, value) => {
        if (cache.has(key)) cache.delete(key);
        while (cache.size >= maxEntries) {
            const oldestKey = cache.keys().next().value;
            if (oldestKey === undefined) break;
            cache.delete(oldestKey);
        }
        cache.set(key, { value, expiresAt: now() + ttlMs });
    };

    return async (sessionUser, config = {}) => {
        if (sessionUser?.authProvider !== 'jellyfin' || !sessionUser?.jellyfinId) return false;
        if (!config?.jellyfinUrl || !config?.jellyfinApiKey) return false;

        const key = `${config.jellyfinUrl}|${sessionUser.jellyfinId}`;
        const cached = cache.get(key);
        if (cached && cached.expiresAt > now()) {
            cache.delete(key);
            cache.set(key, cached);
            return cached.value;
        }
        if (cached) cache.delete(key);
        if (pending.has(key)) return pending.get(key);

        const lookup = Promise.resolve().then(async () => {
            try {
                const baseUrl = await resolveIntegrationUrlForFetch(config.jellyfinUrl);
                const response = await fetchImpl(`${baseUrl}/Users/${encodeURIComponent(sessionUser.jellyfinId)}`, {
                    headers: jellyfinHeaders(config.jellyfinApiKey),
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const jellyfinUser = await response.json();
                const isAdmin = jellyfinUser?.Policy?.IsAdministrator === true;
                cacheResult(key, isAdmin);
                return isAdmin;
            } catch (error) {
                log(`Jellyfin admin policy check failed for ${sessionUser.username || sessionUser.jellyfinId}: ${error.message}`);
                cacheResult(key, false);
                return false;
            }
        }).finally(() => pending.delete(key));
        pending.set(key, lookup);
        return lookup;
    };
};
