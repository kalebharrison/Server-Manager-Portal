export const createAdminProfileService = ({
    fetch,
    resolveIntegrationUrlForFetch,
    jellyfinHeaders,
    getPlexConnectionUri,
    log,
}) => {
    let cachedAdminProfile = null;
    let lastAdminProfileFetch = 0;

    const invalidateAdminProfileCache = () => {
        cachedAdminProfile = null;
        lastAdminProfileFetch = 0;
    };

    const getAdminProfile = async (config) => {
        if (String(config?.mediaServerType || '').toLowerCase() === 'jellyfin') {
            let serverName = 'Jellyfin Server';
            try {
                if (config?.jellyfinUrl && config?.jellyfinApiKey) {
                    const baseUrl = resolveIntegrationUrlForFetch(config.jellyfinUrl);
                    const infoRes = await fetch(`${baseUrl}/System/Info`, {
                        headers: jellyfinHeaders(config.jellyfinApiKey),
                    });
                    if (infoRes.ok) {
                        const info = await infoRes.json();
                        serverName = info.ServerName || info.LocalAddress || serverName;
                    }
                }
            } catch (e) {
                log(`Failed to fetch Jellyfin server info: ${e.message}`);
            }
            return { thumb: null, serverName };
        }

        if (!config || !config.plexToken) return { thumb: null, serverName: 'Server Portal' };

        if (cachedAdminProfile && Date.now() - lastAdminProfileFetch < 3600000) {
            return cachedAdminProfile;
        }

        try {
            const userRes = await fetch('https://plex.tv/api/v2/user', {
                headers: { 'X-Plex-Token': config.plexToken, Accept: 'application/json' },
            }).then((r) => r.json());

            let serverName = 'Server Portal';
            const uri = await getPlexConnectionUri(config);
            if (uri) {
                const serverRes = await fetch(`${uri}/?X-Plex-Token=${config.plexToken}`, {
                    headers: { Accept: 'application/json' },
                }).then((r) => r.json()).catch(() => null);
                if (serverRes?.MediaContainer?.friendlyName) {
                    serverName = serverRes.MediaContainer.friendlyName;
                }
            }

            cachedAdminProfile = { thumb: userRes.thumb || null, serverName };
            lastAdminProfileFetch = Date.now();
            return cachedAdminProfile;
        } catch (e) {
            return { thumb: null, serverName: 'Server Portal' };
        }
    };

    return {
        getAdminProfile,
        invalidateAdminProfileCache,
    };
};
