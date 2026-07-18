import {
    isLoopbackPlexUri,
    pickPlexConnection,
    shouldPreferRemotePlexConnection,
} from './plex-connection-policy.js';

export const createPlexConnectionResolve = ({
    secretMask,
    resolveIntegrationUrlForFetch,
    getClientId,
    log,
    fetchWithTimeout,
}) => {
    const normalizePlexToken = (token) => {
        if (token === undefined || token === null || token === secretMask) return token;
        return String(token).trim();
    };

    const resolveConfiguredPlexServerUrl = (config = {}) => {
        const fromConfig = String(config.plexServerUrl || '').trim().replace(/\/+$/, '');
        const fromEnv = String(process.env.PLEX_SERVER_URL || '').trim().replace(/\/+$/, '');
        return fromConfig || fromEnv;
    };

    const resolvePlexServerUrlForVerification = async (plexToken, config = {}, serverIdentifier = '') => {
        const configured = resolveConfiguredPlexServerUrl(config);
        if (configured && !(isLoopbackPlexUri(configured) && shouldPreferRemotePlexConnection())) {
            return configured;
        }

        const sid = String(serverIdentifier || config.serverIdentifier || '').trim();
        const token = normalizePlexToken(plexToken);
        if (!token || !sid || token === secretMask) return configured;

        try {
            const response = await fetchWithTimeout('https://plex.tv/api/v2/resources?includeHttps=1', {
                headers: {
                    'X-Plex-Token': token,
                    'X-Plex-Client-Identifier': getClientId(),
                    Accept: 'application/json',
                },
            }, 10000);
            if (!response.ok) return configured;
            const resources = await response.json();
            const server = resources.find((r) => r.clientIdentifier === sid);
            const conn = pickPlexConnection(server?.connections || []);
            if (conn?.uri) {
                const discovered = String(conn.uri).replace(/\/+$/, '');
                log(`Discovered Plex server URL for verification: ${discovered}`);
                return discovered;
            }
        } catch (e) {
            log(`Plex server URL discovery failed: ${e.message}`);
        }

        return configured;
    };

    const fetchOwnedPlexServers = async (plexToken) => {
        const response = await fetch('https://plex.tv/pms/servers', {
            headers: {
                'X-Plex-Token': plexToken,
                'Accept': 'application/xml',
            },
        });
        if (!response.ok) {
            await response.text();
            log(`Error fetching Plex servers (XML). Status: ${response.status}.`);
            throw new Error('Failed to fetch servers from Plex. Please double-check your Plex account.');
        }
        const xmlText = await response.text();
        const serverTags = xmlText.match(/<Server\b[^>]*\/?>/g) || [];
        return serverTags.map((tag) => {
            const nameMatch = tag.match(/name="([^"]+)"/);
            const idMatch = tag.match(/machineIdentifier="([^"]+)"/);
            if (idMatch) {
                return { name: nameMatch ? nameMatch[1] : 'Unknown', identifier: idMatch[1] };
            }
            return null;
        }).filter(Boolean);
    };

    const validatePlexServerAdminToken = async (plexToken, plexServerUrl) => {
        const token = normalizePlexToken(plexToken);
        const directUrl = await resolveIntegrationUrlForFetch(plexServerUrl);
        if (!token || !directUrl) return false;
        try {
            const res = await fetchWithTimeout(`${directUrl}/library/sections?X-Plex-Container-Size=1`, {
                headers: { 'X-Plex-Token': token, Accept: 'application/json' },
            }, 6000);
            return res.ok;
        } catch {
            return false;
        }
    };

    const verifyInitialSetupPlexOwner = async (plexToken, serverIdentifier, plexServerUrl = '', config = null) => {
        const token = normalizePlexToken(plexToken);
        if (!token || !serverIdentifier || token === secretMask) return false;
        try {
            const servers = await fetchOwnedPlexServers(token);
            if (servers.some(server => String(server.identifier) === String(serverIdentifier))) {
                return true;
            }
        } catch (e) {
            log(`Initial setup Plex owner verification via Plex.tv failed: ${e.message}`);
        }

        const cfg = config || {};
        let directUrl = String(plexServerUrl || '').trim() || resolveConfiguredPlexServerUrl(cfg);
        if (!directUrl || (isLoopbackPlexUri(directUrl) && shouldPreferRemotePlexConnection())) {
            directUrl = await resolvePlexServerUrlForVerification(token, cfg, serverIdentifier);
        }
        if (directUrl) {
            try {
                const baseUrl = await resolveIntegrationUrlForFetch(directUrl);
                const identityRes = await fetchWithTimeout(`${baseUrl}/identity`, {
                    headers: { 'X-Plex-Token': token, Accept: 'application/json' },
                }, 6000);
                if (!identityRes.ok) return false;

                const identityText = await identityRes.text();
                let machineIdentifier = '';
                try {
                    const parsed = JSON.parse(identityText);
                    const container = parsed?.MediaContainer || parsed || {};
                    machineIdentifier = String(container.machineIdentifier || '');
                } catch {
                    const machineMatch = identityText.match(/machineIdentifier="([^"]+)"/i)
                        || identityText.match(/<machineIdentifier>([^<]+)<\/machineIdentifier>/i);
                    machineIdentifier = machineMatch ? String(machineMatch[1]) : '';
                }

                if (machineIdentifier && String(machineIdentifier) === String(serverIdentifier)) {
                    return validatePlexServerAdminToken(token, directUrl);
                }
            } catch (e) {
                log(`Initial setup Plex owner verification via direct URL failed: ${e.message}`);
            }
        }

        return false;
    };

    return {
        normalizePlexToken,
        resolveConfiguredPlexServerUrl,
        resolvePlexServerUrlForVerification,
        fetchOwnedPlexServers,
        validatePlexServerAdminToken,
        verifyInitialSetupPlexOwner,
    };
};
