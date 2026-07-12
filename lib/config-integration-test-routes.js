import jwt from 'jsonwebtoken';
import { getArrInstance } from './arr-instances.js';

export const registerConfigIntegrationTestRoutes = ({
    app,
    setupRateLimit,
    configPath,
    secretMask,
    jwtSecret,
    loadFile,
    isPortalConfigured,
    resolveCurrentAdmin,
    normalizePlexToken,
    fetchOwnedPlexServers,
    validatePlexServerAdminToken,
    verifyInitialSetupPlexOwner,
    canRunInitialSetup,
    sanitizeIntegrationUrl,
    resolveIntegrationUrlForFetch,
    fetchWithTimeout,
    invalidatePlexConnectionCaches,
    getPlexConnectionUri,
    log,
}) => {
    const CONFIG_PATH = configPath;
    const SECRET_MASK = secretMask;
    const JWT_SECRET = jwtSecret;

    const resolveTestCredential = (incoming, existing) => {
        if (incoming === undefined || incoming === null || incoming === '') return existing || '';
        if (incoming === SECRET_MASK) return existing || '';
        return String(incoming);
    };

    const resolveIntegrationUrlForTest = (incoming, existing) => {
        const url = resolveTestCredential(incoming, existing);
        if (!url) return '';
        const trimmedIncoming = typeof incoming === 'string' ? incoming.trim() : '';
        const trimmedExisting = typeof existing === 'string' ? existing.trim() : '';
        if (trimmedIncoming !== '' && trimmedIncoming !== trimmedExisting) {
            return sanitizeIntegrationUrl(trimmedIncoming);
        }
        return resolveIntegrationUrlForFetch(url);
    };

    const isSeerrFamilyRequestApp = (type) => {
        const lower = String(type || '').toLowerCase();
        return lower === 'seerr' || lower === 'overseerr' || lower === 'jellyseerr';
    };

    const UNCONFIGURED_SETUP_ACCESS_DENIED = 'Initial setup access denied. Use localhost, configure SETUP_TOKEN, or provide a valid Plex server owner token.';

    const verifyPlexOwnerTokenForSetup = async (plexToken, plexServerUrl = '') => {
        const token = normalizePlexToken(plexToken);
        if (!token || token === SECRET_MASK) return false;
        try {
            const servers = await fetchOwnedPlexServers(token);
            if (servers.length > 0) return true;
        } catch (e) {
            log(`Plex owner token verification via Plex.tv failed: ${e.message}`);
        }
        const directUrl = String(plexServerUrl || '').trim();
        return directUrl ? validatePlexServerAdminToken(token, directUrl) : false;
    };

    const assertUnconfiguredSensitiveSetupAccess = async (req, res, stored) => {
        if (canRunInitialSetup(req)) return true;
        const token = req.body?.token;
        const directUrl = req.body?.plexServerUrl || stored?.plexServerUrl || '';
        const type = String(req.body?.type || '').toLowerCase();
        const serverIdentifier = req.body?.serverIdentifier;
        if (type === 'plex' && serverIdentifier) {
            const verified = await verifyInitialSetupPlexOwner(token, serverIdentifier, directUrl, stored);
            if (verified) return true;
        }
        if (await verifyPlexOwnerTokenForSetup(token, directUrl)) return true;
        res.status(403).json({ error: UNCONFIGURED_SETUP_ACCESS_DENIED });
        return false;
    };

    const testSeerrFamilyConnection = async (baseUrl, apiKey) => {
        const headers = { Accept: 'application/json', 'X-Api-Key': apiKey };
        const statusRes = await fetchWithTimeout(`${baseUrl}/api/v1/status`, { headers }, 12000);
        if (!statusRes.ok) throw new Error(`Seerr returned HTTP ${statusRes.status} at /api/v1/status`);
        const data = await statusRes.json().catch(() => ({}));
        const authRes = await fetchWithTimeout(`${baseUrl}/api/v1/request/count`, { headers }, 12000);
        if (!authRes.ok) throw new Error(`Seerr API key rejected (HTTP ${authRes.status})`);
        const version = data.version || data.commitTag || '?';
        return { version, message: `Seerr v${version} connected` };
    };

    const assertIntegrationTestAccess = async (req, res) => {
        const stored = await loadFile(CONFIG_PATH, {});
        const isConfigured = isPortalConfigured(stored);
        if (isConfigured) {
            const sessionToken = req.cookies && req.cookies.session;
            if (!sessionToken) {
                res.status(403).json({ error: 'Forbidden: admin login required.' });
                return false;
            }
            try {
                const decoded = jwt.verify(sessionToken, JWT_SECRET);
                const isAdmin = await resolveCurrentAdmin(decoded, stored);
                if (!isAdmin) {
                    res.status(403).json({ error: 'Forbidden: admins only.' });
                    return false;
                }
                req.user = decoded;
            } catch (e) {
                res.status(403).json({ error: 'Forbidden: invalid session.' });
                return false;
            }
            return true;
        }
        return assertUnconfiguredSensitiveSetupAccess(req, res, stored);
    };

    app.post('/api/config/test-integration', setupRateLimit, async (req, res) => {
        if (!(await assertIntegrationTestAccess(req, res))) return;

        const {
            type,
            instanceId,
            token, serverIdentifier, plexServerUrl,
            jellyfinUrl, jellyfinApiKey,
            sonarrUrl, sonarrApiKey,
            radarrUrl, radarrApiKey,
            lidarrUrl, lidarrApiKey,
            tmdbApiKey,
            tvdbApiKey, tvdbPin,
            tautulliUrl, tautulliApiKey,
            jellystatUrl, jellystatApiKey,
            requestAppType, requestAppUrl, requestAppApiKey,
            ombiUrl, ombiApiKey,
        } = req.body || {};

        const stored = await loadFile(CONFIG_PATH, {});

        try {
            if (type === 'plex') {
                const plexToken = resolveTestCredential(token, stored.plexToken);
                const serverId = resolveTestCredential(serverIdentifier, stored.serverIdentifier);
                if (!plexToken || !serverId) return res.status(400).json({ error: 'Plex token and server identifier are required.' });
                invalidatePlexConnectionCaches();
                const directUrl = resolveTestCredential(plexServerUrl, stored.plexServerUrl);
                const testConfig = { ...stored, plexToken, serverIdentifier: serverId, ...(directUrl ? { plexServerUrl: directUrl } : {}) };
                const uri = await getPlexConnectionUri(testConfig);
                const identityRes = await fetchWithTimeout(`${uri}/identity?X-Plex-Token=${encodeURIComponent(plexToken)}`, {
                    headers: { Accept: 'application/json' },
                }, 12000);
                if (!identityRes.ok) throw new Error(`Plex server returned HTTP ${identityRes.status}`);
                const identity = await identityRes.json().catch(() => ({}));
                const container = identity.MediaContainer || identity;
                const version = container.version || container.Version || '';
                const message = version
                    ? `Connected to Plex Media Server (v${version})`
                    : 'Connected to Plex Media Server';
                return res.json({ ok: true, message, details: { version: version || null, machineIdentifier: container.machineIdentifier || serverId, uri } });
            }

            if (type === 'jellyfin') {
                const url = resolveIntegrationUrlForFetch(resolveTestCredential(jellyfinUrl, stored.jellyfinUrl));
                const apiKey = resolveTestCredential(jellyfinApiKey, stored.jellyfinApiKey);
                if (!url || !apiKey) return res.status(400).json({ error: 'Jellyfin URL and API key are required.' });
                const infoRes = await fetchWithTimeout(`${url}/System/Info`, {
                    headers: { Accept: 'application/json', 'X-Emby-Token': apiKey },
                }, 12000);
                if (!infoRes.ok) throw new Error(`Jellyfin returned HTTP ${infoRes.status}`);
                const data = await infoRes.json().catch(() => ({}));
                const version = data.Version || data.version || '?';
                return res.json({ ok: true, message: `Jellyfin v${version} connected`, details: { version, serverName: data.ServerName || data.LocalAddress || null } });
            }

            if (type === 'sonarr') {
                const instance = getArrInstance(stored, instanceId);
                const url = resolveIntegrationUrlForTest(sonarrUrl, instance?.url || stored.sonarrUrl);
                const apiKey = resolveTestCredential(sonarrApiKey, instance?.apiKey || stored.sonarrApiKey);
                if (!url || !apiKey) return res.status(400).json({ error: 'Sonarr URL and API key are required.' });
                const statusRes = await fetchWithTimeout(`${url}/api/v3/system/status`, {
                    headers: { 'X-Api-Key': apiKey, Accept: 'application/json' },
                }, 12000);
                if (!statusRes.ok) throw new Error(`Sonarr returned HTTP ${statusRes.status}`);
                const data = await statusRes.json();
                return res.json({ ok: true, message: `Sonarr v${data.version || '?'} connected`, details: { version: data.version, appName: data.appName } });
            }

            if (type === 'radarr') {
                const instance = getArrInstance(stored, instanceId);
                const url = resolveIntegrationUrlForTest(radarrUrl, instance?.url || stored.radarrUrl);
                const apiKey = resolveTestCredential(radarrApiKey, instance?.apiKey || stored.radarrApiKey);
                if (!url || !apiKey) return res.status(400).json({ error: 'Radarr URL and API key are required.' });
                const statusRes = await fetchWithTimeout(`${url}/api/v3/system/status`, {
                    headers: { 'X-Api-Key': apiKey, Accept: 'application/json' },
                }, 12000);
                if (!statusRes.ok) throw new Error(`Radarr returned HTTP ${statusRes.status}`);
                const data = await statusRes.json();
                return res.json({ ok: true, message: `Radarr v${data.version || '?'} connected`, details: { version: data.version, appName: data.appName } });
            }

            if (type === 'lidarr') {
                const instance = getArrInstance(stored, instanceId);
                const url = resolveIntegrationUrlForTest(lidarrUrl, instance?.url || stored.lidarrUrl);
                const apiKey = resolveTestCredential(lidarrApiKey, instance?.apiKey || stored.lidarrApiKey);
                if (!url || !apiKey) return res.status(400).json({ error: 'Lidarr URL and API key are required.' });
                const statusRes = await fetchWithTimeout(`${url}/api/v1/system/status`, {
                    headers: { 'X-Api-Key': apiKey, Accept: 'application/json' },
                }, 12000);
                if (!statusRes.ok) throw new Error(`Lidarr returned HTTP ${statusRes.status}`);
                const data = await statusRes.json();
                return res.json({ ok: true, message: `Lidarr v${data.version || '?'} connected`, details: { version: data.version, appName: data.appName } });
            }

            if (type === 'tmdb') {
                const apiKey = resolveTestCredential(tmdbApiKey, stored.tmdbApiKey);
                if (!apiKey) return res.status(400).json({ error: 'TMDB API key is required.' });
                const configurationRes = await fetchWithTimeout(`https://api.themoviedb.org/3/configuration?api_key=${encodeURIComponent(apiKey)}`, {
                    headers: { Accept: 'application/json' },
                }, 12000);
                if (!configurationRes.ok) throw new Error(`TMDB returned HTTP ${configurationRes.status}`);
                const data = await configurationRes.json().catch(() => ({}));
                if (!data?.images?.secure_base_url) throw new Error('TMDB returned an invalid configuration response.');
                return res.json({ ok: true, message: 'TMDB connected', details: { authenticated: true } });
            }

            if (type === 'tvdb') {
                const apiKey = resolveTestCredential(tvdbApiKey, stored.tvdbApiKey);
                const pin = resolveTestCredential(tvdbPin, stored.tvdbPin);
                if (!apiKey) return res.status(400).json({ error: 'TVDB API key is required.' });
                const loginRes = await fetchWithTimeout('https://api4.thetvdb.com/v4/login', {
                    method: 'POST',
                    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
                    body: JSON.stringify({ apikey: apiKey, ...(pin ? { pin } : {}) }),
                }, 12000);
                if (!loginRes.ok) throw new Error(`TVDB returned HTTP ${loginRes.status}`);
                const data = await loginRes.json().catch(() => ({}));
                if (!data?.data?.token) throw new Error('TVDB did not return an authentication token.');
                return res.json({ ok: true, message: 'TVDB connected', details: { authenticated: true } });
            }

            if (type === 'tautulli') {
                const url = resolveIntegrationUrlForTest(tautulliUrl, stored.tautulliUrl);
                const apiKey = resolveTestCredential(tautulliApiKey, stored.tautulliApiKey);
                if (!url || !apiKey) return res.status(400).json({ error: 'Tautulli URL and API key are required.' });
                const infoRes = await fetchWithTimeout(`${url}/api/v2?apikey=${encodeURIComponent(apiKey)}&cmd=get_server_info`, {
                    headers: { Accept: 'application/json' },
                }, 12000);
                if (!infoRes.ok) throw new Error(`Tautulli returned HTTP ${infoRes.status}`);
                const payload = await infoRes.json();
                if (payload?.response?.result !== 'success') throw new Error(payload?.response?.message || 'Tautulli API error');
                const info = payload.response.data || {};
                return res.json({ ok: true, message: `Tautulli connected (${info.pms_name || 'Plex'})`, details: { pmsVersion: info.pms_version, pmsPlatform: info.pms_platform } });
            }

            if (type === 'jellystat') {
                const url = resolveIntegrationUrlForFetch(resolveTestCredential(jellystatUrl, stored.jellystatUrl));
                const apiKey = resolveTestCredential(jellystatApiKey, stored.jellystatApiKey);
                if (!url || !apiKey) return res.status(400).json({ error: 'Jellystat URL and API key are required.' });
                const statsRes = await fetchWithTimeout(`${url}/stats/getViewsByLibraryType?days=30`, {
                    headers: { Accept: 'application/json', 'X-API-Token': apiKey },
                }, 12000);
                if (!statsRes.ok) throw new Error(`Jellystat returned HTTP ${statsRes.status}`);
                const data = await statsRes.json().catch(() => null);
                return res.json({ ok: true, message: 'Jellystat connected', details: { sample: data ? true : false } });
            }

            if (type === 'requestApp') {
                const appType = String(resolveTestCredential(requestAppType, stored.requestAppType) || 'none').toLowerCase();
                const secondaryOmbi = appType === 'ombi' && (ombiUrl !== undefined || ombiApiKey !== undefined);
                const baseUrl = secondaryOmbi
                    ? resolveIntegrationUrlForTest(ombiUrl, stored.ombiUrl)
                    : resolveIntegrationUrlForTest(requestAppUrl, stored.requestAppUrl);
                const apiKey = secondaryOmbi
                    ? resolveTestCredential(ombiApiKey, stored.ombiApiKey)
                    : resolveTestCredential(requestAppApiKey, stored.requestAppApiKey);
                if (appType === 'none') return res.status(400).json({ error: 'Request app type must be selected.' });
                if (!baseUrl || !apiKey) return res.status(400).json({ error: 'Request app URL and API key are required.' });
                if (isSeerrFamilyRequestApp(appType)) {
                    const result = await testSeerrFamilyConnection(baseUrl, apiKey);
                    return res.json({ ok: true, message: result.message, details: { version: result.version } });
                }
                if (appType === 'ombi') {
                    const headers = { Accept: 'application/json', 'X-Api-Key': apiKey };
                    const aboutRes = await fetchWithTimeout(`${baseUrl}/api/v1/Settings/about`, { headers }, 12000);
                    if (!aboutRes.ok) throw new Error(`Ombi returned HTTP ${aboutRes.status}`);
                    const data = await aboutRes.json().catch(() => ({}));
                    return res.json({ ok: true, message: `Ombi v${data.version || data.applicationVersion || '?'} connected`, details: { version: data.version || data.applicationVersion } });
                }
                return res.status(400).json({ error: 'Unsupported request app type.' });
            }

            return res.status(400).json({ error: 'Unknown integration type.' });
        } catch (e) {
            log(`Integration test failed (${type}): ${e.message}`);
            res.status(500).json({ error: e.message || 'Connection test failed.' });
        }
    });
};
