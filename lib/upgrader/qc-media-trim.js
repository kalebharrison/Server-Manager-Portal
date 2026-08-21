/**
 * Trimarr-compatible MKV track strip for Integrity.
 * Keep-rules are configurable (Settings → keep languages + native).
 * Defaults: English keep-list, commentary off, lower-channel dupes off,
 * wipe container title, 50% size guard, audio fallbacks.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { durationMatchesExpected } from './qc-integrity-runtime.js';

export const MIN_OUTPUT_RATIO = 0.5;
/** Portable default — operators add more codes in Settings (e.g. eng,ara or eng,jpn). */
export const DEFAULT_TRIM_LANGUAGES = ['eng'];
/** Written beside the source during remux; orphans left if the container restarts mid-job. */
export const PORTAL_TRIM_TMP_SUFFIX = '.portal-trim.tmp.mkv';
const COMMENTARY_RE = /commentary/i;
/** Healthy large files on spun-down array disks; corrupt MKVs hang mkvmerge forever. */
export const PROBE_TIMEOUT_MS = 180_000;
const PREFLIGHT_TIMEOUT_MS = 45_000;
/** Large TrueHD/Atmos remuxes can exceed 1h on spun-down arrays — allow up to 6h. */
const REMUX_TIMEOUT_MS = 21_600_000;
/** Hard cap — parallel remuxes thrash shared storage I/O. */
export const MAX_TRIM_REMUX_CONCURRENCY = 2;
const DEFAULT_TRIM_REMUX_CONCURRENCY = 1;

let remuxLimit = DEFAULT_TRIM_REMUX_CONCURRENCY;
let remuxInFlight = 0;
const remuxWaiters = [];

export const normalizeTrimRemuxConcurrency = (value) => Math.max(
    1,
    Math.min(MAX_TRIM_REMUX_CONCURRENCY, Number(value) || DEFAULT_TRIM_REMUX_CONCURRENCY),
);

/** Process-wide remux slot limit (shared by scan, recheck, import). */
export const configureTrimRemuxConcurrency = (value) => {
    remuxLimit = normalizeTrimRemuxConcurrency(value);
};

const acquireRemuxSlot = () => new Promise((resolve) => {
    const tryAcquire = () => {
        if (remuxInFlight < remuxLimit) {
            remuxInFlight += 1;
            resolve();
            return true;
        }
        return false;
    };
    // Register waiter before retry so release cannot race past an empty queue.
    if (!tryAcquire()) {
        remuxWaiters.push(tryAcquire);
        if (tryAcquire()) {
            const idx = remuxWaiters.indexOf(tryAcquire);
            if (idx >= 0) remuxWaiters.splice(idx, 1);
        }
    }
});

const releaseRemuxSlot = () => {
    remuxInFlight = Math.max(0, remuxInFlight - 1);
    while (remuxWaiters.length && remuxInFlight < remuxLimit) {
        const next = remuxWaiters.shift();
        if (next?.()) break;
    }
};

/** Test helper — reset remux gate between unit tests. */
export const resetTrimRemuxGateForTests = () => {
    remuxLimit = DEFAULT_TRIM_REMUX_CONCURRENCY;
    remuxInFlight = 0;
    remuxWaiters.length = 0;
};

/** ffprobe Matroska warnings that mean mkvmerge will hang or fail. */
const MKV_CORRUPT_RE = [
    /invalid as first byte of an EBML number/i,
    /exceeds containing master element/i,
    /Incomplete file\?/i,
    /File ended prematurely/i,
    /EBML header parsing failed/i,
];


const ISO_639_1_TO_2 = {
    af: 'afr', sq: 'alb', ar: 'ara', hy: 'arm', az: 'aze', be: 'bel', bs: 'bos',
    bg: 'bul', ca: 'cat', zh: 'chi', hr: 'hrv', cs: 'cze', da: 'dan', nl: 'dut',
    en: 'eng', et: 'est', fi: 'fin', fr: 'fre', gl: 'glg', ka: 'geo', de: 'ger',
    el: 'gre', he: 'heb', hi: 'hin', hu: 'hun', is: 'ice', id: 'ind', it: 'ita',
    ja: 'jpn', kn: 'kan', kk: 'kaz', ko: 'kor', lv: 'lav', lt: 'lit', mk: 'mac',
    ms: 'may', ml: 'mal', mt: 'mlt', nb: 'nob', fa: 'per', pl: 'pol', pt: 'por',
    ro: 'rum', ru: 'rus', sr: 'srp', sk: 'slo', sl: 'slv', es: 'spa', sw: 'swa',
    sv: 'swe', tl: 'tgl', ta: 'tam', te: 'tel', th: 'tha', tr: 'tur', uk: 'ukr',
    ur: 'urd', vi: 'vie', cy: 'wel',
};

const ISO_639_2_T_TO_B = {
    sqi: 'alb', hye: 'arm', eus: 'baq', mya: 'bur', zho: 'chi', ces: 'cze',
    nld: 'dut', fra: 'fre', kat: 'geo', deu: 'ger', ell: 'gre', isl: 'ice',
    mri: 'mao', msa: 'may', mkd: 'mac', fas: 'per', ron: 'rum', slk: 'slo',
    cym: 'wel', bod: 'tib',
};

/** Radarr/Sonarr Language.name → ISO 639-2/B (mkvmerge). */
const LANGUAGE_NAME_TO_B = {
    english: 'eng', japanese: 'jpn', arabic: 'ara', french: 'fre', german: 'ger',
    spanish: 'spa', korean: 'kor', chinese: 'chi', mandarin: 'chi', italian: 'ita',
    portuguese: 'por', russian: 'rus', hindi: 'hin', thai: 'tha', vietnamese: 'vie',
    turkish: 'tur', polish: 'pol', dutch: 'dut', swedish: 'swe', norwegian: 'nor',
    danish: 'dan', finnish: 'fin', icelandic: 'ice', hungarian: 'hun', czech: 'cze',
    greek: 'gre', hebrew: 'heb', indonesian: 'ind', malay: 'may', tamil: 'tam',
    telugu: 'tel', ukrainian: 'ukr', romanian: 'rum', catalan: 'cat', tagalog: 'tgl',
    filipino: 'tgl', unknown: null,
};

export const normalizeLanguageCode = (raw) => {
    const token = String(raw || '').trim().toLowerCase().split(/[-_]/)[0];
    if (!token || token === 'und') return null;
    if (token.length === 2) return ISO_639_1_TO_2[token] || null;
    if (token.length === 3) return ISO_639_2_T_TO_B[token] || token;
    return null;
};

export const parseTrimLanguages = (value, fallback = DEFAULT_TRIM_LANGUAGES) => {
    const fromList = Array.isArray(value)
        ? value
        : String(value || '').split(/[,\s]+/);
    const codes = fromList.map((entry) => normalizeLanguageCode(entry)).filter(Boolean);
    return codes.length ? [...new Set(codes)] : [...fallback];
};

export const trimProfileKey = (cfg = {}) => {
    const languages = parseTrimLanguages(cfg.languages, DEFAULT_TRIM_LANGUAGES).slice().sort();
    const native = normalizeLanguageCode(cfg.nativeLanguage) || '-';
    return [
        languages.join(',') || DEFAULT_TRIM_LANGUAGES.join(','),
        native,
        cfg.stripCommentary === false ? 'c0' : 'c1',
        cfg.stripLowerChannels === false ? 'l0' : 'l1',
        cfg.deleteMetadataTitle === false ? 't0' : 't1',
        cfg.keepUndefinedAudio ? 'u1' : 'u0',
    ].join('|');
};

const languageFromValue = (raw) => {
    if (raw == null || raw === '') return null;
    if (typeof raw === 'object') {
        const named = languageFromValue(raw.name || raw.value || raw.language || raw.languageCode);
        if (named) return named;
        if (typeof raw.id === 'string' && !/^\d+$/.test(raw.id)) return languageFromValue(raw.id);
        return null;
    }
    const token = String(raw).trim().toLowerCase();
    if (Object.prototype.hasOwnProperty.call(LANGUAGE_NAME_TO_B, token)) {
        return LANGUAGE_NAME_TO_B[token];
    }
    return normalizeLanguageCode(token);
};

export const resolveNativeLanguage = (candidate = {}) => (
    languageFromValue(candidate.originalLanguage)
    || languageFromValue(candidate.originalLanguageCode)
    || languageFromValue(candidate.original_language)
    || languageFromValue(candidate.seriesOriginalLanguage)
    || null
);

const isCommentary = (name) => COMMENTARY_RE.test(String(name || ''));

export const parseMkvTracks = (info = {}) => {
    const rows = Array.isArray(info.tracks) ? info.tracks : [];
    return rows.map((raw) => {
        const props = raw?.properties && typeof raw.properties === 'object' ? raw.properties : {};
        const lang = normalizeLanguageCode(props.language_ietf || props.language);
        const channels = Number(props.audio_channels);
        return {
            id: Number(raw.id),
            type: String(raw.type || ''),
            language: lang,
            name: props.track_name || props.name || null,
            channels: Number.isFinite(channels) && channels > 0 ? channels : null,
            defaultTrack: props.default_track === true,
        };
    }).filter((track) => Number.isFinite(track.id));
};

const classifyByLanguage = (tracks, languages, keepUndefinedAudio) => {
    const result = {
        audioKeep: [],
        audioDrop: [],
        subKeep: [],
        subDrop: [],
        audioFallbackFired: false,
        subFallbackFired: false,
    };
    for (const track of tracks) {
        if (track.type === 'audio') {
            const keep = languages.includes(track.language)
                || (track.language == null && keepUndefinedAudio);
            (keep ? result.audioKeep : result.audioDrop).push(track.id);
        } else if (track.type === 'subtitles') {
            const keep = languages.includes(track.language);
            (keep ? result.subKeep : result.subDrop).push(track.id);
        }
    }
    return result;
};

const applyAudioFallbacks = (result, tracks) => {
    const commentaryIds = new Set(
        tracks.filter((track) => track.type === 'audio' && isCommentary(track.name)).map((track) => track.id),
    );
    const keptAllCommentary = result.audioKeep.length > 0
        && result.audioKeep.every((id) => commentaryIds.has(id));
    if ((result.audioDrop.length && !result.audioKeep.length) || (result.audioDrop.length && keptAllCommentary)) {
        result.audioKeep = tracks.filter((track) => track.type === 'audio').map((track) => track.id);
        result.audioDrop = [];
        result.audioFallbackFired = true;
    }
};

const applySubtitleFallback = (result, tracks) => {
    if (result.subDrop.length && !result.subKeep.length) {
        result.subKeep = tracks.filter((track) => track.type === 'subtitles').map((track) => track.id);
        result.subDrop = [];
        result.subFallbackFired = true;
    }
};

const stripCommentary = (result, tracks) => {
    if (result.audioFallbackFired || !result.audioKeep.length) {
        /* skip audio commentary strip */
    } else {
        const drop = tracks
            .filter((track) => track.type === 'audio' && result.audioKeep.includes(track.id) && isCommentary(track.name))
            .map((track) => track.id);
        const remaining = result.audioKeep.filter((id) => !drop.includes(id));
        if (drop.length && remaining.length) {
            result.audioKeep = remaining;
            result.audioDrop.push(...drop);
        }
    }
    if (result.subFallbackFired || !result.subKeep.length) return;
    const subDrop = tracks
        .filter((track) => track.type === 'subtitles' && result.subKeep.includes(track.id) && isCommentary(track.name))
        .map((track) => track.id);
    if (!subDrop.length) return;
    result.subKeep = result.subKeep.filter((id) => !subDrop.includes(id));
    result.subDrop.push(...subDrop);
};

const stripLowerChannels = (result, tracks) => {
    if (result.audioFallbackFired || !result.audioKeep.length) return;
    const keepSet = new Set(result.audioKeep);
    const surviving = tracks.filter((track) => track.type === 'audio' && keepSet.has(track.id));
    const groups = new Map();
    for (const track of surviving) {
        const key = track.language || '__und__';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(track);
    }
    const drop = [];
    for (const group of groups.values()) {
        const nonCommentary = group.filter((track) => !isCommentary(track.name));
        const known = nonCommentary.map((track) => track.channels).filter((ch) => ch != null);
        if (!known.length) continue;
        const maxCh = Math.max(...known);
        if (!known.some((ch) => ch < maxCh)) continue;
        for (const track of nonCommentary) {
            if (track.channels != null && track.channels < maxCh) drop.push(track.id);
        }
    }
    if (!drop.length) return;
    result.audioKeep = result.audioKeep.filter((id) => !drop.includes(id));
    result.audioDrop.push(...drop);
};

/**
 * Decide which tracks to keep. Returns null argv when the file is already clean.
 */
export const planMkvTrim = (info, {
    languages = DEFAULT_TRIM_LANGUAGES,
    nativeLanguage = null,
    stripCommentary: doStripCommentary = true,
    stripLowerChannels: doStripLower = true,
    deleteMetadataTitle = true,
    keepUndefinedAudio = false,
} = {}) => {
    const tracks = parseMkvTracks(info);
    const keepLangs = parseTrimLanguages(
        [...languages, nativeLanguage].filter(Boolean),
        DEFAULT_TRIM_LANGUAGES,
    );
    const result = classifyByLanguage(tracks, keepLangs, keepUndefinedAudio);
    applyAudioFallbacks(result, tracks);
    applySubtitleFallback(result, tracks);
    if (doStripCommentary) stripCommentary(result, tracks);
    if (doStripLower) stripLowerChannels(result, tracks);

    const containerTitle = String(info?.container?.properties?.title || '');
    const needsAudioChange = result.audioDrop.length > 0;
    const needsSubChange = result.subDrop.length > 0;
    const needsMetadataChange = !!deleteMetadataTitle && !!containerTitle;

    return {
        languages: keepLangs,
        tracks,
        ...result,
        containerTitle,
        needsAudioChange,
        needsSubChange,
        needsMetadataChange,
        alreadyClean: !needsAudioChange && !needsSubChange && !needsMetadataChange,
    };
};

export const labelTrimTrack = (track) => {
    if (!track || !Number.isFinite(Number(track.id))) return '';
    const parts = [String(track.id)];
    if (track.language) parts.push(track.language);
    if (track.name) parts.push(String(track.name).replace(/\s+/g, ' ').trim());
    if (track.channels) parts.push(`${track.channels}ch`);
    return parts.join(' ');
};

export const describeTrimPlan = (plan) => {
    const tracks = Array.isArray(plan?.tracks) ? plan.tracks : [];
    const byId = new Map(tracks.map((track) => [track.id, track]));
    const labelsFor = (ids) => (Array.isArray(ids) ? ids : [])
        .map((id) => labelTrimTrack(byId.get(id) || { id }))
        .filter(Boolean);
    const audioKeep = labelsFor(plan?.audioKeep);
    const audioDrop = labelsFor(plan?.audioDrop);
    const subKeep = labelsFor(plan?.subKeep);
    const subDrop = labelsFor(plan?.subDrop);
    const detail = !plan || (plan.alreadyClean && !plan.forceContainerRepair)
        ? 'already clean'
        : plan.forceContainerRepair
            ? 'EBML repair remux (all tracks)'
            : `keep audio [${audioKeep.join('; ') || 'none'}] · drop audio [${audioDrop.join('; ') || 'none'}]`
                + ` · keep subs [${subKeep.join('; ') || 'none'}] · drop subs [${subDrop.join('; ') || 'none'}]`;
    return { detail, audioKeep, audioDrop, subKeep, subDrop };
};

export const buildMkvmergeArgs = (inputPath, outputPath, plan) => {
    if (!plan) return null;
    // EBML-damaged but track-clean: rewrite the container with all tracks (Trimarr repair path).
    if (plan.forceContainerRepair && !plan.needsAudioChange && !plan.needsSubChange && !plan.needsMetadataChange) {
        return ['-o', outputPath, inputPath];
    }
    if (plan.alreadyClean) return null;
    const args = ['-o', outputPath];
    if (plan.needsMetadataChange) args.push('--title', '');
    if (plan.needsAudioChange && plan.audioKeep.length) {
        args.push('--audio-tracks', plan.audioKeep.join(','));
    }
    if (plan.needsSubChange && plan.subKeep.length) {
        args.push('--subtitle-tracks', plan.subKeep.join(','));
    } else if (plan.needsSubChange && !plan.subKeep.length) {
        args.push('--no-subtitles');
    }
    args.push(inputPath);
    return args;
};

export const checkTrimOutputSize = (inputSize, outputSize) => {
    const inBytes = Number(inputSize) || 0;
    const outBytes = Number(outputSize) || 0;
    if (outBytes <= 0) return { ok: false, reason: 'trim_empty_output' };
    const minAcceptable = Math.max(1, Math.floor(inBytes * MIN_OUTPUT_RATIO));
    if (outBytes < minAcceptable) {
        return {
            ok: false,
            reason: 'trim_size_guard',
            detail: `output ${outBytes} B vs ${inBytes} B input`,
        };
    }
    return { ok: true };
};

export const isTrimVideoPath = (filePath, mediaKind = 'video') => {
    if (String(mediaKind || 'video').toLowerCase() === 'audio') return false;
    return /\.mkv$/i.test(String(filePath || ''));
};

export const isPortalTrimTmpName = (name) => String(name || '').endsWith(PORTAL_TRIM_TMP_SUFFIX);

/** Sibling temp path used while mkvmerge rewrites `filePath`. */
export const portalTrimTmpPathFor = (filePath) => {
    const localPath = String(filePath || '');
    return path.posix.join(
        path.posix.dirname(localPath),
        `${path.posix.basename(localPath)}${PORTAL_TRIM_TMP_SUFFIX}`,
    );
};

/**
 * Delete orphaned `*.portal-trim.tmp.mkv` under media roots (boot / restart leftovers).
 * Safe when no remux is in flight for those paths.
 */
export const cleanupPortalTrimTmps = async ({
    roots = [],
    log = () => {},
    readdirImpl = fs.readdir,
    unlinkImpl = fs.unlink,
    statImpl = fs.stat,
} = {}) => {
    const uniqueRoots = [...new Set(
        (Array.isArray(roots) ? roots : [])
            .map((root) => String(root || '').replace(/\/+$/, ''))
            .filter(Boolean),
    )];
    let removed = 0;
    const errors = [];

    const walk = async (dir) => {
        let entries;
        try {
            entries = await readdirImpl(dir, { withFileTypes: true });
        } catch (error) {
            errors.push({ path: dir, error: error.message });
            return;
        }
        for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                await walk(full);
                continue;
            }
            if (!entry.isFile() || !isPortalTrimTmpName(entry.name)) continue;
            try {
                await unlinkImpl(full);
                removed += 1;
                log(`[upgrader] removed orphan trim tmp ${full}`);
            } catch (error) {
                errors.push({ path: full, error: error.message });
            }
        }
    };

    for (const root of uniqueRoots) {
        try {
            const st = await statImpl(root);
            if (!st?.isDirectory?.()) continue;
        } catch {
            continue;
        }
        await walk(root);
    }

    return { removed, errors, roots: uniqueRoots };
};

/** True when ffprobe stderr shows a broken Matroska header/structure. */
export const isCorruptMatroskaProbe = (stderr = '') => {
    const text = String(stderr || '');
    if (!text.trim()) return false;
    if (MKV_CORRUPT_RE.some((re) => re.test(text))) return true;
    // Several "Duplicate element" hits usually mean a glued/corrupt container.
    const dupes = text.match(/Duplicate element/gi);
    return !!(dupes && dupes.length >= 2);
};

const runCommand = (bin, args, { timeoutMs, execImpl } = {}) => {
    if (typeof execImpl === 'function') return execImpl(bin, args, { timeoutMs });
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
        }, Math.max(1000, Number(timeoutMs) || PROBE_TIMEOUT_MS));
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

/**
 * Fast ffprobe pass — notes EBML damage (Trimarr still remuxes) and only fails on timeout.
 */
export const preflightMkvContainer = async (filePath, { execImpl } = {}) => {
    const result = await runCommand('ffprobe', [
        '-v', 'error',
        '-show_entries', 'format=format_name:stream=index,codec_type',
        '-of', 'json',
        filePath,
    ], {
        timeoutMs: PREFLIGHT_TIMEOUT_MS,
        execImpl,
    });
    const stderr = String(result?.stderr || '');
    if (result?.timedOut) {
        return {
            ok: false,
            reason: 'trim_probe_timeout',
            detail: `ffprobe timed out after ${PREFLIGHT_TIMEOUT_MS}ms reading container — use Replace if Recheck keeps timing out.`,
        };
    }
    const ebmlDamage = isCorruptMatroskaProbe(stderr);
    return {
        ok: true,
        stderr,
        ebmlDamage,
        detail: ebmlDamage
            ? 'EBML/Matroska structure warnings from ffprobe — noting damage and continuing with mkvmerge.'
            : null,
    };
};

/** Output duration in seconds (ffprobe), or null when unavailable. */
export const probeFileDurationSec = async (filePath, { execImpl } = {}) => {
    const result = await runCommand('ffprobe', [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        filePath,
    ], {
        timeoutMs: PREFLIGHT_TIMEOUT_MS,
        execImpl,
    });
    const sec = Number(String(result?.stdout || '').trim());
    return Number.isFinite(sec) && sec > 0 ? sec : null;
};

/** mkvmerge exit 0 = clean; exit 1 = warnings (Trimarr accepts). Exit ≥2 is failure. */
export const mkvmergeCommandOk = (result) => {
    if (!result || result.timedOut) return false;
    if (result.ok) return true;
    const code = Number(result.code);
    return Number.isFinite(code) && code === 1;
};

export const probeMkvInfo = async (filePath, { execImpl } = {}) => {
    const preflight = await preflightMkvContainer(filePath, { execImpl });
    if (!preflight.ok) return preflight;

    const result = await runCommand('mkvmerge', ['-J', filePath], {
        timeoutMs: PROBE_TIMEOUT_MS,
        execImpl,
    });
    if (!result?.ok) {
        const timedOut = !!result?.timedOut;
        return {
            ok: false,
            reason: timedOut ? 'trim_probe_timeout' : 'trim_probe_failed',
            detail: timedOut
                ? `mkvmerge timed out after ${PROBE_TIMEOUT_MS}ms reading tracks (often a damaged MKV). Use Replace if it keeps failing.`
                : String(result?.stderr || '').slice(0, 400),
            ebmlDamage: !!preflight.ebmlDamage,
        };
    }
    try {
        return {
            ok: true,
            info: JSON.parse(result.stdout || '{}'),
            ebmlDamage: !!preflight.ebmlDamage,
            detail: preflight.detail || null,
        };
    } catch (error) {
        return { ok: false, reason: 'trim_probe_invalid', detail: error.message, ebmlDamage: !!preflight.ebmlDamage };
    }
};

export const trimMkvFile = async (filePath, {
    execImpl = null,
    dryRun = true,
    languages = DEFAULT_TRIM_LANGUAGES,
    nativeLanguage = null,
    stripCommentary: doStripCommentary = true,
    stripLowerChannels: doStripLower = true,
    deleteMetadataTitle = true,
    keepUndefinedAudio = false,
    remuxConcurrency = DEFAULT_TRIM_REMUX_CONCURRENCY,
    remuxTimeoutMs = REMUX_TIMEOUT_MS,
    expectedRuntimeSec = null,
    mediaKind = 'video',
    mediaType = null,
    log = () => {},
} = {}) => {
    const localPath = String(filePath || '');
    if (!/\.mkv$/i.test(localPath)) {
        return { ok: true, skipped: true, reason: 'trim_not_mkv' };
    }

    const probe = await probeMkvInfo(localPath, { execImpl });
    if (!probe.ok) return { ok: false, ...probe };
    const ebmlDamage = !!probe.ebmlDamage;
    if (ebmlDamage) {
        log(`[upgrader] trim EBML damage noted for ${localPath} — continuing with mkvmerge`);
    }

    let plan = planMkvTrim(probe.info, {
        languages,
        nativeLanguage,
        stripCommentary: doStripCommentary,
        stripLowerChannels: doStripLower,
        deleteMetadataTitle,
        keepUndefinedAudio,
    });
    // Track-clean + EBML damage still needs a container rewrite (Trimarr path).
    if (plan.alreadyClean && ebmlDamage) {
        plan = {
            ...plan,
            alreadyClean: false,
            forceContainerRepair: true,
        };
    }
    if (plan.alreadyClean) {
        return { ok: true, skipped: true, reason: 'trim_already_clean', plan, ebmlDamage };
    }

    if (dryRun) {
        const described = describeTrimPlan(plan);
        const detail = ebmlDamage
            ? [
                'EBML damage noted — would remux to repair container.',
                described.detail,
            ].filter(Boolean).join(' ')
            : described.detail;
        return {
            ok: true,
            skipped: true,
            dryRun: true,
            reason: 'trim_dry_run',
            detail,
            plan,
            ebmlDamage,
            audioKeep: described.audioKeep,
            audioDrop: described.audioDrop,
            subKeep: described.subKeep,
            subDrop: described.subDrop,
        };
    }

    const tmpPath = portalTrimTmpPathFor(localPath);
    const inputStat = await fs.stat(localPath);
    // Drop a leftover tmp from a prior crash/restart before starting mkvmerge.
    await fs.unlink(tmpPath).catch(() => {});
    const args = buildMkvmergeArgs(localPath, tmpPath, plan);
    if (!args) {
        return { ok: true, skipped: true, reason: 'trim_already_clean', plan, ebmlDamage };
    }
    configureTrimRemuxConcurrency(remuxConcurrency);
    await acquireRemuxSlot();
    try {
        const remuxTimeout = Math.max(60_000, Number(remuxTimeoutMs) || REMUX_TIMEOUT_MS);
        const remux = await runCommand('mkvmerge', args, {
            timeoutMs: remuxTimeout,
            execImpl,
        });
        // Trimarr accepts mkvmerge exit 1 (warnings / structure resync).
        if (!mkvmergeCommandOk(remux)) {
            await fs.unlink(tmpPath).catch(() => {});
            return {
                ok: false,
                reason: remux?.timedOut ? 'trim_remux_timeout' : 'trim_remux_failed',
                detail: remux?.timedOut
                    ? `Timed out after ${remuxTimeout}ms`
                    : String(remux?.stderr || remux?.stdout || '').slice(0, 500),
                plan,
                ebmlDamage,
            };
        }
        const outStat = await fs.stat(tmpPath).catch(() => null);
        const sizeCheck = checkTrimOutputSize(inputStat.size, outStat?.size || 0);
        if (!sizeCheck.ok) {
            await fs.unlink(tmpPath).catch(() => {});
            return { ok: false, ...sizeCheck, plan, ebmlDamage };
        }
        const outDurationSec = await probeFileDurationSec(tmpPath, { execImpl });
        const durationCheck = durationMatchesExpected(outDurationSec, expectedRuntimeSec, {
            mediaKind,
            mediaType,
        });
        if (!durationCheck.ok) {
            await fs.unlink(tmpPath).catch(() => {});
            return {
                ok: false,
                reason: 'trim_duration_guard',
                detail: `remux duration ${outDurationSec?.toFixed?.(1) ?? outDurationSec}s vs expected ${durationCheck.expected}s (delta=${durationCheck.delta?.toFixed?.(1) ?? durationCheck.delta}, tol=${durationCheck.tol})`,
                plan,
                ebmlDamage,
                durationSec: outDurationSec,
                expectedRuntimeSec: durationCheck.expected,
            };
        }
        await fs.rename(tmpPath, localPath);
        log(`[upgrader] trim remuxed ${localPath}${ebmlDamage ? ' (EBML repair)' : ''}`);
        return {
            ok: true,
            skipped: false,
            changed: true,
            plan,
            outputSize: outStat.size,
            ebmlDamage,
            durationSec: outDurationSec,
            mkvmergeWarnings: Number(remux?.code) === 1,
        };
    } catch (error) {
        await fs.unlink(tmpPath).catch(() => {});
        return { ok: false, reason: 'trim_replace_failed', detail: error.message, plan, ebmlDamage };
    } finally {
        releaseRemuxSlot();
    }
};

export const resolveTrimConfig = (config = {}, candidate = {}, opts = {}) => {
    const enabled = !!config.qcTrimEnabled;
    // Audit/preview: never remux even when Settings rewrite is live.
    if (opts.forceDryRun === true) {
        return {
            enabled,
            dryRun: true,
            languages: parseTrimLanguages(config.qcTrimLanguages, DEFAULT_TRIM_LANGUAGES),
            nativeLanguage: config.qcTrimKeepNativeAudio === false ? null : resolveNativeLanguage(candidate),
            stripCommentary: config.qcTrimStripCommentary !== false,
            stripLowerChannels: config.qcTrimStripLowerChannels !== false,
            deleteMetadataTitle: config.qcTrimDeleteMetadataTitle !== false,
            keepUndefinedAudio: !!config.qcTrimKeepUndefinedAudio,
            remuxConcurrency: normalizeTrimRemuxConcurrency(config.qcIntegrityTrimConcurrency),
        };
    }
    // Explicit Allow remux (Tier 3) OR legacy Auto-fix + Dry-run off,
    // or when a manual Recheck forces remux of a trim finding.
    const allowRemux = config.qcTrimAllowRemux !== undefined
        ? !!config.qcTrimAllowRemux
        : (!!config.qcIntegrityAutomationEnabled && config.qcTrimDryRun === false);
    const rewrite = enabled && (
        opts.forceRewrite === true
        || allowRemux
    );
    return {
        enabled,
        dryRun: !rewrite,
        languages: parseTrimLanguages(config.qcTrimLanguages, DEFAULT_TRIM_LANGUAGES),
        nativeLanguage: config.qcTrimKeepNativeAudio === false ? null : resolveNativeLanguage(candidate),
        stripCommentary: config.qcTrimStripCommentary !== false,
        stripLowerChannels: config.qcTrimStripLowerChannels !== false,
        deleteMetadataTitle: config.qcTrimDeleteMetadataTitle !== false,
        keepUndefinedAudio: !!config.qcTrimKeepUndefinedAudio,
        remuxConcurrency: normalizeTrimRemuxConcurrency(config.qcIntegrityTrimConcurrency),
    };
};
