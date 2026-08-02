import { extractQualityFromArrFile, minResolutionTier, parseResolutionTier } from './upgrader-quality.js';
import { extractMediaFlags } from './upgrader-media-flags.js';
import { classifyUpgraderLibrary } from './upgrader-library.js';

const normalizeUrl = (url) => String(url || '').replace(/\/+$/, '');
const toGb = (bytes) => Math.round((Number(bytes || 0) / 1024 / 1024 / 1024) * 100) / 100;
const isHevc = (codec) => /hevc|h\.?265|x265/i.test(String(codec || ''));

const posterUrl = (record) => record.images?.find((image) => image.coverType === 'poster')?.remoteUrl || '';

export const normalizeArrReleaseDate = (raw) => {
    if (!raw || String(raw).startsWith('0001-')) return null;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString();
};

/** Streaming / digital: digitalRelease passed, else Radarr isAvailable when no digital date. */
export const isMovieDigitallyAvailable = (record = {}, now = Date.now()) => {
    const digital = normalizeArrReleaseDate(record.digitalRelease);
    if (digital) return Date.parse(digital) <= now;
    return record.isAvailable === true;
};

export const countMissingAiredEpisodes = (episodes = [], now = Date.now()) => {
    let missingAiredCount = 0;
    let availableAt = null;
    for (const episode of (Array.isArray(episodes) ? episodes : [])) {
        if (episode?.monitored === false) continue;
        if (episode?.hasFile || episode?.episodeFileId || episode?.episodeFile) continue;
        const air = normalizeArrReleaseDate(episode.airDateUtc || episode.airDate);
        if (!air) continue;
        if (Date.parse(air) > now) continue;
        missingAiredCount += 1;
        if (!availableAt || Date.parse(air) < Date.parse(availableAt)) availableAt = air;
    }
    return { missingAiredCount, availableAt };
};

const fileSnapshot = (file, profile = null) => {
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
    const quality = extractQualityFromArrFile(file, profile);
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

export const buildRadarrIndexItem = (instance, record, movieFile = null, profile = null, { now = Date.now() } = {}) => {
    // Radarr's /movie list leaves customFormatScore at 0; prefer /moviefile + profile math.
    const snap = fileSnapshot(movieFile || record.movieFile, profile);
    const library = classifyUpgraderLibrary(instance, record);
    const hasFile = !!record.hasFile || !!record.movieFile;
    const monitored = record.monitored !== false;
    const digitalRelease = normalizeArrReleaseDate(record.digitalRelease);
    const physicalRelease = normalizeArrReleaseDate(record.physicalRelease);
    const inCinemas = normalizeArrReleaseDate(record.inCinemas);
    const isAvailable = record.isAvailable === true;
    const digitallyAvailable = isMovieDigitallyAvailable(record, now);
    const huntMissingEligible = monitored && !hasFile && digitallyAvailable;
    const file = movieFile || record.movieFile || null;
    const movieFileId = Number(file?.id || record.movieFileId || 0) || null;
    const filePath = file?.path || null;
    return {
        ratingKey: `radarr:${instance.id}:${record.id}`,
        entityId: record.id,
        arrType: 'radarr',
        arrInstanceId: instance.id,
        arrInstanceName: instance.name,
        libraryKey: library.libraryKey,
        libraryName: library.libraryName,
        libraryBucket: library.libraryBucket,
        mediaType: 'movie',
        title: record.title,
        year: record.year,
        overview: record.overview || '',
        monitored,
        tmdbId: record.tmdbId || null,
        addedAt: record.added || null,
        qualityProfileId: record.qualityProfileId || null,
        thumbUrl: posterUrl(record),
        arrDeepUrl: `${normalizeUrl(instance.url)}/movie/${record.titleSlug || record.id}`,
        hasFile,
        path: record.path || null,
        movieFileId,
        filePath,
        digitalRelease,
        physicalRelease,
        inCinemas,
        isAvailable,
        digitallyAvailable,
        availableAt: digitalRelease,
        huntMissingEligible,
        ...snap,
        seasons: null,
        episodeCount: null,
        seasonFloorResolution: snap.videoResolution,
        avgCustomFormatScore: snap.customFormatScore,
    };
};

/** Prefer the episode-file payload that carries real custom-format data. */
const preferEpisodeFile = (listed, embedded) => {
    if (!listed) return embedded || null;
    if (!embedded) return listed;
    const listedFormats = Array.isArray(listed.customFormats) ? listed.customFormats.length : 0;
    const embeddedFormats = Array.isArray(embedded.customFormats) ? embedded.customFormats.length : 0;
    if (embeddedFormats !== listedFormats) return embeddedFormats > listedFormats ? embedded : listed;
    const listedScore = Number(listed.customFormatScore);
    const embeddedScore = Number(embedded.customFormatScore);
    const listedKnown = Number.isFinite(listedScore) && listedScore !== 0;
    const embeddedKnown = Number.isFinite(embeddedScore) && embeddedScore !== 0;
    if (embeddedKnown && !listedKnown) return embedded;
    if (listedKnown && !embeddedKnown) return listed;
    return Math.abs(embeddedScore || 0) >= Math.abs(listedScore || 0) ? embedded : listed;
};

const seasonNumberFromFile = (file = {}) => {
    const direct = Number(file.seasonNumber);
    if (Number.isFinite(direct)) return direct;
    const fromPath = String(file.relativePath || file.path || '').match(/(?:^|\/)(?:season[ ._-]*)(\d{1,3})\b/i);
    if (fromPath) return Number(fromPath[1]);
    const fromToken = String(file.relativePath || file.path || file.sceneName || '').match(/\bS(\d{1,3})E\d{1,3}\b/i);
    if (fromToken) return Number(fromToken[1]);
    return null;
};

const resolveArrFilePath = (file = {}, seriesPath = null) => {
    if (file?.path) return String(file.path);
    const relative = String(file?.relativePath || '').replace(/^\/+/, '');
    const root = String(seriesPath || '').replace(/\/+$/, '');
    if (relative && root) return `${root}/${relative}`;
    return relative || null;
};

export const buildSonarrIndexItem = (instance, record, episodeFiles = [], episodes = [], profile = null, { now = Date.now() } = {}) => {
    const fileById = new Map((Array.isArray(episodeFiles) ? episodeFiles : []).map((file) => [Number(file.id), file]));
    const episodeRows = [];
    const seasonMap = new Map();

    const pushRow = (row) => {
        episodeRows.push(row);
        if (!seasonMap.has(row.seasonNumber)) seasonMap.set(row.seasonNumber, []);
        seasonMap.get(row.seasonNumber).push(row);
    };

    for (const episode of (Array.isArray(episodes) ? episodes : [])) {
        if (!episode?.hasFile && !episode?.episodeFileId && !episode?.episodeFile) continue;
        const file = preferEpisodeFile(
            fileById.get(Number(episode.episodeFileId || episode.episodeFile?.id)),
            episode.episodeFile || null,
        );
        if (!file) continue;
        const snap = fileSnapshot(file, profile);
        pushRow({
            episodeId: episode.id,
            episodeFileId: file.id,
            filePath: resolveArrFilePath(file, record.path),
            seasonNumber: Number(episode.seasonNumber),
            episodeNumber: episode.episodeNumber,
            title: episode.title,
            ...snap,
        });
    }

    // Fall back to episode files alone when episode↔file join yields nothing.
    if (!episodeRows.length) {
        for (const file of (Array.isArray(episodeFiles) ? episodeFiles : [])) {
            const snap = fileSnapshot(file, profile);
            const seasonNumber = seasonNumberFromFile(file);
            if (!Number.isFinite(seasonNumber)) continue;
            pushRow({
                episodeId: null,
                episodeFileId: file.id,
                filePath: resolveArrFilePath(file, record.path),
                seasonNumber,
                episodeNumber: file.episodeNumber ?? null,
                title: file.relativePath || record.title,
                ...snap,
            });
        }
    }

    let scoreUnknown = false;
    let seasons = [...seasonMap.entries()].map(([seasonNumber, rows]) => {
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
            scoreUnknown: false,
        };
    }).sort((a, b) => a.seasonNumber - b.seasonNumber);

    // Last resort: series statistics prove files exist, but CF scores are unknown.
    // Do NOT treat that as score 0 — hunt would keep picking them as "worst."
    if (!seasons.length && Array.isArray(record.seasons)) {
        seasons = record.seasons
            .filter((season) => Number(season?.statistics?.episodeFileCount || 0) > 0)
            .map((season) => ({
                seasonNumber: Number(season.seasonNumber),
                episodeCount: Number(season.statistics.episodeFileCount || 0),
                minResolution: 'unknown',
                avgCustomFormatScore: null,
                maxCustomFormatScore: null,
                sizeGB: Math.round((Number(season.statistics.sizeOnDisk || 0) / 1024 / 1024 / 1024) * 100) / 100,
                hasHdr: false,
                hasDolbyVision: false,
                hasAtmos: false,
                isRemux: false,
                scoreUnknown: true,
            }))
            .sort((a, b) => a.seasonNumber - b.seasonNumber);
        scoreUnknown = seasons.length > 0;
    }

    const allResolutions = episodeRows.map((row) => row.videoResolution);
    const allScores = episodeRows.map((row) => row.customFormatScore);
    const sizeGB = episodeRows.length
        ? episodeRows.reduce((sum, row) => sum + Number(row.sizeGB || 0), 0)
        : Number(record.statistics?.sizeOnDisk || 0) / 1024 / 1024 / 1024;
    const best = episodeRows.reduce((acc, row) => {
        if (!acc) return row;
        return row.customFormatScore > acc.customFormatScore ? row : acc;
    }, null);
    const statsFileCount = Number(record.statistics?.episodeFileCount || 0);
    const episodeCount = episodeRows.length || statsFileCount || seasons.reduce((sum, season) => sum + Number(season.episodeCount || 0), 0);
    const hasFile = episodeCount > 0;
    const avgCustomFormatScore = scoreUnknown
        ? null
        : (allScores.length
            ? Math.round(allScores.reduce((sum, score) => sum + score, 0) / allScores.length)
            : 0);
    const library = classifyUpgraderLibrary(instance, record);
    const missing = countMissingAiredEpisodes(episodes, now);
    const huntMissingEligible = (record.monitored !== false) && missing.missingAiredCount > 0;

    return {
        ratingKey: `sonarr:${instance.id}:${record.id}`,
        entityId: record.id,
        arrType: 'sonarr',
        arrInstanceId: instance.id,
        arrInstanceName: instance.name,
        libraryKey: library.libraryKey,
        libraryName: library.libraryName,
        libraryBucket: library.libraryBucket,
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
        hasFile,
        scoreUnknown,
        path: record.path || null,
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
        customFormatScore: scoreUnknown ? null : (best?.customFormatScore ?? 0),
        avgCustomFormatScore,
        sizeGB: Math.round(sizeGB * 100) / 100,
        sizeBytes: episodeRows.reduce((sum, row) => sum + Number(row.sizeBytes || 0), 0)
            || Number(record.statistics?.sizeOnDisk || 0),
        seasonFloorResolution: minResolutionTier(allResolutions),
        seasons,
        episodeCount,
        totalEpisodeCount: episodeCount,
        nonHevcEpisodeCount: episodeRows.filter((row) => !row.isHevc).length,
        episodes: episodeRows,
        missingAiredCount: missing.missingAiredCount,
        availableAt: missing.availableAt,
        huntMissingEligible,
    };
};

export const buildLidarrIndexItem = (instance, record, trackFile = null, profile = null) => {
    const snap = fileSnapshot(trackFile || record.trackFile || null, profile);
    const library = classifyUpgraderLibrary(instance, record);
    const artistName = record.artist?.artistName || record.artistName || '';
    const title = artistName ? `${artistName} — ${record.title}` : record.title;
    return {
        ratingKey: `lidarr:${instance.id}:${record.id}`,
        entityId: record.id,
        arrType: 'lidarr',
        arrInstanceId: instance.id,
        arrInstanceName: instance.name,
        libraryKey: library.libraryKey,
        libraryName: library.libraryName,
        libraryBucket: library.libraryBucket,
        mediaType: 'album',
        title,
        year: record.releaseDate ? Number(String(record.releaseDate).slice(0, 4)) : null,
        overview: record.overview || '',
        monitored: record.monitored !== false,
        addedAt: record.added || null,
        qualityProfileId: record.qualityProfileId || null,
        thumbUrl: posterUrl(record) || posterUrl(record.artist || {}),
        arrDeepUrl: `${normalizeUrl(instance.url)}/album/${record.titleSlug || record.id}`,
        hasFile: !!record.anyReleaseHasFile || !!trackFile || Number(record.statistics?.trackFileCount || 0) > 0,
        path: record.path || null,
        ...snap,
        customFormatScore: snap.customFormatScore || Number(record.statistics?.customFormatScore || 0) || 0,
        avgCustomFormatScore: snap.customFormatScore || Number(record.statistics?.customFormatScore || 0) || 0,
        sizeGB: snap.sizeGB || toGb(record.statistics?.sizeOnDisk),
        sizeBytes: snap.sizeBytes || Number(record.statistics?.sizeOnDisk || 0) || 0,
        seasons: null,
        episodeCount: Number(record.statistics?.trackFileCount || 0) || null,
        seasonFloorResolution: snap.videoResolution,
    };
};
