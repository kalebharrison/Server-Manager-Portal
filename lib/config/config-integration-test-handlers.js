import {
    isSeerrFamilyRequestApp,
    resolveIntegrationUrlForTest,
    resolveTestCredential,
} from './config-integration-test-access.js';
import {
    testLidarrConnection,
    testRadarrConnection,
    testSonarrConnection,
} from './config-integration-test-arr-handlers.js';

export const testSeerrFamilyConnection = async (baseUrl, apiKey, fetchWithTimeout) => {
    const headers = { Accept: 'application/json', 'X-Api-Key': apiKey };
    const statusRes = await fetchWithTimeout(`${baseUrl}/api/v1/status`, { headers }, 12000);
    if (!statusRes.ok) throw new Error(`Seerr returned HTTP ${statusRes.status} at /api/v1/status`);
    const data = await statusRes.json().catch(() => ({}));
    const authRes = await fetchWithTimeout(`${baseUrl}/api/v1/request/count`, { headers }, 12000);
    if (!authRes.ok) throw new Error(`Seerr API key rejected (HTTP ${authRes.status})`);
    const version = data.version || data.commitTag || '?';
    return { version, message: `Seerr v${version} connected` };
};

export const runIntegrationTest = async ({
    type,
    instanceId,
    body,
    stored,
    secretMask,
    sanitizeIntegrationUrl,
    resolveIntegrationUrlForFetch,
    fetchWithTimeout,
    invalidatePlexConnectionCaches,
    getPlexConnectionUri,
}) => {
    const {
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
    } = body || {};

    const urlOpts = { secretMask, sanitizeIntegrationUrl };

    if (type === 'plex') {
        const plexToken = resolveTestCredential(token, stored.plexToken, secretMask);
        const serverId = resolveTestCredential(serverIdentifier, stored.serverIdentifier, secretMask);
        if (!plexToken || !serverId) return { status: 400, error: 'Plex token and server identifier are required.' };
        invalidatePlexConnectionCaches();
        const directUrl = resolveTestCredential(plexServerUrl, stored.plexServerUrl, secretMask);
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
        return { ok: true, message, details: { version: version || null, machineIdentifier: container.machineIdentifier || serverId, uri } };
    }

    if (type === 'jellyfin') {
        const url = await resolveIntegrationUrlForTest(jellyfinUrl, stored.jellyfinUrl, urlOpts);
        const apiKey = resolveTestCredential(jellyfinApiKey, stored.jellyfinApiKey, secretMask);
        if (!url || !apiKey) return { status: 400, error: 'Jellyfin URL and API key are required.' };
        const infoRes = await fetchWithTimeout(`${url}/System/Info`, {
            headers: { Accept: 'application/json', 'X-Emby-Token': apiKey },
        }, 12000);
        if (!infoRes.ok) throw new Error(`Jellyfin returned HTTP ${infoRes.status}`);
        const data = await infoRes.json().catch(() => ({}));
        const version = data.Version || data.version || '?';
        return { ok: true, message: `Jellyfin v${version} connected`, details: { version, serverName: data.ServerName || data.LocalAddress || null } };
    }

    if (type === 'sonarr') {
        return testSonarrConnection({
            sonarrUrl, sonarrApiKey, stored, instanceId, secretMask, urlOpts, fetchWithTimeout,
        });
    }

    if (type === 'radarr') {
        return testRadarrConnection({
            radarrUrl, radarrApiKey, stored, instanceId, secretMask, urlOpts, fetchWithTimeout,
        });
    }

    if (type === 'lidarr') {
        return testLidarrConnection({
            lidarrUrl, lidarrApiKey, stored, instanceId, secretMask, urlOpts, fetchWithTimeout,
        });
    }

    if (type === 'tmdb') {
        const apiKey = resolveTestCredential(tmdbApiKey, stored.tmdbApiKey, secretMask);
        if (!apiKey) return { status: 400, error: 'TMDB API key is required.' };
        const configurationRes = await fetchWithTimeout(`https://api.themoviedb.org/3/configuration?api_key=${encodeURIComponent(apiKey)}`, {
            headers: { Accept: 'application/json' },
        }, 12000);
        if (!configurationRes.ok) throw new Error(`TMDB returned HTTP ${configurationRes.status}`);
        const data = await configurationRes.json().catch(() => ({}));
        if (!data?.images?.secure_base_url) throw new Error('TMDB returned an invalid configuration response.');
        return { ok: true, message: 'TMDB connected', details: { authenticated: true } };
    }

    if (type === 'tvdb') {
        const apiKey = resolveTestCredential(tvdbApiKey, stored.tvdbApiKey, secretMask);
        const pin = resolveTestCredential(tvdbPin, stored.tvdbPin, secretMask);
        if (!apiKey) return { status: 400, error: 'TVDB API key is required.' };
        const loginRes = await fetchWithTimeout('https://api4.thetvdb.com/v4/login', {
            method: 'POST',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ apikey: apiKey, ...(pin ? { pin } : {}) }),
        }, 12000);
        if (!loginRes.ok) throw new Error(`TVDB returned HTTP ${loginRes.status}`);
        const data = await loginRes.json().catch(() => ({}));
        if (!data?.data?.token) throw new Error('TVDB did not return an authentication token.');
        return { ok: true, message: 'TVDB connected', details: { authenticated: true } };
    }

    if (type === 'tautulli') {
        const url = await resolveIntegrationUrlForTest(tautulliUrl, stored.tautulliUrl, urlOpts);
        const apiKey = resolveTestCredential(tautulliApiKey, stored.tautulliApiKey, secretMask);
        if (!url || !apiKey) return { status: 400, error: 'Tautulli URL and API key are required.' };
        const infoRes = await fetchWithTimeout(`${url}/api/v2?apikey=${encodeURIComponent(apiKey)}&cmd=get_server_info`, {
            headers: { Accept: 'application/json' },
        }, 12000);
        if (!infoRes.ok) throw new Error(`Tautulli returned HTTP ${infoRes.status}`);
        const payload = await infoRes.json();
        if (payload?.response?.result !== 'success') throw new Error(payload?.response?.message || 'Tautulli API error');
        const info = payload.response.data || {};
        return { ok: true, message: `Tautulli connected (${info.pms_name || 'Plex'})`, details: { pmsVersion: info.pms_version, pmsPlatform: info.pms_platform } };
    }

    if (type === 'jellystat') {
        const url = await resolveIntegrationUrlForTest(jellystatUrl, stored.jellystatUrl, urlOpts);
        const apiKey = resolveTestCredential(jellystatApiKey, stored.jellystatApiKey, secretMask);
        if (!url || !apiKey) return { status: 400, error: 'Jellystat URL and API key are required.' };
        const statsRes = await fetchWithTimeout(`${url}/stats/getViewsByLibraryType?days=30`, {
            headers: { Accept: 'application/json', 'X-API-Token': apiKey },
        }, 12000);
        if (!statsRes.ok) throw new Error(`Jellystat returned HTTP ${statsRes.status}`);
        const data = await statsRes.json().catch(() => null);
        return { ok: true, message: 'Jellystat connected', details: { sample: data ? true : false } };
    }

    if (type === 'requestApp') {
        const appType = String(resolveTestCredential(requestAppType, stored.requestAppType, secretMask) || 'none').toLowerCase();
        const secondaryOmbi = appType === 'ombi' && (ombiUrl !== undefined || ombiApiKey !== undefined);
        const baseUrl = secondaryOmbi
            ? await resolveIntegrationUrlForTest(ombiUrl, stored.ombiUrl, urlOpts)
            : await resolveIntegrationUrlForTest(requestAppUrl, stored.requestAppUrl, urlOpts);
        const apiKey = secondaryOmbi
            ? resolveTestCredential(ombiApiKey, stored.ombiApiKey, secretMask)
            : resolveTestCredential(requestAppApiKey, stored.requestAppApiKey, secretMask);
        if (appType === 'none') return { status: 400, error: 'Request app type must be selected.' };
        if (!baseUrl || !apiKey) return { status: 400, error: 'Request app URL and API key are required.' };
        if (isSeerrFamilyRequestApp(appType)) {
            const result = await testSeerrFamilyConnection(baseUrl, apiKey, fetchWithTimeout);
            return { ok: true, message: result.message, details: { version: result.version } };
        }
        if (appType === 'ombi') {
            const headers = { Accept: 'application/json', 'X-Api-Key': apiKey };
            const aboutRes = await fetchWithTimeout(`${baseUrl}/api/v1/Settings/about`, { headers }, 12000);
            if (!aboutRes.ok) throw new Error(`Ombi returned HTTP ${aboutRes.status}`);
            const data = await aboutRes.json().catch(() => ({}));
            return { ok: true, message: `Ombi v${data.version || data.applicationVersion || '?'} connected`, details: { version: data.version || data.applicationVersion } };
        }
        return { status: 400, error: 'Unsupported request app type.' };
    }

    return { status: 400, error: 'Unknown integration type.' };
};
