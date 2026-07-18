import net from 'net';

export const isLoopbackAddress = (ip = '') => {
    const normalizedIp = String(ip || '').replace(/^::ffff:/i, '').toLowerCase();
    return normalizedIp === '127.0.0.1' || normalizedIp === '::1' || normalizedIp === 'localhost';
};

const isIpv4Private = (host) => {
    if (host === '127.0.0.1') return true;
    if (host.startsWith('10.') || host.startsWith('192.168.')) return true;
    if (host.startsWith('169.254.')) return true; // link-local / cloud metadata range
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
    if (host === '0.0.0.0') return true;
    return false;
};

const expandIpv6 = (host) => {
    const raw = String(host || '').toLowerCase();
    if (!raw.includes(':')) return null;
    const [head, tail] = raw.split('::');
    const headParts = head ? head.split(':').filter(Boolean) : [];
    const tailParts = tail ? tail.split(':').filter(Boolean) : [];
    const missing = 8 - (headParts.length + tailParts.length);
    if (missing < 0) return null;
    const parts = [...headParts, ...Array(Math.max(0, missing)).fill('0'), ...tailParts];
    if (parts.length !== 8) return null;
    return parts.map((part) => part.padStart(4, '0')).join(':');
};

const isIpv6Private = (host) => {
    if (host === '::1') return true;
    const expanded = expandIpv6(host);
    if (!expanded) return /^fc|^fd/i.test(String(host).replace(/:/g, ''));
    const first = parseInt(expanded.slice(0, 4), 16);
    if (!Number.isFinite(first)) return false;
    // Unique local fc00::/7
    if ((first & 0xfe00) === 0xfc00) return true;
    // Link-local fe80::/10
    if ((first & 0xffc0) === 0xfe80) return true;
    // Loopback ::1 already handled; also treat unspecified ::
    if (expanded === '0000:0000:0000:0000:0000:0000:0000:0000') return true;
    return false;
};

export const isPrivateIp = (host) => {
    const normalized = String(host || '').replace(/^::ffff:/i, '').toLowerCase();
    if (!net.isIP(normalized)) return false;
    if (net.isIP(normalized) === 4) return isIpv4Private(normalized);
    return isIpv6Private(normalized);
};

export const isBlockedHostName = (hostname = '') => {
    const host = String(hostname || '').trim().toLowerCase();
    if (!host) return true;
    if (host === 'localhost' || host.endsWith('.localhost')) return true;
    if (host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.lan')) return true;
    if (isPrivateIp(host)) return true;
    return false;
};

export const normalizeExternalBaseUrl = (rawUrl, { allowPrivate = false, allowHttp = true } = {}) => {
    if (!rawUrl) return '';
    let parsed;
    try {
        parsed = new URL(String(rawUrl).trim());
    } catch (e) {
        throw new Error('Invalid URL format');
    }
    const isHttps = parsed.protocol === 'https:';
    const isHttp = parsed.protocol === 'http:';
    if (!isHttps && !(allowHttp && isHttp)) {
        throw new Error('URL must use http or https');
    }
    if (!allowPrivate && isBlockedHostName(parsed.hostname)) {
        throw new Error('Private or local network hosts are not allowed. Set ALLOW_PRIVATE_INTEGRATION_URLS=true in your environment to allow LAN/private URLs.');
    }
    parsed.hash = '';
    parsed.search = '';
    return parsed.toString().replace(/\/+$/, '');
};

/**
 * Normalize an integration URL for outbound fetches.
 * Default allowPrivate=true preserves legacy test helpers; production should use
 * createResolveIntegrationUrlForFetch({ allowPrivate: env flag }).
 */
export const resolveIntegrationUrlForFetch = (rawUrl, { allowPrivate = true } = {}) => {
    if (!rawUrl) return '';
    return normalizeExternalBaseUrl(rawUrl, { allowPrivate, allowHttp: true });
};

export const createResolveIntegrationUrlForFetch = ({ allowPrivate = false } = {}) => (
    (rawUrl) => resolveIntegrationUrlForFetch(rawUrl, { allowPrivate })
);
