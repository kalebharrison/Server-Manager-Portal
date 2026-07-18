import net from 'net';

export const isLoopbackAddress = (ip = '') => {
    const normalizedIp = String(ip || '').replace('::ffff:', '').toLowerCase();
    return normalizedIp === '127.0.0.1' || normalizedIp === '::1' || normalizedIp === 'localhost';
};

export const isPrivateIp = (host) => {
    if (!net.isIP(host)) return false;
    if (host === '127.0.0.1' || host === '::1') return true;
    if (host.startsWith('10.') || host.startsWith('192.168.')) return true;
    if (host.startsWith('169.254.')) return true;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
    if (/^fc|^fd/i.test(host.replace(':', ''))) return true;
    return false;
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

export const resolveIntegrationUrlForFetch = (rawUrl) => {
    if (!rawUrl) return '';
    return normalizeExternalBaseUrl(rawUrl, { allowPrivate: true, allowHttp: true });
};
