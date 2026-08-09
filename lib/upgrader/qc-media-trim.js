/**
 * Trimarr-compatible MKV track strip for Integrity.
 * Keep rules match live unraid01 trimarr: eng+ara+native, commentary off,
 * lower-channel dupes off, wipe container title, 50% size guard, audio fallbacks.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

export const MIN_OUTPUT_RATIO = 0.5;
export const DEFAULT_TRIM_LANGUAGES = ['eng', 'ara'];
const COMMENTARY_RE = /commentary/i;
const PROBE_TIMEOUT_MS = 60_000;
const REMUX_TIMEOUT_MS = 3_600_000;

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
    const detail = !plan || plan.alreadyClean
        ? 'already clean'
        : `keep audio [${audioKeep.join('; ') || 'none'}] · drop audio [${audioDrop.join('; ') || 'none'}]`
            + ` · keep subs [${subKeep.join('; ') || 'none'}] · drop subs [${subDrop.join('; ') || 'none'}]`;
    return { detail, audioKeep, audioDrop, subKeep, subDrop };
};

export const buildMkvmergeArgs = (inputPath, outputPath, plan) => {
    if (!plan || plan.alreadyClean) return null;
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

export const probeMkvInfo = async (filePath, { execImpl } = {}) => {
    const result = await runCommand('mkvmerge', ['-J', filePath], {
        timeoutMs: PROBE_TIMEOUT_MS,
        execImpl,
    });
    if (!result?.ok) {
        return {
            ok: false,
            reason: result?.timedOut ? 'trim_probe_timeout' : 'trim_probe_failed',
            detail: String(result?.stderr || '').slice(0, 400),
        };
    }
    try {
        return { ok: true, info: JSON.parse(result.stdout || '{}') };
    } catch (error) {
        return { ok: false, reason: 'trim_probe_invalid', detail: error.message };
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
    log = () => {},
} = {}) => {
    const localPath = String(filePath || '');
    if (!/\.mkv$/i.test(localPath)) {
        return { ok: true, skipped: true, reason: 'trim_not_mkv' };
    }

    const probe = await probeMkvInfo(localPath, { execImpl });
    if (!probe.ok) return { ok: false, ...probe };

    const plan = planMkvTrim(probe.info, {
        languages,
        nativeLanguage,
        stripCommentary: doStripCommentary,
        stripLowerChannels: doStripLower,
        deleteMetadataTitle,
        keepUndefinedAudio,
    });
    if (plan.alreadyClean) {
        return { ok: true, skipped: true, reason: 'trim_already_clean', plan };
    }

    if (dryRun) {
        const described = describeTrimPlan(plan);
        return {
            ok: true,
            skipped: true,
            dryRun: true,
            reason: 'trim_dry_run',
            detail: described.detail,
            plan,
            ...described,
        };
    }

    const dir = path.posix.dirname(localPath);
    const tmpPath = path.posix.join(dir, `${path.posix.basename(localPath)}.portal-trim.tmp.mkv`);
    const inputStat = await fs.stat(localPath);
    const args = buildMkvmergeArgs(localPath, tmpPath, plan);
    try {
        const remux = await runCommand('mkvmerge', args, {
            timeoutMs: REMUX_TIMEOUT_MS,
            execImpl,
        });
        if (!remux?.ok) {
            await fs.unlink(tmpPath).catch(() => {});
            return {
                ok: false,
                reason: remux?.timedOut ? 'trim_remux_timeout' : 'trim_remux_failed',
                detail: String(remux?.stderr || remux?.stdout || '').slice(0, 500),
                plan,
            };
        }
        const outStat = await fs.stat(tmpPath).catch(() => null);
        const sizeCheck = checkTrimOutputSize(inputStat.size, outStat?.size || 0);
        if (!sizeCheck.ok) {
            await fs.unlink(tmpPath).catch(() => {});
            return { ok: false, ...sizeCheck, plan };
        }
        await fs.rename(tmpPath, localPath);
        log(`[upgrader] trim remuxed ${localPath}`);
        return { ok: true, skipped: false, changed: true, plan, outputSize: outStat.size };
    } catch (error) {
        await fs.unlink(tmpPath).catch(() => {});
        return { ok: false, reason: 'trim_replace_failed', detail: error.message, plan };
    }
};

export const resolveTrimConfig = (config = {}, candidate = {}) => {
    const enabled = !!config.qcTrimEnabled;
    // Default dry-run. Rewrite only with Integrity auto-fix AND dry-run explicitly off.
    const rewrite = enabled && !!config.qcIntegrityAutomationEnabled && config.qcTrimDryRun === false;
    return {
        enabled,
        dryRun: !rewrite,
        languages: parseTrimLanguages(config.qcTrimLanguages, DEFAULT_TRIM_LANGUAGES),
        nativeLanguage: config.qcTrimKeepNativeAudio === false ? null : resolveNativeLanguage(candidate),
        stripCommentary: config.qcTrimStripCommentary !== false,
        stripLowerChannels: config.qcTrimStripLowerChannels !== false,
        deleteMetadataTitle: config.qcTrimDeleteMetadataTitle !== false,
        keepUndefinedAudio: !!config.qcTrimKeepUndefinedAudio,
    };
};
