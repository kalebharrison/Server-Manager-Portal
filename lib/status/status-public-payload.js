import {
    ARR_STATUS_LABELS,
    DOWNLOAD_CLIENT_STATUS_LABELS,
    resolveArrStatusType,
} from './status-labels.js';

export const createPublicStatusPayload = (statusConfig = {}, healthData = {}) => {
    // Settings "Public Display Name/Subtitle" are the source of truth for members.
    // Fallbacks only apply when those fields are empty.
    const publicServiceName = (service = {}) => {
        const name = String(service.name || '').trim();
        if (name) return name;
        const arrType = resolveArrStatusType(service);
        if (arrType) return ARR_STATUS_LABELS[arrType].name;
        if (DOWNLOAD_CLIENT_STATUS_LABELS[service.id]) return DOWNLOAD_CLIENT_STATUS_LABELS[service.id].name;
        if (service.id === 'tmdb') return 'Media Metadata';
        if (service.id === 'tvdb') return 'TV Metadata';
        return 'Service';
    };
    const publicServiceDescription = (service = {}) => {
        const description = String(service.description || '').trim();
        if (description) return description;
        const arrType = resolveArrStatusType(service);
        if (arrType) return ARR_STATUS_LABELS[arrType].description;
        if (DOWNLOAD_CLIENT_STATUS_LABELS[service.id]) return DOWNLOAD_CLIENT_STATUS_LABELS[service.id].description;
        if (service.id === 'tmdb') return 'Movie and TV discovery metadata';
        if (service.id === 'tvdb') return 'TV metadata enrichment';
        return '';
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
