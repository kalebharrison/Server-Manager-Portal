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

/** Multi-episode packs in one file (S03E10-E11, E03E04, etc.). */
export const countMergedEpisodesFromPath = (filePath = null) => {
    const text = String(filePath || '');
    if (!text) return 1;
    const range = text.match(/[Ss]\d{1,2}[Ee](\d{1,3})[-_][Ee]?(\d{1,3})/i)
        || text.match(/(?:^|[/_.-])[Ee](\d{1,3})[-_][Ee](\d{1,3})(?:[._-]|$)/i)
        || text.match(/[Ee](\d{1,3})[Ee](\d{1,3})/i);
    if (!range) return 1;
    const start = Number(range[1]);
    const end = Number(range[2]);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 1;
    return Math.min(Math.max(1, end - start + 1), 12);
};

/** Scale single-episode catalog runtime when the path encodes a merged pack. */
export const adjustTvExpectedRuntimeSec = (expectedSec, filePath = null) => {
    const expected = Number(expectedSec);
    if (!Number.isFinite(expected) || expected <= 0) return expectedSec;
    const merged = countMergedEpisodesFromPath(filePath);
    if (merged <= 1) return expected;
    return expected * merged;
};

/** Sonarr season 0 / specials folder — catalog runtime is usually a regular-episode placeholder. */
export const isSpecialEpisode = ({
    seasonNumber = null,
    filePath = null,
    localPath = null,
    title = null,
} = {}) => {
    if (seasonNumber != null && seasonNumber !== '') {
        const sn = Number(seasonNumber);
        if (Number.isFinite(sn) && sn === 0) return true;
    }
    const path = String(filePath || localPath || '');
    if (/specials/i.test(path) || /\bS00E\d+/i.test(path) || /Season[ _]0{2}\b/i.test(path)) {
        return true;
    }
    return /\bSpecials\b/i.test(String(title || ''));
};

/** Drop stored runtime drift rows that would pass under current TV/movie runtime rules. */
export const shouldIgnoreRuntimeFinding = (finding = {}) => {
    if (String(finding?.reason || '').toLowerCase() !== 'duration_mismatch') return false;
    if (isSpecialEpisode(finding)) return true;

    const actual = Number(finding.durationSec);
    const expectedRaw = Number(finding.expectedRuntimeSec);
    if (!Number.isFinite(actual) || actual <= 0 || !Number.isFinite(expectedRaw) || expectedRaw <= 0) {
        return false;
    }

    const filePath = finding.filePath || finding.localPath || null;
    const isShow = finding.mediaType === 'show'
        || finding.arrType === 'sonarr'
        || finding.seasonNumber != null;
    const check = durationMatchesExpected(actual, expectedRaw, {
        mediaKind: finding.mediaKind || 'video',
        mediaType: isShow ? 'show' : (finding.mediaType || 'movie'),
        alternateCut: !isShow && isLikelyAlternateMovieCut({
            filePath,
            title: finding.title,
            qualityName: finding.qualityName,
            sourceTitle: finding.sourceTitle,
        }),
        specialEpisode: isSpecialEpisode(finding),
        filePath,
    });
    return check.ok;
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
    specialEpisode = false,
    filePath = null,
} = {}) => {
    const actual = Number(actualSec);
    let expected = Number(expectedSec);
    if (!Number.isFinite(actual) || actual <= 0 || !Number.isFinite(expected) || expected <= 0) {
        return { ok: true, skipped: true, delta: null, tol: null };
    }
    const kind = String(mediaKind || 'video').toLowerCase();
    const type = String(mediaType || '').toLowerCase();
    const isShow = type === 'show' || type === 'episode' || type === 'tv';
    const isMovie = !isShow && kind === 'video';

    if (isShow) {
        const merged = countMergedEpisodesFromPath(filePath);
        if (merged > 1) {
            expected *= merged;
        }
    }

    const delta = Math.abs(actual - expected);

    // Season 0 / specials: TVDB often lists ~22–30 min; files are shorts/web extras.
    if (isShow && specialEpisode) {
        return {
            ok: true,
            skipped: true,
            delta,
            tol: null,
            actual,
            expected,
            specialEpisode: true,
        };
    }

    // Multi-episode mkv without E10-E11 in the path (double-length file vs single-episode catalog).
    if (isShow && actual > expected && actual < 14_400) {
        for (let mult = 2; mult <= 6; mult += 1) {
            const target = expected * mult;
            const multiDelta = Math.abs(actual - target);
            const multiTol = Math.max(5 * 60, target * 0.12);
            if (multiDelta <= multiTol) {
                return {
                    ok: true,
                    skipped: true,
                    delta: multiDelta,
                    tol: multiTol,
                    actual,
                    expected,
                    multiEpisode: mult,
                };
            }
        }
        // Sonarr series.runtime placeholders (~10–35 min) vs normal ~22–48 min episode(s).
        if (expected < 35 * 60 && actual >= 20 * 60 && actual > expected * 1.35) {
            return {
                ok: true,
                skipped: true,
                delta: actual - expected,
                tol: null,
                actual,
                expected,
                seriesRuntimePlaceholder: true,
            };
        }
        // Longer episodes (streaming extended cuts) vs stale TVDB slot — still reject 4h corruption.
        const longerDelta = actual - expected;
        const longerTol = Math.max(40 * 60, expected * 0.85);
        if (longerDelta > 0 && longerDelta <= longerTol && actual < 14_400) {
            return {
                ok: true,
                skipped: true,
                delta: longerDelta,
                tol: longerTol,
                actual,
                expected,
                longerEpisode: true,
            };
        }
    }

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
