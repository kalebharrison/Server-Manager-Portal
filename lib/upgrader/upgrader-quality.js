/** Resolution ladder — higher is better. */
export const RESOLUTION_RANK = {
    unknown: 0,
    sd: 1,
    '480p': 1,
    '576p': 1,
    '720p': 2,
    '1080p': 3,
    '2160p': 4,
    '4k': 4,
};

/** Source / quality ladder — higher is better. */
export const SOURCE_RANK = {
    unknown: 0,
    cam: 1,
    telesync: 1,
    telecine: 1,
    workprint: 1,
    dvd: 2,
    hdtv: 3,
    tv: 3,
    webrip: 4,
    'web-rip': 4,
    webdl: 5,
    'web-dl': 5,
    web: 5,
    bluray: 6,
    'blu-ray': 6,
    remux: 7,
    brremux: 7,
};

export const parseResolutionTier = (value) => {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return 'unknown';
    if (raw.includes('2160') || raw.includes('4k') || raw.includes('uhd')) return '4k';
    if (raw.includes('1080')) return '1080p';
    if (raw.includes('720')) return '720p';
    if (raw.includes('480') || raw.includes('576') || raw === 'sd') return 'sd';
    if (RESOLUTION_RANK[raw] != null) return raw;
    const width = Number(raw);
    if (Number.isFinite(width)) {
        if (width >= 3000) return '4k';
        if (width >= 1600) return '1080p';
        if (width >= 1100) return '720p';
        if (width > 0) return 'sd';
    }
    return 'unknown';
};

export const parseSourceTier = (value) => {
    const raw = String(value || '').trim().toLowerCase().replace(/\s+/g, '');
    if (!raw) return 'unknown';
    if (raw.includes('remux')) return 'remux';
    if (raw.includes('bluray') || raw.includes('blu-ray') || raw.includes('bdrip') || raw.includes('brrip')) return 'bluray';
    if (raw.includes('web-dl') || raw.includes('webdl')) return 'webdl';
    if (raw.includes('webrip') || raw.includes('web-rip')) return 'webrip';
    if (raw.includes('hdtv') || raw.includes('pdtv') || raw.includes('dsr')) return 'hdtv';
    if (raw.includes('dvd')) return 'dvd';
    if (SOURCE_RANK[raw] != null) return raw;
    return 'unknown';
};

export const resolutionRank = (tier) => RESOLUTION_RANK[parseResolutionTier(tier)] ?? 0;
export const sourceRank = (tier) => SOURCE_RANK[parseSourceTier(tier)] ?? 0;

/**
 * Compare quality floors. Returns negative if a < b, 0 if equal, positive if a > b.
 * Resolution is primary; source is secondary.
 */
export const compareQualityTier = (a, b) => {
    const resDiff = resolutionRank(a?.resolution) - resolutionRank(b?.resolution);
    if (resDiff !== 0) return resDiff;
    return sourceRank(a?.source) - sourceRank(b?.source);
};

/** True when candidate is strictly worse on resolution, or same res with worse source. */
export const isQualityTierDowngrade = (current, candidate) => compareQualityTier(candidate, current) < 0;

export const minResolutionTier = (tiers = []) => {
    let worst = null;
    let worstRank = Infinity;
    for (const tier of tiers) {
        const parsed = parseResolutionTier(tier);
        const rank = resolutionRank(parsed);
        if (rank < worstRank) {
            worstRank = rank;
            worst = parsed;
        }
    }
    return worst || 'unknown';
};

export const extractQualityFromArrFile = (file = {}) => {
    const quality = file?.quality?.quality || file?.quality || {};
    const mediaInfo = file?.mediaInfo || {};
    const resolution = parseResolutionTier(
        quality.resolution
        || mediaInfo.resolution
        || mediaInfo.width
        || quality.name
        || '',
    );
    const source = parseSourceTier(quality.name || file?.quality?.quality?.name || '');
    return {
        resolution,
        source,
        qualityName: String(quality.name || ''),
        customFormatScore: Number(file?.customFormatScore ?? 0) || 0,
    };
};

export const extractQualityFromRelease = (release = {}) => {
    const quality = release?.quality?.quality || release?.quality || {};
    const title = String(release?.title || release?.releaseTitle || '');
    const resolution = parseResolutionTier(
        quality.resolution
        || quality.name
        || title,
    );
    const source = parseSourceTier(quality.name || title);
    return {
        resolution,
        source,
        qualityName: String(quality.name || ''),
        customFormatScore: Number(release?.customFormatScore ?? 0) || 0,
        fullSeason: release?.fullSeason === true
            || /(?:\bS\d{1,2}\b|\bSeason[ ._-]?\d+\b).*(?:COMPLETE|PACK)|(?:COMPLETE|PACK).*(?:\bS\d{1,2}\b|\bSeason)/i.test(title)
            || /\bseason[ ._-]?\d+[ ._-]?pack\b/i.test(title),
    };
};
