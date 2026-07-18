import { getReadyArrInstances } from '../media-stack/arr-instances.js';

const DEFAULT_STATUS_GROUPS = [
    { id: 'core', name: 'Core Infrastructure', order: 0 },
    { id: 'media', name: 'Media Stack', order: 1 },
    { id: 'downloads', name: 'Download Clients', order: 2 },
    { id: 'external', name: 'External Services', order: 3 },
];

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
    if (config.tmdbApiKey) addService('tmdb', 'TMDB', 'https://api.themoviedb.org', 'external', 'Media metadata');
    if (config.tvdbApiKey) addService('tvdb', 'TVDB', 'https://api4.thetvdb.com', 'external', 'TV metadata enrichment');
    if (config.requestAppType && config.requestAppType !== 'none') {
        addService(config.requestAppType, 'Request Service', config.requestAppUrl, 'external', 'Media requests');
    }
    if (config.ombiUrl && config.ombiApiKey && config.requestAppType !== 'ombi') {
        addService('ombi', 'Music Requests', config.ombiUrl, 'external', 'Music request service');
    }

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
    const metadataServices = {
        tmdb: { configured: !!appConfig.tmdbApiKey, url: 'https://api.themoviedb.org', name: 'TMDB', description: 'Media metadata' },
        tvdb: { configured: !!appConfig.tvdbApiKey, url: 'https://api4.thetvdb.com', name: 'TVDB', description: 'TV metadata enrichment' },
    };
    const primaryOmbi = appConfig.requestAppType === 'ombi' && appConfig.requestAppUrl && appConfig.requestAppApiKey;
    const secondaryOmbi = appConfig.requestAppType !== 'ombi' && appConfig.ombiUrl && appConfig.ombiApiKey;
    const ombiService = primaryOmbi
        ? { configured: true, url: appConfig.requestAppUrl, name: 'Request Service', description: 'Media requests' }
        : { configured: !!secondaryOmbi, url: appConfig.ombiUrl, name: 'Music Requests', description: 'Music request service' };
    const ensureGroup = (id, name, order) => {
        if (!next.groups.some((group) => group.id === id)) next.groups.push({ id, name, order });
    };
    if (expectedArrServices.size > 0) ensureGroup('downloads', 'Download Clients', 2);
    if (Object.values(metadataServices).some((service) => service.configured) || ombiService.configured) ensureGroup('external', 'External Services', 3);
    const plexConfigured = String(appConfig.mediaServerType || 'plex').toLowerCase() !== 'jellyfin'
        && !!(plexServerUrl || appConfig.serverIdentifier);
    next.services = next.services.filter((service) => {
        if (service?.id === 'plex') return plexConfigured;
        if (metadataServices[service?.id]) return metadataServices[service.id].configured;
        if (service?.id === 'ombi') return ombiService.configured;
        if (/^(sonarr|radarr|lidarr)(-|$)/.test(String(service?.id || ''))) return expectedArrServices.has(service.id);
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
        if (metadataServices[service?.id]) {
            return { ...service, url: metadataServices[service.id].url };
        }
        if (service?.id === 'ombi' && ombiService.configured) return { ...service, url: ombiService.url };
        return service;
    });
    if (plexConfigured && !next.services.some((service) => service?.id === 'plex')) {
        next.services.push({ id: 'plex', name: 'Plex', url: plexServerUrl, type: 'web', groupId: 'media', description: 'Plex Media Server' });
    }
    for (const expected of expectedArrServices.values()) {
        if (!next.services.some((service) => service?.id === expected.id)) next.services.push(expected);
    }
    for (const [id, metadata] of Object.entries(metadataServices)) {
        if (metadata.configured && !next.services.some((service) => service?.id === id)) {
            next.services.push({ id, name: metadata.name, url: metadata.url, type: 'web', groupId: 'external', description: metadata.description });
        }
    }
    if (ombiService.configured && !next.services.some((service) => service?.id === 'ombi')) {
        next.services.push({ id: 'ombi', name: ombiService.name, url: ombiService.url, type: 'web', groupId: 'external', description: ombiService.description });
    }
    return next;
};
