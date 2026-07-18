import { getArrInstance } from '../media-stack/arr-instances.js';
import {
    resolveIntegrationUrlForTest,
    resolveTestCredential,
} from './config-integration-test-access.js';

const testArrConnection = async ({
    label,
    statusPath,
    incomingUrl,
    incomingApiKey,
    storedUrl,
    storedApiKey,
    stored,
    instanceId,
    secretMask,
    urlOpts,
    fetchWithTimeout,
}) => {
    const instance = getArrInstance(stored, instanceId);
    const url = await resolveIntegrationUrlForTest(incomingUrl, instance?.url || storedUrl, urlOpts);
    const apiKey = resolveTestCredential(incomingApiKey, instance?.apiKey || storedApiKey, secretMask);
    if (!url || !apiKey) return { status: 400, error: `${label} URL and API key are required.` };
    const statusRes = await fetchWithTimeout(`${url}${statusPath}`, {
        headers: { 'X-Api-Key': apiKey, Accept: 'application/json' },
    }, 12000);
    if (!statusRes.ok) throw new Error(`${label} returned HTTP ${statusRes.status}`);
    const data = await statusRes.json();
    return { ok: true, message: `${label} v${data.version || '?'} connected`, details: { version: data.version, appName: data.appName } };
};

export const testSonarrConnection = (args) => testArrConnection({
    label: 'Sonarr',
    statusPath: '/api/v3/system/status',
    incomingUrl: args.sonarrUrl,
    incomingApiKey: args.sonarrApiKey,
    storedUrl: args.stored.sonarrUrl,
    storedApiKey: args.stored.sonarrApiKey,
    ...args,
});

export const testRadarrConnection = (args) => testArrConnection({
    label: 'Radarr',
    statusPath: '/api/v3/system/status',
    incomingUrl: args.radarrUrl,
    incomingApiKey: args.radarrApiKey,
    storedUrl: args.stored.radarrUrl,
    storedApiKey: args.stored.radarrApiKey,
    ...args,
});

export const testLidarrConnection = (args) => testArrConnection({
    label: 'Lidarr',
    statusPath: '/api/v1/system/status',
    incomingUrl: args.lidarrUrl,
    incomingApiKey: args.lidarrApiKey,
    storedUrl: args.stored.lidarrUrl,
    storedApiKey: args.stored.lidarrApiKey,
    ...args,
});
