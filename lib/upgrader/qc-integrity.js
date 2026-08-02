import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { getReadyArrInstances } from '../media-stack/arr-instances.js';

const DEFAULT_WINDOW_SEC = 10;
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_PER_CYCLE = 25;

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
    if (!hasVideo) {
        return { ok: false, reason: 'missing_video', durationSec: Number.isFinite(durationSec) ? durationSec : null, hasVideo, hasAudio };
    }
    if (requireAudio && !hasAudio) {
        return { ok: false, reason: 'missing_audio', durationSec: Number.isFinite(durationSec) ? durationSec : null, hasVideo, hasAudio };
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
    execImpl = null,
} = {}) => {
    const windows = scheduleDecodeWindows(durationSec, windowSec);
    const window = Math.max(1, Number(windowSec) || DEFAULT_WINDOW_SEC);
    for (const entry of windows) {
        const args = [
            '-hide_banner',
            '-nostdin',
            '-loglevel', 'error',
            '-ss', String(Math.max(0, Number(entry.seekSec) || 0)),
            '-t', String(window),
            '-i', localPath,
            '-map', '0:v:0?',
            '-map', '0:a:0?',
            '-f', 'null',
            '-',
        ];
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

export const collectIntegrityCandidates = (items = []) => {
    const out = [];
    for (const item of (Array.isArray(items) ? items : [])) {
        if (!item || item.monitored === false) continue;
        if (item.arrType === 'lidarr' || item.mediaType === 'album') continue;

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
                movieFileId: item.movieFileId,
                episodeId: null,
                episodeFileId: null,
                seasonNumber: null,
                episodeNumber: null,
                filePath: item.filePath,
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
                    movieFileId: null,
                    episodeId: episode.episodeId || null,
                    episodeFileId: episode.episodeFileId,
                    seasonNumber: episode.seasonNumber ?? null,
                    episodeNumber: episode.episodeNumber ?? null,
                    filePath: episode.filePath,
                    libraryName: item.libraryName || null,
                    thumbUrl: item.thumbUrl || null,
                    episodeTitle: episode.title || null,
                });
            }
        }
    }
    return out;
};

const cacheKeyFor = (candidate) => candidate.key;

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
} = {}) => {
    let scanning = false;
    let lastScan = null;
    let integrityTimer = null;

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
            tools,
            pathMapCount: maps.length,
            ready: tools.ready,
        };
    };

    const validateCandidate = async (config, candidate) => {
        const maps = Array.isArray(config.qcIntegrityPathMaps) ? config.qcIntegrityPathMaps : [];
        const localPath = mapArrPath(candidate.filePath, maps);
        if (!localPath) {
            return { ...candidate, localPath: null, ok: false, reason: 'missing_path' };
        }
        const st = await readStat(localPath);
        if (!st.ok) {
            return { ...candidate, localPath, ok: false, reason: st.reason || 'missing_file', detail: st.detail || null };
        }

        const requireAudio = config.qcIntegrityRequireAudio !== false;
        const timeoutMs = Math.max(1000, Number(config.qcIntegrityDecodeTimeoutMs) || DEFAULT_TIMEOUT_MS);
        const windowSec = Math.max(1, Number(config.qcIntegrityDecodeWindowSec) || DEFAULT_WINDOW_SEC);

        const probe = await probeMediaFile(localPath, { requireAudio, timeoutMs, execImpl });
        if (!probe.ok) {
            return {
                ...candidate,
                localPath,
                size: st.size,
                mtimeMs: st.mtimeMs,
                ok: false,
                reason: probe.reason,
                detail: probe.detail || null,
                durationSec: probe.durationSec,
            };
        }

        const decode = await quickDecodeFile(localPath, {
            durationSec: probe.durationSec,
            windowSec,
            timeoutMs,
            execImpl,
        });
        if (!decode.ok) {
            return {
                ...candidate,
                localPath,
                size: st.size,
                mtimeMs: st.mtimeMs,
                ok: false,
                reason: decode.reason,
                detail: decode.detail || null,
                durationSec: probe.durationSec,
                windowId: decode.windowId || null,
            };
        }

        return {
            ...candidate,
            localPath,
            size: st.size,
            mtimeMs: st.mtimeMs,
            ok: true,
            reason: null,
            durationSec: probe.durationSec,
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

        try {
            if (finding.arrType === 'radarr') {
                if (!finding.movieFileId) return { success: false, reason: 'Missing movieFileId' };
                await request(instance, `/api/v3/moviefile/${encodeURIComponent(finding.movieFileId)}`, { method: 'DELETE' });
                await request(instance, '/api/v3/command', {
                    method: 'POST',
                    body: { name: 'MoviesSearch', movieIds: [finding.entityId] },
                });
            } else {
                if (!finding.episodeFileId) return { success: false, reason: 'Missing episodeFileId' };
                await request(instance, `/api/v3/episodefile/${encodeURIComponent(finding.episodeFileId)}`, { method: 'DELETE' });
                const command = finding.episodeId
                    ? { name: 'EpisodeSearch', episodeIds: [finding.episodeId] }
                    : { name: 'SeriesSearch', seriesId: finding.entityId };
                await request(instance, '/api/v3/command', { method: 'POST', body: command });
            }

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

    const scanIntegrity = async (config, {
        dryRun = true,
        limit = null,
        replaceFindings = false,
        force = false,
    } = {}) => {
        if (scanning) {
            return { ran: false, reason: 'Scan already in progress', findings: [], scanned: 0, skipped: 0 };
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

        scanning = true;
        try {
            const index = await loadIndex();
            const prefs = await loadPrefs();
            const cache = await loadCache();
            const cacheEntries = cache?.entries && typeof cache.entries === 'object' ? cache.entries : {};
            const candidates = collectIntegrityCandidates(index.items || []);
            const maxPerCycle = Math.max(
                1,
                Number(limit ?? config.qcIntegrityMaxPerCycle ?? DEFAULT_MAX_PER_CYCLE) || DEFAULT_MAX_PER_CYCLE,
            );

            const findings = [];
            let scanned = 0;
            let skipped = 0;
            let passed = 0;
            const nextCache = { ...cacheEntries };

            for (const candidate of candidates) {
                if (scanned >= maxPerCycle) break;
                const mapped = mapArrPath(
                    candidate.filePath,
                    Array.isArray(config.qcIntegrityPathMaps) ? config.qcIntegrityPathMaps : [],
                );
                const st = mapped ? await readStat(mapped) : { ok: false };
                const key = cacheKeyFor(candidate);
                const prior = nextCache[key];
                if (
                    !force
                    && st.ok
                    && prior?.ok
                    && Number(prior.size) === Number(st.size)
                    && Number(prior.mtimeMs) === Number(st.mtimeMs)
                ) {
                    skipped += 1;
                    continue;
                }

                scanned += 1;
                const result = await validateCandidate(config, candidate);
                if (result.ok) {
                    passed += 1;
                    nextCache[key] = {
                        ok: true,
                        size: result.size,
                        mtimeMs: result.mtimeMs,
                        checkedAt: new Date().toISOString(),
                    };
                    continue;
                }

                delete nextCache[key];
                findings.push(result);

                if (replaceFindings && !dryRun) {
                    await replaceCorrupt(config, result, { dryRun: false });
                }
            }

            await saveCache({
                updatedAt: new Date().toISOString(),
                entries: nextCache,
            });

            lastScan = {
                at: new Date().toISOString(),
                dryRun: !!dryRun,
                scanned,
                skipped,
                passed,
                findingCount: findings.length,
                findings: findings.slice(0, 200),
            };

            await appendAudit({
                action: 'qc_integrity_scan',
                success: true,
                dryRun: !!dryRun,
                scanned,
                skipped,
                passed,
                findingCount: findings.length,
            });

            prefs.integrityLastScan = {
                at: lastScan.at,
                scanned,
                skipped,
                passed,
                findingCount: findings.length,
            };
            await savePrefs(prefs);

            return {
                ran: true,
                dryRun: !!dryRun,
                setup,
                scanned,
                skipped,
                passed,
                findingCount: findings.length,
                findings,
                candidates: candidates.length,
            };
        } finally {
            scanning = false;
        }
    };

    const getStatus = async (config) => {
        const setup = await getSetup(config);
        const prefs = await loadPrefs();
        return {
            scanning,
            setup,
            lastScan: lastScan || prefs.integrityLastScan || null,
        };
    };

    const startIntegrityJob = (getConfig) => {
        if (integrityTimer) return;
        const run = async () => {
            try {
                const config = await getConfig();
                if (!config.upgraderEnabled || !config.qcIntegrityEnabled || !config.qcIntegrityAutomationEnabled) {
                    return;
                }
                const result = await scanIntegrity(config, {
                    dryRun: false,
                    replaceFindings: true,
                });
                if (result.findingCount) {
                    log(`[upgrader] integrity found ${result.findingCount} bad file(s); replace attempted`);
                }
            } catch (error) {
                log(`[upgrader] integrity job failed: ${error.message}`);
            }
        };
        setTimeout(() => { void run(); }, 3 * 60 * 1000);
        integrityTimer = setInterval(run, 6 * 60 * 60 * 1000);
    };

    return {
        get scanning() { return scanning; },
        getSetup,
        getStatus,
        scanIntegrity,
        replaceCorrupt,
        validateCandidate,
        collectIntegrityCandidates,
        startIntegrityJob,
        mapArrPath,
        scheduleDecodeWindows,
    };
};
