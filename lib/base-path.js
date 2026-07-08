export const normalizeBasePath = (raw = '') => {
    const value = String(raw || '').trim();
    if (!value || value === '/') return '';
    const withLeading = value.startsWith('/') ? value : `/${value}`;
    return withLeading.replace(/\/+$/, '');
};

export const deriveBasePath = ({ envBasePath, publicBaseUrl } = {}) => {
    if (envBasePath != null && String(envBasePath).trim() !== '') {
        return normalizeBasePath(envBasePath);
    }
    if (publicBaseUrl) {
        try {
            return normalizeBasePath(new URL(publicBaseUrl).pathname);
        } catch (_) {
            return '';
        }
    }
    return '';
};

export const createBasePathHelpers = (basePath = '') => {
    const normalizedBasePath = normalizeBasePath(basePath);

    const withBasePath = (route = '/') => {
        const path = route.startsWith('/') ? route : `/${route}`;
        return normalizedBasePath ? `${normalizedBasePath}${path}` : path;
    };

    const stripBasePathFromUrl = (url = '/') => {
        const [pathname, ...queryParts] = String(url).split('?');
        const query = queryParts.length ? `?${queryParts.join('?')}` : '';
        if (!normalizedBasePath) return url;
        if (pathname === normalizedBasePath || pathname === `${normalizedBasePath}/`) {
            return `/${query}`;
        }
        if (pathname.startsWith(`${normalizedBasePath}/`)) {
            const rest = pathname.slice(normalizedBasePath.length) || '/';
            return `${rest}${query}`;
        }
        return url;
    };

    return { withBasePath, stripBasePathFromUrl };
};
