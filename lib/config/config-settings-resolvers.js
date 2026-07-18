export const createResolveConfigIntegrationUrl = (sanitizeIntegrationUrl) => async (incoming, existing) => {
    const existingValue = typeof existing === 'string' ? existing : '';
    // Keep existing URL as-is when caller did not change the value.
    // This prevents unrelated settings edits from failing on legacy private URLs.
    if (incoming === undefined || incoming === null) return existingValue;
    const incomingValue = String(incoming).trim();
    if (incomingValue === String(existingValue || '').trim()) return existingValue;
    return sanitizeIntegrationUrl(incomingValue);
};

export const createResolveSecret = (secretMask) => (incoming, existing) => {
    if (incoming === undefined || incoming === null) return existing || '';
    if (incoming === secretMask) return existing || '';
    return String(incoming);
};

export const resolveSafeIntegrationUrls = async ({
    body,
    existingConfig,
    resolveConfigIntegrationUrl,
}) => {
    const {
        plexServerUrl: plexServerUrlFromBody,
        jellyfinUrl,
        sonarrUrl,
        radarrUrl,
        lidarrUrl,
        tautulliUrl,
        jellystatUrl,
        requestAppUrl,
        ombiUrl,
    } = body;

    try {
        const [
            safeSonarrUrl,
            safeRadarrUrl,
            safeLidarrUrl,
            safeTautulliUrl,
            safeJellystatUrl,
            safeRequestAppUrl,
            safeOmbiUrl,
            safeJellyfinUrl,
            safePlexServerUrl,
        ] = await Promise.all([
            resolveConfigIntegrationUrl(sonarrUrl, existingConfig.sonarrUrl || ''),
            resolveConfigIntegrationUrl(radarrUrl, existingConfig.radarrUrl || ''),
            resolveConfigIntegrationUrl(lidarrUrl, existingConfig.lidarrUrl || ''),
            resolveConfigIntegrationUrl(tautulliUrl, existingConfig.tautulliUrl || ''),
            resolveConfigIntegrationUrl(jellystatUrl, existingConfig.jellystatUrl || ''),
            resolveConfigIntegrationUrl(requestAppUrl, existingConfig.requestAppUrl || ''),
            resolveConfigIntegrationUrl(ombiUrl, existingConfig.ombiUrl || ''),
            resolveConfigIntegrationUrl(jellyfinUrl, existingConfig.jellyfinUrl || ''),
            plexServerUrlFromBody !== undefined
                ? resolveConfigIntegrationUrl(plexServerUrlFromBody, existingConfig.plexServerUrl || '')
                : Promise.resolve(existingConfig.plexServerUrl || ''),
        ]);
        return {
            safeSonarrUrl,
            safeRadarrUrl,
            safeLidarrUrl,
            safeTautulliUrl,
            safeJellystatUrl,
            safeRequestAppUrl,
            safeOmbiUrl,
            safeJellyfinUrl,
            safePlexServerUrl,
        };
    } catch (e) {
        throw new Error(`Invalid integration URL: ${e.message}`);
    }
};
