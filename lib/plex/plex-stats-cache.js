export const PLEX_STATS_CACHE_VERSION = 1;

export const matchesPlexStatsCacheIdentity = (cache, config) => {
    const serverIdentifier = String(config?.serverIdentifier || '');
    return !!serverIdentifier
        && cache?.version === PLEX_STATS_CACHE_VERSION
        && String(cache?.serverIdentifier || '') === serverIdentifier;
};
