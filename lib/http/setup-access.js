import { isLoopbackAddress, normalizeExternalBaseUrl } from './network-policy.js';
import { secureTokenEquals } from './http-security.js';
import { assertHostnameAllowed } from './dns-guard.js';

export const getSocketPeerIp = (req) => (req.socket && req.socket.remoteAddress) || 'unknown';

export const createSetupAccess = ({ setupToken, allowPrivateIntegrationUrls }) => {
    const hasValidSetupToken = (req) => {
        if (!setupToken) return false;
        const provided = req.headers['x-setup-token'] || req.body?.setupToken;
        return secureTokenEquals(provided, setupToken);
    };

    // Use the raw TCP peer address for setup authorization. req.ip honors the
    // client-supplied X-Forwarded-For header (trust proxy is enabled), which an
    // attacker could spoof to impersonate localhost during the unconfigured window.
    const canRunInitialSetup = (req) => hasValidSetupToken(req) || isLoopbackAddress(getSocketPeerIp(req));

    const sanitizeIntegrationUrl = (rawUrl) => {
        if (!rawUrl) return '';
        return normalizeExternalBaseUrl(rawUrl, { allowPrivate: allowPrivateIntegrationUrls, allowHttp: true });
    };

    // Same as sanitizeIntegrationUrl, plus DNS resolution when private hosts are disallowed.
    const sanitizeIntegrationUrlAsync = async (rawUrl) => {
        const normalized = sanitizeIntegrationUrl(rawUrl);
        if (!normalized || allowPrivateIntegrationUrls) return normalized;
        let hostname = '';
        try {
            hostname = new URL(normalized).hostname;
        } catch {
            throw new Error('Invalid URL format');
        }
        await assertHostnameAllowed(hostname, { allowPrivate: false });
        return normalized;
    };

    return {
        hasValidSetupToken,
        getSocketPeerIp,
        canRunInitialSetup,
        sanitizeIntegrationUrl,
        sanitizeIntegrationUrlAsync,
    };
};
