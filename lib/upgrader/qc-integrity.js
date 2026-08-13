import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getReadyArrInstances } from '../media-stack/arr-instances.js';
import { createPlexSessionsSnapshot } from '../plex/plex-sessions-snapshot.js';
import { computeImohash, computeXxhash64 } from './qc-integrity-hash.js';
import { durationMatchesExpected } from './qc-integrity-runtime.js';
import {
    cleanupPortalTrimTmps,
    configureTrimRemuxConcurrency,
    describeTrimPlan,
    isTrimVideoPath,
    normalizeTrimRemuxConcurrency,
    resolveTrimConfig,
    trimMkvFile,
    trimProfileKey,
} from './qc-media-trim.js';
import {
    RECENT_IMPORT_WINDOW_MS,
    collectRecentImportPayloads,
    missingImportChecks,
} from './qc-integrity-recent-imports.js';
import {
    isIntegrityCheckAllowed,
    librariesAllowingNightlyCheck,
} from './qc-integrity-schedule-policy.js';
import { refreshPlexPathAfterImport } from './qc-plex-refresh.js';
import { lookupTrimNativeLanguage } from './qc-trim-native-lang.js';

const DEFAULT_WINDOW_SEC = 10;
const DEFAULT_TIMEOUT_MS = 90000;
const DEFAULT_DECODE_RETRIES = 2;
const DEFAULT_MAX_PER_CYCLE = 200;
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_PLAYABILITY_CONCURRENCY = 1;
const DEFAULT_TRIM_CONCURRENCY = 1;
const SCHEMA_VERSION = 2;
const PLEX_SESSION_CACHE_MS = 20000;

const isTimeoutReason = (reason) => /_timeout$/i.test(String(reason || ''));
const softTimeoutsEnabled = (config) => config?.qcIntegritySoftDecodeTimeouts !== false;

const EMPTY_BUCKET = () => ({ total: 0, playability: 0, imohash: 0, xxhash: 0, trim: 0 });
const INTEGRITY_SCAN_MODES = ['baseline', 'playability', 'imohash', 'xxhash', 'trim'];
const TRIM_SOFT_REASONS = new Set(['trim_pending', 'trim_dry_run']);
const TRIM_PREVIEW_MAX_ITEMS = 5000;

const isTrimPreviewReason = (reason) => TRIM_SOFT_REASONS.has(reason);

const buildTrimPreviewItem = (candidate, result) => {
    const described = result?.trimPlan
        ? describeTrimPlan(result.trimPlan)
        : {
            detail: result?.detail || null,
            audioKeep: result?.audioKeep || [],
            audioDrop: result?.audioDrop || [],
            subKeep: result?.subKeep || [],
            subDrop: result?.subDrop || [],
        };
    return {
        key: result?.key || candidate?.key || null,
        title: result?.title || candidate?.title || null,
        seasonNumber: candidate?.seasonNumber ?? result?.seasonNumber ?? null,
        episodeNumber: candidate?.episodeNumber ?? result?.episodeNumber ?? null,
        filePath: result?.localPath || result?.filePath || candidate?.filePath || null,
        libraryName: candidate?.libraryName || candidate?.arrInstanceName || null,
        nativeLanguage: result?.nativeLanguage || result?.trimNativeLang || null,
        nativeSource: result?.nativeSource || result?.trimNativeSource || null,
        detail: described.detail,
        audioKeep: described.audioKeep,
        audioDrop: described.audioDrop,
        subKeep: described.subKeep,
        subDrop: described.subDrop,
    };
};

const EMPTY_COVERAGE = () => ({
    movie: EMPTY_BUCKET(),
    show: EMPTY_BUCKET(),
    album: EMPTY_BUCKET(),
    byLibrary: [],
});

const mapPool = async (items, concurrency, worker, { shouldStop } = {}) => {
    const list = Array.isArray(items) ? items : [];
    const results = new Array(list.length);
    let next = 0;
    const runners = Array.from({ length: Math.max(1, Number(concurrency) || 1) }, async () => {
        while (next < list.length) {
            if (typeof shouldStop === 'function' && shouldStop()) break;
            const index = next;
            next += 1;
            results[index] = await worker(list[index], index);
        }
    });
    await Promise.all(runners);
    return results;
};

export const normalizeIntegrityPathMaps = (maps = []) => (Array.isArray(maps) ? maps : [])
    .map((entry) => ({
        from: String(entry?.from || entry?.arrPrefix || '').replace(/\/+$/, ''),
        to: String(entry?.to || entry?.containerPrefix || '').replace(/\/+$/, ''),
    }))
    .filter((entry) => entry.from && entry.to);

const normalizePathSlashes = (value) => String(value || '').replace(/\\/g, '/');

const hasParentTraversal = (value) => (
    normalizePathSlashes(value).split('/').some((segment) => segment === '..')
);

const isUnderPrefix = (candidatePath, prefix) => {
    const normalized = path.posix.normalize(normalizePathSlashes(candidatePath));
    const normPrefix = path.posix.normalize(normalizePathSlashes(prefix));
    if (!normPrefix) return false;
    return normalized === normPrefix || normalized.startsWith(`${normPrefix}/`);
};

const resolveRealPath = async (localPath, realpathImpl) => {
    const realpathFn = realpathImpl || ((target) => fs.realpath(target));
    try {
        return await realpathFn(localPath);
    } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
        const normalized = path.posix.normalize(normalizePathSlashes(localPath));
        const dir = path.posix.dirname(normalized);
        const base = path.posix.basename(normalized);
        if (dir === normalized || dir === '.') return normalized;
        try {
            const resolvedDir = await realpathFn(dir);
            return path.posix.join(resolvedDir, base);
        } catch {
            return normalized;
        }
    }
};

/** Documented compose default mount root when no path maps / media roots are set. */
export const DEFAULT_INTEGRITY_MEDIA_ROOT = '/media';

/** Never allow Integrity probes/remux under these prefixes (empty-map denylist mode). */
export const INTEGRITY_FORBIDDEN_PATH_PREFIXES = Object.freeze([
    '/etc', '/proc', '/sys', '/dev', '/boot', '/run', '/root',
    '/bin', '/sbin', '/usr', '/lib', '/lib64',
    '/var/run', '/var/lib/docker', '/var/lib/containerd',
]);

export const parseIntegrityMediaRoots = (value) => {
    const raw = Array.isArray(value)
        ? value
        : String(value || '')
            .split(/[\n,]+/)
            .map((entry) => entry.trim())
            .filter(Boolean);
    const out = [];
    for (const entry of raw) {
        const normalized = path.posix.normalize(normalizePathSlashes(String(entry || '')).replace(/\/+$/, '') || '/');
        if (!path.posix.isAbsolute(normalized) || normalized === '/') continue;
        if (hasParentTraversal(normalized)) continue;
        if (!out.includes(normalized)) out.push(normalized);
    }
    return out;
};

/**
 * Allowed media roots for Integrity reads/writes.
 * 1) Path-map `to` prefixes (preferred — Arr→container remap)
 * 2) Explicit qcIntegrityMediaRoots (identity mounts outside documented defaults)
 * 3) null → denylist mode (any absolute path except system prefixes)
 */
export const resolveIntegrityMediaRoots = (configOrMaps = {}, mapsInput = undefined) => {
    const config = Array.isArray(configOrMaps) ? {} : (configOrMaps || {});
    const maps = Array.isArray(mapsInput)
        ? mapsInput
        : (Array.isArray(configOrMaps) ? configOrMaps : (config.qcIntegrityPathMaps || []));
    const fromMaps = normalizeIntegrityPathMaps(maps).map((entry) => entry.to).filter(Boolean);
    if (fromMaps.length) return [...new Set(fromMaps)];
    const custom = parseIntegrityMediaRoots(config.qcIntegrityMediaRoots);
    if (custom.length) return custom;
    return null;
};

/**
 * Reject traversal/null-byte paths and confine reads to configured media roots.
 * With path maps / media roots: allowlist those prefixes.
 * With neither: denylist system paths (portable for identity Arr mounts).
 */
export const assertSafeMediaPath = async (localPath, maps = [], {
    realpathImpl = null,
    allowedRoots = undefined,
    config = null,
} = {}) => {
    const raw = String(localPath || '');
    if (!raw) {
        return { ok: false, reason: 'unsafe_path', detail: 'empty path' };
    }
    if (raw.includes('\0')) {
        return { ok: false, reason: 'unsafe_path', detail: 'null byte in path' };
    }
    if (hasParentTraversal(raw)) {
        return { ok: false, reason: 'unsafe_path', detail: 'parent traversal segment' };
    }

    let resolved;
    try {
        resolved = await resolveRealPath(raw, realpathImpl);
    } catch (error) {
        return { ok: false, reason: 'unsafe_path', detail: error.message };
    }
    const normalizedResolved = path.posix.normalize(normalizePathSlashes(resolved));

    if (!path.posix.isAbsolute(normalizedResolved)) {
        return { ok: false, reason: 'unsafe_path', detail: 'relative path not allowed' };
    }

    const roots = allowedRoots !== undefined
        ? allowedRoots
        : resolveIntegrityMediaRoots(config || {}, maps);

    if (Array.isArray(roots) && roots.length > 0) {
        const allowed = roots.some((prefix) => isUnderPrefix(normalizedResolved, prefix));
        if (!allowed) {
            return {
                ok: false,
                reason: 'unsafe_path',
                detail: 'path outside configured media roots',
            };
        }
        return { ok: true, path: normalizedResolved };
    }

    // Denylist mode — portable when Arr paths already match container mounts.
    if (normalizedResolved === '/') {
        return { ok: false, reason: 'unsafe_path', detail: 'filesystem root not allowed' };
    }
    const forbidden = INTEGRITY_FORBIDDEN_PATH_PREFIXES.some((prefix) => (
        isUnderPrefix(normalizedResolved, prefix)
    ));
    if (forbidden) {
        return {
            ok: false,
            reason: 'unsafe_path',
            detail: 'path under forbidden system prefix',
        };
    }

    return { ok: true, path: normalizedResolved };
};

export const mapArrPath = (arrPath, maps = []) => {
    const raw = String(arrPath || '');
    if (!raw) return null;
    const normalizedMaps = normalizeIntegrityPathMaps(maps)
        .sort((a, b) => b.from.length - a.from.length);

    for (const entry of normalizedMaps) {
        if (raw === entry.from || raw.startsWith(`${entry.from}/`)) {
            return `${entry.to}${raw.slice(entry.from.length)}`;
        }
    }
    return raw;
};

export const scheduleDecodeWindows = (durationSec, windowSec = DEFAULT_WINDOW_SEC) => {
    const duration = Number(durationSec);
    const window = Math.max(1, Number(windowSec) || DEFAULT_WINDOW_SEC);
    if (!Number.isFinite(duration) || duration <= 0) {
        return [{ id: 'start', seekSec: 0 }];
    }
    if (duration <= window * 2) {
        const windows = [{ id: 'start', seekSec: 0 }];
        if (duration > window) {
            windows.push({ id: 'end', seekSec: Math.max(0, duration - window) });
        }
        return windows;
    }
    return [
        { id: 'start', seekSec: 0 },
        { id: 'mid', seekSec: Math.max(0, (duration / 2) - (window / 2)) },
        { id: 'end', seekSec: Math.max(0, duration - window) },
    ];
};

const runCommand = (bin, args, { timeoutMs = DEFAULT_TIMEOUT_MS, execImpl = null } = {}) => {
    if (typeof execImpl === 'function') {
        return execImpl(bin, args, { timeoutMs });
    }
    return new Promise((resolve) => {
        const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '';
        let stderr = '';
        let settled = false;
        const finish = (result) => {
            if (settled) return;
            settled = true;
            resolve(result);
        };
        const timer = setTimeout(() => {
            try { child.kill('SIGKILL'); } catch { /* ignore */ }
            finish({
                ok: false,
                code: null,
                timedOut: true,
                stdout,
                stderr: stderr || `Timed out after ${timeoutMs}ms`,
            });
        }, Math.max(1000, Number(timeoutMs) || DEFAULT_TIMEOUT_MS));

        child.stdout.on('data', (chunk) => { stdout += String(chunk); });
        child.stderr.on('data', (chunk) => { stderr += String(chunk); });
        child.on('error', (error) => {
            clearTimeout(timer);
            finish({ ok: false, code: null, timedOut: false, stdout, stderr: error.message });
        });
        child.on('close', (code) => {
            clearTimeout(timer);
            finish({
                ok: code === 0,
                code,
                timedOut: false,
                stdout,
                stderr,
            });
        });
    });
};

export const checkIntegrityTools = async ({ execImpl = null } = {}) => {
    const ffprobe = await runCommand('ffprobe', ['-version'], { timeoutMs: 5000, execImpl });
    const ffmpeg = await runCommand('ffmpeg', ['-version'], { timeoutMs: 5000, execImpl });
    const mkvmerge = await runCommand('mkvmerge', ['--version'], { timeoutMs: 5000, execImpl });
    return {
        ffprobe: !!ffprobe.ok,
        ffmpeg: !!ffmpeg.ok,
        mkvmerge: !!mkvmerge.ok,
        ready: !!ffprobe.ok && !!ffmpeg.ok,
    };
};

export const probeMediaFile = async (localPath, {
    requireAudio = true,
    mediaKind = 'video',
    timeoutMs = DEFAULT_TIMEOUT_MS,
    execImpl = null,
} = {}) => {
    const result = await runCommand('ffprobe', [
        '-v', 'error',
        '-show_entries', 'format=duration:stream=codec_type',
        '-of', 'json',
        localPath,
    ], { timeoutMs, execImpl });

    if (result.timedOut) {
        return { ok: false, reason: 'probe_timeout', durationSec: null, hasVideo: false, hasAudio: false };
    }
    if (!result.ok) {
        return {
            ok: false,
            reason: 'probe_failed',
            detail: (result.stderr || '').trim().slice(0, 200) || 'ffprobe failed',
            durationSec: null,
            hasVideo: false,
            hasAudio: false,
        };
    }

    let parsed = null;
    try {
        parsed = JSON.parse(result.stdout || '{}');
    } catch {
        return { ok: false, reason: 'probe_failed', detail: 'Invalid ffprobe JSON', durationSec: null, hasVideo: false, hasAudio: false };
    }

    const streams = Array.isArray(parsed?.streams) ? parsed.streams : [];
    const hasVideo = streams.some((stream) => stream?.codec_type === 'video');
    const hasAudio = streams.some((stream) => stream?.codec_type === 'audio');
    const durationSec = Number(parsed?.format?.duration);
    const kind = mediaKind === 'audio' ? 'audio' : 'video';

    if (kind === 'audio') {
        if (!hasAudio) {
            return {
                ok: false,
                reason: 'missing_audio',
                durationSec: Number.isFinite(durationSec) ? durationSec : null,
                hasVideo,
                hasAudio,
            };
        }
        return {
            ok: true,
            reason: null,
            durationSec: Number.isFinite(durationSec) ? durationSec : null,
            hasVideo,
            hasAudio,
        };
    }

    if (!hasVideo) {
        return {
            ok: false,
            reason: 'missing_video',
            durationSec: Number.isFinite(durationSec) ? durationSec : null,
            hasVideo,
            hasAudio,
        };
    }
    if (requireAudio && !hasAudio) {
        return {
            ok: false,
            reason: 'missing_audio',
            durationSec: Number.isFinite(durationSec) ? durationSec : null,
            hasVideo,
            hasAudio,
        };
    }
    return {
        ok: true,
        reason: null,
        durationSec: Number.isFinite(durationSec) ? durationSec : null,
        hasVideo,
        hasAudio,
    };
};

export const quickDecodeFile = async (localPath, {
    durationSec = null,
    windowSec = DEFAULT_WINDOW_SEC,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = DEFAULT_DECODE_RETRIES,
    mediaKind = 'video',
    execImpl = null,
} = {}) => {
    const windows = scheduleDecodeWindows(durationSec, windowSec);
    const window = Math.max(1, Number(windowSec) || DEFAULT_WINDOW_SEC);
    const kind = mediaKind === 'audio' ? 'audio' : 'video';
    const maxAttempts = Math.max(1, 1 + (Math.max(0, Number(retries) || 0)));
    for (const entry of windows) {
        const args = [
            '-hide_banner',
            '-nostdin',
            '-loglevel', 'error',
            '-ss', String(Math.max(0, Number(entry.seekSec) || 0)),
            '-t', String(window),
            '-i', localPath,
        ];
        if (kind === 'audio') {
            args.push('-map', '0:a:0?', '-vn');
        } else {
            args.push('-map', '0:v:0?', '-map', '0:a:0?');
        }
        args.push('-f', 'null', '-');

        let lastFailure = null;
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            const result = await runCommand('ffmpeg', args, { timeoutMs, execImpl });
            if (result.ok && !result.timedOut) {
                lastFailure = null;
                break;
            }
            lastFailure = result.timedOut
                ? { ok: false, reason: `decode_${entry.id}_timeout`, windowId: entry.id, timedOut: true, attempts: attempt }
                : {
                    ok: false,
                    reason: `decode_${entry.id}`,
                    windowId: entry.id,
                    detail: (result.stderr || '').trim().slice(0, 200) || 'ffmpeg decode failed',
                    timedOut: false,
                    attempts: attempt,
                };
            // Only retry timeouts / transient failures; hard decode errors stop immediately.
            if (!result.timedOut) break;
        }
        if (lastFailure) return lastFailure;
    }
    return { ok: true, reason: null, windows: windows.map((entry) => entry.id) };
};

const coverageBucket = (mediaType) => {
    if (mediaType === 'movie') return 'movie';
    if (mediaType === 'album') return 'album';
    return 'show';
};

export const collectIntegrityCandidates = (items = [], { includeMusic = true } = {}) => {
    const out = [];
    for (const item of (Array.isArray(items) ? items : [])) {
        // Integrity covers the whole library — do not skip unmonitored Arr items.
        if (!item) continue;

        if (item.mediaType === 'movie' || item.arrType === 'radarr') {
            if (!item.hasFile || !item.movieFileId || !item.filePath) continue;
            out.push({
                key: `${item.ratingKey}:file:${item.movieFileId}`,
                ratingKey: item.ratingKey,
                title: item.title,
                arrType: 'radarr',
                arrInstanceId: item.arrInstanceId,
                arrInstanceName: item.arrInstanceName,
                entityId: item.entityId,
                mediaType: 'movie',
                mediaKind: 'video',
                movieFileId: item.movieFileId,
                episodeId: null,
                episodeFileId: null,
                trackFileId: null,
                seasonNumber: null,
                episodeNumber: null,
                filePath: item.filePath,
                expectedRuntimeSec: item.expectedRuntimeSec ?? null,
                downloadId: item.downloadId || null,
                sourceTitle: item.sourceTitle || null,
                libraryKey: item.libraryKey || null,
                libraryName: item.libraryName || item.arrInstanceName || null,
                libraryBucket: item.libraryBucket || null,
                thumbUrl: item.thumbUrl || null,
                originalLanguage: item.originalLanguage || item.originalLanguageCode || null,
                tmdbId: item.tmdbId || null,
                tvdbId: item.tvdbId || null,
                imdbId: item.imdbId || null,
                year: item.year || null,
            });
            continue;
        }

        if (item.mediaType === 'show' || item.arrType === 'sonarr') {
            const seenEpisodeFiles = new Set();
            for (const episode of (Array.isArray(item.episodes) ? item.episodes : [])) {
                if (!episode?.episodeFileId || !episode?.filePath) continue;
                const fileId = String(episode.episodeFileId);
                // Multi-episode packs share one file — one integrity candidate per file id.
                if (seenEpisodeFiles.has(fileId)) continue;
                seenEpisodeFiles.add(fileId);
                out.push({
                    key: `${item.ratingKey}:file:${episode.episodeFileId}`,
                    ratingKey: item.ratingKey,
                    title: item.title,
                    arrType: 'sonarr',
                    arrInstanceId: item.arrInstanceId,
                    arrInstanceName: item.arrInstanceName,
                    entityId: item.entityId,
                    mediaType: 'show',
                    mediaKind: 'video',
                    movieFileId: null,
                    episodeId: episode.episodeId || null,
                    episodeFileId: episode.episodeFileId,
                    trackFileId: null,
                    seasonNumber: episode.seasonNumber ?? null,
                    episodeNumber: episode.episodeNumber ?? null,
                    filePath: episode.filePath,
                    expectedRuntimeSec: episode.expectedRuntimeSec ?? item.expectedRuntimeSec ?? null,
                    downloadId: episode.downloadId || item.downloadId || null,
                    sourceTitle: episode.sourceTitle || item.sourceTitle || null,
                    libraryKey: item.libraryKey || null,
                    libraryName: item.libraryName || item.arrInstanceName || null,
                    libraryBucket: item.libraryBucket || null,
                    thumbUrl: item.thumbUrl || null,
                    episodeTitle: episode.title || null,
                    originalLanguage: item.originalLanguage || item.originalLanguageCode || null,
                    tmdbId: item.tmdbId || null,
                    tvdbId: item.tvdbId || null,
                    imdbId: item.imdbId || null,
                    year: item.year || null,
                });
            }
            continue;
        }

        if (!includeMusic) continue;
        if (item.arrType !== 'lidarr' && item.mediaType !== 'album') continue;

        const trackFiles = Array.isArray(item.trackFiles) && item.trackFiles.length
            ? item.trackFiles
            : ((item.trackFileId || item.filePath)
                ? [{
                    trackFileId: item.trackFileId || null,
                    filePath: item.filePath || null,
                    expectedRuntimeSec: item.expectedRuntimeSec ?? null,
                    downloadId: item.downloadId || null,
                    sourceTitle: item.sourceTitle || null,
                    title: item.title || null,
                }]
                : []);

        for (const track of trackFiles) {
            const trackFileId = track?.trackFileId || track?.id || null;
            const filePath = track?.filePath || track?.path || null;
            if (!trackFileId || !filePath) continue;
            out.push({
                key: `${item.ratingKey}:file:${trackFileId}`,
                ratingKey: item.ratingKey,
                title: item.title,
                arrType: 'lidarr',
                arrInstanceId: item.arrInstanceId,
                arrInstanceName: item.arrInstanceName,
                entityId: item.entityId,
                artistId: item.artistId || null,
                mediaType: 'album',
                mediaKind: 'audio',
                movieFileId: null,
                episodeId: null,
                episodeFileId: null,
                trackFileId,
                seasonNumber: null,
                episodeNumber: null,
                filePath,
                expectedRuntimeSec: track.expectedRuntimeSec ?? item.expectedRuntimeSec ?? null,
                downloadId: track.downloadId || item.downloadId || null,
                sourceTitle: track.sourceTitle || item.sourceTitle || null,
                libraryKey: item.libraryKey || null,
                libraryName: item.libraryName || item.arrInstanceName || null,
                thumbUrl: item.thumbUrl || null,
                trackTitle: track.title || null,
            });
        }
    }
    return out;
};

const cacheKeyFor = (candidate) => candidate.key;

const normalizePath = (value) => String(value || '').replace(/\\/g, '/').replace(/\/+/g, '/').toLowerCase();

const pathsMatch = (a, b) => {
    const left = normalizePath(a);
    const right = normalizePath(b);
    if (!left || !right) return false;
    return left === right || left.endsWith(right) || right.endsWith(left);
};

const extractSessionPaths = (metadata = []) => {
    const paths = new Set();
    for (const entry of (Array.isArray(metadata) ? metadata : [])) {
        for (const media of (Array.isArray(entry?.Media) ? entry.Media : [])) {
            for (const part of (Array.isArray(media?.Part) ? media.Part : [])) {
                if (part?.file) paths.add(String(part.file));
            }
        }
    }
    return [...paths];
};

const apiVersionFor = (arrType) => (arrType === 'lidarr' ? 'v1' : 'v3');

const cursorKeyForMode = (mode) => {
    if (mode === 'imohash') return 'integrityImohashCursor';
    if (mode === 'xxhash') return 'integrityXxhashCursor';
    if (mode === 'playability') return 'integrityPlayabilityCursor';
    if (mode === 'trim') return 'integrityTrimCursor';
    return 'integrityScanCursor';
};

const libraryCoverageKey = (candidate) => {
    if (candidate?.libraryKey) return String(candidate.libraryKey);
    const bucket = coverageBucket(candidate?.mediaType);
    const arrType = candidate?.arrType || 'unknown';
    const arrId = candidate?.arrInstanceId || 'default';
    return `${arrType}:${arrId}:${bucket}`;
};

const libraryCoverageLabel = (candidate) => (
    candidate?.libraryName
    || candidate?.arrInstanceName
    || coverageBucket(candidate?.mediaType)
);

const bumpCoverageChecks = (bucket, prior) => {
    // playabilityAt is set only after a real decode pass (not imohash-only).
    if (prior.playabilityAt) bucket.playability += 1;
    if (prior.imohash) bucket.imohash += 1;
    if (prior.xxhash) bucket.xxhash += 1;
    if (prior.trimAt) bucket.trim += 1;
};

const computeCoverage = (candidates, cacheEntries = {}) => {
    const coverage = EMPTY_COVERAGE();
    const byLibrary = new Map();
    for (const candidate of candidates) {
        const bucket = coverageBucket(candidate.mediaType);
        coverage[bucket].total += 1;
        const libKey = libraryCoverageKey(candidate);
        if (!byLibrary.has(libKey)) {
            byLibrary.set(libKey, {
                key: libKey,
                label: libraryCoverageLabel(candidate),
                mediaType: bucket,
                ...EMPTY_BUCKET(),
            });
        }
        const lib = byLibrary.get(libKey);
        lib.total += 1;
        const prior = cacheEntries[candidate.key];
        if (!prior || prior.ok === false) continue;
        bumpCoverageChecks(coverage[bucket], prior);
        bumpCoverageChecks(lib, prior);
    }
    coverage.byLibrary = [...byLibrary.values()].sort((a, b) => {
        const typeOrder = { movie: 0, show: 1, album: 2 };
        const left = typeOrder[a.mediaType] ?? 9;
        const right = typeOrder[b.mediaType] ?? 9;
        if (left !== right) return left - right;
        return String(a.label).localeCompare(String(b.label));
    });
    return coverage;
};

const isCachedIntegrityCoverageValid = (prefs, indexGeneratedAt, includeMusic) => {
    if (!prefs?.integrityCoverage || !indexGeneratedAt) return false;
    if (!Array.isArray(prefs.integrityCoverage.byLibrary)) return false;
    if (String(prefs.integrityCoverageIndexAt || '') !== String(indexGeneratedAt)) return false;
    return Boolean(prefs.integrityCoverageIncludeMusic) === Boolean(includeMusic);
};

const assignIntegrityCoveragePrefs = (prefs, coverage, indexGeneratedAt, includeMusic) => {
    prefs.integrityCoverage = coverage;
    prefs.integrityCoverageIndexAt = indexGeneratedAt || null;
    prefs.integrityCoverageIncludeMusic = !!includeMusic;
};

const dedupeFindings = (findings = []) => {
    const byKey = new Map();
    for (const finding of (Array.isArray(findings) ? findings : [])) {
        if (!finding?.key) continue;
        byKey.set(finding.key, finding);
    }
    return [...byKey.values()];
};

const toKeySet = (value) => {
    if (value instanceof Set) return value;
    if (Array.isArray(value)) return new Set(value.map((entry) => String(entry)));
    return null;
};

/**
 * Keep Integrity findings in sync with the live Arr index.
 * - Drops findings whose file key no longer exists (rename/upgrade replaced the Arr file id).
 * - Drops findings that passed on a later recheck.
 * - Merges newly discovered findings.
 */
export const reconcileIntegrityFindings = (existing = [], {
    liveKeys = null,
    passedKeys = null,
    incoming = [],
} = {}) => {
    const live = toKeySet(liveKeys);
    const passed = toKeySet(passedKeys);
    const kept = [];
    for (const finding of (Array.isArray(existing) ? existing : [])) {
        if (!finding?.key) continue;
        const key = String(finding.key);
        if (live && !live.has(key)) continue;
        if (passed && passed.has(key)) continue;
        kept.push(finding);
    }
    return dedupeFindings([
        ...kept,
        ...(Array.isArray(incoming) ? incoming : []),
    ]);
};

const isSnoozed = (prefs, key, now = Date.now()) => {
    const raw = prefs?.integritySnoozed?.[key] || prefs?.snoozed?.[key];
    if (!raw) return false;
    const until = raw && typeof raw === 'object' && !Array.isArray(raw)
        ? raw.until
        : raw;
    const ts = Date.parse(String(until || ''));
    return Number.isFinite(ts) && ts > now;
};

const snoozeUntilValue = (raw) => {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw.until;
    return raw;
};

const snoozeTitleValue = (raw) => {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        const title = String(raw.title || '').trim();
        return title || null;
    }
    return null;
};

const cacheStatMatches = (prior, st) => (
    prior
    && st?.ok
    && Number(prior.size) === Number(st.size)
    && Number(prior.mtimeMs) === Number(st.mtimeMs)
);

export const createQcIntegrity = ({
    request,
    loadIndex,
    loadIndexShared = loadIndex,
    loadPrefs,
    savePrefs,
    appendAudit,
    loadCache,
    saveCache,
    log = () => {},
    execImpl = null,
    statImpl = null,
    realpathImpl = null,
    imohashImpl = null,
    xxhashImpl = null,
    getPlayingPaths = null,
    actionsRemaining = null,
    markAction = null,
    resolvePlexUri = null,
    fetchImpl = null,
    requestIndexRefresh = null,
    getDiscordNotifier = null,
    mediaAnnounce = null,
} = {}) => {
    let scanning = false;
    let scanCancelRequested = false;
    const activeRechecks = new Map();
    let lastScan = null;
    let lastTrimPreview = null;
    let lastTrimAudit = null;
    let integrityTimer = null;
    let nightlyTimer = null;
    let lastNightlyKey = null;
    let lastRecentImportCatchupAt = 0;
    let recentImportCatchupRunning = false;
    let progress = null;
    const plexSessions = createPlexSessionsSnapshot({
        fetchImpl: fetchImpl || fetch,
        ttlMs: PLEX_SESSION_CACHE_MS,
    });

    const hashImo = typeof imohashImpl === 'function' ? imohashImpl : computeImohash;
    const hashXx = typeof xxhashImpl === 'function' ? xxhashImpl : computeXxhash64;

    const findInstance = (config, candidate) => getReadyArrInstances(config)
        .find((instance) => String(instance.id) === String(candidate.arrInstanceId) && instance.type === candidate.arrType);

    const readStat = async (localPath) => {
        if (typeof statImpl === 'function') return statImpl(localPath);
        try {
            const st = await fs.stat(localPath);
            return { ok: true, size: Number(st.size) || 0, mtimeMs: Number(st.mtimeMs) || 0 };
        } catch (error) {
            return { ok: false, reason: 'missing_file', detail: error.message };
        }
    };

    const resolveMappedPath = async (arrPath, maps = [], { config = null } = {}) => {
        const mapped = mapArrPath(arrPath, maps);
        if (!mapped) return { ok: false, path: null, reason: 'missing_path' };
        const safe = await assertSafeMediaPath(mapped, maps, {
            realpathImpl,
            config,
            allowedRoots: resolveIntegrityMediaRoots(config || {}, maps),
        });
        if (!safe.ok) {
            return {
                ok: false,
                path: mapped,
                reason: safe.reason || 'unsafe_path',
                detail: safe.detail || null,
            };
        }
        return { ok: true, path: safe.path || mapped };
    };

    const resolveArrFilePathFromRecord = (file, candidate) => {
        const direct = String(file?.path || '').trim();
        if (direct) return direct;
        const relative = String(file?.relativePath || '').replace(/^\/+/, '');
        const root = String(candidate?.path || candidate?.seriesPath || candidate?.moviePath || '').replace(/\/+$/, '');
        if (relative && root) return `${root}/${relative}`;
        return relative || null;
    };

    /**
     * Index paths lag Arr after rename/upgrade (index rebuilds every few hours).
     * On ENOENT, confirm the Arr file id/path still exists before raising missing_file.
     */
    const classifyMissingAgainstArr = async (config, candidate, maps = []) => {
        const instance = findInstance(config, candidate);
        if (!instance) return { kind: 'unknown' };

        const version = apiVersionFor(candidate.arrType);
        let endpoint = null;
        if (candidate.arrType === 'radarr' && candidate.movieFileId) {
            endpoint = `/api/${version}/moviefile/${encodeURIComponent(candidate.movieFileId)}`;
        } else if (candidate.arrType === 'sonarr' && candidate.episodeFileId) {
            endpoint = `/api/${version}/episodefile/${encodeURIComponent(candidate.episodeFileId)}`;
        } else if (candidate.arrType === 'lidarr' && candidate.trackFileId) {
            endpoint = `/api/${version}/trackfile/${encodeURIComponent(candidate.trackFileId)}`;
        }
        if (!endpoint) return { kind: 'unknown' };

        let file = null;
        try {
            file = await request(instance, endpoint, { timeoutMs: 15000 });
        } catch (error) {
            const message = String(error?.message || error || '');
            if (/\b404\b/.test(message)) {
                return { kind: 'stale_file_id', detail: message.slice(0, 200) };
            }
            return { kind: 'unknown', detail: message.slice(0, 200) };
        }
        if (!file || file.id == null) {
            return { kind: 'stale_file_id', detail: 'Arr file record missing' };
        }

        const livePath = resolveArrFilePathFromRecord(file, candidate);
        if (!livePath) return { kind: 'confirmed' };
        if (normalizePath(livePath) === normalizePath(candidate.filePath)) {
            return { kind: 'confirmed', livePath };
        }

        const mapped = mapArrPath(livePath, maps);
        if (!mapped) return { kind: 'confirmed', livePath };
        const safe = await assertSafeMediaPath(mapped, maps, {
            realpathImpl,
            config,
            allowedRoots: resolveIntegrityMediaRoots(config, maps),
        });
        if (!safe.ok) return { kind: 'confirmed', livePath };
        const liveStat = await readStat(safe.path || mapped);
        if (liveStat.ok) {
            return {
                kind: 'stale_path',
                livePath,
                detail: `Arr path is now ${livePath}`,
            };
        }
        return { kind: 'confirmed', livePath };
    };

    const getSetup = async (config) => {
        const tools = await checkIntegrityTools({ execImpl });
        const maps = Array.isArray(config.qcIntegrityPathMaps) ? config.qcIntegrityPathMaps : [];
        return {
            enabled: !!config.qcIntegrityEnabled && !!config.upgraderEnabled,
            automationEnabled: !!config.qcIntegrityAutomationEnabled,
            xxhashEnabled: !!config.qcIntegrityXxhashEnabled,
            trimEnabled: !!config.qcTrimEnabled,
            includeMusic: config.qcIntegrityIncludeMusic !== false,
            tools,
            pathMapCount: maps.length,
            ready: tools.ready,
            concurrency: Math.max(1, Number(config.qcIntegrityConcurrency) || DEFAULT_CONCURRENCY),
            playabilityConcurrency: Math.max(
                1,
                Number(config.qcIntegrityPlayabilityConcurrency) || DEFAULT_PLAYABILITY_CONCURRENCY,
            ),
            trimConcurrency: normalizeTrimRemuxConcurrency(config.qcIntegrityTrimConcurrency),
            nightlyHour: Math.max(0, Math.min(23, Number(config.qcIntegrityNightlyHour ?? 2) || 2)),
        };
    };

    const loadPlayingPaths = async (config) => {
        if (typeof getPlayingPaths === 'function') {
            const paths = await getPlayingPaths(config);
            return {
                paths: Array.isArray(paths) ? paths : [],
                sessionCount: Array.isArray(paths) ? paths.length : 0,
            };
        }
        if (typeof resolvePlexUri !== 'function' || !config?.plexToken) {
            return { paths: [], sessionCount: 0 };
        }
        try {
            const uri = await resolvePlexUri(config);
            if (!uri) return { paths: [], sessionCount: 0 };
            const metadata = await plexSessions.fetchSessionsMetadata(config, uri);
            const paths = extractSessionPaths(metadata);
            return { paths, sessionCount: Array.isArray(metadata) ? metadata.length : paths.length };
        } catch {
            return { paths: [], sessionCount: 0 };
        }
    };

    const blocklistRelease = async (config, candidate) => {
        const instance = findInstance(config, candidate);
        if (!instance) return { success: false, reason: 'Arr instance not found' };
        const version = apiVersionFor(candidate.arrType);
        const base = `/api/${version}`;
        try {
            if (candidate.downloadId) {
                const qs = new URLSearchParams({
                    downloadId: String(candidate.downloadId),
                    pageSize: '20',
                });
                const history = await request(instance, `${base}/history?${qs.toString()}`);
                const records = Array.isArray(history?.records)
                    ? history.records
                    : (Array.isArray(history) ? history : []);
                const matches = records.filter((entry) => (
                    String(entry?.downloadId || '').toLowerCase() === String(candidate.downloadId).toLowerCase()
                ));
                if (matches.length) {
                    for (const entry of matches) {
                        if (entry?.id == null) continue;
                        await request(instance, `${base}/history/failed/${encodeURIComponent(entry.id)}`, {
                            method: 'POST',
                        });
                    }
                    await appendAudit({
                        action: 'qc_integrity_blocklist',
                        success: true,
                        ratingKey: candidate.ratingKey,
                        title: candidate.title,
                        downloadId: candidate.downloadId,
                        arrType: candidate.arrType,
                        via: 'history_failed',
                    });
                    return { success: true, blocked: true, via: 'history_failed', count: matches.length };
                }
            }

            const body = { sourceTitle: candidate.sourceTitle || candidate.title || undefined };
            if (candidate.arrType === 'radarr' && candidate.entityId) {
                body.movieIds = [candidate.entityId];
            } else if (candidate.arrType === 'sonarr' && candidate.entityId) {
                body.seriesIds = [candidate.entityId];
            } else if (candidate.arrType === 'lidarr') {
                const artistId = candidate.artistId ?? candidate.artist?.id ?? null;
                if (artistId) body.artistIds = [artistId];
            }
            await request(instance, `${base}/blocklist`, { method: 'POST', body });
            await appendAudit({
                action: 'qc_integrity_blocklist',
                success: true,
                ratingKey: candidate.ratingKey,
                title: candidate.title,
                downloadId: candidate.downloadId || null,
                arrType: candidate.arrType,
                via: 'blocklist',
            });
            return { success: true, blocked: true, via: 'blocklist' };
        } catch (error) {
            await appendAudit({
                action: 'qc_integrity_blocklist',
                success: false,
                ratingKey: candidate.ratingKey,
                title: candidate.title,
                reason: error.message,
            });
            return { success: false, reason: error.message || 'Blocklist failed' };
        }
    };

    const runPlayability = async (config, candidate, localPath, st) => {
        const mediaKind = candidate.mediaKind === 'audio' ? 'audio' : 'video';
        const requireAudio = mediaKind === 'audio' ? true : config.qcIntegrityRequireAudio !== false;
        const timeoutMs = Math.max(1000, Number(config.qcIntegrityDecodeTimeoutMs) || DEFAULT_TIMEOUT_MS);
        const windowSec = Math.max(1, Number(config.qcIntegrityDecodeWindowSec) || DEFAULT_WINDOW_SEC);
        const retries = Math.max(0, Number(config.qcIntegrityDecodeRetries ?? DEFAULT_DECODE_RETRIES) || 0);

        const probe = await probeMediaFile(localPath, {
            requireAudio,
            mediaKind,
            timeoutMs,
            execImpl,
        });
        if (!probe.ok) {
            return {
                ok: false,
                reason: probe.reason,
                detail: probe.detail || null,
                durationSec: probe.durationSec,
                playabilityOk: false,
                softTimeout: softTimeoutsEnabled(config) && isTimeoutReason(probe.reason),
            };
        }

        const decode = await quickDecodeFile(localPath, {
            durationSec: probe.durationSec,
            windowSec,
            timeoutMs,
            retries,
            mediaKind,
            execImpl,
        });
        if (!decode.ok) {
            return {
                ok: false,
                reason: decode.reason,
                detail: decode.detail || null,
                durationSec: probe.durationSec,
                windowId: decode.windowId || null,
                playabilityOk: false,
                softTimeout: softTimeoutsEnabled(config) && isTimeoutReason(decode.reason),
            };
        }

        const expectedRuntimeSec = candidate.expectedRuntimeSec ?? null;
        const durationCheck = durationMatchesExpected(probe.durationSec, expectedRuntimeSec, { mediaKind });
        if (!durationCheck.ok) {
            return {
                ok: false,
                reason: 'duration_mismatch',
                detail: `delta=${durationCheck.delta?.toFixed?.(1) ?? durationCheck.delta} tol=${durationCheck.tol}`,
                durationSec: probe.durationSec,
                expectedRuntimeSec,
                playabilityOk: false,
                softTimeout: false,
            };
        }

        return {
            ok: true,
            reason: null,
            durationSec: probe.durationSec,
            expectedRuntimeSec,
            playabilityOk: true,
            size: st.size,
            mtimeMs: st.mtimeMs,
        };
    };

    const importShouldBlocklist = (source, result) => {
        if (source !== 'import') return false;
        if (result?.softTimeout) return false;
        return true;
    };

    const notifyIntegrityIssue = async (config, {
        title,
        description,
        finding = null,
        color = 0xef4444,
    } = {}) => {
        if (!config?.qcIntegrityDiscordDigestEnabled) return false;
        const notifier = typeof getDiscordNotifier === 'function'
            ? getDiscordNotifier()
            : getDiscordNotifier;
        if (!notifier?.postAdminEvent && !notifier?.postEvent) return false;
        const post = notifier.postAdminEvent || notifier.postEvent;
        const fields = [];
        if (finding?.reason) fields.push({ name: 'Reason', value: String(finding.reason).slice(0, 256), inline: true });
        if (finding?.title) fields.push({ name: 'Title', value: String(finding.title).slice(0, 256), inline: true });
        if (finding?.localPath || finding?.filePath) {
            fields.push({
                name: 'Path',
                value: String(finding.localPath || finding.filePath).slice(0, 1024),
                inline: false,
            });
        }
        try {
            await post(config, { title, description, fields, color });
            return true;
        } catch (error) {
            log(`[upgrader] integrity discord notify failed: ${error.message}`);
            return false;
        }
    };

    const queueSoftRecheck = async (key) => {
        if (!key) return;
        const prefs = await loadPrefs();
        const queue = Array.isArray(prefs.integritySoftRecheckQueue)
            ? prefs.integritySoftRecheckQueue.map((entry) => String(entry))
            : [];
        if (!queue.includes(String(key))) queue.push(String(key));
        prefs.integritySoftRecheckQueue = queue.slice(-200);
        await savePrefs(prefs);
    };

    const buildCacheEntry = (candidate, localPath, st, extras = {}) => ({
        schemaVersion: SCHEMA_VERSION,
        key: candidate.key,
        path: localPath,
        size: st.size,
        mtimeMs: st.mtimeMs,
        mediaKind: candidate.mediaKind === 'audio' ? 'audio' : 'video',
        imohash: extras.imohash ?? null,
        xxhash: extras.xxhash ?? null,
        durationSec: extras.durationSec ?? null,
        expectedRuntimeSec: extras.expectedRuntimeSec ?? candidate.expectedRuntimeSec ?? null,
        baselinedAt: extras.baselinedAt ?? null,
        sampleHashedAt: extras.sampleHashedAt ?? null,
        fullHashedAt: extras.fullHashedAt ?? null,
        playabilityAt: extras.playabilityAt ?? null,
        trimAt: extras.trimAt ?? null,
        trimOk: extras.trimOk === true,
        trimProfile: extras.trimProfile ?? null,
        trimReason: extras.trimReason ?? null,
        trimNativeLang: extras.trimNativeLang ?? null,
        trimNativeSource: extras.trimNativeSource ?? null,
        trimEbmlDamage: extras.trimEbmlDamage === true,
        baselineSource: extras.baselineSource ?? null,
        playabilityOk: extras.playabilityOk === true,
        ok: extras.ok !== false,
    });

    const validateCandidate = async (config, candidate, {
        mode = 'baseline',
        baselineSource = 'backfill',
        prior = null,
        forceRewrite = false,
        forceDryRun = false,
    } = {}) => {
        const maps = Array.isArray(config.qcIntegrityPathMaps) ? config.qcIntegrityPathMaps : [];
        const resolved = await resolveMappedPath(candidate.filePath, maps, { config });
        const source = baselineSource || 'backfill';
        if (!resolved.ok) {
            return {
                ...candidate,
                localPath: resolved.path || null,
                ok: false,
                reason: resolved.reason || 'missing_path',
                detail: resolved.detail || null,
                shouldBlocklist: source === 'import' && resolved.reason !== 'unsafe_path',
                mode,
            };
        }
        const localPath = resolved.path;
        const st = await readStat(localPath);
        if (!st.ok) {
            const missing = await classifyMissingAgainstArr(config, candidate, maps);
            if (missing.kind === 'stale_file_id' || missing.kind === 'stale_path') {
                return {
                    ...candidate,
                    localPath,
                    ok: true,
                    skipped: true,
                    staleIndex: true,
                    reason: missing.kind,
                    detail: missing.detail || null,
                    livePath: missing.livePath || null,
                    shouldBlocklist: false,
                    mode,
                };
            }
            return {
                ...candidate,
                localPath,
                ok: false,
                reason: st.reason || 'missing_file',
                detail: st.detail || null,
                shouldBlocklist: source === 'import',
                mode,
            };
        }

        const mediaKind = candidate.mediaKind === 'audio' ? 'audio' : 'video';
        const nowIso = new Date().toISOString();

        if (mode === 'imohash') {
            const hashed = await hashImo(localPath, { size: st.size });
            if (!hashed?.ok) {
                return {
                    ...candidate,
                    localPath,
                    size: st.size,
                    mtimeMs: st.mtimeMs,
                    ok: false,
                    reason: hashed?.reason || 'imohash_failed',
                    detail: hashed?.detail || null,
                    shouldBlocklist: false,
                    mode,
                };
            }
            if (prior?.imohash && prior.imohash !== hashed.imohash && cacheStatMatches(prior, st)) {
                return {
                    ...candidate,
                    localPath,
                    size: st.size,
                    mtimeMs: st.mtimeMs,
                    ok: false,
                    reason: 'imohash_mismatch',
                    detail: `expected ${prior.imohash}`,
                    imohash: hashed.imohash,
                    priorImohash: prior.imohash,
                    shouldBlocklist: false,
                    mode,
                    cacheEntry: buildCacheEntry(candidate, localPath, st, {
                        ...prior,
                        imohash: prior.imohash,
                        sampleHashedAt: nowIso,
                        playabilityOk: prior.playabilityOk,
                        ok: false,
                        baselineSource: prior.baselineSource || source,
                    }),
                };
            }
            return {
                ...candidate,
                localPath,
                size: st.size,
                mtimeMs: st.mtimeMs,
                ok: true,
                reason: null,
                imohash: hashed.imohash,
                shouldBlocklist: false,
                mode,
                cacheEntry: buildCacheEntry(candidate, localPath, st, {
                    ...(prior || {}),
                    imohash: hashed.imohash,
                    xxhash: prior?.xxhash ?? null,
                    durationSec: prior?.durationSec ?? null,
                    expectedRuntimeSec: prior?.expectedRuntimeSec ?? candidate.expectedRuntimeSec ?? null,
                    baselinedAt: prior?.baselinedAt || nowIso,
                    sampleHashedAt: nowIso,
                    fullHashedAt: prior?.fullHashedAt ?? null,
                    playabilityAt: prior?.playabilityAt ?? null,
                    baselineSource: prior?.baselineSource || source,
                    playabilityOk: prior?.playabilityOk === true,
                    ok: true,
                }),
            };
        }

        if (mode === 'xxhash') {
            const hashed = await hashXx(localPath);
            if (!hashed?.ok) {
                return {
                    ...candidate,
                    localPath,
                    size: st.size,
                    mtimeMs: st.mtimeMs,
                    ok: false,
                    reason: hashed?.reason || 'xxhash_failed',
                    detail: hashed?.detail || null,
                    shouldBlocklist: false,
                    mode,
                };
            }
            if (prior?.xxhash && prior.xxhash !== hashed.xxhash && cacheStatMatches(prior, st)) {
                return {
                    ...candidate,
                    localPath,
                    size: st.size,
                    mtimeMs: st.mtimeMs,
                    ok: false,
                    reason: 'xxhash_mismatch',
                    detail: `expected ${prior.xxhash}`,
                    xxhash: hashed.xxhash,
                    priorXxhash: prior.xxhash,
                    shouldBlocklist: false,
                    mode,
                };
            }
            return {
                ...candidate,
                localPath,
                size: st.size,
                mtimeMs: st.mtimeMs,
                ok: true,
                reason: null,
                xxhash: hashed.xxhash,
                shouldBlocklist: false,
                mode,
                cacheEntry: buildCacheEntry(candidate, localPath, st, {
                    ...(prior || {}),
                    imohash: prior?.imohash ?? null,
                    xxhash: hashed.xxhash,
                    durationSec: prior?.durationSec ?? null,
                    expectedRuntimeSec: prior?.expectedRuntimeSec ?? candidate.expectedRuntimeSec ?? null,
                    baselinedAt: prior?.baselinedAt || nowIso,
                    sampleHashedAt: prior?.sampleHashedAt ?? null,
                    fullHashedAt: nowIso,
                    baselineSource: prior?.baselineSource || source,
                    playabilityOk: prior?.playabilityOk ?? true,
                    ok: true,
                }),
            };
        }

        if (mode === 'playability') {
            const play = await runPlayability(config, candidate, localPath, st);
            if (!play.ok) {
                return {
                    ...candidate,
                    localPath,
                    size: st.size,
                    mtimeMs: st.mtimeMs,
                    ...play,
                    shouldBlocklist: importShouldBlocklist(source, play),
                    mode,
                };
            }
            return {
                ...candidate,
                localPath,
                size: st.size,
                mtimeMs: st.mtimeMs,
                ok: true,
                reason: null,
                durationSec: play.durationSec,
                expectedRuntimeSec: play.expectedRuntimeSec,
                playabilityOk: true,
                shouldBlocklist: false,
                mode,
                cacheEntry: buildCacheEntry(candidate, localPath, st, {
                    ...(prior || {}),
                    durationSec: play.durationSec,
                    expectedRuntimeSec: play.expectedRuntimeSec,
                    imohash: prior?.imohash ?? null,
                    xxhash: prior?.xxhash ?? null,
                    baselinedAt: prior?.baselinedAt || nowIso,
                    sampleHashedAt: prior?.sampleHashedAt ?? null,
                    fullHashedAt: prior?.fullHashedAt ?? null,
                    playabilityAt: nowIso,
                    baselineSource: prior?.baselineSource || source,
                    playabilityOk: true,
                    ok: true,
                }),
            };
        }

        if (mode === 'trim') {
            const trimCfgBase = resolveTrimConfig(config, candidate, { forceRewrite, forceDryRun });
            const stampSkip = (reason, native = { code: null, source: 'skipped' }) => ({
                trimAt: nowIso,
                trimOk: true,
                trimProfile: reason === 'trim_not_mkv' ? 'not-mkv' : trimProfileKey(trimCfgBase),
                trimReason: reason,
                trimNativeLang: native.code || null,
                trimNativeSource: native.source || 'unresolved',
            });
            // Music / non-MKV never remux — do not native-lookup or Discord-alert.
            if (!isTrimVideoPath(localPath, mediaKind)) {
                return {
                    ...candidate,
                    localPath,
                    size: st.size,
                    mtimeMs: st.mtimeMs,
                    ok: true,
                    skipped: true,
                    reason: 'trim_not_mkv',
                    shouldBlocklist: false,
                    mode,
                    cacheEntry: buildCacheEntry(candidate, localPath, st, {
                        ...(prior || {}),
                        imohash: prior?.imohash ?? null,
                        xxhash: prior?.xxhash ?? null,
                        durationSec: prior?.durationSec ?? null,
                        expectedRuntimeSec: prior?.expectedRuntimeSec ?? candidate.expectedRuntimeSec ?? null,
                        baselinedAt: prior?.baselinedAt || nowIso,
                        sampleHashedAt: prior?.sampleHashedAt ?? null,
                        fullHashedAt: prior?.fullHashedAt ?? null,
                        playabilityAt: prior?.playabilityAt ?? null,
                        baselineSource: prior?.baselineSource || source,
                        playabilityOk: prior?.playabilityOk === true,
                        ok: true,
                        ...stampSkip('trim_not_mkv'),
                    }),
                };
            }
            const native = await lookupTrimNativeLanguage(config, candidate, {
                localPath,
                prior,
                fetchImpl: fetchImpl || fetch,
                log,
            });
            if (config.qcTrimKeepNativeAudio !== false && !native.code) {
                return {
                    ...candidate,
                    localPath,
                    size: st.size,
                    mtimeMs: st.mtimeMs,
                    ok: false,
                    reason: 'trim_native_unknown',
                    detail: 'No single original language from TMDb/TVDB/IMDb id lookup — skipped remux.',
                    shouldBlocklist: false,
                    nativeLanguage: null,
                    nativeSource: native.source || 'unresolved',
                    mode,
                };
            }
            const trimCfg = resolveTrimConfig(config, {
                ...candidate,
                originalLanguage: native.code || candidate.originalLanguage,
            }, { forceRewrite, forceDryRun });
            const trimResult = await trimMkvFile(localPath, {
                ...trimCfg,
                expectedRuntimeSec: prior?.expectedRuntimeSec ?? candidate.expectedRuntimeSec ?? null,
                mediaKind: candidate.mediaKind || 'video',
                execImpl,
                log,
            });
            const stamp = (reason) => ({
                trimAt: nowIso,
                trimOk: true,
                trimProfile: reason === 'trim_not_mkv' ? 'not-mkv' : trimProfileKey(trimCfg),
                trimReason: reason,
                trimNativeLang: native.code || null,
                trimNativeSource: native.source || 'unresolved',
                trimEbmlDamage: !!trimResult?.ebmlDamage,
            });
            const described = trimResult.plan
                ? describeTrimPlan(trimResult.plan)
                : {
                    detail: trimResult.detail || null,
                    audioKeep: trimResult.audioKeep || [],
                    audioDrop: trimResult.audioDrop || [],
                    subKeep: trimResult.subKeep || [],
                    subDrop: trimResult.subDrop || [],
                };
            if (trimResult.dryRun && trimResult.reason === 'trim_dry_run') {
                return {
                    ...candidate,
                    localPath,
                    size: st.size,
                    mtimeMs: st.mtimeMs,
                    ok: false,
                    reason: 'trim_pending',
                    detail: described.detail || trimResult.detail || null,
                    shouldBlocklist: false,
                    wouldRemux: true,
                    ebmlDamage: !!trimResult.ebmlDamage,
                    nativeLanguage: native.code || null,
                    nativeSource: native.source || null,
                    trimPlan: trimResult.plan || null,
                    audioKeep: described.audioKeep,
                    audioDrop: described.audioDrop,
                    subKeep: described.subKeep,
                    subDrop: described.subDrop,
                    mode,
                };
            }
            if (!trimResult.ok) {
                return {
                    ...candidate,
                    localPath,
                    size: st.size,
                    mtimeMs: st.mtimeMs,
                    ok: false,
                    reason: trimResult.reason || 'trim_failed',
                    detail: trimResult.detail || described.detail || null,
                    shouldBlocklist: false,
                    ebmlDamage: !!trimResult.ebmlDamage,
                    durationSec: trimResult.durationSec ?? null,
                    expectedRuntimeSec: trimResult.expectedRuntimeSec
                        ?? prior?.expectedRuntimeSec
                        ?? candidate.expectedRuntimeSec
                        ?? null,
                    trimPlan: trimResult.plan || null,
                    mode,
                };
            }
            if (!trimResult.changed) {
                return {
                    ...candidate,
                    localPath,
                    size: st.size,
                    mtimeMs: st.mtimeMs,
                    ok: true,
                    reason: null,
                    shouldBlocklist: false,
                    mode,
                    cacheEntry: buildCacheEntry(candidate, localPath, st, {
                        ...(prior || {}),
                        imohash: prior?.imohash ?? null,
                        xxhash: prior?.xxhash ?? null,
                        durationSec: prior?.durationSec ?? null,
                        expectedRuntimeSec: prior?.expectedRuntimeSec ?? candidate.expectedRuntimeSec ?? null,
                        baselinedAt: prior?.baselinedAt || nowIso,
                        sampleHashedAt: prior?.sampleHashedAt ?? null,
                        fullHashedAt: prior?.fullHashedAt ?? null,
                        playabilityAt: prior?.playabilityAt ?? null,
                        baselineSource: prior?.baselineSource || source,
                        playabilityOk: prior?.playabilityOk === true,
                        ok: true,
                        ...stamp(trimResult.reason || 'trim_already_clean'),
                    }),
                };
            }
            const nextSt = await readStat(localPath);
            const liveSt = nextSt.ok ? nextSt : st;
            const playAfterTrim = await runPlayability(config, candidate, localPath, liveSt);
            if (!playAfterTrim.ok) {
                return {
                    ...candidate,
                    localPath,
                    size: liveSt.size,
                    mtimeMs: liveSt.mtimeMs,
                    ...playAfterTrim,
                    reason: playAfterTrim.reason || 'trim_playback_failed',
                    detail: 'Playback failed after media trim.',
                    shouldBlocklist: false,
                    ebmlDamage: !!trimResult.ebmlDamage,
                    mode,
                };
            }
            return {
                ...candidate,
                localPath,
                size: liveSt.size,
                mtimeMs: liveSt.mtimeMs,
                ok: true,
                reason: null,
                changed: true,
                shouldBlocklist: false,
                ebmlDamage: !!trimResult.ebmlDamage,
                mode,
                cacheEntry: buildCacheEntry(candidate, localPath, liveSt, {
                    ...(prior || {}),
                    imohash: null,
                    xxhash: null,
                    durationSec: playAfterTrim.durationSec,
                    expectedRuntimeSec: playAfterTrim.expectedRuntimeSec,
                    baselinedAt: prior?.baselinedAt || nowIso,
                    sampleHashedAt: null,
                    fullHashedAt: null,
                    playabilityAt: nowIso,
                    baselineSource: prior?.baselineSource || source,
                    playabilityOk: true,
                    ok: true,
                    ...stamp(trimResult.ebmlDamage ? 'trim_remuxed_ebml' : 'trim_remuxed'),
                }),
            };
        }

        // baseline (default): playback → imohash → optional xxhash
        const play = await runPlayability(config, candidate, localPath, st);
        if (!play.ok) {
            return {
                ...candidate,
                localPath,
                size: st.size,
                mtimeMs: st.mtimeMs,
                ...play,
                shouldBlocklist: importShouldBlocklist(source, play),
                mode: 'baseline',
            };
        }

        const imo = await hashImo(localPath, { size: st.size });
        if (!imo?.ok) {
            return {
                ...candidate,
                localPath,
                size: st.size,
                mtimeMs: st.mtimeMs,
                ok: false,
                reason: imo?.reason || 'imohash_failed',
                detail: imo?.detail || null,
                durationSec: play.durationSec,
                shouldBlocklist: false,
                mode: 'baseline',
            };
        }

        let xxhash = null;
        let fullHashedAt = null;
        if (config.qcIntegrityXxhashEnabled) {
            const hashed = await hashXx(localPath);
            if (!hashed?.ok) {
                return {
                    ...candidate,
                    localPath,
                    size: st.size,
                    mtimeMs: st.mtimeMs,
                    ok: false,
                    reason: hashed?.reason || 'xxhash_failed',
                    detail: hashed?.detail || null,
                    durationSec: play.durationSec,
                    imohash: imo.imohash,
                    shouldBlocklist: false,
                    mode: 'baseline',
                };
            }
            xxhash = hashed.xxhash;
            fullHashedAt = nowIso;
        }

        return {
            ...candidate,
            localPath,
            size: st.size,
            mtimeMs: st.mtimeMs,
            ok: true,
            reason: null,
            durationSec: play.durationSec,
            expectedRuntimeSec: play.expectedRuntimeSec,
            imohash: imo.imohash,
            xxhash,
            playabilityOk: true,
            shouldBlocklist: false,
            mode: 'baseline',
            cacheEntry: buildCacheEntry(candidate, localPath, st, {
                imohash: imo.imohash,
                xxhash,
                durationSec: play.durationSec,
                expectedRuntimeSec: play.expectedRuntimeSec,
                baselinedAt: nowIso,
                sampleHashedAt: nowIso,
                fullHashedAt,
                playabilityAt: nowIso,
                baselineSource: source,
                playabilityOk: true,
                ok: true,
            }),
        };
    };

    const replaceCorrupt = async (config, finding, { dryRun = false } = {}) => {
        const instance = findInstance(config, finding);
        if (!instance) return { success: false, reason: 'Arr instance not found' };
        if (dryRun) {
            return {
                success: true,
                dryRun: true,
                wouldReplace: true,
                title: finding.title,
                reason: finding.reason,
                key: finding.key,
            };
        }

        if (typeof actionsRemaining === 'function' && actionsRemaining(config) <= 0) {
            return { success: false, reason: 'Hunt action quota exhausted', key: finding.key, held: true };
        }

        try {
            if (finding.arrType === 'radarr') {
                if (!finding.movieFileId) return { success: false, reason: 'Missing movieFileId' };
                await request(instance, `/api/v3/moviefile/${encodeURIComponent(finding.movieFileId)}`, { method: 'DELETE' });
                await request(instance, '/api/v3/command', {
                    method: 'POST',
                    body: { name: 'MoviesSearch', movieIds: [finding.entityId] },
                });
            } else if (finding.arrType === 'lidarr') {
                if (!finding.trackFileId) return { success: false, reason: 'Missing trackFileId' };
                await request(instance, `/api/v1/trackfile/${encodeURIComponent(finding.trackFileId)}`, { method: 'DELETE' });
                await request(instance, '/api/v1/command', {
                    method: 'POST',
                    body: { name: 'AlbumSearch', albumIds: [finding.entityId] },
                });
            } else {
                if (!finding.episodeFileId) return { success: false, reason: 'Missing episodeFileId' };
                await request(instance, `/api/v3/episodefile/${encodeURIComponent(finding.episodeFileId)}`, { method: 'DELETE' });
                const command = finding.episodeId
                    ? { name: 'EpisodeSearch', episodeIds: [finding.episodeId] }
                    : { name: 'SeriesSearch', seriesId: finding.entityId };
                await request(instance, '/api/v3/command', { method: 'POST', body: command });
            }

            if (typeof markAction === 'function') markAction();

            await appendAudit({
                action: 'qc_integrity_replace',
                success: true,
                ratingKey: finding.ratingKey,
                title: finding.title,
                reason: finding.reason,
                arrType: finding.arrType,
                arrInstanceId: finding.arrInstanceId,
                filePath: finding.filePath,
                localPath: finding.localPath || null,
            });
            return { success: true, replaced: true, key: finding.key, title: finding.title };
        } catch (error) {
            await appendAudit({
                action: 'qc_integrity_replace',
                success: false,
                ratingKey: finding.ratingKey,
                title: finding.title,
                reason: error.message,
            });
            return { success: false, reason: error.message || 'Replace failed', key: finding.key };
        }
    };

    const tripBreaker = async (prefs, reason, metrics = {}) => {
        prefs.integrityBreaker = {
            tripped: true,
            trippedAt: new Date().toISOString(),
            reason,
            ...metrics,
        };
        await savePrefs(prefs);
        return prefs.integrityBreaker;
    };

    const clearBreaker = async () => {
        const prefs = await loadPrefs();
        prefs.integrityBreaker = {
            tripped: false,
            trippedAt: null,
            reason: null,
            clearedAt: new Date().toISOString(),
        };
        await savePrefs(prefs);
        return prefs.integrityBreaker;
    };

    const snoozeFinding = async (key, hours = 24, { title = null } = {}) => {
        const prefs = await loadPrefs();
        const findingKey = String(key || '').trim();
        const until = new Date(Date.now() + (Math.max(1, Number(hours) || 24) * 60 * 60 * 1000)).toISOString();
        const finding = (prefs.integrityFindings || []).find((entry) => String(entry?.key) === findingKey);
        const label = String(title || finding?.title || '').trim() || null;
        prefs.integritySnoozed = {
            ...(prefs.integritySnoozed || {}),
            [findingKey]: label ? { until, title: label } : { until, title: null },
        };
        prefs.integrityFindings = dedupeFindings(
            (prefs.integrityFindings || []).filter((entry) => entry.key !== findingKey),
        );
        await savePrefs(prefs);
        return { key: findingKey, until, title: label };
    };

    const clearIntegritySnooze = async (key = null) => {
        const prefs = await loadPrefs();
        const current = prefs.integritySnoozed && typeof prefs.integritySnoozed === 'object'
            ? { ...prefs.integritySnoozed }
            : {};
        if (key == null || key === '') {
            prefs.integritySnoozed = {};
            await savePrefs(prefs);
            return { cleared: Object.keys(current).length, keys: Object.keys(current) };
        }
        const target = String(key);
        const existed = Object.prototype.hasOwnProperty.call(current, target);
        delete current[target];
        prefs.integritySnoozed = current;
        await savePrefs(prefs);
        return { cleared: existed ? 1 : 0, keys: existed ? [target] : [] };
    };

    const listIntegritySnoozes = async (now = Date.now()) => {
        const prefs = await loadPrefs();
        const current = prefs.integritySnoozed && typeof prefs.integritySnoozed === 'object'
            ? prefs.integritySnoozed
            : {};

        const active = [];
        let expired = false;
        for (const [key, raw] of Object.entries(current)) {
            const untilRaw = snoozeUntilValue(raw);
            const ms = Date.parse(String(untilRaw || ''));
            if (!Number.isFinite(ms) || ms <= now) {
                expired = true;
                continue;
            }
            active.push({
                key,
                until: new Date(ms).toISOString(),
                title: snoozeTitleValue(raw),
                legacy: typeof raw === 'string',
            });
        }

        const needsTitleLookup = active.some((row) => !row.title);
        let titleByKey = new Map();
        let titleByRatingKey = new Map();
        if (needsTitleLookup) {
            try {
                const index = await loadIndexShared();
                for (const candidate of collectIntegrityCandidates(index?.items || [], { includeMusic: true })) {
                    if (candidate?.key && candidate?.title) {
                        titleByKey.set(String(candidate.key), String(candidate.title));
                    }
                }
                for (const item of (index?.items || [])) {
                    if (item?.ratingKey && item?.title) {
                        titleByRatingKey.set(String(item.ratingKey), String(item.title));
                    }
                }
            } catch {
                titleByKey = new Map();
                titleByRatingKey = new Map();
            }
            try {
                const cache = await loadCache();
                for (const [entryKey, entry] of Object.entries(cache?.entries || {})) {
                    if (entry?.title && !titleByKey.has(entryKey)) {
                        titleByKey.set(entryKey, String(entry.title));
                    }
                }
            } catch {
                /* cache optional for labels */
            }
        }

        const resolveTitle = (key, storedTitle) => {
            if (storedTitle) return storedTitle;
            if (titleByKey.has(key)) return titleByKey.get(key);
            const ratingKey = String(key).replace(/:file:\d+$/, '');
            if (ratingKey && titleByRatingKey.has(ratingKey)) return titleByRatingKey.get(ratingKey);
            return null;
        };

        const rows = [];
        let dirty = expired;
        const nextStored = {};
        for (const row of active) {
            const title = resolveTitle(row.key, row.title);
            if (!row.title && title) dirty = true;
            if (row.legacy) dirty = true;
            nextStored[row.key] = { until: row.until, title };
            rows.push({ key: row.key, until: row.until, title });
        }
        if (dirty || Object.keys(nextStored).length !== Object.keys(current).length) {
            prefs.integritySnoozed = nextStored;
            await savePrefs(prefs);
        }
        return rows.sort((a, b) => String(a.until).localeCompare(String(b.until)));
    };

    const resolveRecheckMode = (finding = {}) => {
        const stored = String(finding.mode || '').toLowerCase();
        if (['playability', 'imohash', 'xxhash', 'baseline', 'trim'].includes(stored)) return stored;
        const reason = String(finding.reason || '').toLowerCase();
        if (reason.startsWith('trim_')) return 'trim';
        if (reason.includes('xxhash')) return 'xxhash';
        if (reason.includes('imohash')) return 'imohash';
        if (
            reason.startsWith('decode_')
            || reason === 'probe_failed'
            || reason === 'missing_video'
            || reason === 'missing_audio'
            || reason === 'duration_mismatch'
        ) {
            return 'playability';
        }
        return 'playability';
    };

    const candidateFromFinding = (finding = {}) => ({
        key: String(finding.key),
        ratingKey: finding.ratingKey || null,
        title: finding.title || 'Unknown',
        arrType: finding.arrType || null,
        arrInstanceId: finding.arrInstanceId || null,
        arrInstanceName: finding.arrInstanceName || null,
        entityId: finding.entityId ?? null,
        mediaType: finding.mediaType || (finding.arrType === 'lidarr' ? 'album' : finding.arrType === 'sonarr' ? 'show' : 'movie'),
        mediaKind: finding.mediaKind || (finding.arrType === 'lidarr' ? 'audio' : 'video'),
        movieFileId: finding.movieFileId || null,
        episodeId: finding.episodeId || null,
        episodeFileId: finding.episodeFileId || null,
        trackFileId: finding.trackFileId || null,
        seasonNumber: finding.seasonNumber ?? null,
        episodeNumber: finding.episodeNumber ?? null,
        filePath: finding.filePath || finding.localPath || null,
        expectedRuntimeSec: finding.expectedRuntimeSec ?? null,
        downloadId: finding.downloadId || null,
        sourceTitle: finding.sourceTitle || null,
        libraryName: finding.libraryName || null,
        thumbUrl: finding.thumbUrl || null,
        episodeTitle: finding.episodeTitle || null,
    });

    const recheckFinding = async (config, { key = null, finding: findingInput = null } = {}) => {
        if (scanning) {
            return {
                ok: false,
                cleared: false,
                reason: 'Scan already in progress',
                scanning: true,
                progress,
            };
        }
        if (!config.upgraderEnabled || !config.qcIntegrityEnabled) {
            return { ok: false, cleared: false, reason: 'Integrity disabled' };
        }
        const setup = await getSetup(config);
        if (!setup.tools.ready) {
            return { ok: false, cleared: false, reason: 'ffmpeg/ffprobe not available in this container', setup };
        }

        const prefs = await loadPrefs();
        const findings = Array.isArray(prefs.integrityFindings) ? prefs.integrityFindings : [];
        const findingKey = String(key || findingInput?.key || '').trim();
        if (!findingKey) {
            return { ok: false, cleared: false, reason: 'key is required' };
        }
        const storedFinding = findings.find((entry) => String(entry?.key) === findingKey) || null;
        const finding = storedFinding || (findingInput?.key ? findingInput : null);
        if (!finding?.key) {
            return { ok: false, cleared: false, reason: 'Finding not found' };
        }

        let mode = resolveRecheckMode(finding);
        if (String(finding.reason || '').includes('imohash_mismatch')) {
            mode = 'baseline';
        }
        if (mode === 'xxhash' && !config.qcIntegrityXxhashEnabled) {
            return { ok: false, cleared: false, reason: 'xxhash disabled', mode };
        }

        const includeMusic = config.qcIntegrityIncludeMusic !== false;
        const index = await loadIndexShared();
        const candidates = collectIntegrityCandidates(index.items || [], { includeMusic });
        const fromIndex = candidates.find((entry) => String(entry.key) === findingKey) || null;
        const candidate = fromIndex || candidateFromFinding(finding);
        if (!candidate.filePath) {
            return { ok: false, cleared: false, reason: 'Finding has no file path to recheck', key: findingKey, mode };
        }

        const cache = await loadCache();
        const entries = cache?.entries && typeof cache.entries === 'object' ? { ...cache.entries } : {};
        const prior = entries[findingKey] || null;
        activeRechecks.set(findingKey, {
            key: findingKey,
            title: candidate.title || finding.title || 'Unknown',
            mode,
            startedAt: new Date().toISOString(),
        });
        let result;
        try {
            result = String(finding.reason || '').includes('imohash_mismatch')
                ? await escalateMismatch(config, candidate, prior)
                : await validateCandidate(config, candidate, {
                    mode,
                    baselineSource: 'recheck',
                    prior,
                    forceRewrite: mode === 'trim',
                });
        } finally {
            activeRechecks.delete(findingKey);
        }

        if (result.skipped || result.staleIndex) {
            prefs.integrityFindings = reconcileIntegrityFindings(findings, {
                passedKeys: [findingKey],
            });
            await savePrefs(prefs);
            await appendAudit({
                action: 'qc_integrity_recheck',
                success: true,
                cleared: true,
                staleIndex: true,
                key: findingKey,
                title: candidate.title,
                mode,
                reason: result.reason || null,
            });
            return {
                ok: true,
                cleared: true,
                staleIndex: true,
                key: findingKey,
                mode,
                finding: null,
                result,
            };
        }

        if (result.ok && result.cacheEntry) {
            entries[findingKey] = result.cacheEntry;
            await saveCache({
                updatedAt: new Date().toISOString(),
                schemaVersion: SCHEMA_VERSION,
                entries,
            });
            prefs.integrityFindings = reconcileIntegrityFindings(findings, {
                passedKeys: [findingKey],
            });
            await savePrefs(prefs);
            await appendAudit({
                action: 'qc_integrity_recheck',
                success: true,
                cleared: true,
                key: findingKey,
                title: candidate.title,
                mode,
            });
            const playabilityOk = result.cacheEntry?.playabilityOk === true || !!result.cacheEntry?.playabilityAt;
            if (playabilityOk && (finding?.softTimeout || finding?.baselineSource === 'import') && mediaAnnounce?.enqueue) {
                void mediaAnnounce.enqueue(config, {
                    key: findingKey,
                    title: candidate.title || finding.title,
                    arrType: candidate.arrType || finding.arrType,
                    mediaType: candidate.mediaType || finding.mediaType,
                    arrInstanceId: candidate.arrInstanceId ?? finding.arrInstanceId ?? null,
                    entityId: candidate.entityId ?? finding.entityId ?? null,
                    seasonNumber: candidate.seasonNumber ?? finding.seasonNumber ?? null,
                    episodeNumber: candidate.episodeNumber ?? finding.episodeNumber ?? null,
                    episodeTitle: candidate.episodeTitle || finding.episodeTitle || null,
                    movieFileId: candidate.movieFileId || finding.movieFileId || null,
                    episodeFileId: candidate.episodeFileId || finding.episodeFileId || null,
                    trackFileId: candidate.trackFileId || finding.trackFileId || null,
                    episodeId: candidate.episodeId || finding.episodeId || null,
                    isUpgrade: !!(candidate.isUpgrade || finding.isUpgrade),
                    year: candidate.year ?? finding.year ?? null,
                    overview: candidate.overview || finding.overview || '',
                    thumbUrl: candidate.thumbUrl || finding.thumbUrl || null,
                    tmdbId: candidate.tmdbId || finding.tmdbId || null,
                    tvdbId: candidate.tvdbId || finding.tvdbId || null,
                    imdbId: candidate.imdbId || finding.imdbId || null,
                    playabilityOk: true,
                }).catch((error) => log(`[upgrader] media announce enqueue failed: ${error.message}`));
            }
            return {
                ok: true,
                cleared: true,
                key: findingKey,
                mode,
                finding: null,
                result,
            };
        }

        const updatedFinding = {
            ...finding,
            ...result,
            key: findingKey,
            ok: false,
            mode,
            shouldBlocklist: false,
        };
        prefs.integrityFindings = reconcileIntegrityFindings(
            findings.filter((entry) => String(entry?.key) !== findingKey),
            { incoming: [updatedFinding] },
        ).slice(0, 500);
        await savePrefs(prefs);
        await appendAudit({
            action: 'qc_integrity_recheck',
            success: true,
            cleared: false,
            key: findingKey,
            title: candidate.title,
            mode,
            reason: updatedFinding.reason || null,
            detail: updatedFinding.detail || null,
        });
        return {
            ok: true,
            cleared: false,
            key: findingKey,
            mode,
            finding: updatedFinding,
            result: updatedFinding,
        };
    };

    const shouldSkipCached = (mode, prior, st, force, trimProfile = null) => {
        if (force || !cacheStatMatches(prior, st)) return false;
        if (mode === 'imohash' || mode === 'xxhash') return false;
        if (mode === 'playability') return !!prior?.playabilityAt;
        if (mode === 'trim') {
            if (!prior?.trimAt || prior.trimOk === false) return false;
            if (!prior.trimNativeSource) return false;
            if (trimProfile && prior.trimProfile && prior.trimProfile !== trimProfile) return false;
            return true;
        }
        // baseline: skip only when both playability and imohash exist
        return !!(prior?.playabilityAt && prior?.imohash && prior?.ok !== false);
    };

    const scanIntegrity = async (config, {
        dryRun = true,
        limit = null,
        replaceFindings = false,
        force = false,
        mode = 'baseline',
        baselineSource = 'backfill',
        full = false,
        libraryKey = null,
        libraryLabel = null,
        audit = false,
        forceDryRun = false,
        _lockHeld = false,
    } = {}) => {
        const isAudit = !!audit;
        if (isAudit) {
            mode = 'trim';
            force = true;
            full = true;
            forceDryRun = true;
            dryRun = true;
            replaceFindings = false;
        }
        const trimForceDryRun = !!forceDryRun || isAudit;
        if (!_lockHeld && scanning) {
            return {
                ran: false,
                reason: 'Scan already in progress',
                scanning: true,
                progress,
                findings: [],
                scanned: Number(progress?.scanned || 0),
                skipped: Number(progress?.skipped || 0),
            };
        }
        if (!config.upgraderEnabled || !config.qcIntegrityEnabled) {
            if (_lockHeld) {
                scanning = false;
                progress = null;
            }
            return { ran: false, reason: 'Integrity disabled', findings: [], scanned: 0, skipped: 0 };
        }

        const setup = await getSetup(config);
        if (!setup.tools.ready) {
            if (_lockHeld) {
                scanning = false;
                progress = null;
            }
            return {
                ran: false,
                reason: 'ffmpeg/ffprobe not available in this container',
                setup,
                findings: [],
                scanned: 0,
                skipped: 0,
            };
        }

        const scanMode = INTEGRITY_SCAN_MODES.includes(mode) ? mode : 'baseline';
        if (scanMode === 'xxhash' && !config.qcIntegrityXxhashEnabled) {
            if (_lockHeld) {
                scanning = false;
                progress = null;
            }
            return {
                ran: false,
                reason: 'xxhash disabled',
                setup,
                findings: [],
                scanned: 0,
                skipped: 0,
            };
        }
        if (scanMode === 'trim' && !setup.tools?.mkvmerge) {
            if (_lockHeld) {
                scanning = false;
                progress = null;
            }
            return {
                ran: false,
                reason: 'mkvmerge not available in this container',
                setup,
                findings: [],
                scanned: 0,
                skipped: 0,
            };
        }

        if (!_lockHeld) {
            scanning = true;
            scanCancelRequested = false;
            progress = {
                startedAt: new Date().toISOString(),
                mode: scanMode,
                full: !!full,
                target: 0,
                scanned: 0,
                skipped: 0,
                skippedPlaying: 0,
                passed: 0,
                findingCount: 0,
                currentTitle: isAudit ? 'Starting trim audit…' : null,
                audit: isAudit || undefined,
                libraryKey: libraryKey != null && String(libraryKey).trim() !== ''
                    ? String(libraryKey)
                    : null,
                libraryLabel: libraryLabel || null,
            };
        } else {
            progress = {
                ...(progress || {}),
                startedAt: progress?.startedAt || new Date().toISOString(),
                mode: scanMode,
                full: !!full,
                target: Number(progress?.target || 0),
                scanned: Number(progress?.scanned || 0),
                skipped: Number(progress?.skipped || 0),
                skippedPlaying: Number(progress?.skippedPlaying || 0),
                passed: Number(progress?.passed || 0),
                findingCount: Number(progress?.findingCount || 0),
                currentTitle: progress?.currentTitle || null,
            };
        }

        try {
            const index = await loadIndex();
            const prefs = await loadPrefs();
            const cache = await loadCache();
            const cacheEntries = cache?.entries && typeof cache.entries === 'object' ? { ...cache.entries } : {};
            const includeMusic = config.qcIntegrityIncludeMusic !== false;
            const allCandidates = collectIntegrityCandidates(index.items || [], { includeMusic });
            const libraryFilter = libraryKey != null && String(libraryKey).trim() !== ''
                ? String(libraryKey)
                : null;
            const libraryFilterLabel = libraryLabel != null && String(libraryLabel).trim() !== ''
                ? String(libraryLabel)
                : null;
            if (libraryFilter) {
                progress = {
                    ...progress,
                    libraryKey: libraryFilter,
                    libraryLabel: libraryFilterLabel || progress?.libraryLabel || null,
                };
            }
            const candidates = libraryFilter
                ? allCandidates.filter((candidate) => libraryCoverageKey(candidate) === libraryFilter)
                : allCandidates;
            if (libraryFilter && !candidates.length) {
                if (_lockHeld) {
                    scanning = false;
                    progress = null;
                }
                return {
                    ran: false,
                    reason: `No integrity candidates for library ${libraryFilter}`,
                    libraryKey: libraryFilter,
                    setup,
                    findings: [],
                    scanned: 0,
                    skipped: 0,
                    skippedPlaying: 0,
                };
            }
            const configuredMax = Number(limit ?? config.qcIntegrityMaxPerCycle);
            // Legacy integrity default was 25; phase-1 backfill needs a much larger batch.
            const resolvedMax = Number.isFinite(configuredMax) && configuredMax > 0
                ? (limit == null && configuredMax === 25 ? DEFAULT_MAX_PER_CYCLE : configuredMax)
                : DEFAULT_MAX_PER_CYCLE;
            const maxPerCycle = full
                ? Math.max(1, candidates.length || 1)
                : Math.max(1, resolvedMax);
            const hashConcurrency = Math.max(1, Number(config.qcIntegrityConcurrency) || DEFAULT_CONCURRENCY);
            const playConcurrency = Math.max(
                1,
                Number(config.qcIntegrityPlayabilityConcurrency) || DEFAULT_PLAYABILITY_CONCURRENCY,
            );
            const trimConcurrency = normalizeTrimRemuxConcurrency(
                config.qcIntegrityTrimConcurrency ?? DEFAULT_TRIM_CONCURRENCY,
            );
            // Trim remuxes are disk-heavy — never share playability/fingerprint pools.
            const concurrency = scanMode === 'trim'
                ? trimConcurrency
                : (scanMode === 'playability' || scanMode === 'baseline')
                    ? playConcurrency
                    : hashConcurrency;
            configureTrimRemuxConcurrency(trimConcurrency);
            const cursorKey = cursorKeyForMode(scanMode);
            // Full manual passes start at 0 so every file is covered once.
            const cursor = full
                ? 0
                : Math.max(0, Number(prefs[cursorKey]) || 0) % Math.max(1, candidates.length || 1);
            const ordered = candidates.length
                ? [...candidates.slice(cursor), ...candidates.slice(0, cursor)]
                : [];

            const playing = await loadPlayingPaths(config);
            const pauseAt = Number(config.qcIntegrityPauseWhenSessions);
            if (Number.isFinite(pauseAt) && pauseAt > 0 && playing.sessionCount >= pauseAt) {
                lastScan = {
                    at: new Date().toISOString(),
                    dryRun: !!dryRun,
                    mode: scanMode,
                    full: !!full,
                    scanned: 0,
                    skipped: 0,
                    skippedPlaying: 0,
                    passed: 0,
                    findingCount: 0,
                    paused: true,
                    reason: 'plex_sessions_busy',
                    findings: [],
                };
                // Do not clobber integrityLastScan KPIs with an empty paused stub.
                return {
                    ran: false,
                    reason: 'Paused while Plex sessions are busy',
                    paused: true,
                    sessionCount: playing.sessionCount,
                    setup,
                    findings: [],
                    scanned: 0,
                    skipped: 0,
                    skippedPlaying: 0,
                };
            }

            const batch = [];
            let walked = 0;
            let skipped = 0;
            let skippedPlaying = 0;
            const maps = Array.isArray(config.qcIntegrityPathMaps) ? config.qcIntegrityPathMaps : [];
            const needsPreStat = scanMode === 'baseline' || scanMode === 'playability' || scanMode === 'trim';

            progress = {
                ...progress,
                target: full ? ordered.length : Math.min(maxPerCycle, ordered.length || maxPerCycle),
                currentTitle: 'Selecting files…',
                full: !!full,
                libraryKey: libraryFilter,
            };

            for (const candidate of ordered) {
                if (scanCancelRequested) break;
                if (!full && batch.length >= maxPerCycle) break;
                walked += 1;

                if (walked === 1 || walked % 250 === 0) {
                    progress = {
                        ...progress,
                        currentTitle: scanCancelRequested
                            ? 'Cancelling…'
                            : `Selecting files… ${walked}/${progress.target}`,
                        skipped,
                        skippedPlaying,
                    };
                }

                if (isSnoozed(prefs, candidate.key)) {
                    skipped += 1;
                    continue;
                }

                // Non-MKV still go through validateCandidate so they get a trim_not_mkv
                // stamp — otherwise Media trim coverage permanently under-counts.

                const mappedResult = await resolveMappedPath(candidate.filePath, maps, { config });
                const mapped = mappedResult.ok ? mappedResult.path : null;
                // Still queue unsafe/unmapped paths so validateCandidate can record a finding
                // instead of silently under-scanning the library.
                if (mapped && playing.paths.some((path) => pathsMatch(path, mapped) || pathsMatch(path, candidate.filePath))) {
                    skippedPlaying += 1;
                    continue;
                }

                const key = cacheKeyFor(candidate);
                const prior = cacheEntries[key] || null;

                // imohash/xxhash always re-check — don't sequentially stat tens of thousands first.
                if (!needsPreStat) {
                    batch.push({ candidate, prior });
                    continue;
                }

                const st = mapped ? await readStat(mapped) : { ok: false };
                if (prior && st.ok && !cacheStatMatches(prior, st)) {
                    delete cacheEntries[key];
                }

                const freshPrior = cacheEntries[key] || null;
                const trimProfile = scanMode === 'trim'
                    ? (isTrimVideoPath(candidate.filePath, candidate.mediaKind)
                        ? trimProfileKey(resolveTrimConfig(config, candidate))
                        : 'not-mkv')
                    : null;
                if (shouldSkipCached(scanMode, freshPrior, st, force, trimProfile)) {
                    skipped += 1;
                    continue;
                }

                batch.push({ candidate, prior: freshPrior });
            }

            const cancelled = !!scanCancelRequested;
            if (cancelled) {
                progress = {
                    ...progress,
                    currentTitle: 'Cancelling…',
                    skipped,
                    skippedPlaying,
                };
                log(`[upgrader] integrity ${scanMode} cancel requested during file selection`
                    + (libraryFilter ? ` library=${libraryFilter}` : ''));
            }

            progress = {
                ...progress,
                target: batch.length,
                scanned: 0,
                skipped,
                skippedPlaying,
                passed: 0,
                findingCount: 0,
                currentTitle: cancelled
                    ? 'Cancelling…'
                    : (batch.length ? 'Hashing…' : 'Nothing to scan'),
                full: !!full,
            };
            log(`[upgrader] integrity ${scanMode}${full ? ' full' : ''} pass: ${batch.length} file(s) queued`
                + (libraryFilter ? ` library=${libraryFilter}` : '')
                + ` (skipped ${skipped}, playing ${skippedPlaying}, concurrency ${concurrency})`
                + (cancelled ? ', cancelling' : ''));

            const findings = [];
            const passedKeys = new Set();
            const trimPreviewItems = [];
            const trimNativeUnknownTitles = [];
            const trimSummary = {
                alreadyClean: 0,
                wouldRemux: 0,
                remuxed: 0,
                failed: 0,
                notMkv: 0,
            };
            let scanned = 0;
            let passed = 0;
            let staleIndexHits = 0;
            let breaker = prefs.integrityBreaker?.tripped
                ? prefs.integrityBreaker
                : null;
            const liveReplace = !!replaceFindings && !dryRun;
            let lastCacheSaveAt = 0;
            // Always prune against the full library — a per-library scan must not wipe other libraries' cache.
            const liveKeys = new Set(allCandidates.map((candidate) => String(candidate.key)));

            // Never wipe the whole cache on an empty/missing index snapshot.
            // When music is excluded from candidates, leave music stamps alone.
            const prunedKeys = new Set();
            if (liveKeys.size > 0) {
                for (const key of Object.keys(cacheEntries)) {
                    if (liveKeys.has(key)) continue;
                    if (!includeMusic && String(key).startsWith('lidarr:')) continue;
                    delete cacheEntries[key];
                    prunedKeys.add(key);
                }
            }

            const persistCacheMaybe = async (forceSave = false) => {
                if (!forceSave && scanned - lastCacheSaveAt < 50) return;
                lastCacheSaveAt = scanned;
                await saveCacheMerged({
                    entries: cacheEntries,
                    deletedKeys: prunedKeys,
                    trimPreview: lastTrimPreview || cache.trimPreview || null,
                    trimAudit: lastTrimAudit || cache.trimAudit || null,
                });
            };

            if (!cancelled) {
                await mapPool(batch, concurrency, async ({ candidate, prior }) => {
                    if (scanCancelRequested) return null;
                    const result = await validateCandidate(config, candidate, {
                        mode: scanMode,
                        baselineSource: scanMode === 'imohash' || scanMode === 'xxhash'
                            ? (prior?.baselineSource || baselineSource || 'recheck')
                            : baselineSource,
                        prior,
                        forceDryRun: trimForceDryRun,
                    });

                    scanned += 1;
                    const key = result?.key || candidate?.key;
                    const trimPreviewHit = scanMode === 'trim' && isTrimPreviewReason(result?.reason);

                    if (trimPreviewHit) {
                        trimSummary.wouldRemux += 1;
                        if (trimPreviewItems.length < TRIM_PREVIEW_MAX_ITEMS) {
                            trimPreviewItems.push(buildTrimPreviewItem(candidate, result));
                        }
                    } else if (result?.ok) {
                        passed += 1;
                        if (key) passedKeys.add(String(key));
                        if (result.staleIndex) staleIndexHits += 1;
                        if (result.cacheEntry) cacheEntries[key] = result.cacheEntry;
                        if (scanMode === 'trim') {
                            if (result.reason === 'trim_not_mkv') trimSummary.notMkv += 1;
                            else if (result.changed) {
                                trimSummary.remuxed += 1;
                                if (trimPreviewItems.length < TRIM_PREVIEW_MAX_ITEMS) {
                                    trimPreviewItems.push({
                                        ...buildTrimPreviewItem(candidate, result),
                                        remuxed: true,
                                    });
                                }
                            } else {
                                trimSummary.alreadyClean += 1;
                            }
                        }
                    } else {
                        if (result?.cacheEntry) cacheEntries[key] = result.cacheEntry;
                        else if (key) delete cacheEntries[key];

                        if (result?.shouldBlocklist && baselineSource === 'import') {
                            await blocklistRelease(config, result);
                        }

                        findings.push(result);
                        if (findings.length > 500) findings.splice(0, findings.length - 500);
                        if (scanMode === 'trim') trimSummary.failed += 1;
                        if (result?.reason === 'trim_native_unknown') {
                            if (isAudit) {
                                if (trimNativeUnknownTitles.length < 50) {
                                    trimNativeUnknownTitles.push(result.title || candidate.title || 'a title');
                                }
                            } else {
                                await notifyIntegrityIssue(config, {
                                    title: 'Integrity trim skipped — no original language',
                                    description: `Could not resolve a single original language for **${result.title || candidate.title || 'a title'}** — remux skipped.`,
                                    finding: result,
                                    color: 0xf59e0b,
                                });
                            }
                        }

                        if (liveReplace && !result?.softTimeout) {
                            const maxFindings = Math.max(1, Number(config.qcIntegrityBreakerMaxFindings) || 50);
                            const maxPercent = Math.max(0.1, Number(config.qcIntegrityBreakerMaxPercent) || 10);
                            const percent = scanned > 0 ? (findings.length / scanned) * 100 : 0;
                            if (!breaker && (findings.length >= maxFindings || percent >= maxPercent)) {
                                breaker = await tripBreaker(prefs, 'mass_findings', {
                                    findingCount: findings.length,
                                    scanned,
                                    percent,
                                });
                                log(`[upgrader] integrity breaker tripped: ${findings.length} findings (${percent.toFixed(1)}%)`);
                            }
                            if (!breaker?.tripped) {
                                await replaceCorrupt(config, result, { dryRun: false });
                            }
                        }
                    }

                    progress = {
                        ...progress,
                        scanned,
                        skipped,
                        skippedPlaying,
                        passed,
                        findingCount: findings.length,
                        wouldRemux: trimSummary.wouldRemux,
                        currentTitle: scanCancelRequested
                            ? 'Cancelling…'
                            : (candidate?.title || result?.title || null),
                    };

                    await persistCacheMaybe(false);
                    return result;
                }, { shouldStop: () => scanCancelRequested });
            }

            const wasCancelled = cancelled || !!scanCancelRequested;
            if (wasCancelled) {
                log(`[upgrader] integrity ${scanMode} cancelled after ${scanned} probed`
                    + (libraryFilter ? ` library=${libraryFilter}` : ''));
            }

            await persistCacheMaybe(true);

            prefs[cursorKey] = wasCancelled
                ? (Number(prefs[cursorKey]) || 0)
                : (full
                    ? 0
                    : (candidates.length
                        ? (cursor + Math.max(walked, 1)) % candidates.length
                        : 0));

            if (isAudit && trimNativeUnknownTitles.length) {
                await notifyIntegrityIssue(config, {
                    title: 'Integrity trim audit — missing original language',
                    description: `**${trimNativeUnknownTitles.length}+** title(s) skipped remux plan (no single original language). Examples: ${
                        trimNativeUnknownTitles.slice(0, 8).map((t) => `**${t}**`).join(', ')
                    }.`,
                    finding: findings.find((f) => f?.reason === 'trim_native_unknown') || null,
                    color: 0xf59e0b,
                });
            }

            // Reload prefs before write so soft-recheck / import RMW during the scan is preserved.
            const freshPrefs = await loadPrefs();
            const coverage = computeCoverage(allCandidates, cacheEntries);
            assignIntegrityCoveragePrefs(freshPrefs, coverage, index.generatedAt, includeMusic);
            freshPrefs[cursorKey] = prefs[cursorKey];

            const mergedFindings = reconcileIntegrityFindings(freshPrefs.integrityFindings || [], {
                liveKeys,
                passedKeys,
                incoming: findings,
            }).slice(0, 500);
            freshPrefs.integrityFindings = mergedFindings;
            Object.assign(prefs, freshPrefs);

            if (staleIndexHits > 0 && typeof requestIndexRefresh === 'function') {
                log(`[upgrader] integrity saw ${staleIndexHits} stale index path(s); requesting index refresh`);
                try { requestIndexRefresh({ reason: 'integrity_stale_paths', count: staleIndexHits }); } catch { /* ignore */ }
            }

            const trimPreview = scanMode === 'trim' ? {
                at: new Date().toISOString(),
                libraryKey: libraryFilter,
                libraryLabel: libraryFilterLabel || libraryLabel || null,
                dryRun: trimForceDryRun || resolveTrimConfig(config).dryRun,
                audit: isAudit || undefined,
                summary: {
                    scanned,
                    skipped,
                    skippedPlaying,
                    alreadyClean: trimSummary.alreadyClean,
                    wouldRemux: trimSummary.wouldRemux,
                    remuxed: trimSummary.remuxed,
                    failed: trimSummary.failed,
                    notMkv: trimSummary.notMkv,
                    itemCount: trimPreviewItems.length,
                    truncated: (trimSummary.wouldRemux + trimSummary.remuxed) > trimPreviewItems.length,
                },
                items: trimPreviewItems,
            } : (cache.trimPreview || lastTrimPreview || null);
            if (scanMode === 'trim') lastTrimPreview = trimPreview;
            const trimAudit = isAudit && trimPreview ? {
                ...trimPreview,
                audit: true,
                force: true,
            } : (cache.trimAudit || lastTrimAudit || null);
            if (isAudit && trimPreview) lastTrimAudit = trimAudit;

            await saveCacheMerged({
                entries: cacheEntries,
                deletedKeys: prunedKeys,
                trimPreview: trimPreview || null,
                trimAudit: trimAudit || cache.trimAudit || null,
            });

            lastScan = {
                at: new Date().toISOString(),
                dryRun: !!dryRun,
                mode: scanMode,
                full: !!full,
                libraryKey: libraryFilter,
                scanned,
                skipped,
                skippedPlaying,
                passed,
                findingCount: findings.length,
                wouldRemux: trimSummary.wouldRemux,
                breakerTripped: !!breaker?.tripped,
                cancelled: wasCancelled,
                findings: findings.slice(0, 200),
            };

            await appendAudit({
                action: 'qc_integrity_scan',
                success: !wasCancelled,
                cancelled: wasCancelled,
                dryRun: !!dryRun,
                mode: scanMode,
                full: !!full,
                libraryKey: libraryFilter,
                scanned,
                skipped,
                skippedPlaying,
                passed,
                findingCount: findings.length,
                breakerTripped: !!breaker?.tripped,
            });

            // Only full-library passes (manual buttons / nightly) own the Integrity "last scan" KPIs.
            // Background backfill batches must not overwrite that with a confusing "200 probed".
            if (full) {
                prefs.integrityLastScan = {
                    at: lastScan.at,
                    mode: scanMode,
                    full: true,
                    libraryKey: libraryFilter,
                    scanned,
                    skipped,
                    skippedPlaying,
                    passed,
                    findingCount: findings.length,
                    wouldRemux: trimSummary.wouldRemux,
                    cancelled: wasCancelled,
                    findings: findings.slice(0, 200),
                    breakerTripped: !!breaker?.tripped,
                };
                await savePrefs(prefs);
            } else {
                prefs.integrityBackfillLast = {
                    at: lastScan.at,
                    mode: scanMode,
                    scanned,
                    passed,
                    findingCount: findings.length,
                    cancelled: wasCancelled,
                };
                await savePrefs(prefs);
            }

            return {
                ran: true,
                dryRun: !!dryRun,
                mode: scanMode,
                full: !!full,
                cancelled: wasCancelled,
                reason: wasCancelled ? 'Cancelled' : undefined,
                setup,
                scanned,
                skipped,
                skippedPlaying,
                passed,
                findingCount: findings.length,
                wouldRemux: trimSummary.wouldRemux,
                findings,
                trimPreview,
                coverage,
                breaker: breaker || prefs.integrityBreaker || null,
                candidates: candidates.length,
                progress: null,
            };
        } finally {
            scanning = false;
            scanCancelRequested = false;
            progress = null;
        }
    };

    const cancelScanIntegrity = () => {
        if (!scanning) {
            return {
                ok: true,
                cancelled: false,
                reason: 'No scan in progress',
                scanning: false,
                progress: null,
            };
        }
        scanCancelRequested = true;
        progress = {
            ...(progress || {}),
            currentTitle: 'Cancelling…',
        };
        log('[upgrader] integrity scan cancel requested');
        return {
            ok: true,
            cancelled: true,
            scanning: true,
            progress,
        };
    };

    const beginScanIntegrity = (config, opts = {}) => {
        if (scanning) {
            return {
                started: false,
                ran: false,
                reason: 'Scan already in progress',
                scanning: true,
                progress,
            };
        }
        const mode = INTEGRITY_SCAN_MODES.includes(opts.mode)
            ? opts.mode
            : 'baseline';
        const libraryKey = opts.libraryKey != null && String(opts.libraryKey).trim() !== ''
            ? String(opts.libraryKey)
            : null;
        scanning = true;
        scanCancelRequested = false;
        const audit = !!opts.audit;
        progress = {
            startedAt: new Date().toISOString(),
            mode: audit ? 'trim' : mode,
            full: audit ? true : !!opts.full,
            libraryKey,
            libraryLabel: opts.libraryLabel || null,
            target: 0,
            scanned: 0,
            skipped: 0,
            skippedPlaying: 0,
            passed: 0,
            findingCount: 0,
            currentTitle: audit ? 'Starting trim audit…' : 'Starting…',
            audit: audit || undefined,
        };
        void scanIntegrity(config, { ...opts, mode, libraryKey, audit, _lockHeld: true }).catch((error) => {
            log(`[upgrader] integrity scan failed: ${error.message}`);
            scanning = false;
            progress = null;
        });
        return {
            started: true,
            ran: true,
            scanning: true,
            mode: audit ? 'trim' : mode,
            full: audit ? true : !!opts.full,
            libraryKey,
            audit: audit || undefined,
            progress,
        };
    };

    const invalidateIntegrityCoverage = (prefs) => {
        if (!prefs || typeof prefs !== 'object') return;
        prefs.integrityCoverageIndexAt = null;
    };

    const writeImportCacheEntry = async (key, cacheEntry) => {
        if (!key || !cacheEntry) return;
        // Merge one stamp onto disk so a concurrent scan save cannot wipe the import.
        const cache = await loadCache();
        const entries = cache?.entries && typeof cache.entries === 'object' ? { ...cache.entries } : {};
        entries[key] = cacheEntry;
        await saveCache({
            updatedAt: new Date().toISOString(),
            schemaVersion: SCHEMA_VERSION,
            entries,
            trimPreview: cache.trimPreview || lastTrimPreview || null,
            trimAudit: cache.trimAudit || lastTrimAudit || null,
        });
        const prefs = await loadPrefs();
        invalidateIntegrityCoverage(prefs);
        await savePrefs(prefs);
    };

    /** Merge scan working-set onto disk entries; preserve stamps written during the scan. */
    const saveCacheMerged = async ({ entries, deletedKeys = null, trimPreview = undefined, trimAudit = undefined }) => {
        const disk = await loadCache();
        const nextEntries = disk?.entries && typeof disk.entries === 'object' ? { ...disk.entries } : {};
        if (deletedKeys && typeof deletedKeys[Symbol.iterator] === 'function') {
            for (const key of deletedKeys) delete nextEntries[key];
        }
        for (const [key, value] of Object.entries(entries || {})) {
            nextEntries[key] = value;
        }
        await saveCache({
            updatedAt: new Date().toISOString(),
            schemaVersion: SCHEMA_VERSION,
            entries: nextEntries,
            trimPreview: trimPreview !== undefined ? trimPreview : (disk.trimPreview || lastTrimPreview || null),
            trimAudit: trimAudit !== undefined ? trimAudit : (disk.trimAudit || lastTrimAudit || null),
        });
    };

    const plexRefreshPending = new Map();

    const plexRefreshDebounceMs = (config) => {
        const minutes = Math.max(
            1,
            Math.min(180, Number(config?.discordMediaAnnounceDebounceMinutes) || 60),
        );
        return minutes * 60 * 1000;
    };

    const runPlexRefreshNow = async (config, candidate) => {
        const maps = Array.isArray(config?.qcIntegrityPathMaps) ? config.qcIntegrityPathMaps : [];
        const mappedPath = mapArrPath(candidate?.filePath, maps);
        try {
            const result = await refreshPlexPathAfterImport({
                config,
                resolvePlexUri,
                fetchImpl: fetchImpl || fetch,
                arrPath: candidate?.filePath || null,
                mappedPath,
                mediaType: candidate?.mediaType || candidate?.mediaKind || 'movie',
                log,
            });
            if (result?.ok === false && !result?.skipped) {
                log(`[upgrader] plex refresh failed: ${result.reason || 'unknown'}${result.detail ? ` (${result.detail})` : ''}`);
            }
            return result;
        } catch (error) {
            log(`[upgrader] plex refresh failed: ${error.message}`);
            return { ok: false, reason: 'exception', detail: error.message };
        }
    };

    const notifyPlexAfterImport = async (config, candidate) => {
        const mediaType = String(candidate?.mediaType || candidate?.mediaKind || '').toLowerCase();
        const isShow = candidate?.arrType === 'sonarr' || mediaType === 'show';
        if (!isShow) {
            return runPlexRefreshNow(config, candidate);
        }
        const season = Number(candidate?.seasonNumber);
        const groupKey = `sonarr:${candidate?.entityId ?? 'x'}:S${Number.isFinite(season) ? season : 0}`;
        const now = Date.now();
        plexRefreshPending.set(groupKey, {
            configHint: {
                qcIntegrityPlexRefreshAfterImport: config?.qcIntegrityPlexRefreshAfterImport,
                plexToken: config?.plexToken,
                qcIntegrityPathMaps: config?.qcIntegrityPathMaps,
            },
            candidate: {
                filePath: candidate?.filePath || null,
                mediaType: 'show',
                mediaKind: candidate?.mediaKind || 'video',
                entityId: candidate?.entityId ?? null,
                seasonNumber: candidate?.seasonNumber ?? null,
                arrType: 'sonarr',
            },
            flushAt: now + plexRefreshDebounceMs(config),
        });
        log(`[upgrader] plex refresh queued for ${groupKey} (TV debounce)`);
        return { ok: true, queued: true, groupKey };
    };

    const flushPlexRefreshDue = async (config) => {
        if (!plexRefreshPending.size) return { flushed: 0 };
        const now = Date.now();
        let flushed = 0;
        for (const [groupKey, entry] of [...plexRefreshPending.entries()]) {
            if (Number(entry.flushAt) > now) continue;
            plexRefreshPending.delete(groupKey);
            await runPlexRefreshNow(config, entry.candidate);
            flushed += 1;
        }
        return { flushed };
    };

    const baselineImport = async (config, payload = {}) => {
        const candidate = {
            key: payload.key || `${payload.ratingKey || 'import'}:file:${payload.movieFileId || payload.episodeFileId || payload.trackFileId || 'x'}`,
            ratingKey: payload.ratingKey || null,
            title: payload.title || payload.sourceTitle || 'Import',
            arrType: payload.arrType,
            arrInstanceId: payload.arrInstanceId,
            arrInstanceName: payload.arrInstanceName || null,
            entityId: payload.entityId,
            mediaType: payload.mediaType || (payload.arrType === 'lidarr' ? 'album' : payload.arrType === 'sonarr' ? 'show' : 'movie'),
            mediaKind: payload.mediaKind || (payload.arrType === 'lidarr' ? 'audio' : 'video'),
            movieFileId: payload.movieFileId || null,
            episodeId: payload.episodeId || null,
            episodeFileId: payload.episodeFileId || null,
            trackFileId: payload.trackFileId || null,
            filePath: payload.filePath,
            expectedRuntimeSec: payload.expectedRuntimeSec ?? null,
            downloadId: payload.downloadId || null,
            sourceTitle: payload.sourceTitle || null,
            libraryKey: payload.libraryKey || null,
            libraryName: payload.libraryName || null,
            seasonNumber: payload.seasonNumber ?? null,
            episodeNumber: payload.episodeNumber ?? null,
            episodeTitle: payload.episodeTitle || null,
            year: payload.year ?? null,
            overview: payload.overview || '',
            thumbUrl: payload.thumbUrl || null,
            tmdbId: payload.tmdbId || null,
            tvdbId: payload.tvdbId || null,
            imdbId: payload.imdbId || null,
            originalLanguage: payload.originalLanguage || null,
            isUpgrade: !!payload.isUpgrade,
        };

        const persistFinding = async (finding) => {
            const prefs = await loadPrefs();
            prefs.integrityFindings = reconcileIntegrityFindings(prefs.integrityFindings || [], {
                incoming: [finding],
            }).slice(0, 500);
            invalidateIntegrityCoverage(prefs);
            await savePrefs(prefs);
        };

        const allowImport = (check) => isIntegrityCheckAllowed(config, {
            libraryKey: candidate.libraryKey,
            schedule: 'import',
            check,
        });
        const allowPlay = allowImport('playability');
        const allowTrim = allowImport('trim');
        const allowImo = allowImport('imohash');
        const allowXx = allowImport('xxhash');
        if (!allowPlay && !allowTrim && !allowImo && !allowXx) {
            await notifyPlexAfterImport(config, candidate);
            return { ran: true, ok: true, skipped: true, reason: 'import_policy_disabled', blocklisted: false };
        }

        let priorEntry = null;
        if (!allowPlay) {
            const cache = await loadCache();
            priorEntry = cache?.entries?.[candidate.key] || null;
        }

        let play = { ok: true, cacheEntry: priorEntry, key: candidate.key, skipped: !allowPlay };
        if (allowPlay) {
            play = await validateCandidate(config, candidate, {
                mode: 'playability',
                baselineSource: 'import',
            });

            if (play.ok && play.cacheEntry) {
                await writeImportCacheEntry(play.key || candidate.key, play.cacheEntry);
            } else if (play.softTimeout) {
                const prefs = await loadPrefs();
                prefs.integrityFindings = reconcileIntegrityFindings(prefs.integrityFindings || [], {
                    incoming: [{
                        ...play,
                        softTimeout: true,
                        shouldBlocklist: false,
                        seasonNumber: candidate.seasonNumber,
                        episodeNumber: candidate.episodeNumber,
                        episodeTitle: candidate.episodeTitle,
                        isUpgrade: candidate.isUpgrade,
                        baselineSource: 'import',
                    }],
                }).slice(0, 500);
                invalidateIntegrityCoverage(prefs);
                await savePrefs(prefs);
                await queueSoftRecheck(play.key || candidate.key);
                await notifyIntegrityIssue(config, {
                    title: 'Integrity soft timeout (import)',
                    description: `Playback timed out for **${play.title || 'a title'}** — fingerprint kept; queued for recheck (not blocklisted).`,
                    finding: play,
                    color: 0xf59e0b,
                });
                // File remains on disk — notify Plex once (Arr Connect should be off).
                await notifyPlexAfterImport(config, candidate);
                return { ran: true, ok: false, blocklisted: false, softTimeout: true, result: play };
            } else if (!play.ok) {
                let blocklisted = false;
                if (play.shouldBlocklist) {
                    const blocked = await blocklistRelease(config, play);
                    blocklisted = !!blocked?.success;
                    if (config.qcIntegrityAutomationEnabled && !play.softTimeout) {
                        await replaceCorrupt(config, play, { dryRun: false });
                    }
                }
                const prefs = await loadPrefs();
                prefs.integrityFindings = reconcileIntegrityFindings(prefs.integrityFindings || [], {
                    incoming: [play],
                }).slice(0, 500);
                invalidateIntegrityCoverage(prefs);
                await savePrefs(prefs);
                await notifyIntegrityIssue(config, {
                    title: play.shouldBlocklist ? 'Integrity import failure' : 'Integrity import finding',
                    description: `Hard fail on import/upgrade for **${play.title || 'a title'}**`
                        + (blocklisted ? ' — release blocklisted' : '')
                        + (config.qcIntegrityAutomationEnabled ? ' — replace/search triggered' : '')
                        + '.',
                    finding: play,
                    color: play.shouldBlocklist ? undefined : 0xf59e0b,
                });
                return { ran: true, ok: false, blocklisted, result: play };
            }
        }

        let suppressAnnounce = false;
        const trimCfg = resolveTrimConfig(config, candidate);
        // Video only — including non-MKV so import stamps trim_not_mkv for coverage.
        // (MKV remux still gated inside validateCandidate / resolveTrimConfig.)
        if (
            allowTrim
            && trimCfg.enabled
            && String(candidate.mediaKind || 'video').toLowerCase() !== 'audio'
        ) {
            const trimOutcome = await validateCandidate(config, candidate, {
                mode: 'trim',
                baselineSource: 'import',
                prior: play.cacheEntry || null,
            });
            if (trimOutcome.cacheEntry) {
                play.cacheEntry = trimOutcome.cacheEntry;
                await writeImportCacheEntry(trimOutcome.key || candidate.key, trimOutcome.cacheEntry);
            }
            if (isTrimPreviewReason(trimOutcome.reason) || trimOutcome.reason === 'trim_pending') {
                // Dry-run remux preview — not an integrity failure.
            } else if (!trimOutcome.ok && !trimOutcome.skipped) {
                suppressAnnounce = true;
                await persistFinding({
                    ...trimOutcome,
                    shouldBlocklist: false,
                    baselineSource: 'import',
                });
                if (trimOutcome.reason === 'trim_native_unknown') {
                    await notifyIntegrityIssue(config, {
                        title: 'Integrity trim skipped — no original language',
                        description: `Could not resolve a single original language for **${trimOutcome.title || candidate.title || 'a title'}** — remux skipped.`,
                        finding: trimOutcome,
                        color: 0xf59e0b,
                    });
                }
            }
        }

        let finger = { ok: true, cacheEntry: play.cacheEntry, key: play.key || candidate.key, skipped: !allowImo };
        if (allowImo) {
            finger = await validateCandidate(config, candidate, {
                mode: 'imohash',
                baselineSource: 'import',
                prior: play.cacheEntry || null,
            });
            if (finger.ok && finger.cacheEntry) {
                await writeImportCacheEntry(finger.key, finger.cacheEntry);
            } else if (!finger.ok && !finger.skipped) {
                await persistFinding(finger);
                await notifyIntegrityIssue(config, {
                    title: 'Integrity import finding',
                    description: `Fingerprint failed on import/upgrade for **${finger.title || 'a title'}** (playback kept).`,
                    finding: finger,
                    color: 0xf59e0b,
                });
                await notifyPlexAfterImport(config, candidate);
                return { ran: true, ok: false, blocklisted: false, result: finger };
            }
        }

        let finalEntry = finger.cacheEntry || play.cacheEntry;
        let finalResult = finger.ok ? finger : play;
        if (allowXx && config.qcIntegrityXxhashEnabled) {
            const hashed = await validateCandidate(config, candidate, {
                mode: 'xxhash',
                baselineSource: 'import',
                prior: finalEntry,
            });
            if (hashed.ok && hashed.cacheEntry) {
                await writeImportCacheEntry(hashed.key || candidate.key, hashed.cacheEntry);
                finalEntry = hashed.cacheEntry;
                finalResult = hashed;
            } else if (!hashed.ok) {
                const prefs = await loadPrefs();
                prefs.integrityFindings = reconcileIntegrityFindings(prefs.integrityFindings || [], {
                    incoming: [hashed],
                }).slice(0, 500);
                invalidateIntegrityCoverage(prefs);
                await savePrefs(prefs);
                await notifyIntegrityIssue(config, {
                    title: 'Integrity import finding',
                    description: `Full-file hash failed on import/upgrade for **${hashed.title || 'a title'}** (playback + fingerprint kept).`,
                    finding: hashed,
                    color: 0xf59e0b,
                });
                await notifyPlexAfterImport(config, candidate);
                return { ran: true, ok: false, blocklisted: false, result: hashed };
            }
        }

        const prefs = await loadPrefs();
        const prior = Array.isArray(prefs.integrityFindings) ? prefs.integrityFindings : [];
        const next = reconcileIntegrityFindings(prior, {
            passedKeys: finalResult.key ? [finalResult.key] : [],
        });
        if (next.length !== prior.length) {
            prefs.integrityFindings = next;
            invalidateIntegrityCoverage(prefs);
            await savePrefs(prefs);
        }

        const playabilityOk = finalEntry?.playabilityOk === true || !!finalEntry?.playabilityAt;
        if (playabilityOk && !suppressAnnounce && mediaAnnounce?.enqueue) {
            void mediaAnnounce.enqueue(config, {
                key: finalResult.key || candidate.key,
                title: candidate.title,
                arrType: candidate.arrType,
                mediaType: candidate.mediaType,
                arrInstanceId: candidate.arrInstanceId,
                entityId: candidate.entityId,
                seasonNumber: candidate.seasonNumber,
                episodeNumber: candidate.episodeNumber,
                episodeTitle: candidate.episodeTitle,
                movieFileId: candidate.movieFileId,
                episodeFileId: candidate.episodeFileId,
                trackFileId: candidate.trackFileId,
                episodeId: candidate.episodeId,
                isUpgrade: candidate.isUpgrade,
                year: candidate.year ?? null,
                overview: candidate.overview || '',
                thumbUrl: candidate.thumbUrl || null,
                tmdbId: candidate.tmdbId || null,
                tvdbId: candidate.tvdbId || null,
                imdbId: candidate.imdbId || null,
                playabilityOk: true,
            }).catch((error) => log(`[upgrader] media announce enqueue failed: ${error.message}`));
        }

        // After playback → trim → fingerprint (+ optional hash): one Plex path refresh.
        // Turn off Arr → Plex On Import/Upgrade so Plex does not analyze the pre-remux file.
        await notifyPlexAfterImport(config, candidate);

        return { ran: true, ok: true, blocklisted: false, result: finalResult };
    };

    const catchUpRecentImports = async (config, {
        sinceMs = RECENT_IMPORT_WINDOW_MS,
        now = Date.now(),
    } = {}) => {
        if (!config?.upgraderEnabled || !config?.qcIntegrityEnabled) {
            return { ran: false, reason: 'Integrity disabled', checked: 0, ranImport: 0, skipped: 0 };
        }
        if (scanning || recentImportCatchupRunning) {
            return { ran: false, reason: 'Scan already in progress', checked: 0, ranImport: 0, skipped: 0 };
        }
        recentImportCatchupRunning = true;
        try {
            const includeMusic = config.qcIntegrityIncludeMusic !== false;
            const payloads = await collectRecentImportPayloads(config, {
                request,
                now,
                sinceMs,
                includeMusic,
            });
            const cache = await loadCache();
            const entries = cache?.entries && typeof cache.entries === 'object' ? cache.entries : {};
            let skipped = 0;
            let ranImport = 0;
            for (const payload of payloads) {
                const key = payload?.key;
                const missing = missingImportChecks(key ? entries[key] : null, config, payload);
                if (!missing.length) {
                    skipped += 1;
                    continue;
                }
                if (missing.includes('playability')) {
                    await baselineImport(config, payload);
                } else {
                    let prior = key ? entries[key] : null;
                    for (const mode of missing.filter((item) => item !== 'playability')) {
                        const result = await validateCandidate(config, payload, {
                            mode,
                            baselineSource: 'import',
                            prior,
                        });
                        if (result?.cacheEntry && key) {
                            prior = result.cacheEntry;
                            await writeImportCacheEntry(key, result.cacheEntry);
                        } else if (!result?.ok && result?.reason) {
                            const prefs = await loadPrefs();
                            prefs.integrityFindings = reconcileIntegrityFindings(prefs.integrityFindings || [], {
                                incoming: [{
                                    ...payload,
                                    ...result,
                                    key: result.key || key,
                                    shouldBlocklist: false,
                                    baselineSource: 'import',
                                }],
                            }).slice(0, 500);
                            invalidateIntegrityCoverage(prefs);
                            await savePrefs(prefs);
                        }
                    }
                }
                ranImport += 1;
                if (key) {
                    const fresh = await loadCache();
                    if (fresh?.entries?.[key]) entries[key] = fresh.entries[key];
                }
            }
            lastRecentImportCatchupAt = now;
            log(`[upgrader] integrity recent-import catch-up: ${payloads.length} in window, filled ${ranImport}, complete ${skipped}`);
            return {
                ran: true,
                checked: payloads.length,
                ranImport,
                skipped,
            };
        } catch (error) {
            log(`[upgrader] integrity recent-import catch-up failed: ${error.message}`);
            return { ran: false, reason: error.message, checked: 0, ranImport: 0, skipped: 0 };
        } finally {
            recentImportCatchupRunning = false;
        }
    };

    const getStatus = async (config, opts = {}) => {
        const setup = await getSetup(config);
        const prefs = await loadPrefs();
        const cache = await loadCache();
        const includeMusic = config.qcIntegrityIncludeMusic !== false;
        const index = opts.index ?? await loadIndexShared();
        const cacheEntries = cache?.entries && typeof cache.entries === 'object' ? cache.entries : {};
        const priorFindings = Array.isArray(prefs.integrityFindings) ? prefs.integrityFindings : [];

        let coverage;
        let findings = priorFindings;
        if (prefs.integrityLastScan && prefs.integrityLastScan.full !== true) {
            // Drop leftover batch "last scan" rows that confused the Integrity KPIs.
            prefs.integrityBackfillLast = prefs.integrityBackfillLast || {
                at: prefs.integrityLastScan.at,
                mode: prefs.integrityLastScan.mode,
                scanned: prefs.integrityLastScan.scanned,
                passed: prefs.integrityLastScan.passed,
                findingCount: prefs.integrityLastScan.findingCount,
            };
            delete prefs.integrityLastScan;
            await savePrefs(prefs);
        }
        if (isCachedIntegrityCoverageValid(prefs, index.generatedAt, includeMusic)) {
            coverage = prefs.integrityCoverage;
        } else {
            const candidates = collectIntegrityCandidates(index.items || [], { includeMusic });
            coverage = computeCoverage(candidates, cacheEntries);
            assignIntegrityCoveragePrefs(prefs, coverage, index.generatedAt, includeMusic);
            const liveKeys = new Set(candidates.map((candidate) => String(candidate.key)));
            findings = reconcileIntegrityFindings(priorFindings, { liveKeys });
            if (findings.length !== priorFindings.length) {
                prefs.integrityFindings = findings;
            }
            await savePrefs(prefs);
        }
        return {
            scanning,
            progress,
            setup,
            coverage,
            breaker: prefs.integrityBreaker || { tripped: false },
            findings,
            activeRechecks: [...activeRechecks.values()],
            trimPreview: lastTrimPreview || cache.trimPreview || null,
            trimAudit: lastTrimAudit || cache.trimAudit || null,
            snoozes: await listIntegritySnoozes(),
            settings: {
                enabled: setup.enabled,
                automationEnabled: setup.automationEnabled,
                xxhashEnabled: setup.xxhashEnabled,
                trimEnabled: !!setup.trimEnabled,
                includeMusic: setup.includeMusic,
                concurrency: setup.concurrency,
                playabilityConcurrency: setup.playabilityConcurrency,
                trimConcurrency: setup.trimConcurrency,
                nightlyHour: setup.nightlyHour,
                maxPerCycle: Math.max(1, Number(config.qcIntegrityMaxPerCycle) || DEFAULT_MAX_PER_CYCLE),
                breakerMaxFindings: Math.max(1, Number(config.qcIntegrityBreakerMaxFindings) || 50),
                breakerMaxPercent: Math.max(0.1, Number(config.qcIntegrityBreakerMaxPercent) || 10),
                pauseWhenSessions: Number(config.qcIntegrityPauseWhenSessions) || null,
                snoozeDefaultHours: Math.max(1, Number(config.qcSnoozeDefaultHours) || 24),
            },
            lastScan: (() => {
                const live = lastScan?.full ? lastScan : null;
                const stored = prefs.integrityLastScan?.full ? prefs.integrityLastScan : null;
                return live || stored || null;
            })(),
        };
    };

    const escalateMismatch = async (config, candidate, prior = null, { replace = false } = {}) => {
        const play = await validateCandidate(config, candidate, {
            mode: 'playability',
            baselineSource: 'recheck',
            prior,
        });
        if (!play.ok) {
            return { ...play, shouldBlocklist: false, escalatedFrom: 'imohash_mismatch' };
        }

        let nextPrior = play.cacheEntry || prior;
        const allowNightlyTrim = isIntegrityCheckAllowed(config, {
            libraryKey: candidate.libraryKey || libraryCoverageKey(candidate),
            schedule: 'nightly',
            check: 'trim',
        });
        const trimOutcome = await validateCandidate(config, candidate, {
            mode: 'trim',
            baselineSource: 'recheck',
            prior: nextPrior,
            // Escalate must not remux when the library's nightly.trim policy is off.
            forceDryRun: !allowNightlyTrim,
        });
        if (trimOutcome.cacheEntry) nextPrior = trimOutcome.cacheEntry;
        if (trimOutcome.reason === 'trim_native_unknown') {
            // Remux skipped — still refresh hash after playback passed.
        } else if (!trimOutcome.ok && !trimOutcome.skipped && !TRIM_SOFT_REASONS.has(trimOutcome.reason)) {
            return { ...trimOutcome, shouldBlocklist: false, escalatedFrom: 'imohash_mismatch' };
        }

        // Playback (+ optional remux) passed — accept the new fingerprint instead of
        // reporting another mismatch against the pre-escalate hash.
        const hashPrior = nextPrior
            ? { ...nextPrior, imohash: null, xxhash: null }
            : null;
        const finger = await validateCandidate(config, candidate, {
            mode: 'imohash',
            baselineSource: 'recheck',
            prior: hashPrior,
        });
        if (!finger.ok) {
            return { ...finger, shouldBlocklist: false, escalatedFrom: 'imohash_mismatch' };
        }
        nextPrior = finger.cacheEntry || nextPrior;

        if (config.qcIntegrityXxhashEnabled) {
            const hashed = await validateCandidate(config, candidate, {
                mode: 'xxhash',
                baselineSource: 'recheck',
                prior: nextPrior,
            });
            if (!hashed.ok) {
                return { ...hashed, shouldBlocklist: false, escalatedFrom: 'imohash_mismatch' };
            }
            return { ...hashed, shouldBlocklist: false, escalatedFrom: 'imohash_mismatch' };
        }

        if (replace && finger.ok) {
            // Cache update handled by caller.
        }
        return { ...finger, shouldBlocklist: false, escalatedFrom: 'imohash_mismatch' };
    };

    const lookupIntegrityFiles = async (config, { query = '', limit = 25 } = {}) => {
        const needle = String(query || '').trim().toLowerCase();
        if (needle.length < 2) {
            return { query: needle, matches: [], truncated: false };
        }
        const includeMusic = config.qcIntegrityIncludeMusic !== false;
        const index = await loadIndexShared();
        const cache = await loadCache();
        const entries = cache?.entries && typeof cache.entries === 'object' ? cache.entries : {};
        const max = Math.max(1, Math.min(50, Number(limit) || 25));
        const matches = [];
        for (const candidate of collectIntegrityCandidates(index.items || [], { includeMusic })) {
            const episodeTag = candidate.seasonNumber != null && candidate.episodeNumber != null
                ? `s${String(candidate.seasonNumber).padStart(2, '0')}e${String(candidate.episodeNumber).padStart(2, '0')}`
                : '';
            const haystack = [
                candidate.title,
                candidate.episodeTitle,
                candidate.filePath,
                candidate.key,
                candidate.libraryName,
                candidate.arrInstanceName,
                episodeTag,
            ].map((value) => String(value || '').toLowerCase()).join(' ');
            if (!haystack.includes(needle)) continue;
            matches.push({
                key: candidate.key,
                title: candidate.title,
                episodeTitle: candidate.episodeTitle || null,
                seasonNumber: candidate.seasonNumber ?? null,
                episodeNumber: candidate.episodeNumber ?? null,
                filePath: candidate.filePath,
                libraryName: candidate.libraryName || candidate.arrInstanceName || null,
                mediaType: candidate.mediaType,
                arrType: candidate.arrType,
                cache: entries[candidate.key] || null,
            });
            if (matches.length >= max) break;
        }
        return { query: needle, matches, truncated: matches.length >= max };
    };

    const runFileCheck = async (config, { key = null, mode = 'playability' } = {}) => {
        if (scanning) {
            return { ok: false, reason: 'Scan already in progress', scanning: true };
        }
        if (!config.upgraderEnabled || !config.qcIntegrityEnabled) {
            return { ok: false, reason: 'Integrity disabled' };
        }
        const scanMode = INTEGRITY_SCAN_MODES.includes(mode) ? mode : 'playability';
        if (scanMode === 'xxhash' && !config.qcIntegrityXxhashEnabled) {
            return { ok: false, reason: 'xxhash disabled', mode: scanMode };
        }
        const findingKey = String(key || '').trim();
        if (!findingKey) return { ok: false, reason: 'key is required' };

        const includeMusic = config.qcIntegrityIncludeMusic !== false;
        const index = await loadIndexShared();
        const candidates = collectIntegrityCandidates(index.items || [], { includeMusic });
        const candidate = candidates.find((entry) => String(entry.key) === findingKey) || null;
        if (!candidate?.filePath) {
            return { ok: false, reason: 'File not found in library index', key: findingKey, mode: scanMode };
        }

        const cache = await loadCache();
        const entries = cache?.entries && typeof cache.entries === 'object' ? { ...cache.entries } : {};
        const prior = entries[findingKey] || null;
        const result = scanMode === 'baseline'
            ? await validateCandidate(config, candidate, { mode: 'baseline', baselineSource: 'recheck', prior })
            : await validateCandidate(config, candidate, { mode: scanMode, baselineSource: 'recheck', prior });

        if (result?.cacheEntry) {
            entries[findingKey] = result.cacheEntry;
            await saveCache({
                updatedAt: new Date().toISOString(),
                schemaVersion: SCHEMA_VERSION,
                entries,
                trimPreview: cache.trimPreview || lastTrimPreview || null,
                trimAudit: cache.trimAudit || lastTrimAudit || null,
            });
            const prefs = await loadPrefs();
            invalidateIntegrityCoverage(prefs);
            if (result.ok) {
                prefs.integrityFindings = reconcileIntegrityFindings(prefs.integrityFindings || [], {
                    passedKeys: [findingKey],
                });
            }
            await savePrefs(prefs);
        }

        await appendAudit({
            action: 'qc_integrity_file_check',
            success: !!result?.ok,
            key: findingKey,
            title: candidate.title,
            mode: scanMode,
            reason: result?.reason || null,
        });

        const wouldRemux = isTrimPreviewReason(result?.reason) || result?.wouldRemux === true;
        return {
            ok: !!result?.ok || wouldRemux,
            skipped: !!result?.skipped,
            wouldRemux,
            key: findingKey,
            mode: scanMode,
            reason: result?.reason || null,
            detail: result?.detail || null,
            audioKeep: result?.audioKeep || [],
            audioDrop: result?.audioDrop || [],
            subKeep: result?.subKeep || [],
            subDrop: result?.subDrop || [],
            trimPlan: result?.trimPlan || null,
            cache: result?.cacheEntry || entries[findingKey] || null,
            result,
        };
    };

    const processSoftRecheckQueue = async (config) => {
        if (scanning) return;
        const prefs = await loadPrefs();
        const queue = Array.isArray(prefs.integritySoftRecheckQueue)
            ? prefs.integritySoftRecheckQueue.map((entry) => String(entry)).filter(Boolean)
            : [];
        if (!queue.length) return;
        const key = queue[0];
        const dequeueKey = async () => {
            const fresh = await loadPrefs();
            fresh.integritySoftRecheckQueue = (Array.isArray(fresh.integritySoftRecheckQueue)
                ? fresh.integritySoftRecheckQueue
                : []
            ).map((entry) => String(entry)).filter((entry) => entry && entry !== String(key));
            await savePrefs(fresh);
        };
        const rotateKey = async () => {
            const fresh = await loadPrefs();
            const next = (Array.isArray(fresh.integritySoftRecheckQueue)
                ? fresh.integritySoftRecheckQueue
                : []
            ).map((entry) => String(entry)).filter(Boolean);
            if (next[0] === String(key)) {
                next.shift();
                next.push(String(key));
            }
            fresh.integritySoftRecheckQueue = next.slice(-200);
            await savePrefs(fresh);
        };
        try {
            const findings = Array.isArray(prefs.integrityFindings) ? prefs.integrityFindings : [];
            const finding = findings.find((entry) => String(entry?.key) === String(key)) || null;
            const check = String(finding?.reason || '').startsWith('trim_')
                ? 'trim'
                : String(finding?.reason || '').includes('imohash')
                    ? 'imohash'
                    : String(finding?.reason || '').includes('xxhash')
                        ? 'xxhash'
                        : 'playability';
            if (!isIntegrityCheckAllowed(config, {
                libraryKey: finding?.libraryKey || null,
                schedule: 'import',
                check,
            })) {
                log(`[upgrader] soft recheck skipped for ${key} (import policy denies ${check})`);
                await dequeueKey();
                return;
            }
            if (scanning) {
                await rotateKey();
                return;
            }
            await recheckFinding(config, { key });
            await dequeueKey();
        } catch (error) {
            log(`[upgrader] soft recheck failed for ${key}: ${error.message}`);
            await rotateKey();
        }
    };

    const startIntegrityJob = (getConfig) => {
        if (integrityTimer || nightlyTimer) return;

        const trimTmpRootsFromConfig = (config) => {
            const roots = resolveIntegrityMediaRoots(config);
            if (Array.isArray(roots) && roots.length) return roots;
            // Denylist mode: still sweep the documented compose mount for orphan tmp files.
            return [DEFAULT_INTEGRITY_MEDIA_ROOT];
        };

        // Restart leftovers only — do not sweep periodically while remuxes may be in flight.
        void (async () => {
            try {
                const config = await getConfig();
                if (!config?.upgraderEnabled || !config?.qcIntegrityEnabled) return;
                configureTrimRemuxConcurrency(config.qcIntegrityTrimConcurrency);
                const result = await cleanupPortalTrimTmps({
                    roots: trimTmpRootsFromConfig(config),
                    log,
                });
                if (result.removed) {
                    log(`[upgrader] cleaned ${result.removed} orphan portal-trim tmp file(s) on boot`);
                }
            } catch (error) {
                log(`[upgrader] trim tmp cleanup failed: ${error.message}`);
            }
        })();

        const maybeCatchUpRecentImports = async ({ force = false } = {}) => {
            try {
                const config = await getConfig();
                if (!config?.upgraderEnabled || !config?.qcIntegrityEnabled) return;
                const now = Date.now();
                if (!force && lastRecentImportCatchupAt && (now - lastRecentImportCatchupAt) < (60 * 60 * 1000)) {
                    return;
                }
                await catchUpRecentImports(config, { now });
            } catch (error) {
                log(`[upgrader] integrity recent-import catch-up failed: ${error.message}`);
            }
        };

        const runNightly = async () => {
            try {
                const config = await getConfig();
                if (!config.upgraderEnabled || !config.qcIntegrityEnabled) return;
                const hour = Math.max(0, Math.min(23, Number(config.qcIntegrityNightlyHour ?? 2) || 2));
                const now = new Date();
                if (now.getHours() !== hour) return;
                const dayKey = now.toISOString().slice(0, 10);
                if (lastNightlyKey === dayKey) return;

                const replace = !!config.qcIntegrityAutomationEnabled;
                const includeMusic = config.qcIntegrityIncludeMusic !== false;
                const index = await loadIndex();
                const allCandidates = collectIntegrityCandidates(index.items || [], { includeMusic });
                const librariesByKey = new Map();
                for (const candidate of allCandidates) {
                    const key = libraryCoverageKey(candidate);
                    if (!key || librariesByKey.has(key)) continue;
                    librariesByKey.set(key, {
                        key,
                        label: candidate.libraryName || key,
                        mediaType: candidate.mediaType || null,
                    });
                }
                const libraries = [...librariesByKey.values()];

                if (config.qcTrimEnabled) {
                    const trimLibs = librariesAllowingNightlyCheck(libraries, config, 'trim')
                        .filter((lib) => lib.mediaType !== 'album');
                    if (!trimLibs.length) {
                        log('[upgrader] integrity nightly trim: skipped (no libraries allow nightly trim)');
                    }
                    for (const lib of trimLibs) {
                        try {
                            const trimScan = await scanIntegrity(config, {
                                dryRun: true,
                                replaceFindings: false,
                                mode: 'trim',
                                baselineSource: 'recheck',
                                full: true,
                                libraryKey: lib.key,
                                libraryLabel: lib.label,
                            });
                            log(`[upgrader] integrity nightly trim · ${lib.label}: scanned ${trimScan.scanned || 0}, findings ${trimScan.findingCount || 0}, skipped ${trimScan.skipped || 0}`);
                        } catch (error) {
                            log(`[upgrader] integrity nightly trim · ${lib.label} failed: ${error.message}`);
                        }
                    }
                }

                const imoLibs = librariesAllowingNightlyCheck(libraries, config, 'imohash');
                const mismatches = [];
                if (!imoLibs.length) {
                    log('[upgrader] integrity nightly fingerprint: skipped (no libraries allow nightly imohash)');
                }
                for (const lib of imoLibs) {
                    try {
                        const imo = await scanIntegrity(config, {
                            dryRun: true,
                            replaceFindings: false,
                            mode: 'imohash',
                            baselineSource: 'recheck',
                            full: true,
                            force: true,
                            libraryKey: lib.key,
                            libraryLabel: lib.label,
                        });
                        const libMismatches = (imo.findings || []).filter((entry) => (
                            entry?.reason === 'imohash_mismatch' || entry?.reason === 'imohash_failed'
                        ));
                        mismatches.push(...libMismatches);
                        log(`[upgrader] integrity nightly fingerprint · ${lib.label}: scanned ${imo.scanned || 0}, mismatches ${libMismatches.length}`);
                    } catch (error) {
                        log(`[upgrader] integrity nightly fingerprint · ${lib.label} failed: ${error.message}`);
                    }
                }
                log(`[upgrader] integrity nightly fingerprint: ${mismatches.length} mismatch(es) across ${imoLibs.length} libraries`);

                const escalatedFindings = [];
                const cache = await loadCache();
                const entries = cache?.entries && typeof cache.entries === 'object' ? { ...cache.entries } : {};
                for (const finding of mismatches) {
                    const prior = entries[finding.key] || null;
                    const candidate = {
                        key: finding.key,
                        ratingKey: finding.ratingKey,
                        title: finding.title,
                        arrType: finding.arrType,
                        arrInstanceId: finding.arrInstanceId,
                        arrInstanceName: finding.arrInstanceName,
                        entityId: finding.entityId,
                        mediaType: finding.mediaType,
                        mediaKind: finding.mediaKind,
                        movieFileId: finding.movieFileId,
                        episodeId: finding.episodeId,
                        episodeFileId: finding.episodeFileId,
                        trackFileId: finding.trackFileId,
                        filePath: finding.filePath,
                        expectedRuntimeSec: finding.expectedRuntimeSec,
                        downloadId: finding.downloadId,
                        sourceTitle: finding.sourceTitle,
                        libraryKey: finding.libraryKey || null,
                    };
                    const escalated = await escalateMismatch(config, candidate, prior, { replace });
                    if (escalated.ok && escalated.cacheEntry) {
                        entries[finding.key] = escalated.cacheEntry;
                        continue;
                    }
                    escalatedFindings.push({ ...escalated, shouldBlocklist: false });
                    if (replace && !escalated.ok && !escalated.softTimeout) {
                        await replaceCorrupt(config, escalated, { dryRun: false });
                    }
                }

                await saveCache({
                    updatedAt: new Date().toISOString(),
                    schemaVersion: SCHEMA_VERSION,
                    entries,
                });

                if (escalatedFindings.length) {
                    const prefs = await loadPrefs();
                    prefs.integrityFindings = reconcileIntegrityFindings(prefs.integrityFindings || [], {
                        incoming: escalatedFindings,
                        passedKeys: mismatches
                            .filter((entry) => !escalatedFindings.some((fail) => fail.key === entry.key))
                            .map((entry) => entry.key),
                    }).slice(0, 500);
                    await savePrefs(prefs);
                    await notifyIntegrityIssue(config, {
                        title: 'Integrity nightly escalate',
                        description: `Fingerprint mismatches escalated: **${escalatedFindings.length}** still failing`
                            + (replace ? ' — replace/search triggered (no blocklist).' : ' (report-only).'),
                        finding: escalatedFindings[0],
                    });
                    log(`[upgrader] integrity nightly escalate: ${escalatedFindings.length} failure(s)${replace ? '; replace attempted' : ''}`);
                } else if (mismatches.length) {
                    const prefs = await loadPrefs();
                    prefs.integrityFindings = reconcileIntegrityFindings(prefs.integrityFindings || [], {
                        passedKeys: mismatches.map((entry) => entry.key),
                    });
                    await savePrefs(prefs);
                }
                lastNightlyKey = dayKey;
            } catch (error) {
                log(`[upgrader] integrity nightly job failed: ${error.message}`);
            }
        };

        setTimeout(() => { void maybeCatchUpRecentImports({ force: true }); }, 3 * 60 * 1000);
        integrityTimer = setInterval(() => {
            void (async () => {
                try {
                    const config = await getConfig();
                    if (config?.upgraderEnabled && config?.qcIntegrityEnabled) {
                        await processSoftRecheckQueue(config);
                    }
                    if (config && mediaAnnounce?.flushDue) {
                        await mediaAnnounce.flushDue(config);
                    }
                    if (config) {
                        await flushPlexRefreshDue(config);
                    }
                } catch (error) {
                    log(`[upgrader] soft recheck tick failed: ${error.message}`);
                }
                await maybeCatchUpRecentImports();
                await runNightly();
            })();
        }, 60 * 1000);
        nightlyTimer = integrityTimer;
    };

    return {
        get scanning() { return scanning; },
        getSetup,
        getStatus,
        scanIntegrity,
        beginScanIntegrity,
        cancelScanIntegrity,
        replaceCorrupt,
        validateCandidate,
        baselineImport,
        catchUpRecentImports,
        lookupIntegrityFiles,
        runFileCheck,
        escalateMismatch,
        clearBreaker,
        snoozeFinding,
        clearIntegritySnooze,
        listIntegritySnoozes,
        recheckFinding,
        collectIntegrityCandidates,
        startIntegrityJob,
        mapArrPath,
        scheduleDecodeWindows,
        blocklistRelease,
        flushMediaAnnounces: async (config) => (
            mediaAnnounce?.flushDue ? mediaAnnounce.flushDue(config) : { flushed: 0 }
        ),
    };
};
