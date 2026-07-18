import { getRequestAppGate } from './request-app-gate.js';
import { createMemoryCache } from './request-app-cache.js';
import { createRequestImageCache } from './request-image-cache.js';

export const createRequestAppClient = ({
    fetchWithTimeout,
    resolveIntegrationUrlForFetch,
    withBasePath = (value) => value,
    requestAppInternalUrl = '',
}) => {
    const cache = createMemoryCache();
    const imageCache = createRequestImageCache({ fetchWithTimeout });

    const proxyPoster = (remoteUrl) => {
        try {
            const url = new URL(remoteUrl);
            if (url.protocol !== 'https:' || url.hostname !== 'image.tmdb.org') return remoteUrl;
            return `${withBasePath('/api/request-app/image')}?url=${encodeURIComponent(url.toString())}`;
        } catch {
            return remoteUrl;
        }
    };

    const getCredentials = (config = {}) => {
        const gate = getRequestAppGate(config);
        if (!gate.ready) throw new Error(gate.error || 'Request app is not ready');
        const publicBaseUrl = resolveIntegrationUrlForFetch(config.requestAppUrl);
        const fetchUrlOverride = config.requestAppFetchUrl || requestAppInternalUrl;
        return {
            type: String(config.requestAppType || '').toLowerCase(),
            baseUrl: fetchUrlOverride ? resolveIntegrationUrlForFetch(fetchUrlOverride) : publicBaseUrl,
            publicBaseUrl,
            apiKey: config.requestAppApiKey,
        };
    };

    const fetchSeerrJson = async (config, path, { method = 'GET', body = null } = {}) => {
        const { baseUrl, apiKey } = getCredentials(config);
        let response;
        try {
            response = await fetchWithTimeout(`${baseUrl}${path}`, {
                method,
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    'X-Api-Key': apiKey,
                },
                ...(body ? { body: JSON.stringify(body) } : {}),
            }, 15000);
        } catch (err) {
            const code = err?.cause?.code || err?.code || err?.message || 'network error';
            const dockerHint = /localhost|127\.0\.0\.1/i.test(baseUrl)
                ? ' If the portal runs in Docker, use your server LAN IP or Docker service name instead of localhost.'
                : '';
            throw new Error(`Cannot reach request app at ${baseUrl}.${dockerHint} (${code})`);
        }

        const data = response.status === 204 ? null : await response.json().catch(() => null);
        if (!response.ok) {
            const message = data?.message || data?.error || `Request app returned HTTP ${response.status}`;
            if (response.status === 401 || response.status === 403) {
                throw new Error(`${message} - check the request app API key permissions.`);
            }
            throw new Error(message);
        }
        return data || { success: true };
    };

    const cachedSeerrJson = (config, path, ttlMs, staleIfErrorMs = 0) => {
        const { baseUrl, type } = getCredentials(config);
        return cache.getOrSet(`${type}:${baseUrl}:${path}`, ttlMs, () => fetchSeerrJson(config, path), { staleIfErrorMs });
    };

    const invalidateUserLists = () => cache.invalidateMatching((key) => key.includes('/api/v1/user'));
    const invalidateRequestLists = () => cache.invalidateMatching((key) => (
        key.includes('/api/v1/request') || key.includes('/api/v1/issue')
    ));

    return {
        cache,
        imageCache,
        proxyPoster,
        getCredentials,
        fetchSeerrJson,
        cachedSeerrJson,
        invalidateUserLists,
        invalidateRequestLists,
    };
};
