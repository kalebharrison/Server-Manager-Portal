export const tmdbImageUrl = (path, size) => {
    if (!path) return '';
    const raw = String(path);
    if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
    return `https://image.tmdb.org/t/p/${size}${raw.startsWith('/') ? raw : `/${raw}`}`;
};
