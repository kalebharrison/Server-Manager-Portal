/** Shared blocked-extension junk detection for QC early-kill (qBit + SAB). */

const MEDIA_EXTENSIONS = new Set([
    'mkv', 'mp4', 'avi', 'm4v', 'mov', 'wmv', 'ts', 'm2ts', 'mts', 'mpg', 'mpeg', 'vob', 'iso',
    'flac', 'mp3', 'm4a', 'aac', 'opus', 'ogg', 'wav', 'wma', 'alac', 'aiff',
]);

/** Sidecars / archives — not proof of a good payload, but also not junk by themselves. */
const BENIGN_EXTENSIONS = new Set([
    'nfo', 'txt', 'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp',
    'srt', 'ass', 'ssa', 'sub', 'idx', 'sup',
    'pdf', 'sfv', 'md5', 'sha', 'sha1', 'sha256', 'url', 'lnk',
    'par2', 'par', 'rar', 'zip', '7z', 'gz', 'bz2', 'tar',
]);

export const parseExtensionList = (raw) => {
    const text = Array.isArray(raw) ? raw.join('\n') : String(raw || '');
    return [...new Set(
        text
            .split(/[\n,]+/)
            .map((entry) => String(entry || '').trim())
            .filter(Boolean)
            .map((entry) => entry.replace(/^\*\./, '').replace(/^\./, '').toLowerCase())
            .filter(Boolean),
    )];
};

export const extensionOf = (name = '') => {
    const base = String(name || '').split(/[\\/]/).pop() || '';
    const match = /\.([a-z0-9]{1,16})$/i.exec(base);
    return match ? match[1].toLowerCase() : '';
};

/**
 * True when names look like blocked junk with no real media/archive payload.
 * Empty file list → unknown (don't kill; metadata may still be missing).
 */
export const isJunkByBlockedExtensions = ({
    names = [],
    blockedExtensions = [],
} = {}) => {
    const blocked = new Set(parseExtensionList(blockedExtensions));
    if (!blocked.size) return false;

    const list = (Array.isArray(names) ? names : [])
        .map((entry) => String(entry || '').trim())
        .filter(Boolean);
    if (!list.length) return false;

    // Folder/torrent named `Something.exe` — kill even before deep file listing.
    if (list.some((name) => blocked.has(extensionOf(name)))) {
        const exts = list.map(extensionOf).filter(Boolean);
        const hasMedia = exts.some((ext) => MEDIA_EXTENSIONS.has(ext));
        if (!hasMedia) return true;
    }

    const payload = list
        .map((name) => ({ name, ext: extensionOf(name) }))
        .filter((entry) => entry.ext && !BENIGN_EXTENSIONS.has(entry.ext));

    if (!payload.length) return false;
    if (payload.some((entry) => MEDIA_EXTENSIONS.has(entry.ext))) return false;
    return payload.some((entry) => blocked.has(entry.ext));
};

export const resolveBlockedExtensions = (config = {}, liveLists = []) => {
    const fromConfig = parseExtensionList(config.qcBlockedExtensions);
    const fromLive = (Array.isArray(liveLists) ? liveLists : [])
        .flatMap((list) => parseExtensionList(list));
    return [...new Set([...fromConfig, ...fromLive])];
};
