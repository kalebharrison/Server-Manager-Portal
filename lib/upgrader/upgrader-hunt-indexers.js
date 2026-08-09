export const DEFAULT_HUNT_INDEXER_DENY = ['bitmagnet'];

export const parseHuntIndexerDeny = (value) => {
    const parts = (Array.isArray(value) ? value : String(value ?? '').split(/[\n,]+/))
        .map((part) => String(part || '').trim().toLowerCase())
        .filter(Boolean);
    return parts.length ? [...new Set(parts)] : [...DEFAULT_HUNT_INDEXER_DENY];
};

export const formatHuntIndexerDeny = (value) => parseHuntIndexerDeny(value).join(', ');

const indexerBlob = (release = {}) => String(
    release?.indexer
    || release?.indexerName
    || '',
).toLowerCase();

export const isHuntIndexerDenied = (release, denyList = DEFAULT_HUNT_INDEXER_DENY) => {
    const blob = indexerBlob(release);
    if (!blob) return false;
    return denyList.some((token) => blob.includes(token));
};

export const filterDeniedHuntReleases = (releases, config = {}) => {
    const deny = parseHuntIndexerDeny(config.upgraderHuntIndexerDeny);
    return (Array.isArray(releases) ? releases : []).filter((release) => !isHuntIndexerDenied(release, deny));
};
