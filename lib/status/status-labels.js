export const ARR_STATUS_LABELS = Object.freeze({
    sonarr: { name: 'TV Automation', description: 'TV release automation' },
    radarr: { name: 'Movie Automation', description: 'Movie release automation' },
    lidarr: { name: 'Music Automation', description: 'Music release automation' },
});

export const DOWNLOAD_CLIENT_STATUS_LABELS = Object.freeze({
    torrent: { name: 'Torrent', description: 'Torrent downloads' },
    usenet: { name: 'Usenet', description: 'Usenet downloads' },
});

/** Product / instance names we replace with generic public labels. */
const ARR_PRODUCT_NAMES = new Set([
    'sonarr',
    'radarr',
    'lidarr',
]);

export const resolveArrStatusType = (service = {}) => (
    ['sonarr', 'radarr', 'lidarr'].find((type) => (
        service.id === type || String(service.id || '').startsWith(`${type}-`)
    )) || null
);

export const shouldUseArrStatusFallbackName = (service = {}) => {
    const name = String(service.name || '').trim();
    if (!name) return true;
    return ARR_PRODUCT_NAMES.has(name.toLowerCase());
};
