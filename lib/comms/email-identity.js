export const EMAIL_PRODUCT_NAME = 'Server Portal';

const SMALL_TITLE_WORDS = new Set(['a', 'an', 'and', 'at', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'vs']);

export const toEmailTitleCase = (value) => String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word, index, words) => {
        const match = word.match(/^([^.,!?:;]*)(.*)$/);
        const core = match?.[1] || word;
        const punct = match?.[2] || '';
        if (/^[A-Z0-9]{2,}s?$/.test(core) && /[A-Z]/.test(core)) return `${core}${punct}`;
        const lower = core.toLowerCase();
        const isEdge = index === 0 || index === words.length - 1;
        if (!isEdge && SMALL_TITLE_WORDS.has(lower)) return `${lower}${punct}`;
        if (lower.includes("'")) {
            return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}${punct}`;
        }
        return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}${punct}`;
    })
    .join(' ');

export const emailStatusLabel = (status) => toEmailTitleCase(String(status || 'Updated').replace(/[_-]+/g, ' '));

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

export const emailNoticeSubject = (config, label, mediaTitle) => {
    const headed = toEmailTitleCase(label);
    const title = String(mediaTitle || '').trim();
    return title ? emailSubject(config, `${headed}: ${title}`) : emailSubject(config, headed);
};

export const resolveEmailPosterUrl = (config, poster) => {
    const raw = String(poster || '').trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith('/static/')) return buildPortalPathUrl(config, raw.split('?')[0]);
    if (raw.startsWith('/library/') || raw.startsWith('/photo/') || raw.startsWith('/api/')) return '';
    if (raw.startsWith('/')) return `https://image.tmdb.org/t/p/w342${raw}`;
    return `https://image.tmdb.org/t/p/w342/${raw}`;
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
