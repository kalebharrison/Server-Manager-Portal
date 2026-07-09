import fsSync from 'fs';
import fetch from 'node-fetch';

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

    const isLoopbackPlexUri = (uri = '') => {
        try {
            const { hostname } = new URL(uri);
            return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
        } catch (e) {
            return false;
        }
    };

    const shouldPreferRemotePlexConnection = () => {
        const override = String(process.env.PLEX_PREFER_REMOTE_CONNECTION || '').toLowerCase();
        if (override === 'true') return true;
        if (override === 'false') return false;
        // Inside Docker, Plex "local" URLs usually mean the container loopback — not the host.
        return fsSync.existsSync('/.dockerenv');
    };

    const pickPlexConnection = (connections = []) => {
        if (!Array.isArray(connections) || connections.length === 0) return null;
        if (shouldPreferRemotePlexConnection()) {
            const remote = connections.find(c => !c.local && !isLoopbackPlexUri(c.uri));
            if (remote) return remote;
            const nonLoopback = connections.find(c => !isLoopbackPlexUri(c.uri));
            if (nonLoopback) return nonLoopback;
        }
        return connections.find(c => c.local) || connections[0];
    };

    const fetchWithTimeout = async (url, options = {}, timeoutMs = 15000) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            return await fetch(url, { ...options, signal: controller.signal });
        } finally {
            clearTimeout(timer);
        }
    };

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
            const errorText = await response.text();
            log(`Error fetching Plex servers (XML). Status: ${response.status}. Response: ${errorText}`);
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
        const directUrl = resolveIntegrationUrlForFetch(plexServerUrl);
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
                const baseUrl = resolveIntegrationUrlForFetch(directUrl);
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

    // Plex interaction helpers
    let cachedPlexAccounts = null;
    let cachedPlexAccountsAt = 0;

    const fetchPlexServerAccounts = async (uri, config) => {
        if (cachedPlexAccounts && (Date.now() - cachedPlexAccountsAt < 5 * 60 * 1000)) {
            return cachedPlexAccounts;
        }
        const accountsRes = await fetchWithTimeout(`${uri}/accounts?X-Plex-Token=${config.plexToken}`, {
            headers: { Accept: 'application/json' },
        }, 8000).then(r => r.json()).catch(() => null);

        const accounts = accountsRes?.MediaContainer?.Account || [];
        const map = {};
        accounts.forEach((acc) => {
            map[String(acc.id)] = {
                id: String(acc.id),
                name: acc.name || '',
                thumb: acc.thumb || null,
            };
        });
        cachedPlexAccounts = { list: accounts, map };
        cachedPlexAccountsAt = Date.now();
        return cachedPlexAccounts;
    };

    const resolveLocalPlexAccountId = async (config, uri, sessionUser) => {
        const norm = (v) => String(v || '').trim().toLowerCase();
        const users = await loadFile(usersPath, []);
        const portalUser = findLocalUserForSession(users, sessionUser);
        if (portalUser?.plexAccountId) return String(portalUser.plexAccountId);

        const { list: accounts } = await fetchPlexServerAccounts(uri, config);
        if (!accounts.length) {
            return sessionUser?.plexId ? String(sessionUser.plexId) : null;
        }

        const byName = accounts.find((a) => norm(a.name) === norm(sessionUser?.username));
        if (byName) return String(byName.id);

        if (sessionUser?.email) {
            const byEmail = accounts.find((a) =>
                norm(a.name) === norm(sessionUser.email) || norm(a.email) === norm(sessionUser.email),
            );
            if (byEmail) return String(byEmail.id);
        }

        if (sessionUser?.plexId) {
            const byPlexId = accounts.find((a) => String(a.id) === String(sessionUser.plexId));
            if (byPlexId) return String(byPlexId.id);
        }

        // Home admin is usually local account 1, but only as a last resort for admins.
        if (sessionUser?.isAdmin) {
            const home = accounts.find((a) => String(a.id) === '1') || accounts[0];
            if (home) return String(home.id);
        }

        return null;
    };

    const getPlexConnectionUri = async (config) => {
        if (cachedPlexConnectionUri && (Date.now() - lastPlexConnectionUriFetch < 60 * 60 * 1000)) {
            return cachedPlexConnectionUri;
        }

        let directUrl = resolveConfiguredPlexServerUrl(config);
        if (!directUrl || (isLoopbackPlexUri(directUrl) && shouldPreferRemotePlexConnection())) {
            directUrl = await resolvePlexServerUrlForVerification(config.plexToken, config, config.serverIdentifier);
        }
        if (directUrl) {
            const normalized = resolveIntegrationUrlForFetch(directUrl);
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
    };
};
