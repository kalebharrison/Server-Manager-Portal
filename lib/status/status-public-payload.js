export const createPublicStatusPayload = (statusConfig = {}, healthData = {}) => {
    const requestServiceIds = new Set(['seerr', 'jellyseerr', 'overseerr', 'ombi']);
    const publicServiceName = (service = {}) => {
        const name = String(service.name || '').trim();
        const arrType = ['sonarr', 'radarr', 'lidarr'].find((type) => service.id === type || String(service.id || '').startsWith(`${type}-`));
        if (arrType) {
            const base = arrType === 'sonarr' ? 'TV Automation' : arrType === 'radarr' ? 'Movie Automation' : 'Music Automation';
            if (name && !name.toLowerCase().includes(arrType)) return name;
            const instanceLabel = name.replace(new RegExp(arrType, 'ig'), '').trim().replace(/^[-:]+|[-:]+$/g, '').trim();
            return instanceLabel ? `${base} - ${instanceLabel}` : base;
        }
        if (service.id === 'tmdb' && (!name || name.toLowerCase() === 'tmdb')) return 'Media Metadata';
        if (service.id === 'tvdb' && (!name || name.toLowerCase() === 'tvdb')) return 'TV Metadata';
        if (requestServiceIds.has(service.id) && (!name || ['seerr', 'jellyseerr', 'overseerr', 'ombi'].includes(name.toLowerCase()))) return 'Request Service';
        return name || 'Service';
    };
    const publicServiceDescription = (service = {}) => {
        const description = String(service.description || '').trim();
        if ((service.id === 'sonarr' || String(service.id || '').startsWith('sonarr-')) && (!description || description.toLowerCase() === 'tv automation')) return 'TV release automation';
        if ((service.id === 'radarr' || String(service.id || '').startsWith('radarr-')) && (!description || description.toLowerCase() === 'movie automation')) return 'Movie release automation';
        if ((service.id === 'lidarr' || String(service.id || '').startsWith('lidarr-')) && (!description || description.toLowerCase() === 'music automation')) return 'Music release automation';
        if (service.id === 'tmdb' && (!description || description.toLowerCase() === 'media metadata')) return 'Movie and TV discovery metadata';
        if (service.id === 'tvdb' && (!description || description.toLowerCase() === 'tv metadata enrichment')) return 'TV metadata enrichment';
        if (requestServiceIds.has(service.id) && (!description || ['requests portal', 'request portal'].includes(description.toLowerCase()))) return 'Media requests';
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
