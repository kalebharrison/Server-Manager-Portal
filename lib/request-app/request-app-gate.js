const SEERR_TYPES = new Set(['seerr', 'overseerr', 'jellyseerr']);

export const isSeerrFamilyRequestApp = (type) => SEERR_TYPES.has(String(type || '').toLowerCase());

export const isRequestAppConfigured = (config = {}) => {
    const type = String(config.requestAppType || 'none').toLowerCase();
    return type !== 'none' && !!config.requestAppUrl && !!config.requestAppApiKey;
};

export const getRequestAppGate = (config = {}) => {
    if (!isRequestAppConfigured(config)) {
        return {
            configured: false,
            supported: false,
            ready: false,
            error: 'Set Request App Type, URL, and API key under Settings > Integrations.',
        };
    }
    if (!isSeerrFamilyRequestApp(config.requestAppType)) {
        return {
            configured: true,
            supported: false,
            ready: false,
            error: 'Embedded requests currently support Seerr, Overseerr, and Jellyseerr.',
        };
    }
    return { configured: true, supported: true, ready: true, error: null };
};

/** Portal↔Seerr user lifecycle sync (import on activate, delete on revoke). Default on. */
export const isRequestAppMembershipSyncEnabled = (config = {}) => (
    getRequestAppGate(config).ready && config.requestAppMembershipSync !== false
);
