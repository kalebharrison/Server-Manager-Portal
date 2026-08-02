import { getReadyArrInstances } from '../media-stack/arr-instances.js';
import {
    ARR_STATUS_LABELS,
    DOWNLOAD_CLIENT_STATUS_LABELS,
    resolveArrStatusType,
    shouldUseArrStatusFallbackName,
} from './status-labels.js';

const DEFAULT_STATUS_GROUPS = [
    { id: 'core', name: 'Core Infrastructure', order: 0 },
    { id: 'media', name: 'Media Stack', order: 1 },
    { id: 'automation', name: 'Automations', order: 2 },
    { id: 'downloads', name: 'Download Clients', order: 3 },
    { id: 'external', name: 'External Services', order: 4 },
];

const downloadClientStatusServices = (appConfig = {}) => {
    const services = [];
    const qbitUrl = String(appConfig.qcQbitUrl || '').trim();
    if (qbitUrl) {
        services.push({
            id: 'torrent',
            name: DOWNLOAD_CLIENT_STATUS_LABELS.torrent.name,
            url: qbitUrl,
            type: 'web',
            groupId: 'downloads',
            description: DOWNLOAD_CLIENT_STATUS_LABELS.torrent.description,
        });
    }
    const sabUrl = String(appConfig.qcSabUrl || '').trim();
    if (sabUrl && String(appConfig.qcSabApiKey || '').trim()) {
        services.push({
            id: 'usenet',
            name: DOWNLOAD_CLIENT_STATUS_LABELS.usenet.name,
            url: sabUrl,
            type: 'web',
            groupId: 'downloads',
            description: DOWNLOAD_CLIENT_STATUS_LABELS.usenet.description,
        });
    }
    return services;
};

const arrStatusService = (type, instance, index) => {
    const labels = ARR_STATUS_LABELS[type];
    const useFallbackName = shouldUseArrStatusFallbackName({ name: instance.name });
    return {
        id: index === 0 ? type : `${type}-${instance.id}`,
        name: useFallbackName ? labels.name : String(instance.name || labels.name),
        url: instance.url,
        type: 'web',
        groupId: 'automation',
        description: labels.description,
    };
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

    for (const type of Object.keys(ARR_STATUS_LABELS)) {
        getReadyArrInstances(config, type).forEach((instance, index) => {
            services.push(arrStatusService(type, instance, index));
        });
    }
    for (const client of downloadClientStatusServices(config)) {
        services.push(client);
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
    const expectedArrServices = new Map();
    for (const type of Object.keys(ARR_STATUS_LABELS)) {
        getReadyArrInstances(appConfig, type).forEach((instance, index) => {
            const expected = arrStatusService(type, instance, index);
            expectedArrServices.set(expected.id, expected);
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
        const existing = next.groups.find((group) => group.id === id);
        if (!existing) next.groups.push({ id, name, order });
        else if (!String(existing.name || '').trim()) existing.name = name;
    };
    if (expectedArrServices.size > 0) ensureGroup('automation', 'Automations', 2);
    if (expectedDownloadClients.size > 0) ensureGroup('downloads', 'Download Clients', 3);
    if (Object.values(metadataServices).some((service) => service.configured)) ensureGroup('external', 'External Services', 4);

    // Legacy installs used a single "downloads" group for Arr + clients.
    const downloadsGroup = next.groups.find((group) => group.id === 'downloads');
    if (downloadsGroup && /automation/i.test(String(downloadsGroup.name || ''))) {
        downloadsGroup.name = 'Download Clients';
    }

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
            const arrType = resolveArrStatusType(service);
            const labels = arrType ? ARR_STATUS_LABELS[arrType] : null;
            const useFallbackName = shouldUseArrStatusFallbackName(service);
            const existingDescription = String(service.description || '').trim().toLowerCase();
            const weakDescriptions = new Set([
                '',
                `${arrType} automation`,
                'tv automation',
                'movie automation',
                'music automation',
            ]);
            const useFallbackDescription = weakDescriptions.has(existingDescription);
            return {
                ...service,
                url: expected.url,
                groupId: 'automation',
                name: useFallbackName && labels ? labels.name : service.name,
                description: useFallbackDescription && labels ? labels.description : service.description,
            };
        }
        if (expectedDownloadClients.has(service?.id)) {
            const expected = expectedDownloadClients.get(service.id);
            return {
                ...service,
                url: expected.url,
                groupId: 'downloads',
                name: String(service.name || '').trim() || expected.name,
                description: String(service.description || '').trim() || expected.description,
            };
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
