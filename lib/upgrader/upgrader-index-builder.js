import { extractQualityFromArrFile, minResolutionTier, parseResolutionTier } from './upgrader-quality.js';
import { extractMediaFlags } from './upgrader-media-flags.js';

const normalizeUrl = (url) => String(url || '').replace(/\/+$/, '');
const toGb = (bytes) => Math.round((Number(bytes || 0) / 1024 / 1024 / 1024) * 100) / 100;
const isHevc = (codec) => /hevc|h\.?265|x265/i.test(String(codec || ''));

const posterUrl = (record) => record.images?.find((image) => image.coverType === 'poster')?.remoteUrl || '';

const fileSnapshot = (file) => {
    if (!file) {
        return {
            videoCodec: '',
            isHevc: false,
            hasHdr: false,
            hasDolbyVision: false,
            hasAtmos: false,
            hasTrueHd: false,
            isRemux: false,
            videoResolution: 'unknown',
            sourceTier: 'unknown',
            qualityName: '',
            customFormatScore: 0,
            sizeGB: 0,
            sizeBytes: 0,
        };
    }
    const quality = extractQualityFromArrFile(file);
    const flags = extractMediaFlags(file);
    if (quality.source === 'remux') flags.isRemux = true;
    return {
        videoCodec: flags.videoCodec,
        isHevc: flags.isHevc || isHevc(flags.videoCodec),
        hasHdr: flags.hasHdr,
        hasDolbyVision: flags.hasDolbyVision,
        hasAtmos: flags.hasAtmos,
        hasTrueHd: flags.hasTrueHd,
        isRemux: flags.isRemux,
        videoResolution: quality.resolution,
        sourceTier: quality.source,
        qualityName: quality.qualityName,
        customFormatScore: quality.customFormatScore,
        sizeGB: toGb(file.size),
        sizeBytes: Number(file.size || 0) || 0,
    };
};

export const buildRadarrIndexItem = (instance, record, movieFile = null) => {
    // Radarr's /movie list leaves customFormatScore at 0; prefer /moviefile.
    const snap = fileSnapshot(movieFile || record.movieFile);
    return {
        ratingKey: `radarr:${instance.id}:${record.id}`,
        entityId: record.id,
        arrType: 'radarr',
        arrInstanceId: instance.id,
        arrInstanceName: instance.name,
        mediaType: 'movie',
        title: record.title,
        year: record.year,
        overview: record.overview || '',
        monitored: record.monitored !== false,
        tmdbId: record.tmdbId || null,
        addedAt: record.added || null,
        qualityProfileId: record.qualityProfileId || null,
        thumbUrl: posterUrl(record),
        arrDeepUrl: `${normalizeUrl(instance.url)}/movie/${record.titleSlug || record.id}`,
        hasFile: !!record.hasFile || !!record.movieFile,
        ...snap,
        seasons: null,
        episodeCount: null,
        seasonFloorResolution: snap.videoResolution,
        avgCustomFormatScore: snap.customFormatScore,
    };
};

export const buildSonarrIndexItem = (instance, record, episodeFiles = [], episodes = []) => {
    const fileById = new Map((Array.isArray(episodeFiles) ? episodeFiles : []).map((file) => [Number(file.id), file]));
    const episodeRows = [];
    const seasonMap = new Map();

    for (const episode of (Array.isArray(episodes) ? episodes : [])) {
        if (!episode?.hasFile || !episode.episodeFileId) continue;
        const file = fileById.get(Number(episode.episodeFileId));
        if (!file) continue;
        const snap = fileSnapshot(file);
        const seasonNumber = Number(episode.seasonNumber);
        const row = {
            episodeId: episode.id,
            episodeFileId: file.id,
            seasonNumber,
            episodeNumber: episode.episodeNumber,
            title: episode.title,
            ...snap,
        };
        episodeRows.push(row);
        if (!seasonMap.has(seasonNumber)) {
            seasonMap.set(seasonNumber, []);
        }
        seasonMap.get(seasonNumber).push(row);
    }

    const seasons = [...seasonMap.entries()].map(([seasonNumber, rows]) => {
        const resolutions = rows.map((row) => row.videoResolution);
        const scores = rows.map((row) => row.customFormatScore);
        const sizeGB = rows.reduce((sum, row) => sum + Number(row.sizeGB || 0), 0);
        return {
            seasonNumber,
            episodeCount: rows.length,
            minResolution: minResolutionTier(resolutions),
            avgCustomFormatScore: scores.length
                ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
                : 0,
            maxCustomFormatScore: scores.length ? Math.max(...scores) : 0,
            sizeGB: Math.round(sizeGB * 100) / 100,
            hasHdr: rows.some((row) => row.hasHdr),
            hasDolbyVision: rows.some((row) => row.hasDolbyVision),
            hasAtmos: rows.some((row) => row.hasAtmos),
            isRemux: rows.some((row) => row.isRemux),
        };
    }).sort((a, b) => a.seasonNumber - b.seasonNumber);

    const allResolutions = episodeRows.map((row) => row.videoResolution);
    const allScores = episodeRows.map((row) => row.customFormatScore);
    const sizeGB = episodeRows.reduce((sum, row) => sum + Number(row.sizeGB || 0), 0);
    const best = episodeRows.reduce((acc, row) => {
        if (!acc) return row;
        return row.customFormatScore > acc.customFormatScore ? row : acc;
    }, null);

    return {
        ratingKey: `sonarr:${instance.id}:${record.id}`,
        entityId: record.id,
        arrType: 'sonarr',
        arrInstanceId: instance.id,
        arrInstanceName: instance.name,
        mediaType: 'show',
        title: record.title,
        year: record.year,
        overview: record.overview || '',
        monitored: record.monitored !== false,
        tvdbId: record.tvdbId || null,
        addedAt: record.added || null,
        qualityProfileId: record.qualityProfileId || null,
        thumbUrl: posterUrl(record),
        arrDeepUrl: `${normalizeUrl(instance.url)}/series/${record.titleSlug || record.id}`,
        hasFile: episodeRows.length > 0,
        videoCodec: best?.videoCodec || '',
        isHevc: episodeRows.some((row) => row.isHevc),
        hasHdr: episodeRows.some((row) => row.hasHdr),
        hasDolbyVision: episodeRows.some((row) => row.hasDolbyVision),
        hasAtmos: episodeRows.some((row) => row.hasAtmos),
        hasTrueHd: episodeRows.some((row) => row.hasTrueHd),
        isRemux: episodeRows.some((row) => row.isRemux),
        videoResolution: parseResolutionTier(best?.videoResolution || minResolutionTier(allResolutions)),
        sourceTier: best?.sourceTier || 'unknown',
        qualityName: best?.qualityName || '',
        customFormatScore: best?.customFormatScore || 0,
        avgCustomFormatScore: allScores.length
            ? Math.round(allScores.reduce((sum, score) => sum + score, 0) / allScores.length)
            : 0,
        sizeGB: Math.round(sizeGB * 100) / 100,
        sizeBytes: episodeRows.reduce((sum, row) => sum + Number(row.sizeBytes || 0), 0),
        seasonFloorResolution: minResolutionTier(allResolutions),
        seasons,
        episodeCount: episodeRows.length,
        totalEpisodeCount: episodeRows.length,
        nonHevcEpisodeCount: episodeRows.filter((row) => !row.isHevc).length,
        episodes: episodeRows,
    };
};
