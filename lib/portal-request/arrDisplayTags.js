/**
 * Build compact quality labels (4K / 1080p / HDR / DV) from *arr file metadata.
 * Used on Discover cards for titles already in the library.
 */

const pushUnique = (tags, value) => {
    if (!value || tags.includes(value)) return;
    tags.push(value);
};

const resolutionTagFromParts = (...parts) => {
    const hay = parts.filter(Boolean).join(' ').toLowerCase();
    if (!hay) return null;
    if (/\b(2160|4k|uhd)\b/.test(hay)) return '4K';
    if (/\b1080\b/.test(hay)) return '1080p';
    if (/\b720\b/.test(hay)) return '720p';
    return null;
};

const hdrTagFromParts = (...parts) => {
    const hay = parts.filter(Boolean).join(' ').toLowerCase();
    if (!hay) return null;
    if (/dolby\s*vision|\bdv\b|dvhe|dvav/.test(hay)) return 'DV';
    if (/hdr10\+|hdr10|\bhdr\b|hlg|smpte2084|bt2020/.test(hay)) return 'HDR';
    return null;
};

/** Radarr movie catalog objects include movieFile when hasFile. */
export const extractArrMovieDisplayTags = (movie = {}) => {
    const file = movie?.movieFile && typeof movie.movieFile === 'object' ? movie.movieFile : {};
    const quality = file.quality?.quality && typeof file.quality.quality === 'object'
        ? file.quality.quality
        : {};
    const mediaInfo = file.mediaInfo && typeof file.mediaInfo === 'object' ? file.mediaInfo : {};
    const tags = [];

    const resolutionTag = resolutionTagFromParts(
        quality.resolution,
        quality.name,
        mediaInfo.resolution,
        mediaInfo.width,
        file.relativePath,
    );
    if (resolutionTag) pushUnique(tags, resolutionTag);
    else if (Number(quality.resolution) >= 2160 || Number(mediaInfo.width) >= 3800) {
        pushUnique(tags, '4K');
    } else if (Number(quality.resolution) >= 1080 || Number(mediaInfo.width) >= 1800) {
        pushUnique(tags, '1080p');
    } else if (Number(quality.resolution) >= 720 || Number(mediaInfo.width) >= 1200) {
        pushUnique(tags, '720p');
    }

    const hdrTag = hdrTagFromParts(
        mediaInfo.videoDynamicRangeType,
        mediaInfo.videoDynamicRange,
        mediaInfo.videoColourPrimaries,
        mediaInfo.videoTransferCharacteristics,
        file.releaseGroup,
        file.relativePath,
    );
    if (hdrTag) pushUnique(tags, hdrTag);

    return tags;
};

/**
 * Sonarr series list payloads rarely include episode file mediaInfo.
 * Prefer episodeFile when present; otherwise fall back to quality profile name hints only for resolution.
 */
export const extractArrSeriesDisplayTags = (series = {}) => {
    const tags = [];
    const episodeFile = series?.episodeFile && typeof series.episodeFile === 'object'
        ? series.episodeFile
        : null;
    if (episodeFile) {
        // Reuse movie extractor shape by wrapping.
        return extractArrMovieDisplayTags({ movieFile: episodeFile });
    }

    const profileName = String(series?.qualityProfile?.name || series?.qualityProfileId || '').toLowerCase();
    const resolutionTag = resolutionTagFromParts(profileName);
    if (resolutionTag) pushUnique(tags, resolutionTag);
    return tags;
};

export default {
    extractArrMovieDisplayTags,
    extractArrSeriesDisplayTags,
};
