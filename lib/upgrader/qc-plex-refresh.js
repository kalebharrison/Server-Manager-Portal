import path from 'node:path';

const normalizeSlashes = (value) => String(value || '').replace(/\\/g, '/').replace(/\/+/g, '/');

const sectionTypeForMedia = (mediaType) => {
    const kind = String(mediaType || '').toLowerCase();
    if (kind === 'show' || kind === 'episode' || kind === 'tv') return 'show';
    if (kind === 'album' || kind === 'artist' || kind === 'track' || kind === 'audio') return 'artist';
    return 'movie';
};

/**
 * Align a portal/Arr file path onto a Plex library root when mounts differ
 * (e.g. /media/movies/... vs /mnt/user/media/movies/...).
 */
export const resolvePlexScanPath = (filePath, libraryLocations = []) => {
    const file = normalizeSlashes(filePath).replace(/\/+$/, '');
    if (!file || file === '/') return null;
    const locations = (Array.isArray(libraryLocations) ? libraryLocations : [])
        .map((loc) => normalizeSlashes(loc).replace(/\/+$/, ''))
        .filter(Boolean);

    for (const root of locations) {
        if (file === root || file.startsWith(`${root}/`)) return file;
    }

    const fileParts = file.split('/').filter(Boolean);
    for (const root of locations) {
        const rootParts = root.split('/').filter(Boolean);
        if (!rootParts.length || !fileParts.length) continue;
        const maxOverlap = Math.min(rootParts.length, fileParts.length);
        for (let overlap = maxOverlap; overlap >= 1; overlap -= 1) {
            const rootTail = rootParts.slice(-overlap);
            for (let start = 0; start <= fileParts.length - overlap; start += 1) {
                const matches = rootTail.every((part, index) => part === fileParts[start + index]);
                if (!matches) continue;
                const rest = fileParts.slice(start + overlap);
                return `/${[...rootParts, ...rest].join('/')}`;
            }
        }
    }
    return null;
};

export const pickPlexRefreshTarget = ({
    sections = [],
    filePaths = [],
    mediaType = 'movie',
} = {}) => {
    const wantedType = sectionTypeForMedia(mediaType);
    const candidates = [...new Set(
        (Array.isArray(filePaths) ? filePaths : [])
            .map((entry) => normalizeSlashes(entry).replace(/\/+$/, ''))
            .filter(Boolean),
    )];
    if (!candidates.length) return null;

    const directories = (Array.isArray(sections) ? sections : [])
        .filter((section) => String(section?.type || '').toLowerCase() === wantedType);

    for (const section of directories) {
        const locations = (Array.isArray(section?.Location) ? section.Location : [])
            .map((loc) => loc?.path || loc)
            .filter(Boolean);
        if (!locations.length) continue;
        for (const candidate of candidates) {
            const plexFile = resolvePlexScanPath(candidate, locations);
            if (!plexFile) continue;
            const scanPath = path.posix.dirname(plexFile);
            if (!scanPath || scanPath === '/') continue;
            return {
                sectionKey: String(section.key),
                sectionTitle: section.title || null,
                path: scanPath,
                filePath: plexFile,
            };
        }
    }
    return null;
};

/**
 * Partial library refresh for one import folder after Integrity finishes.
 * Uses GET /library/sections/{id}/refresh?path=...
 */
export const refreshPlexPathAfterImport = async ({
    config,
    resolvePlexUri,
    fetchImpl = fetch,
    arrPath = null,
    mappedPath = null,
    mediaType = 'movie',
    log = () => {},
} = {}) => {
    if (config?.qcIntegrityPlexRefreshAfterImport === false) {
        return { ok: false, skipped: true, reason: 'disabled' };
    }
    const token = String(config?.plexToken || '').trim();
    if (!token || typeof resolvePlexUri !== 'function') {
        return { ok: false, skipped: true, reason: 'no_plex' };
    }

    let uri;
    try {
        uri = await resolvePlexUri(config);
    } catch (error) {
        return { ok: false, skipped: true, reason: 'plex_uri_failed', detail: error.message };
    }
    if (!uri) return { ok: false, skipped: true, reason: 'no_plex_uri' };

    const sectionsUrl = `${uri}/library/sections?X-Plex-Token=${encodeURIComponent(token)}`;
    let sectionsPayload;
    try {
        const response = await fetchImpl(sectionsUrl, {
            headers: { Accept: 'application/json' },
        });
        if (!response.ok) {
            return { ok: false, reason: 'sections_http', detail: `HTTP ${response.status}` };
        }
        sectionsPayload = await response.json();
    } catch (error) {
        return { ok: false, reason: 'sections_fetch', detail: error.message };
    }

    const sections = sectionsPayload?.MediaContainer?.Directory || [];
    const target = pickPlexRefreshTarget({
        sections,
        filePaths: [arrPath, mappedPath],
        mediaType,
    });
    if (!target) {
        log(`[upgrader] plex refresh skipped — no library match for ${arrPath || mappedPath || 'path'}`);
        return { ok: false, skipped: true, reason: 'no_section_match' };
    }

    const refreshUrl = `${uri}/library/sections/${encodeURIComponent(target.sectionKey)}/refresh`
        + `?path=${encodeURIComponent(target.path)}`
        + `&X-Plex-Token=${encodeURIComponent(token)}`;
    try {
        const response = await fetchImpl(refreshUrl, { method: 'GET' });
        if (!response.ok) {
            return {
                ok: false,
                reason: 'refresh_http',
                detail: `HTTP ${response.status}`,
                sectionKey: target.sectionKey,
                path: target.path,
            };
        }
        log(`[upgrader] plex refresh queued section=${target.sectionKey} path=${target.path}`);
        return {
            ok: true,
            sectionKey: target.sectionKey,
            sectionTitle: target.sectionTitle,
            path: target.path,
        };
    } catch (error) {
        return {
            ok: false,
            reason: 'refresh_fetch',
            detail: error.message,
            sectionKey: target.sectionKey,
            path: target.path,
        };
    }
};
