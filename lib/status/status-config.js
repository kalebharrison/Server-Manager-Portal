import { getReadyArrInstances } from '../media-stack/arr-instances.js';

const DEFAULT_STATUS_GROUPS = [
    { id: 'core', name: 'Core Infrastructure', order: 0 },
    { id: 'media', name: 'Media Stack', order: 1 },
    { id: 'downloads', name: 'Download Clients', order: 2 },
    { id: 'external', name: 'External Services', order: 3 },
];

const downloadClientStatusServices = (appConfig = {}) => {
    const services = [];
    const qbitUrl = String(appConfig.qcQbitUrl || '').trim();
    if (qbitUrl) {
        services.push({
            id: 'torrent',
            name: 'Torrent',
            url: qbitUrl,
            type: 'web',
            groupId: 'downloads',
            description: 'Torrent downloads',
        });
    }
    const sabUrl = String(appConfig.qcSabUrl || '').trim();
    if (sabUrl && String(appConfig.qcSabApiKey || '').trim()) {
        services.push({
            id: 'usenet',
            name: 'Usenet',
            url: sabUrl,
            type: 'web',
            groupId: 'downloads',
            description: 'Usenet downloads',
        });
    }
    return services;
};

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

    const descriptions = { sonarr: 'TV automation', radarr: 'Movie automation', lidarr: 'Music automation' };
    for (const type of Object.keys(descriptions)) {
        getReadyArrInstances(config, type).forEach((instance, index) => {
            addService(index === 0 ? type : `${type}-${instance.id}`, instance.name, instance.url, 'downloads', descriptions[type]);
        });
    }
    for (const client of downloadClientStatusServices(config)) {
        addService(client.id, client.name, client.url, client.groupId, client.description);
    }
    if (config.tmdbApiKey) addService('tmdb', 'TMDB', 'https://api.themoviedb.org', 'external', 'Media metadata');
    if (config.tvdbApiKey) addService('tvdb', 'TVDB', 'https://api4.thetvdb.com', 'external', 'TV metadata enrichment');

    return { groups, services, announcement: null };
};

export const reconcileBuiltInStatusConfig = (statusConfig = {}, appConfig = {}) => {
    const next = {
        ...statusConfig,
        groups: Array.isArray(statusConfig.groups) ? [...statusConfig.groups] : [],
        services: Array.isArray(statusConfig.services) ? [...statusConfig.services] : [],
    };
    const publicDomain = String(appConfig.publicDomain || '').trim().replace(/\/+$/, '');
    const plexServerUrl = String(appConfig.plexServerUrl || '').trim();
    const arrDescriptions = { sonarr: 'TV automation', radarr: 'Movie automation', lidarr: 'Music automation' };
    const expectedArrServices = new Map();
    for (const type of Object.keys(arrDescriptions)) {
        getReadyArrInstances(appConfig, type).forEach((instance, index) => {
            const id = index === 0 ? type : `${type}-${instance.id}`;
            expectedArrServices.set(id, { id, name: instance.name, url: instance.url, type: 'web', groupId: 'downloads', description: arrDescriptions[type] });
        });
    }
    const expectedDownloadClients = new Map(
        downloadClientStatusServices(appConfig).map((service) => [service.id, service]),
    );
    const metadataServices = {
        tmdb: { configured: !!appConfig.tmdbApiKey, url: 'https://api.themoviedb.org', name: 'TMDB', description: 'Media metadata' },
        tvdb: { configured: !!appConfig.tvdbApiKey, url: 'https://api4.thetvdb.com', name: 'TVDB', description: 'TV metadata enrichment' },
    };
    const ensureGroup = (id, name, order) => {
        if (!next.groups.some((group) => group.id === id)) next.groups.push({ id, name, order });
    };
    if (expectedArrServices.size > 0 || expectedDownloadClients.size > 0) ensureGroup('downloads', 'Download Clients', 2);
    if (Object.values(metadataServices).some((service) => service.configured)) ensureGroup('external', 'External Services', 3);
    const plexConfigured = String(appConfig.mediaServerType || 'plex').toLowerCase() !== 'jellyfin'
        && !!(plexServerUrl || appConfig.serverIdentifier);
    next.services = next.services.filter((service) => {
        // Drop retired Ombi auto-monitor entries.
        if (service?.id === 'ombi') return false;
        if (service?.id === 'plex') return plexConfigured;
        if (metadataServices[service?.id]) return metadataServices[service.id].configured;
        if (/^(sonarr|radarr|lidarr)(-|$)/.test(String(service?.id || ''))) return expectedArrServices.has(service.id);
        if (service?.id === 'torrent' || service?.id === 'usenet') return expectedDownloadClients.has(service.id);
        return true;
    }).map((service) => {
        if (service?.id === 'portal' && publicDomain) {
            return { ...service, url: `${publicDomain}/api/health` };
        }
        if (service?.id === 'plex') {
            return { ...service, url: plexServerUrl };
        }
        if (expectedArrServices.has(service?.id)) {
            const expected = expectedArrServices.get(service.id);
            return { ...service, url: expected.url };
        }
        if (expectedDownloadClients.has(service?.id)) {
            const expected = expectedDownloadClients.get(service.id);
            return { ...service, url: expected.url };
        }
        if (metadataServices[service?.id]) {
            return { ...service, url: metadataServices[service.id].url };
        }
        return service;
    });
    if (plexConfigured && !next.services.some((service) => service?.id === 'plex')) {
        next.services.push({ id: 'plex', name: 'Plex', url: plexServerUrl, type: 'web', groupId: 'media', description: 'Plex Media Server' });
    }
    for (const expected of expectedArrServices.values()) {
        if (!next.services.some((service) => service?.id === expected.id)) next.services.push(expected);
    }
    for (const expected of expectedDownloadClients.values()) {
        if (!next.services.some((service) => service?.id === expected.id)) next.services.push(expected);
    }
    for (const [id, metadata] of Object.entries(metadataServices)) {
        if (metadata.configured && !next.services.some((service) => service?.id === id)) {
            next.services.push({ id, name: metadata.name, url: metadata.url, type: 'web', groupId: 'external', description: metadata.description });
        }
    }
    return next;
};
