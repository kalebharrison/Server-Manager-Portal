export const EMAIL_PRODUCT_NAME = 'Server Portal';

export const looksLikeMachineId = (value) => /^[a-f0-9]{16,}$/i.test(String(value || '').trim());

export const inferServerNameFromFromHeader = (smtpFrom = '') => {
    const match = String(smtpFrom || '').match(/^\s*(.+?)\s*</);
    const label = String(match ? match[1] : smtpFrom || '')
        .replace(/^requests?\s*[-–—:]\s*/i, '')
        .trim();
    if (!label || looksLikeMachineId(label) || /@/.test(label)) return '';
    return label;
};

export const resolveEmailServerName = (config = {}, fallback = EMAIL_PRODUCT_NAME) => {
    for (const candidate of [
        config.emailServerName,
        config.serverName,
        inferServerNameFromFromHeader(config.smtpFrom),
        config.serverIdentifier,
    ]) {
        const value = String(candidate || '').trim();
        if (value && !looksLikeMachineId(value)) return value;
    }
    return fallback;
};

export const emailSubject = (config, rest) => {
    const name = resolveEmailServerName(config);
    const text = String(rest || '').trim();
    return text ? `[${name}] ${text}` : `[${name}]`;
};

export const normalizePortalBaseUrl = (config = {}) => {
    const raw = String(config.publicDomain || '').trim();
    if (!raw || raw.includes('yourdomain.com')) return '';
    try {
        const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
        return `${url.origin}${url.pathname}`.replace(/\/+$/, '');
    } catch {
        return '';
    }
};

export const buildPortalPathUrl = (config, path = '/') => {
    const base = normalizePortalBaseUrl(config);
    if (!base) return '';
    const normalized = String(path || '/').startsWith('/') ? String(path) : `/${path}`;
    return `${base}${normalized}`;
};

export const portalMediaKind = (mediaType) => (
    mediaType === 'tv' || mediaType === 'show' ? 'tv' : 'movie'
);

export const buildPortalMediaUrl = (config, { mediaType, tmdbId } = {}) => {
    const id = Number(tmdbId);
    if (!Number.isFinite(id) || id <= 0) return '';
    return buildPortalPathUrl(config, `/discovery/${portalMediaKind(mediaType)}/${id}`);
};

export const buildPortalRequestsUrl = (config) => buildPortalPathUrl(config, '/discovery/requests');
export const buildPortalIssuesUrl = (config) => buildPortalPathUrl(config, '/discovery/issues');
export const buildPortalPreferencesUrl = (config) => buildPortalPathUrl(config, '/preferences');
export const buildPortalHomeUrl = (config) => buildPortalPathUrl(config, '/');
