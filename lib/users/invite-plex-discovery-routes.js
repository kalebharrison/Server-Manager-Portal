import jwt from 'jsonwebtoken';

import { verifySessionJwt } from '../auth/jwt-session.js';

export const resolvePlexDiscoveryToken = (incomingToken, storedToken, secretMask, normalizePlexToken) => (
    normalizePlexToken(incomingToken === secretMask ? storedToken : incomingToken)
);

export const registerInvitePlexDiscoveryRoutes = ({
    app,
    setupRateLimit,
    configPath,
    jwtSecret,
    secretMask,
    loadFile,
    normalizePlexToken,
    isPortalConfigured,
    resolveCurrentAdmin,
    fetchOwnedPlexServers,
    validatePlexServerAdminToken,
    canRunInitialSetup,
    resolveConfiguredPlexServerUrl,
    resolveIntegrationUrlForFetch,
    sanitizeIntegrationUrl = null,
    fetchWithTimeout,
    log,
}) => {
    const CONFIG_PATH = configPath;
    const JWT_SECRET = jwtSecret;
    const SECRET_MASK = secretMask;
    const UNCONFIGURED_SETUP_ACCESS_DENIED = 'Initial setup access denied. Use localhost, configure SETUP_TOKEN, or provide a valid Plex server owner token.';

    const verifyPlexOwnerTokenForSetup = async (plexToken, plexServerUrl = '') => {
        const token = normalizePlexToken(plexToken);
        if (!token) return false;
        try {
            const servers = await fetchOwnedPlexServers(token);
            if (servers.length > 0) return true;
        } catch (e) {
            log(`Plex owner token verification via Plex.tv failed: ${e.message}`);
        }
        const directUrl = String(plexServerUrl || '').trim();
        return directUrl ? validatePlexServerAdminToken(token, directUrl) : false;
    };

    app.post('/api/plex/servers', setupRateLimit, async (req, res) => {
        const { token, plexServerUrl } = req.body;

        try {
            const existingConfig = await loadFile(CONFIG_PATH, {});
            const isConfigured = isPortalConfigured(existingConfig);
            if (isConfigured) {
                const sessionToken = req.cookies && req.cookies.session;
                if (!sessionToken) {
                    return res.status(403).json({ error: 'Forbidden: Admin session required.' });
                }
                let decoded;
                try {
                    decoded = verifySessionJwt(jwt, sessionToken, JWT_SECRET);
                } catch (e) {
                    return res.status(403).json({ error: 'Forbidden: Invalid admin session.' });
                }
                const isAdmin = await resolveCurrentAdmin(decoded, existingConfig);
                if (!isAdmin) {
                    return res.status(403).json({ error: 'Forbidden: Admins only.' });
                }
            }
            const normalizedToken = resolvePlexDiscoveryToken(token, existingConfig.plexToken, SECRET_MASK, normalizePlexToken);
            if (!normalizedToken) return res.status(400).json({ error: 'Plex token is required.' });
            if (!isConfigured && !canRunInitialSetup(req) && !(await verifyPlexOwnerTokenForSetup(normalizedToken, plexServerUrl || resolveConfiguredPlexServerUrl(existingConfig)))) {
                return res.status(403).json({ error: UNCONFIGURED_SETUP_ACCESS_DENIED });
            }

            log('Fetching Plex servers using /pms/servers XML API...');
            let servers = [];
            try {
                servers = await fetchOwnedPlexServers(normalizedToken);
            } catch (e) {
                log(`Owned Plex server discovery failed: ${e.message}`);
            }

            const rawDirectUrl = String(plexServerUrl || '').trim() || resolveConfiguredPlexServerUrl(existingConfig);
            if (servers.length === 0 && rawDirectUrl) {
                try {
                    const baseUrl = sanitizeIntegrationUrl
                        ? await sanitizeIntegrationUrl(rawDirectUrl)
                        : resolveIntegrationUrlForFetch(rawDirectUrl);
                    if (!baseUrl) throw new Error('Invalid Plex server URL.');
                    const identityRes = await fetchWithTimeout(`${baseUrl}/identity`, {
                        headers: { 'X-Plex-Token': normalizedToken, Accept: 'application/json' },
                    }, 6000);
                    if (identityRes.ok) {
                        const identityText = await identityRes.text();
                        let machineIdentifier = '';
                        let friendlyName = '';
                        try {
                            const parsed = JSON.parse(identityText);
                            const container = parsed?.MediaContainer || parsed || {};
                            machineIdentifier = String(container.machineIdentifier || '');
                            friendlyName = String(container.friendlyName || container.name || 'Plex Server');
                        } catch {
                            const machineMatch = identityText.match(/machineIdentifier="([^"]+)"/i)
                                || identityText.match(/<machineIdentifier>([^<]+)<\/machineIdentifier>/i);
                            machineIdentifier = machineMatch ? String(machineMatch[1]) : '';
                            const nameMatch = identityText.match(/friendlyName="([^"]+)"/i)
                                || identityText.match(/<friendlyName>([^<]+)<\/friendlyName>/i);
                            friendlyName = nameMatch ? String(nameMatch[1]) : 'Plex Server';
                        }
                        if (machineIdentifier) {
                            servers = [{ name: friendlyName || 'Plex Server', identifier: machineIdentifier }];
                        }
                    }
                } catch (e) {
                    log(`Direct Plex URL identity fallback failed: ${e.message}`);
                }
            }

            if (servers.length === 0) {
                log('No owned servers found via Plex.tv or direct URL.');
            } else {
                log(`Found ${servers.length} server(s).`);
            }

            res.json(servers);
        } catch (error) {
            log(`An exception occurred in /api/plex/servers: ${error.message}`);
            const isPolicyError = /private or local|invalid url|not allowed/i.test(String(error.message || ''));
            res.status(isPolicyError ? 400 : 500).json({
                error: isPolicyError ? error.message : 'Failed to fetch Plex servers.',
            });
        }
    });
};
