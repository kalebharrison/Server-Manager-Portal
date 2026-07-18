import dns from 'dns/promises';
import { isPrivateIp } from './network-policy.js';

/**
 * Resolve a hostname and reject if any address is private/link-local when
 * private hosts are not allowed. Mitigates basic DNS rebinding against public
 * integration URL validation.
 */
export const assertHostnameAllowed = async (hostname, { allowPrivate = false } = {}) => {
    const host = String(hostname || '').trim().toLowerCase();
    if (!host) throw new Error('Invalid host');
    if (allowPrivate) return true;

    let addresses = [];
    try {
        addresses = await dns.lookup(host, { all: true, verbatim: true });
    } catch {
        throw new Error('Unable to resolve host for URL validation');
    }
    if (!addresses.length) throw new Error('Unable to resolve host for URL validation');
    for (const entry of addresses) {
        if (isPrivateIp(entry.address)) {
            throw new Error('Private or local network hosts are not allowed. Set ALLOW_PRIVATE_INTEGRATION_URLS=true in your environment to allow LAN/private URLs.');
        }
    }
    return true;
};
