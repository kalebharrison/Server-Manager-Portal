/**
 * Trimarr-compatible native language lookup for Integrity trim.
 * Prefer TMDb/TVDB originalLanguage (production language), then Arr,
 * then anime-library last resort. Results should be cached on the
 * integrity row (trimNativeLang + trimNativeSource).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeLanguageCode, resolveNativeLanguage } from './qc-media-trim.js';

const TMDB_API_BASE = 'https://api.themoviedb.org/3';
const TVDB_API_BASE = 'https://api4.thetvdb.com/v4';
const LOOKUP_TIMEOUT_MS = 15_000;

const UNIQUEID_RE = /<uniqueid\b[^>]*\btype=["'](tmdb|imdb|tvdb)["'][^>]*>([^<]+)<\/uniqueid>/gi;
const ID_TAG_RE = /<(tmdbid|imdbid|tvdbid)>([^<]+)<\/\1>/gi;
const EMBEDDED_TMDB_RE = /(?:\[tmdb-(\d+)\]|\{tmdb-(\d+)\}|tmdb-(\d+))/i;
const EMBEDDED_TVDB_RE = /(?:\[tvdb-(\d+)\]|\{tvdb-(\d+)\}|tvdb-(\d+))/i;

const detailMemo = new Map();
let tvdbAuth = { key: '', token: '', expiresAt: 0 };

const looksLikeAnimeLibrary = (candidate = {}) => {
    if (String(candidate.libraryBucket || '').toLowerCase() === 'anime') return true;
    return /\banime\b/i.test(`${candidate.libraryKey || ''} ${candidate.libraryName || ''}`);
};

const isTvCandidate = (candidate = {}) => (
    candidate.mediaType === 'show'
    || candidate.mediaType === 'tv'
    || candidate.arrType === 'sonarr'
);

const tmdbMediaType = (candidate = {}) => (isTvCandidate(candidate) ? 'tv' : 'movie');

const asId = (value) => {
    const text = String(value || '').trim();
    if (!text) return null;
    const digits = text.replace(/^tt/i, '');
    return /^\d+$/.test(digits) ? text : null;
};

export const parseNfoMetadataIds = (xml = '') => {
    const out = { tmdbId: null, tvdbId: null, imdbId: null };
    const raw = String(xml || '');
    for (const match of raw.matchAll(UNIQUEID_RE)) {
        const type = String(match[1] || '').toLowerCase();
        const value = String(match[2] || '').trim();
        if (type === 'tmdb' && !out.tmdbId) out.tmdbId = asId(value);
        if (type === 'tvdb' && !out.tvdbId) out.tvdbId = asId(value);
        if (type === 'imdb' && !out.imdbId) out.imdbId = value.startsWith('tt') ? value : `tt${value}`;
    }
    for (const match of raw.matchAll(ID_TAG_RE)) {
        const tag = String(match[1] || '').toLowerCase();
        const value = String(match[2] || '').trim();
        if (tag === 'tmdbid' && !out.tmdbId) out.tmdbId = asId(value);
        if (tag === 'tvdbid' && !out.tvdbId) out.tvdbId = asId(value);
        if (tag === 'imdbid' && !out.imdbId) out.imdbId = value.startsWith('tt') ? value : `tt${value}`;
    }
    return out;
};

const fileExists = async (target, statImpl) => {
    try {
        const st = typeof statImpl === 'function'
            ? await statImpl(target)
            : await fs.stat(target);
        return !!(st && (st.ok !== false));
    } catch {
        return false;
    }
};

export const discoverNfoPath = async (mkvPath, { statImpl = null } = {}) => {
    const local = String(mkvPath || '');
    if (!local) return null;
    const dir = path.posix.dirname(local);
    const stem = path.posix.basename(local).replace(/\.[^.]+$/, '');
    const direct = [
        path.posix.join(dir, `${stem}.nfo`),
        path.posix.join(dir, 'movie.nfo'),
        path.posix.join(dir, 'tvshow.nfo'),
    ];
    for (const candidate of direct) {
        if (await fileExists(candidate, statImpl)) return candidate;
    }
    let current = dir;
    for (let i = 0; i < 3; i += 1) {
        const parent = path.posix.dirname(current);
        if (!parent || parent === current) break;
        current = parent;
        const tvshow = path.posix.join(current, 'tvshow.nfo');
        if (await fileExists(tvshow, statImpl)) return tvshow;
    }
    return null;
};

const fetchJson = async (url, { fetchImpl = fetch, headers = {}, timeoutMs = LOOKUP_TIMEOUT_MS } = {}) => {
    const controller = typeof AbortSignal?.timeout === 'function'
        ? null
        : new AbortController();
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
        const response = await fetchImpl(url, {
            headers: { Accept: 'application/json', ...headers },
            signal: controller?.signal || AbortSignal.timeout(timeoutMs),
        });
        if (!response?.ok) return null;
        return await response.json();
    } catch {
        return null;
    } finally {
        if (timer) clearTimeout(timer);
    }
};

const fetchTmdbOriginalLanguage = async (tmdbId, mediaType, apiKey, fetchImpl) => {
    const id = Number(tmdbId);
    if (!Number.isFinite(id) || id <= 0 || !apiKey) return null;
    const type = mediaType === 'tv' ? 'tv' : 'movie';
    const memoKey = `tmdb:${type}:${id}`;
    if (detailMemo.has(memoKey)) return detailMemo.get(memoKey);
    const url = `${TMDB_API_BASE}/${type}/${id}?api_key=${encodeURIComponent(apiKey)}`;
    const payload = await fetchJson(url, { fetchImpl });
    const code = normalizeLanguageCode(payload?.original_language);
    detailMemo.set(memoKey, code);
    return code;
};

const fetchTvdbOriginalLanguage = async (tvdbId, apiKey, pin, fetchImpl) => {
    const id = Number(tvdbId);
    if (!Number.isFinite(id) || id <= 0 || !apiKey) return null;
    const memoKey = `tvdb:${id}`;
    if (detailMemo.has(memoKey)) return detailMemo.get(memoKey);
    const identity = `${apiKey}:${pin || ''}`;
    let token = (tvdbAuth.key === identity && tvdbAuth.token && tvdbAuth.expiresAt > Date.now())
        ? tvdbAuth.token
        : null;
    if (!token) {
        try {
            const response = await fetchImpl(`${TVDB_API_BASE}/login`, {
                method: 'POST',
                headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
                body: JSON.stringify({ apikey: apiKey, ...(pin ? { pin } : {}) }),
                signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
            });
            const body = response?.ok ? await response.json() : null;
            token = body?.data?.token || null;
            if (token) {
                tvdbAuth = { key: identity, token, expiresAt: Date.now() + (24 * 60 * 60 * 1000) };
            }
        } catch {
            token = null;
        }
    }
    if (!token) return null;
    const detail = await fetchJson(`${TVDB_API_BASE}/series/${id}/extended`, {
        fetchImpl,
        headers: { Authorization: `Bearer ${token}` },
    });
    const code = normalizeLanguageCode(detail?.data?.originalLanguage);
    detailMemo.set(memoKey, code);
    return code;
};

const fetchTmdbSearchLanguage = async (title, year, mediaType, apiKey, fetchImpl) => {
    const query = String(title || '').trim();
    if (!query || !apiKey) return null;
    const type = mediaType === 'tv' ? 'tv' : 'movie';
    const params = new URLSearchParams({
        api_key: apiKey,
        query,
        include_adult: 'false',
    });
    if (year) params.set(type === 'tv' ? 'first_air_date_year' : 'year', String(year));
    const payload = await fetchJson(`${TMDB_API_BASE}/search/${type}?${params}`, { fetchImpl });
    const hit = Array.isArray(payload?.results) ? payload.results[0] : null;
    const id = Number(hit?.id);
    if (!Number.isFinite(id) || id <= 0) return null;
    return fetchTmdbOriginalLanguage(id, type, apiKey, fetchImpl);
};

const collectIds = async (candidate, localPath, { readFileImpl, statImpl } = {}) => {
    const ids = {
        tmdbId: asId(candidate?.tmdbId),
        tvdbId: asId(candidate?.tvdbId),
        imdbId: candidate?.imdbId || null,
    };
    const nfoPath = await discoverNfoPath(localPath, { statImpl });
    if (!nfoPath) return ids;
    try {
        const xml = typeof readFileImpl === 'function'
            ? await readFileImpl(nfoPath, 'utf8')
            : await fs.readFile(nfoPath, 'utf8');
        const parsed = parseNfoMetadataIds(xml);
        ids.tmdbId = ids.tmdbId || parsed.tmdbId;
        ids.tvdbId = ids.tvdbId || parsed.tvdbId;
        ids.imdbId = ids.imdbId || parsed.imdbId;
    } catch {
        /* ignore unreadable nfo */
    }
    const stem = path.posix.basename(String(localPath || candidate?.filePath || ''));
    const tmdbEmbed = EMBEDDED_TMDB_RE.exec(stem);
    if (!ids.tmdbId && tmdbEmbed) ids.tmdbId = tmdbEmbed[1] || tmdbEmbed[2] || tmdbEmbed[3];
    const tvdbEmbed = EMBEDDED_TVDB_RE.exec(stem);
    if (!ids.tvdbId && tvdbEmbed) ids.tvdbId = tvdbEmbed[1] || tvdbEmbed[2] || tvdbEmbed[3];
    return ids;
};

export const lookupTrimNativeLanguage = async (config = {}, candidate = {}, {
    localPath = null,
    prior = null,
    fetchImpl = fetch,
    readFileImpl = null,
    statImpl = null,
    log = () => {},
} = {}) => {
    if (config.qcTrimKeepNativeAudio === false) {
        return { code: null, source: 'disabled' };
    }
    if (prior?.trimNativeLang) {
        return { code: prior.trimNativeLang, source: prior.trimNativeSource || 'cache' };
    }

    const apiKey = String(config.tmdbApiKey || '').trim();
    const tvdbKey = String(config.tvdbApiKey || '').trim();
    const tvdbPin = String(config.tvdbPin || '').trim();
    const mediaType = tmdbMediaType(candidate);
    const ids = await collectIds(candidate, localPath || candidate.filePath, { readFileImpl, statImpl });

    const tryTmdb = async (source) => {
        if (!ids.tmdbId || !apiKey) return null;
        const code = await fetchTmdbOriginalLanguage(ids.tmdbId, mediaType, apiKey, fetchImpl);
        return code ? { code, source } : null;
    };
    const tryTvdb = async (source) => {
        if (!ids.tvdbId || !tvdbKey) return null;
        const code = await fetchTvdbOriginalLanguage(ids.tvdbId, tvdbKey, tvdbPin, fetchImpl);
        return code ? { code, source } : null;
    };

    // Trimarr: movies TMDb first, TV TVDB first.
    const ordered = mediaType === 'tv'
        ? [() => tryTvdb('tvdb'), () => tryTmdb('tmdb')]
        : [() => tryTmdb('tmdb'), () => tryTvdb('tvdb')];
    for (const step of ordered) {
        const hit = await step();
        if (hit?.code) return hit;
    }

    if (apiKey && candidate.title) {
        const searched = await fetchTmdbSearchLanguage(
            candidate.title,
            candidate.year,
            mediaType,
            apiKey,
            fetchImpl,
        );
        if (searched) return { code: searched, source: 'tmdb-search' };
    }

    const arrCode = resolveNativeLanguage(candidate);
    if (arrCode) return { code: arrCode, source: 'arr' };

    if (looksLikeAnimeLibrary(candidate)) {
        log(`[upgrader] trim native lang fallback anime-library jpn for ${candidate.title || localPath}`);
        return { code: 'jpn', source: 'anime-library' };
    }

    return { code: null, source: 'unresolved' };
};
