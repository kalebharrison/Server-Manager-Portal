const ARR_FALLBACKS = {
    sonarr: { name: 'TV Automation', description: 'TV release automation' },
    radarr: { name: 'Movie Automation', description: 'Movie release automation' },
    lidarr: { name: 'Music Automation', description: 'Music release automation' },
};

const resolveArrType = (service = {}) => (
    ['sonarr', 'radarr', 'lidarr'].find((type) => service.id === type || String(service.id || '').startsWith(`${type}-`))
    || null
);

export const createPublicStatusPayload = (statusConfig = {}, healthData = {}) => {
    // Settings "Public Display Name/Subtitle" are the source of truth for members.
    // Fallbacks only apply when those fields are empty.
    const publicServiceName = (service = {}) => {
        const name = String(service.name || '').trim();
        if (name) return name;
        const arrType = resolveArrType(service);
        if (arrType) return ARR_FALLBACKS[arrType].name;
        if (service.id === 'tmdb') return 'Media Metadata';
        if (service.id === 'tvdb') return 'TV Metadata';
        return 'Service';
    };
    const publicServiceDescription = (service = {}) => {
        const description = String(service.description || '').trim();
        if (description) return description;
        const arrType = resolveArrType(service);
        if (arrType) return ARR_FALLBACKS[arrType].description;
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
