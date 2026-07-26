/**
 * Request/discovery engine selection.
 *
 * Seerr is deliberately the compatibility default: Discord and Ask continue
 * to use its APIs while the Portal request engine is being rolled out.
 */
export const normalizeRequestEngine = (value) => (
    String(value || '').trim().toLowerCase() === 'portal' ? 'portal' : 'seerr'
);

export const getRequestEngine = (config = {}) => normalizeRequestEngine(config.requestEngine);

export const normalizeDiscoverySource = (value) => (
    String(value || '').trim().toLowerCase() === 'tmdb' ? 'tmdb' : 'seerr'
);

export const getDiscoverySource = (config = {}) => normalizeDiscoverySource(config.discoverySource);

export const isPortalRequestEngineEnabled = (config = {}) => getRequestEngine(config) === 'portal';
