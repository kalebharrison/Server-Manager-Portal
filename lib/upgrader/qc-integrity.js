import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { getReadyArrInstances } from '../media-stack/arr-instances.js';
import { createPlexSessionsSnapshot } from '../plex/plex-sessions-snapshot.js';
import { computeImohash, computeXxhash64 } from './qc-integrity-hash.js';
import { durationMatchesExpected } from './qc-integrity-runtime.js';

const DEFAULT_WINDOW_SEC = 10;
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_PER_CYCLE = 200;
const DEFAULT_CONCURRENCY = 4;
const SCHEMA_VERSION = 2;
const PLEX_SESSION_CACHE_MS = 20000;

const EMPTY_COVERAGE = () => ({
    movie: { total: 0, baselined: 0, imohash: 0, xxhash: 0 },
    show: { total: 0, baselined: 0, imohash: 0, xxhash: 0 },
    album: { total: 0, baselined: 0, imohash: 0, xxhash: 0 },
});

const mapPool = async (items, concurrency, worker) => {
    const list = Array.isArray(items) ? items : [];
    const results = new Array(list.length);
    let next = 0;
    const runners = Array.from({ length: Math.max(1, Number(concurrency) || 1) }, async () => {
        while (next < list.length) {
            const index = next;
            next += 1;
            results[index] = await worker(list[index], index);
        }
    });
    await Promise.all(runners);
    return results;
};

export const mapArrPath = (arrPath, maps = []) => {
    const raw = String(arrPath || '');
    if (!raw) return null;
    const normalizedMaps = (Array.isArray(maps) ? maps : [])
        .map((entry) => ({
            from: String(entry?.from || entry?.arrPrefix || '').replace(/\/+$/, ''),
            to: String(entry?.to || entry?.containerPrefix || '').replace(/\/+$/, ''),
        }))
        .filter((entry) => entry.from && entry.to)
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
    return {
        ffprobe: !!ffprobe.ok,
        ffmpeg: !!ffmpeg.ok,
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
    mediaKind = 'video',
    execImpl = null,
} = {}) => {
    const windows = scheduleDecodeWindows(durationSec, windowSec);
    const window = Math.max(1, Number(windowSec) || DEFAULT_WINDOW_SEC);
    const kind = mediaKind === 'audio' ? 'audio' : 'video';
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
        const result = await runCommand('ffmpeg', args, { timeoutMs, execImpl });
        if (result.timedOut) {
            return { ok: false, reason: `decode_${entry.id}_timeout`, windowId: entry.id };
        }
        if (!result.ok) {
            return {
                ok: false,
                reason: `decode_${entry.id}`,
                windowId: entry.id,
                detail: (result.stderr || '').trim().slice(0, 200) || 'ffmpeg decode failed',
            };
        }
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
        if (!item || item.monitored === false) continue;

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
                libraryName: item.libraryName || null,
                thumbUrl: item.thumbUrl || null,
            });
            continue;
        }

        if (item.mediaType === 'show' || item.arrType === 'sonarr') {
            for (const episode of (Array.isArray(item.episodes) ? item.episodes : [])) {
                if (!episode?.episodeFileId || !episode?.filePath) continue;
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
                    libraryName: item.libraryName || null,
                    thumbUrl: item.thumbUrl || null,
                    episodeTitle: episode.title || null,
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
                libraryName: item.libraryName || null,
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
    return 'integrityScanCursor';
};

const computeCoverage = (candidates, cacheEntries = {}) => {
    const coverage = EMPTY_COVERAGE();
    for (const candidate of candidates) {
        const bucket = coverageBucket(candidate.mediaType);
        coverage[bucket].total += 1;
        const prior = cacheEntries[candidate.key];
        if (!prior || prior.ok === false) continue;
        if (prior.baselinedAt || prior.playabilityOk) coverage[bucket].baselined += 1;
        if (prior.imohash) coverage[bucket].imohash += 1;
        if (prior.xxhash) coverage[bucket].xxhash += 1;
    }
    return coverage;
};

const dedupeFindings = (findings = []) => {
    const byKey = new Map();
    for (const finding of (Array.isArray(findings) ? findings : [])) {
        if (!finding?.key) continue;
        byKey.set(finding.key, finding);
    }
    return [...byKey.values()];
};

const isSnoozed = (prefs, key, now = Date.now()) => {
    const until = prefs?.integritySnoozed?.[key] || prefs?.snoozed?.[key];
    if (!until) return false;
    const ts = Date.parse(until);
    return Number.isFinite(ts) && ts > now;
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
    loadPrefs,
    savePrefs,
    appendAudit,
    loadCache,
    saveCache,
    log = () => {},
    execImpl = null,
    statImpl = null,
    imohashImpl = null,
    xxhashImpl = null,
    getPlayingPaths = null,
    actionsRemaining = null,
    markAction = null,
    resolvePlexUri = null,
    fetchImpl = null,
} = {}) => {
    let scanning = false;
    let lastScan = null;
    let integrityTimer = null;
    let nightlyTimer = null;
    let lastNightlyKey = null;
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

    const getSetup = async (config) => {
        const tools = await checkIntegrityTools({ execImpl });
        const maps = Array.isArray(config.qcIntegrityPathMaps) ? config.qcIntegrityPathMaps : [];
        return {
            enabled: !!config.qcIntegrityEnabled && !!config.upgraderEnabled,
            automationEnabled: !!config.qcIntegrityAutomationEnabled,
            xxhashEnabled: !!config.qcIntegrityXxhashEnabled,
            includeMusic: config.qcIntegrityIncludeMusic !== false,
            tools,
            pathMapCount: maps.length,
            ready: tools.ready,
            concurrency: Math.max(1, Number(config.qcIntegrityConcurrency) || DEFAULT_CONCURRENCY),
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
            } else if (candidate.arrType === 'lidarr' && candidate.entityId) {
                body.artistIds = [candidate.entityId];
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
            };
        }

        const decode = await quickDecodeFile(localPath, {
            durationSec: probe.durationSec,
            windowSec,
            timeoutMs,
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
        baselineSource: extras.baselineSource ?? null,
        playabilityOk: extras.playabilityOk ?? false,
        ok: extras.ok !== false,
    });

    const validateCandidate = async (config, candidate, {
        mode = 'baseline',
        baselineSource = 'backfill',
        prior = null,
    } = {}) => {
        const maps = Array.isArray(config.qcIntegrityPathMaps) ? config.qcIntegrityPathMaps : [];
        const localPath = mapArrPath(candidate.filePath, maps);
        const source = baselineSource || 'backfill';
        if (!localPath) {
            return {
                ...candidate,
                localPath: null,
                ok: false,
                reason: 'missing_path',
                shouldBlocklist: source === 'import',
                mode,
            };
        }
        const st = await readStat(localPath);
        if (!st.ok) {
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
                    baselineSource: prior?.baselineSource || source,
                    playabilityOk: prior?.playabilityOk ?? true,
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
                    shouldBlocklist: source === 'import',
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
                    baselineSource: prior?.baselineSource || source,
                    playabilityOk: true,
                    ok: true,
                }),
            };
        }

        // baseline (default)
        const play = await runPlayability(config, candidate, localPath, st);
        if (!play.ok) {
            return {
                ...candidate,
                localPath,
                size: st.size,
                mtimeMs: st.mtimeMs,
                ...play,
                shouldBlocklist: source === 'import',
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
                    shouldBlocklist: false,
                    mode: 'baseline',
                };
            }
            xxhash = hashed.xxhash;
            fullHashedAt = nowIso;
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

    const snoozeFinding = async (key, hours = 24) => {
        const prefs = await loadPrefs();
        const until = new Date(Date.now() + (Math.max(1, Number(hours) || 24) * 60 * 60 * 1000)).toISOString();
        prefs.integritySnoozed = {
            ...(prefs.integritySnoozed || {}),
            [String(key)]: until,
        };
        prefs.integrityFindings = dedupeFindings(
            (prefs.integrityFindings || []).filter((entry) => entry.key !== String(key)),
        );
        await savePrefs(prefs);
        return { key: String(key), until };
    };

    const shouldSkipCached = (mode, prior, st, force) => {
        if (force || !cacheStatMatches(prior, st)) return false;
        if (mode === 'imohash' || mode === 'xxhash') return false;
        if (mode === 'playability') return !!(prior?.playabilityOk || prior?.ok);
        return !!(prior?.baselinedAt && prior?.imohash && prior?.ok !== false);
    };

    const scanIntegrity = async (config, {
        dryRun = true,
        limit = null,
        replaceFindings = false,
        force = false,
        mode = 'baseline',
        baselineSource = 'backfill',
    } = {}) => {
        if (scanning) {
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
            return { ran: false, reason: 'Integrity disabled', findings: [], scanned: 0, skipped: 0 };
        }

        const setup = await getSetup(config);
        if (!setup.tools.ready) {
            return {
                ran: false,
                reason: 'ffmpeg/ffprobe not available in this container',
                setup,
                findings: [],
                scanned: 0,
                skipped: 0,
            };
        }

        const scanMode = ['baseline', 'playability', 'imohash', 'xxhash'].includes(mode) ? mode : 'baseline';
        if (scanMode === 'xxhash' && !config.qcIntegrityXxhashEnabled) {
            return {
                ran: false,
                reason: 'xxhash disabled',
                setup,
                findings: [],
                scanned: 0,
                skipped: 0,
            };
        }

        scanning = true;
        progress = {
            startedAt: new Date().toISOString(),
            mode: scanMode,
            target: 0,
            scanned: 0,
            skipped: 0,
            skippedPlaying: 0,
            passed: 0,
            findingCount: 0,
            currentTitle: null,
        };

        try {
            const index = await loadIndex();
            const prefs = await loadPrefs();
            const cache = await loadCache();
            const cacheEntries = cache?.entries && typeof cache.entries === 'object' ? { ...cache.entries } : {};
            const includeMusic = config.qcIntegrityIncludeMusic !== false;
            const candidates = collectIntegrityCandidates(index.items || [], { includeMusic });
            const maxPerCycle = Math.max(
                1,
                Number(limit ?? config.qcIntegrityMaxPerCycle ?? DEFAULT_MAX_PER_CYCLE) || DEFAULT_MAX_PER_CYCLE,
            );
            const concurrency = Math.max(1, Number(config.qcIntegrityConcurrency) || DEFAULT_CONCURRENCY);
            const cursorKey = cursorKeyForMode(scanMode);
            const cursor = Math.max(0, Number(prefs[cursorKey]) || 0) % Math.max(1, candidates.length || 1);
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
                    scanned: 0,
                    skipped: 0,
                    skippedPlaying: 0,
                    passed: 0,
                    findingCount: 0,
                    paused: true,
                    reason: 'plex_sessions_busy',
                    findings: [],
                };
                prefs.integrityLastScan = lastScan;
                await savePrefs(prefs);
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

            for (const candidate of ordered) {
                if (batch.length >= maxPerCycle) break;
                walked += 1;

                if (isSnoozed(prefs, candidate.key)) {
                    skipped += 1;
                    continue;
                }

                const mapped = mapArrPath(candidate.filePath, maps);
                if (mapped && playing.paths.some((path) => pathsMatch(path, mapped) || pathsMatch(path, candidate.filePath))) {
                    skippedPlaying += 1;
                    continue;
                }

                const st = mapped ? await readStat(mapped) : { ok: false };
                const key = cacheKeyFor(candidate);
                const prior = cacheEntries[key] || null;

                if (prior && st.ok && !cacheStatMatches(prior, st)) {
                    delete cacheEntries[key];
                }

                const freshPrior = cacheEntries[key] || null;
                if (shouldSkipCached(scanMode, freshPrior, st, force)) {
                    skipped += 1;
                    continue;
                }

                batch.push({ candidate, prior: freshPrior });
            }

            progress = {
                ...progress,
                target: batch.length,
                skipped,
                skippedPlaying,
            };

            const findings = [];
            let scanned = 0;
            let passed = 0;
            let breaker = prefs.integrityBreaker?.tripped
                ? prefs.integrityBreaker
                : null;
            const liveReplace = !!replaceFindings && !dryRun;

            const results = await mapPool(batch, concurrency, async ({ candidate, prior }) => {
                const needsBaseline = (scanMode === 'imohash' || scanMode === 'xxhash')
                    && (!prior?.baselinedAt || !prior?.imohash);

                if (needsBaseline) {
                    // Baseline already stores imohash (+ xxhash when enabled).
                    return validateCandidate(config, candidate, {
                        mode: 'baseline',
                        baselineSource: 'backfill',
                        prior: null,
                    });
                }

                return validateCandidate(config, candidate, {
                    mode: scanMode,
                    baselineSource,
                    prior,
                });
            });

            for (let i = 0; i < results.length; i += 1) {
                const result = results[i];
                const candidate = batch[i]?.candidate;
                scanned += 1;
                progress = {
                    ...progress,
                    scanned,
                    skipped,
                    skippedPlaying,
                    passed,
                    findingCount: findings.length,
                    currentTitle: candidate?.title || result?.title || null,
                };

                const key = result?.key || candidate?.key;
                if (result?.ok) {
                    passed += 1;
                    if (result.cacheEntry) cacheEntries[key] = result.cacheEntry;
                    progress = { ...progress, passed, findingCount: findings.length };
                    continue;
                }

                if (result?.cacheEntry) cacheEntries[key] = result.cacheEntry;
                else if (key) delete cacheEntries[key];

                if (result?.shouldBlocklist && baselineSource === 'import') {
                    await blocklistRelease(config, result);
                }

                findings.push(result);
                progress = { ...progress, findingCount: findings.length };

                if (liveReplace) {
                    const maxFindings = Math.max(1, Number(config.qcIntegrityBreakerMaxFindings) || 25);
                    const maxPercent = Math.max(0.1, Number(config.qcIntegrityBreakerMaxPercent) || 2);
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

            prefs[cursorKey] = candidates.length
                ? (cursor + Math.max(walked, 1)) % candidates.length
                : 0;

            const coverage = computeCoverage(candidates, cacheEntries);
            prefs.integrityCoverage = coverage;

            const mergedFindings = dedupeFindings([
                ...(Array.isArray(prefs.integrityFindings) ? prefs.integrityFindings : []),
                ...findings,
            ]).slice(0, 500);
            prefs.integrityFindings = mergedFindings;

            await saveCache({
                updatedAt: new Date().toISOString(),
                schemaVersion: SCHEMA_VERSION,
                entries: cacheEntries,
            });

            lastScan = {
                at: new Date().toISOString(),
                dryRun: !!dryRun,
                mode: scanMode,
                scanned,
                skipped,
                skippedPlaying,
                passed,
                findingCount: findings.length,
                breakerTripped: !!breaker?.tripped,
                findings: findings.slice(0, 200),
            };

            await appendAudit({
                action: 'qc_integrity_scan',
                success: true,
                dryRun: !!dryRun,
                mode: scanMode,
                scanned,
                skipped,
                skippedPlaying,
                passed,
                findingCount: findings.length,
                breakerTripped: !!breaker?.tripped,
            });

            prefs.integrityLastScan = {
                at: lastScan.at,
                mode: scanMode,
                scanned,
                skipped,
                skippedPlaying,
                passed,
                findingCount: findings.length,
                findings: findings.slice(0, 200),
                breakerTripped: !!breaker?.tripped,
            };
            await savePrefs(prefs);

            return {
                ran: true,
                dryRun: !!dryRun,
                mode: scanMode,
                setup,
                scanned,
                skipped,
                skippedPlaying,
                passed,
                findingCount: findings.length,
                findings,
                coverage,
                breaker: breaker || prefs.integrityBreaker || null,
                candidates: candidates.length,
                progress: null,
            };
        } finally {
            scanning = false;
            progress = null;
        }
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
        };

        const result = await validateCandidate(config, candidate, {
            mode: 'baseline',
            baselineSource: 'import',
        });

        const cache = await loadCache();
        const entries = cache?.entries && typeof cache.entries === 'object' ? { ...cache.entries } : {};
        let blocklisted = false;
        if (result.ok && result.cacheEntry) {
            entries[result.key] = result.cacheEntry;
            await saveCache({
                updatedAt: new Date().toISOString(),
                schemaVersion: SCHEMA_VERSION,
                entries,
            });
            return { ran: true, ok: true, blocklisted: false, result };
        }

        if (result.shouldBlocklist) {
            const blocked = await blocklistRelease(config, result);
            blocklisted = !!blocked?.success;
            if (config.qcIntegrityAutomationEnabled) {
                await replaceCorrupt(config, result, { dryRun: false });
            }
            const prefs = await loadPrefs();
            prefs.integrityFindings = dedupeFindings([
                ...(prefs.integrityFindings || []),
                result,
            ]).slice(0, 500);
            await savePrefs(prefs);
        } else {
            const prefs = await loadPrefs();
            prefs.integrityFindings = dedupeFindings([
                ...(prefs.integrityFindings || []),
                result,
            ]).slice(0, 500);
            await savePrefs(prefs);
        }

        return { ran: true, ok: false, blocklisted, result };
    };

    const getStatus = async (config) => {
        const setup = await getSetup(config);
        const prefs = await loadPrefs();
        const cache = await loadCache();
        const includeMusic = config.qcIntegrityIncludeMusic !== false;
        let coverage = prefs.integrityCoverage || null;
        if (!coverage) {
            const index = await loadIndex();
            const candidates = collectIntegrityCandidates(index.items || [], { includeMusic });
            coverage = computeCoverage(
                candidates,
                cache?.entries && typeof cache.entries === 'object' ? cache.entries : {},
            );
        }
        return {
            scanning,
            progress,
            setup,
            coverage,
            breaker: prefs.integrityBreaker || { tripped: false },
            findings: prefs.integrityFindings || [],
            settings: {
                enabled: setup.enabled,
                automationEnabled: setup.automationEnabled,
                xxhashEnabled: setup.xxhashEnabled,
                includeMusic: setup.includeMusic,
                concurrency: setup.concurrency,
                nightlyHour: setup.nightlyHour,
                maxPerCycle: Math.max(1, Number(config.qcIntegrityMaxPerCycle) || DEFAULT_MAX_PER_CYCLE),
                breakerMaxFindings: Math.max(1, Number(config.qcIntegrityBreakerMaxFindings) || 25),
                breakerMaxPercent: Math.max(0.1, Number(config.qcIntegrityBreakerMaxPercent) || 2),
                pauseWhenSessions: Number(config.qcIntegrityPauseWhenSessions) || null,
            },
            lastScan: lastScan || prefs.integrityLastScan || null,
        };
    };

    const startIntegrityJob = (getConfig) => {
        if (integrityTimer || nightlyTimer) return;

        const runBaselineBackfill = async () => {
            try {
                const config = await getConfig();
                if (!config.upgraderEnabled || !config.qcIntegrityEnabled) return;
                const result = await scanIntegrity(config, {
                    dryRun: true,
                    replaceFindings: false,
                    mode: 'baseline',
                    baselineSource: 'backfill',
                });
                if (result.ran) {
                    log(`[upgrader] integrity baseline backfill scanned ${result.scanned}, findings ${result.findingCount}`);
                }
            } catch (error) {
                log(`[upgrader] integrity baseline backfill failed: ${error.message}`);
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
                lastNightlyKey = dayKey;

                const replace = !!config.qcIntegrityAutomationEnabled;
                const imo = await scanIntegrity(config, {
                    dryRun: !replace,
                    replaceFindings: replace,
                    mode: 'imohash',
                    baselineSource: 'recheck',
                });
                if (imo.findingCount) {
                    log(`[upgrader] integrity imohash found ${imo.findingCount} issue(s)${replace ? '; replace attempted' : ' (report-only)'}`);
                }

                if (config.qcIntegrityXxhashEnabled) {
                    const xx = await scanIntegrity(config, {
                        dryRun: !replace,
                        replaceFindings: replace,
                        mode: 'xxhash',
                        baselineSource: 'recheck',
                    });
                    if (xx.findingCount) {
                        log(`[upgrader] integrity xxhash found ${xx.findingCount} issue(s)${replace ? '; replace attempted' : ' (report-only)'}`);
                    }
                }

                const play = await scanIntegrity(config, {
                    dryRun: !replace,
                    replaceFindings: replace,
                    mode: 'playability',
                    baselineSource: 'recheck',
                });
                if (play.findingCount) {
                    log(`[upgrader] integrity playability found ${play.findingCount} issue(s)${replace ? '; replace attempted' : ' (report-only)'}`);
                }
            } catch (error) {
                log(`[upgrader] integrity nightly job failed: ${error.message}`);
            }
        };

        setTimeout(() => { void runBaselineBackfill(); }, 3 * 60 * 1000);
        integrityTimer = setInterval(() => { void runNightly(); }, 60 * 1000);
        nightlyTimer = integrityTimer;
    };

    return {
        get scanning() { return scanning; },
        getSetup,
        getStatus,
        scanIntegrity,
        replaceCorrupt,
        validateCandidate,
        baselineImport,
        clearBreaker,
        snoozeFinding,
        collectIntegrityCandidates,
        startIntegrityJob,
        mapArrPath,
        scheduleDecodeWindows,
        blocklistRelease,
    };
};
