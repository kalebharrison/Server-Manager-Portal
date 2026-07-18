import { createPlexConnectionAccounts } from './plex-connection-accounts.js';
import { createPlexConnectionResolve } from './plex-connection-resolve.js';
import {
    isLoopbackPlexUri,
    pickPlexConnection,
    shouldPreferRemotePlexConnection,
} from './plex-connection-policy.js';

export const createPlexConnectionService = ({
    usersPath,
    secretMask,
    loadFile,
    resolveIntegrationUrlForFetch,
    findLocalUserForSession,
    getClientId,
    log,
}) => {
    let cachedPlexConnectionUri = null;
    let lastPlexConnectionUriFetch = 0;

    const fetchWithTimeout = async (url, options = {}, timeoutMs = 15000) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            return await fetch(url, { ...options, signal: controller.signal });
        } finally {
            clearTimeout(timer);
        }
    };

    const {
        normalizePlexToken,
        resolveConfiguredPlexServerUrl,
        resolvePlexServerUrlForVerification,
        fetchOwnedPlexServers,
        validatePlexServerAdminToken,
        verifyInitialSetupPlexOwner,
    } = createPlexConnectionResolve({
        secretMask,
        resolveIntegrationUrlForFetch,
        getClientId,
        log,
        fetchWithTimeout,
    });

    const {
        fetchPlexServerAccounts,
        resolveLocalPlexAccountId,
        invalidatePlexAccountCache,
    } = createPlexConnectionAccounts({
        usersPath,
        loadFile,
        findLocalUserForSession,
        fetchWithTimeout,
    });

    const getPlexConnectionUri = async (config) => {
        if (cachedPlexConnectionUri && (Date.now() - lastPlexConnectionUriFetch < 60 * 60 * 1000)) {
            return cachedPlexConnectionUri;
        }

        let directUrl = resolveConfiguredPlexServerUrl(config);
        if (!directUrl || (isLoopbackPlexUri(directUrl) && shouldPreferRemotePlexConnection())) {
            directUrl = await resolvePlexServerUrlForVerification(config.plexToken, config, config.serverIdentifier);
        }
        if (directUrl) {
            const normalized = await resolveIntegrationUrlForFetch(directUrl);
            if (normalized) {
                try {
                    const probe = await fetchWithTimeout(`${normalized}/identity`, {
                        headers: { 'X-Plex-Token': config.plexToken, Accept: 'application/json' },
                    }, 4000);
                    if (probe.ok) {
                        cachedPlexConnectionUri = normalized;
                        lastPlexConnectionUriFetch = Date.now();
                        log(`Using direct Plex server URL: ${cachedPlexConnectionUri}`);
                        return cachedPlexConnectionUri;
                    }
                } catch (e) {
                    log(`Direct Plex URL probe failed (${directUrl}): ${e.message}`);
                }
            }
        }

        const response = await fetchWithTimeout('https://plex.tv/api/v2/resources?includeHttps=1', {
            headers: {
                'X-Plex-Token': config.plexToken,
                'X-Plex-Client-Identifier': getClientId(),
                'Accept': 'application/json'
            }
        }, 20000);
        if (!response.ok) throw new Error('Failed to fetch resources from Plex.tv');
        const resources = await response.json();
        const server = resources.find(r => r.clientIdentifier === config.serverIdentifier);
        if (!server || !server.connections || server.connections.length === 0) throw new Error('Server not found');
        const connection = pickPlexConnection(server.connections);
        if (!connection?.uri) throw new Error('No usable Plex connection found');
        cachedPlexConnectionUri = connection.uri;
        lastPlexConnectionUriFetch = Date.now();
        if (shouldPreferRemotePlexConnection()) {
            log(`Using Plex connection URI for container runtime: ${cachedPlexConnectionUri}`);
        }
        return cachedPlexConnectionUri;
    };

    const invalidatePlexConnectionCaches = () => {
        cachedPlexConnectionUri = null;
        lastPlexConnectionUriFetch = 0;
        invalidatePlexAccountCache();
    };

    return {
        fetchWithTimeout,
        normalizePlexToken,
        resolveConfiguredPlexServerUrl,
        resolvePlexServerUrlForVerification,
        fetchOwnedPlexServers,
        validatePlexServerAdminToken,
        verifyInitialSetupPlexOwner,
        fetchPlexServerAccounts,
        resolveLocalPlexAccountId,
        getPlexConnectionUri,
        invalidatePlexConnectionCaches,
    };
};
