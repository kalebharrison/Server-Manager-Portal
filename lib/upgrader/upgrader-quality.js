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

const looksLikeMp4Name = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return false;
    return /\.mp4$/i.test(raw) || /(?:^|[._\-\s[(])mp4(?:$|[.)\]\-\s])/i.test(raw);
};

const looksLikeRemuxName = (value) => {
    const raw = String(value || '');
    if (!raw) return false;
    return /uhdremux|bdremux|\bremux\b/i.test(raw);
};

/**
 * Real UHD remuxes are HEVC (+ lossless audio) in MKV/m2ts.
 * DHT "UHDRemux" .mp4 / AC3 files are encodes that Radarr still parses as Remux-2160p.
 */
export const hasLosslessRemuxAudio = (value) => (
    /truehd|atmos|dts[- .]?hd|dts[- .]?x|\bflac\b|\bpcm\b/i.test(String(value || ''))
);

export const hasLossyRemuxAudio = (value) => {
    const raw = String(value || '');
    if (!raw || hasLosslessRemuxAudio(raw)) return false;
    return /\b(eac3|dd\+|ddp|aac)\b/i.test(raw) || /(?<![a-z])ac3(?![a-z])/i.test(raw);
};

export const isFakeRemuxRelease = ({ title, qualityName, files = [] } = {}) => {
    const names = [title, qualityName, ...(Array.isArray(files) ? files : [])]
        .filter(Boolean)
        .map((value) => String(value));
    if (!names.length) return false;
    const remux = names.some((name) => looksLikeRemuxName(name));
    if (!remux) return false;
    if (names.some((name) => looksLikeMp4Name(name))) return true;
    return hasLossyRemuxAudio(names.join(' '));
};

export const isFakeRemuxContainer = (args) => isFakeRemuxRelease(args);

export const REMUX_UPGRADE_MIN_CF = 2000;

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

/**
 * Sum quality-profile format scores for matched custom formats.
 * Radarr's /movie list often returns customFormatScore: 0 even when formats match.
 */
export const calculateCustomFormatScore = (customFormats = [], profile = null) => {
    if (!profile || !Array.isArray(customFormats) || !customFormats.length) return null;
    const scoreByFormatId = new Map();
    for (const item of (profile.formatItems || [])) {
        const formatId = Number(item?.format?.id ?? item?.format);
        if (!Number.isFinite(formatId)) continue;
        scoreByFormatId.set(formatId, Number(item.score) || 0);
    }
    if (!scoreByFormatId.size) return null;
    let total = 0;
    let matched = 0;
    for (const format of customFormats) {
        const formatId = Number(format?.id);
        if (!scoreByFormatId.has(formatId)) continue;
        total += scoreByFormatId.get(formatId);
        matched += 1;
    }
    return matched > 0 ? total : null;
};

export const resolveCustomFormatScore = (file = {}, profile = null) => {
    const reported = Number(file?.customFormatScore);
    if (Number.isFinite(reported) && reported !== 0) return reported;
    const calculated = calculateCustomFormatScore(file?.customFormats, profile);
    if (calculated != null) return calculated;
    return Number.isFinite(reported) ? reported : 0;
};

export const extractQualityFromArrFile = (file = {}, profile = null) => {
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
        customFormatScore: resolveCustomFormatScore(file, profile),
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
        customFormatScore: Number.isFinite(Number(release?.customFormatScore))
            ? Number(release.customFormatScore)
            : 0,
        fullSeason: release?.fullSeason === true
            || /(?:\bS\d{1,2}\b|\bSeason[ ._-]?\d+\b).*(?:COMPLETE|PACK)|(?:COMPLETE|PACK).*(?:\bS\d{1,2}\b|\bSeason)/i.test(title)
            || /\bseason[ ._-]?\d+[ ._-]?pack\b/i.test(title),
        episodeNumbers: episodeNumbersFromRelease(release),
    };
};

/** Sonarr interactive-search episode ids, with title fallback (S01E02 / E02). */
export const episodeNumbersFromRelease = (release = {}) => {
    if (Array.isArray(release.episodeNumbers) && release.episodeNumbers.length) {
        return release.episodeNumbers.map(Number).filter(Number.isFinite);
    }
    if (Array.isArray(release.episodes) && release.episodes.length) {
        return release.episodes
            .map((episode) => Number(episode?.episodeNumber ?? episode?.episode))
            .filter(Number.isFinite);
    }
    const title = String(release.title || release.releaseTitle || '');
    const tagged = [...title.matchAll(/S\d{1,2}E(\d{1,3})/gi)].map((match) => Number(match[1]));
    if (tagged.length) return tagged;
    const loose = /\bE(\d{1,3})\b/i.exec(title);
    return loose ? [Number(loose[1])] : [];
};
