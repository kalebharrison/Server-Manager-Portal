/**
 * Build compact quality labels from *arr file metadata.
 * Order: resolution → DV/HDR/SDR → best audio (Atmos / DTS-HD / …).
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

/**
 * Map Arr videoDynamicRangeType (and fallbacks) to a single badge:
 * DV | HDR | DV/HDR | null (caller may add SDR).
 *
 * Prefer videoDynamicRangeType — Radarr also sets videoDynamicRange="HDR" for
 * pure DV, which would false-positive as DV/HDR if both strings were merged.
 *
 * Radarr types: DV, DV HDR10, DV HDR10Plus, DV HLG, DV SDR,
 * HDR10, HDR10Plus, HLG, PQ.
 */
const hdrTagFromMediaInfo = (mediaInfo = {}, ...fallbackParts) => {
    const type = String(mediaInfo.videoDynamicRangeType || '')
        .toLowerCase()
        .replace(/[_+./-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (type) {
        if (/^dv\s+(hdr|hlg|pq)/.test(type)) return 'DV/HDR';
        if (/^dv(\s+sdr)?$/.test(type) || type === 'dolby vision') return 'DV';
        if (/^(hdr|hlg|pq)/.test(type)) return 'HDR';
    }

    // Filename / release-group hints when Arr type is missing.
    const hay = fallbackParts.filter(Boolean).join(' ').toLowerCase().replace(/[_+./-]+/g, ' ');
    if (hay.trim()) {
        const hasDv = /dolby\s*vision|\bdv\b|dvhe|dvav/.test(hay);
        const hasHdr = /hdr\s*10|\bhdr10\b|\bhlg\b|\bpq\b|\bhdr\b|smpte\s*2084/.test(hay);
        if (hasDv && hasHdr && !/\bdv\s*sdr\b/.test(hay)) return 'DV/HDR';
        if (hasDv) return 'DV';
        if (hasHdr) return 'HDR';
    }

    // Last resort: coarse Arr "HDR" / "SDR" flag (no type available).
    const range = String(mediaInfo.videoDynamicRange || '').trim().toLowerCase();
    if (range === 'hdr') return 'HDR';
    return null;
};

/** Highest-quality audio label wins (Atmos > DTS-X > TrueHD > …). */
const AUDIO_CODEC_RANK = [
    { re: /\batmos\b/i, label: 'Atmos' },
    { re: /dts[\s.-]?x\b|\bdtsx\b/i, label: 'DTS-X' },
    { re: /true[\s.-]?hd/i, label: 'TrueHD' },
    { re: /dts[\s.-]?hd(?:[\s.-]?ma)?|\bdtshd\b/i, label: 'DTS-HD' },
    { re: /\bdts\b/i, label: 'DTS' },
    { re: /\bflac\b/i, label: 'FLAC' },
    { re: /e-?ac-?3|\beac3\b|\bdd\+|ddp|dolby\s*digital\s*plus/i, label: 'EAC3' },
    { re: /\bac-?3\b|\bdd\b|dolby\s*digital(?!\s*plus)/i, label: 'AC3' },
    { re: /\baac\b/i, label: 'AAC' },
    { re: /\bopus\b/i, label: 'Opus' },
    { re: /\bmp3\b/i, label: 'MP3' },
];

const audioTagFromParts = (...parts) => {
    const hay = parts.filter(Boolean).join(' ');
    if (!hay.trim()) return null;
    let bestLabel = null;
    let bestRank = -1;
    AUDIO_CODEC_RANK.forEach((entry, index) => {
        const rank = AUDIO_CODEC_RANK.length - index;
        if (entry.re.test(hay) && rank > bestRank) {
            bestRank = rank;
            bestLabel = entry.label;
        }
    });
    return bestLabel;
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

    const hdrTag = hdrTagFromMediaInfo(
        mediaInfo,
        file.releaseGroup,
        file.relativePath,
        mediaInfo.videoColourPrimaries,
        mediaInfo.videoTransferCharacteristics,
    );
    if (hdrTag) pushUnique(tags, hdrTag);
    else if (tags.some((tag) => tag === '4K' || tag === '1080p' || tag === '720p')) {
        // Known video file with no HDR markers → SDR.
        pushUnique(tags, 'SDR');
    }

    const audioTag = audioTagFromParts(
        mediaInfo.audioCodec,
        mediaInfo.audioAdditionalFeatures,
        mediaInfo.audioChannels,
        file.relativePath,
        file.releaseGroup,
    );
    if (audioTag) pushUnique(tags, audioTag);

    return tags;
};

/**
 * Sonarr series list payloads rarely include episode file mediaInfo.
 * Prefer episodeFile when present; otherwise fall back to quality profile name hints only for resolution.
 */
export const extractArrSeriesDisplayTags = (series = {}) => {
    const episodeFile = series?.episodeFile && typeof series.episodeFile === 'object'
        ? series.episodeFile
        : null;
    if (episodeFile) {
        // Reuse movie extractor shape by wrapping.
        return extractArrMovieDisplayTags({ movieFile: episodeFile });
    }

    const tags = [];
    const profileName = String(series?.qualityProfile?.name || series?.qualityProfileId || '').toLowerCase();
    const resolutionTag = resolutionTagFromParts(profileName);
    if (resolutionTag) pushUnique(tags, resolutionTag);
    return tags;
};

export default {
    extractArrMovieDisplayTags,
    extractArrSeriesDisplayTags,
};
