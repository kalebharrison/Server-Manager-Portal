/**
 * Parse Arr catalog / MediaInfo runtime values into seconds.
 * Accepts HH:MM:SS, MM:SS, seconds, minutes (small ints), or milliseconds (large ints).
 */
export const parseRuntimeToSec = (raw) => {
    if (raw == null || raw === '') return null;
    if (typeof raw === 'number' && Number.isFinite(raw)) {
        if (raw <= 0) return null;
        if (raw >= 10_000) return raw / 1000; // ms (Lidarr track duration)
        if (raw <= 600 && Number.isInteger(raw)) return raw * 60; // Arr movie/episode runtime minutes
        return raw;
    }
    const text = String(raw).trim();
    if (!text) return null;
    if (/^\d{1,3}:\d{2}(:\d{2}(\.\d+)?)?$/.test(text)) {
        const parts = text.split(':').map((part) => Number(part));
        if (parts.some((part) => !Number.isFinite(part))) return null;
        if (parts.length === 3) return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
        return (parts[0] * 60) + parts[1];
    }
    const numeric = Number(text);
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    return parseRuntimeToSec(numeric);
};

/**
 * Lidarr durations are milliseconds (or already seconds). Never treat a 3–4
 * minute integer as "minutes" the way movie/episode runtime works.
 */
export const parseAudioRuntimeToSec = (raw) => {
    if (raw == null || raw === '') return null;
    if (typeof raw === 'number' && Number.isFinite(raw)) {
        if (raw <= 0) return null;
        if (raw >= 10_000) return raw / 1000;
        return raw;
    }
    const text = String(raw).trim();
    if (!text) return null;
    if (/^\d{1,3}:\d{2}(:\d{2}(\.\d+)?)?$/.test(text)) {
        return parseRuntimeToSec(text);
    }
    const numeric = Number(text);
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    return parseAudioRuntimeToSec(numeric);
};

const firstAudioDuration = (...values) => {
    for (const value of values) {
        const parsed = parseAudioRuntimeToSec(value);
        if (parsed != null) return parsed;
    }
    return null;
};

/**
 * Expected runtime for duration mismatch — catalog metadata via Arr (TMDb/TVDB),
 * not file MediaInfo (that would match a bad encode to itself).
 */
export const extractExpectedRuntimeSec = ({
    file = null,
    record = null,
    episode = null,
    track = null,
    mediaKind = 'video',
} = {}) => {
    if (mediaKind === 'audio') {
        const media = file?.mediaInfo || track?.mediaInfo || {};
        // Per-track only. Lidarr album `duration` is the whole album and would
        // fail every song as duration_mismatch (3 min file vs 40 min album).
        return firstAudioDuration(
            track?.duration,
            file?.duration,
            media.audioDuration,
            media.duration,
            media.runTime,
        );
    }

    const episodeRuntime = parseRuntimeToSec(episode?.runtime ?? episode?.runTime);
    if (episodeRuntime != null) return episodeRuntime;

    const recordRuntime = parseRuntimeToSec(record?.runtime ?? record?.runTime ?? file?.runtime);
    if (recordRuntime != null) return recordRuntime;

    return null;
};

/** Alternate-cut hints in release names / paths (TMDb has no per-edition runtime). */
export const MOVIE_EDITION_PATTERN = /\b(director'?s?\s*cut|extended\s*(cut|edition|version)?|unrated|ultimate\s*cut|final\s*cut|special\s*edition|anniversary\s*edition|recut|imax\s*enhanced)\b/i;

export const isLikelyAlternateMovieCut = ({
    filePath = null,
    title = null,
    qualityName = null,
    sourceTitle = null,
} = {}) => {
    const haystack = [filePath, title, qualityName, sourceTitle].filter(Boolean).join(' ');
    return MOVIE_EDITION_PATTERN.test(haystack);
};

/**
 * Best-effort movie expected length: catalog (TMDb via Radarr) plus any longer
 * duration we already probed on this file. TMDb does not expose director/extended
 * cut runtimes as separate metadata — this learns from the file on disk.
 */
export const resolveMovieExpectedRuntimeSec = ({
    catalogSec = null,
    priorDurationSec = null,
    priorExpectedRuntimeSec = null,
} = {}) => {
    const values = [catalogSec, priorExpectedRuntimeSec, priorDurationSec]
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0);
    if (!values.length) return null;
    return Math.max(...values);
};

/**
 * Duration vs expected runtime. Large deltas catch "plays forever / stuck at 4h" style corruption.
 * TV episode catalog runtimes (TVDB/Sonarr) are often wrong for specials / variable-length
 * shows — keep a wide band so Top Gear / GoT / extended eps do not flood findings.
 */
export const durationMatchesExpected = (actualSec, expectedSec, {
    mediaKind = 'video',
    mediaType = null,
    alternateCut = false,
} = {}) => {
    const actual = Number(actualSec);
    const expected = Number(expectedSec);
    if (!Number.isFinite(actual) || actual <= 0 || !Number.isFinite(expected) || expected <= 0) {
        return { ok: true, skipped: true, delta: null, tol: null };
    }
    const kind = String(mediaKind || 'video').toLowerCase();
    const type = String(mediaType || '').toLowerCase();
    const isShow = type === 'show' || type === 'episode' || type === 'tv';
    const isMovie = !isShow && kind === 'video';
    const delta = Math.abs(actual - expected);

    // Plex / bad encodes that never end — always fail regardless of edition tolerance.
    if (isMovie && actual >= 14_400) {
        return {
            ok: false,
            skipped: false,
            delta,
            tol: 0,
            actual,
            expected,
        };
    }

    // Extended/director cuts are often longer than theatrical TMDb runtime — allow
    // moderate overrun; still fail absurd inflation (stuck-at-4h style corruption).
    if (isMovie && alternateCut && actual > expected) {
        const corruptionCeiling = Math.max(90 * 60, expected * 0.55);
        if (actual - expected <= corruptionCeiling) {
            return {
                ok: true,
                skipped: true,
                delta: actual - expected,
                tol: corruptionCeiling,
                actual,
                expected,
                longerCut: true,
            };
        }
    }

    const tol = kind === 'audio'
        ? Math.max(2, expected * 0.08)
        : isShow
            // ±50% or at least 20 minutes — still catches 4h-vs-45m corruption.
            ? Math.max(20 * 60, expected * 0.5)
            : isMovie
                // ±15 minutes or 15% — credits/metadata/edition drift; still catches huge gaps.
                ? Math.max(15 * 60, expected * 0.15)
                : Math.max(45, expected * 0.06);
    // Stale indexes stamped album length onto every track (~40 min expected vs
    // ~3 min file). Skip rather than fail until the index is rebuilt.
    if (kind === 'audio' && expected >= 900 && actual < expected * 0.4) {
        return {
            ok: true,
            skipped: true,
            delta,
            tol: null,
            actual,
            expected,
        };
    }
    return {
        ok: delta <= tol,
        skipped: false,
        delta,
        tol,
        actual,
        expected,
    };
};
