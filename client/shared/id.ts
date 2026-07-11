export const createClientId = () => {
    const cryptoApi = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
    if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
        return cryptoApi.randomUUID();
    }
    const random = cryptoApi && typeof cryptoApi.getRandomValues === 'function'
        ? Array.from(cryptoApi.getRandomValues(new Uint32Array(2)), (part) => part.toString(36)).join('')
        : Math.random().toString(36).slice(2);
    return `${Date.now().toString(36)}-${random}`;
};
