const DEFAULT_STATUS_GROUPS = [
    { id: 'core', name: 'Core Infrastructure', order: 0 },
    { id: 'media', name: 'Media Stack', order: 1 },
    { id: 'downloads', name: 'Download Clients', order: 2 },
    { id: 'external', name: 'External Services', order: 3 },
];

export const SPEED_TEST_CHUNK_SIZE = 1024 * 1024;
export const SPEED_TEST_BUFFER = Buffer.alloc(SPEED_TEST_CHUNK_SIZE, 'x');

export const createDefaultStatusConfig = (config = {}) => {
    const groups = DEFAULT_STATUS_GROUPS.map((group) => ({ ...group }));
    const services = [];
    const addService = (id, name, url, groupId, description = '') => {
        if (!url) return;
        services.push({ id, name, url, type: 'web', groupId, description });
    };

    const publicDomain = String(config.publicDomain || '').trim();
    if (publicDomain) addService('portal', 'Server Portal', `${publicDomain.replace(/\/+$/, '')}/api/health`, 'core', 'Portal API health');

    const mediaServerType = String(config.mediaServerType || 'plex').toLowerCase();
    if (mediaServerType === 'jellyfin') {
        addService('jellyfin', 'Jellyfin', config.jellyfinUrl, 'media', 'Jellyfin media server');
        addService('jellystat', 'Jellystat', config.jellystatUrl, 'media', 'Jellyfin analytics');
    } else {
        if (config.plexServerUrl || config.serverIdentifier) {
            services.push({ id: 'plex', name: 'Plex', url: config.plexServerUrl || '', type: 'web', groupId: 'media', description: 'Plex Media Server' });
        }
        addService('tautulli', 'Tautulli', config.tautulliUrl, 'media', 'Plex analytics');
    }

    addService('sonarr', 'Sonarr', config.sonarrUrl, 'downloads', 'TV automation');
    addService('radarr', 'Radarr', config.radarrUrl, 'downloads', 'Movie automation');
    if (config.requestAppType && config.requestAppType !== 'none') {
        addService(config.requestAppType, config.requestAppType === 'jellyseerr' ? 'Jellyseerr' : 'Seerr', config.requestAppUrl, 'external', 'Requests portal');
    }

    return { groups, services, announcement: null };
};

export const reconcileBuiltInStatusConfig = (statusConfig = {}, appConfig = {}) => {
    const next = {
        ...statusConfig,
        groups: Array.isArray(statusConfig.groups) ? statusConfig.groups : [],
        services: Array.isArray(statusConfig.services) ? [...statusConfig.services] : [],
    };
    const publicDomain = String(appConfig.publicDomain || '').trim().replace(/\/+$/, '');
    const plexServerUrl = String(appConfig.plexServerUrl || '').trim();
    const plexConfigured = String(appConfig.mediaServerType || 'plex').toLowerCase() !== 'jellyfin'
        && !!(plexServerUrl || appConfig.serverIdentifier);
    next.services = next.services.filter((service) => service?.id !== 'plex' || plexConfigured).map((service) => {
        if (service?.id === 'portal' && publicDomain) {
            return { ...service, url: `${publicDomain}/api/health` };
        }
        if (service?.id === 'plex') {
            return { ...service, url: plexServerUrl };
        }
        return service;
    });
    if (plexConfigured && !next.services.some((service) => service?.id === 'plex')) {
        next.services.push({ id: 'plex', name: 'Plex', url: plexServerUrl, type: 'web', groupId: 'media', description: 'Plex Media Server' });
    }
    return next;
};

export const createPublicStatusPayload = (statusConfig = {}, healthData = {}) => {
    const publicServiceName = (service = {}) => {
        const name = String(service.name || '').trim();
        if (service.id === 'sonarr' && (!name || name.toLowerCase() === 'sonarr')) return 'TV Automation';
        if (service.id === 'radarr' && (!name || name.toLowerCase() === 'radarr')) return 'Movie Automation';
        return name || 'Service';
    };
    const publicServiceDescription = (service = {}) => {
        const description = String(service.description || '').trim();
        if (service.id === 'sonarr' && (!description || description.toLowerCase() === 'tv automation')) return 'TV release automation';
        if (service.id === 'radarr' && (!description || description.toLowerCase() === 'movie automation')) return 'Movie release automation';
        return description;
    };
    const publicServices = (statusConfig.services || []).map(service => ({
        id: service.id,
        name: publicServiceName(service),
        groupId: service.groupId,
        type: service.type || 'web',
        description: publicServiceDescription(service)
    }));
    const groups = (statusConfig.groups || []).map(group => ({ id: group.id, name: group.name, order: group.order }));
    return {
        config: {
            services: publicServices,
            groups,
            announcement: statusConfig.announcement || null
        },
        healthData
    };
};

export const calculateUptime30Days = (healthDataObj) => {
    if (!healthDataObj) return 100;

    let totalUp = 0;
    let totalChecks = 0;
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);

    for (const [key, service] of Object.entries(healthDataObj)) {
        if (key === '_meta' || !service.dailyHistory) continue;

        for (const [dateStr, stat] of Object.entries(service.dailyHistory)) {
            if (new Date(dateStr).getTime() >= thirtyDaysAgo) {
                totalUp += stat.up || 0;
                totalChecks += stat.total || 0;
            }
        }
    }

    if (totalChecks === 0) return 100;
    return (totalUp / totalChecks) * 100;
};
