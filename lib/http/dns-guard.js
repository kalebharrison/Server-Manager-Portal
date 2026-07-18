import dns from 'dns/promises';
import { isAlwaysBlockedIp, isPrivateIp } from './network-policy.js';

/**
 * Resolve a hostname and reject if any address is private/link-local when
 * private hosts are not allowed. Mitigates basic DNS rebinding against public
 * integration URL validation. Link-local/cloud-metadata can still be blocked
 * when allowPrivate is true (blockAlwaysBlocked).
 */
export const assertHostnameAllowed = async (hostname, { allowPrivate = false, blockAlwaysBlocked = false } = {}) => {
    const host = String(hostname || '').trim().toLowerCase();
    if (!host) throw new Error('Invalid host');
    if (allowPrivate && !blockAlwaysBlocked) return true;
    if (isAlwaysBlockedIp(host)) {
        throw new Error('Link-local and cloud metadata addresses are not allowed.');
    }

    let addresses = [];
    try {
        addresses = await dns.lookup(host, { all: true, verbatim: true });
    } catch {
        // In LAN-allow mode we only need metadata rejection; unresolved private hosts stay usable.
        if (allowPrivate && blockAlwaysBlocked) return true;
        throw new Error('Unable to resolve host for URL validation');
    }
    if (!addresses.length) {
        if (allowPrivate && blockAlwaysBlocked) return true;
        throw new Error('Unable to resolve host for URL validation');
    }
    for (const entry of addresses) {
        if (isAlwaysBlockedIp(entry.address)) {
            throw new Error('Link-local and cloud metadata addresses are not allowed.');
        }
        if (!allowPrivate && isPrivateIp(entry.address)) {
            throw new Error('Private or local network hosts are not allowed. Set ALLOW_PRIVATE_INTEGRATION_URLS=true in your environment to allow LAN/private URLs.');
        }
    }
    return true;
};
