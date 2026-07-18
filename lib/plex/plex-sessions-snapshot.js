import { createTtlCache } from '../cache/cache.js';

const DEFAULT_TTL_MS = 3000;

/**
 * Shared short-TTL Plex /status/sessions snapshot used by the live sessions API
 * and the background stream monitor so both do not hammer Plex every cycle.
 */
export const createPlexSessionsSnapshot = ({
    fetchImpl = fetch,
    ttlMs = DEFAULT_TTL_MS,
} = {}) => {
    const cache = createTtlCache({ maxEntries: 8 });

    const fetchSessionsPayload = async (config, uri) => {
        if (!config?.plexToken || !uri) return null;
        const key = `${config.serverIdentifier || 'plex'}:${uri}`;
        return cache.getOrSet(key, ttlMs, async () => {
            try {
                const response = await fetchImpl(`${uri}/status/sessions?X-Plex-Token=${config.plexToken}`, {
                    headers: { Accept: 'application/json' },
                });
                if (!response?.ok) return null;
                return response.json();
            } catch {
                return null;
            }
        });
    };

    const fetchSessionsMetadata = async (config, uri) => {
        const payload = await fetchSessionsPayload(config, uri);
        return payload?.MediaContainer?.Metadata || [];
    };

    return {
        fetchSessionsPayload,
        fetchSessionsMetadata,
    };
};
