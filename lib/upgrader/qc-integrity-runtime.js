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
        const trackDuration = parseRuntimeToSec(
            track?.duration
            ?? file?.duration
            ?? file?.mediaInfo?.duration
            ?? record?.duration,
        );
        if (trackDuration != null) return trackDuration;
        return null;
    }

    const episodeRuntime = parseRuntimeToSec(episode?.runtime ?? episode?.runTime);
    if (episodeRuntime != null) return episodeRuntime;

    const recordRuntime = parseRuntimeToSec(record?.runtime ?? record?.runTime ?? file?.runtime);
    if (recordRuntime != null) return recordRuntime;

    return null;
};

/**
 * Duration vs expected runtime. Large deltas catch "plays forever / stuck at 4h" style corruption.
 */
export const durationMatchesExpected = (actualSec, expectedSec, { mediaKind = 'video' } = {}) => {
    const actual = Number(actualSec);
    const expected = Number(expectedSec);
    if (!Number.isFinite(actual) || actual <= 0 || !Number.isFinite(expected) || expected <= 0) {
        return { ok: true, skipped: true, delta: null, tol: null };
    }
    const tol = mediaKind === 'audio'
        ? Math.max(2, expected * 0.08)
        : Math.max(45, expected * 0.06);
    const delta = Math.abs(actual - expected);
    return {
        ok: delta <= tol,
        skipped: false,
        delta,
        tol,
        actual,
        expected,
    };
};
