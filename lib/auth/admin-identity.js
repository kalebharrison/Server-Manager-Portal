export const isPlexConfigured = (config = {}) => !!(config && config.plexToken && config.serverIdentifier);

export const isJellyfinConfigured = (config = {}) => (
    String(config?.mediaServerType || '').toLowerCase() === 'jellyfin'
    && !!(config?.jellyfinUrl && config?.jellyfinApiKey)
);

export const isPortalConfigured = (config = {}) => isPlexConfigured(config) || isJellyfinConfigured(config);

export const createAdminIdentity = ({
    apiFetch,
    secretMask,
    loadFile,
    saveFile,
    configPath,
    resolveJellyfinAdmin,
    log = () => {},
}) => {
    const syncAdminPlexIdFromConfigToken = async (config, { persist = false } = {}) => {
        if (!config?.plexToken || config.plexToken === secretMask) return config;
        try {
            const ownerRes = await apiFetch('https://plex.tv/api/v2/user', config.plexToken);
            if (!ownerRes.ok) return config;
            const ownerData = await ownerRes.json();
            const ownerId = ownerData?.id ? String(ownerData.id) : '';
            if (!ownerId) return config;
            if (String(config.adminPlexId || '') !== ownerId) {
                log(`Syncing adminPlexId -> ${ownerId} from configured Plex token (was ${config.adminPlexId || 'unset'})`);
                config.adminPlexId = ownerId;
                if (persist) await saveFile(configPath, config);
            }
        } catch (e) {
            log(`Admin Plex ID sync skipped: ${e.message}`);
        }
        return config;
    };

    const getAdminId = async (config) => {
        if (config?.adminPlexId) return String(config.adminPlexId);
        if (!config || !config.plexToken || config.plexToken === secretMask) return null;
        try {
            const res = await apiFetch('https://plex.tv/api/v2/user', config.plexToken);
            if (!res.ok) return null;
            const data = await res.json();
            return data?.id ? String(data.id) : null;
        } catch (e) {
            log('Failed to fetch admin info: ' + e.message);
            return null;
        }
    };

    const resolveCurrentAdmin = async (sessionUser, config = null) => {
        const loadedConfig = config || await loadFile(configPath, {});
        if (String(loadedConfig?.mediaServerType || '').toLowerCase() === 'jellyfin') {
            return resolveJellyfinAdmin(sessionUser, loadedConfig);
        }
        if (!sessionUser?.plexId) return false;
        const adminId = await getAdminId(loadedConfig);
        return !!(adminId && String(sessionUser.plexId) === String(adminId));
    };

    return {
        syncAdminPlexIdFromConfigToken,
        getAdminId,
        resolveCurrentAdmin,
        isPlexConfigured,
        isJellyfinConfigured,
        isPortalConfigured,
    };
};
