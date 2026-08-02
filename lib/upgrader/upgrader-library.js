/**
 * Split Quality Hunt fairness by configured Arr root folders on an instance.
 * Labels come from the root path basename — no hardcoded library names.
 */

const normalizePath = (value = '') => String(value || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/+$/, '')
    .toLowerCase();

export const slugifyRootPath = (path = '') => {
    const base = String(path || '').trim().replace(/\\/g, '/').replace(/\/+$/, '').split('/').pop() || 'default';
    const slug = base
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return slug || 'default';
};

/** `/media/anime.movies` → `Anime Movies` */
export const humanizeRootLabel = (path = '') => {
    const base = String(path || '').trim().replace(/\\/g, '/').replace(/\/+$/, '').split('/').pop() || '';
    if (!base) return '';
    return base
        .replace(/[._-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\b\w/g, (ch) => ch.toUpperCase());
};

const collectRoots = (instance = {}) => {
    const main = String(instance.activeDirectory || '').trim();
    const anime = String(instance.activeAnimeDirectory || '').trim();
    const roots = [];
    if (main) {
        roots.push({ kind: 'main', path: main, slug: slugifyRootPath(main), label: humanizeRootLabel(main) });
    }
    if (anime && normalizePath(anime) !== normalizePath(main)) {
        roots.push({ kind: 'anime', path: anime, slug: slugifyRootPath(anime), label: humanizeRootLabel(anime) });
    }
    return roots;
};

const pathMatchesRoot = (itemPath, rootPath) => {
    const path = normalizePath(itemPath);
    const root = normalizePath(rootPath);
    if (!path || !root) return false;
    return path === root || path.startsWith(`${root}/`);
};

const recordTags = (record = {}) => {
    const raw = record.tags;
    if (!Array.isArray(raw)) return [];
    return raw.map((tag) => Number(tag?.id ?? tag)).filter((id) => Number.isFinite(id));
};

const hasAnimeTag = (instance = {}, record = {}) => {
    const animeTags = new Set(
        (Array.isArray(instance.animeTags) ? instance.animeTags : [])
            .map((tag) => Number(tag))
            .filter((id) => Number.isFinite(id)),
    );
    if (!animeTags.size) return false;
    return recordTags(record).some((tag) => animeTags.has(tag));
};

const instanceType = (instance = {}) => instance.type || instance.arrType || 'arr';

const defaultLibrary = (instance = {}) => {
    const type = instanceType(instance);
    const id = instance.id != null ? String(instance.id) : '';
    const name = instance.name
        || (type === 'radarr' ? 'Radarr' : type === 'sonarr' ? 'Sonarr' : 'Library');
    return {
        libraryKey: id ? `${type}:${id}:default` : `unknown:default`,
        libraryName: name,
        libraryBucket: 'default',
        rootPath: String(instance.activeDirectory || '').trim() || null,
    };
};

/**
 * Classify an Arr movie/series into a hunt library based on configured roots.
 * @returns {{ libraryKey: string, libraryName: string, libraryBucket: string, rootPath: string|null }}
 */
export const classifyUpgraderLibrary = (instance = {}, record = {}) => {
    const type = instanceType(instance);
    const id = instance.id != null ? String(instance.id) : '';
    const roots = collectRoots(instance);
    const fallback = defaultLibrary(instance);

    if (!roots.length) return fallback;

    // Single configured root → keep instance name as the library label.
    if (roots.length === 1) {
        const root = roots[0];
        return {
            libraryKey: id ? `${type}:${id}:${root.slug}` : `unknown:${root.slug}`,
            libraryName: instance.name || root.label || fallback.libraryName,
            libraryBucket: root.kind,
            rootPath: root.path,
        };
    }

    const itemPath = record.path || record.rootFolderPath || '';
    const matches = roots
        .filter((root) => pathMatchesRoot(itemPath, root.path))
        .sort((a, b) => normalizePath(b.path).length - normalizePath(a.path).length);

    let chosen = matches[0] || null;
    if (!chosen && hasAnimeTag(instance, record)) {
        chosen = roots.find((root) => root.kind === 'anime') || null;
    }
    if (!chosen) {
        chosen = roots.find((root) => root.kind === 'main') || roots[0];
    }

    return {
        libraryKey: id ? `${type}:${id}:${chosen.slug}` : `unknown:${chosen.slug}`,
        libraryName: chosen.label || fallback.libraryName,
        libraryBucket: chosen.kind,
        rootPath: chosen.path,
    };
};

/** Unique library descriptors for an Arr instance (for dashboard/listing). */
export const librariesForArrInstance = (instance = {}) => {
    const type = instanceType(instance);
    const id = instance.id != null ? String(instance.id) : '';
    const roots = collectRoots(instance);
    if (!roots.length) {
        const fallback = defaultLibrary(instance);
        return [{ id: fallback.libraryKey, key: fallback.libraryKey, name: fallback.libraryName, type }];
    }
    if (roots.length === 1) {
        const root = roots[0];
        const key = id ? `${type}:${id}:${root.slug}` : `unknown:${root.slug}`;
        return [{
            id: key,
            key,
            name: instance.name || root.label || defaultLibrary(instance).libraryName,
            type,
        }];
    }
    return roots.map((root) => {
        const key = id ? `${type}:${id}:${root.slug}` : `unknown:${root.slug}`;
        return { id: key, key, name: root.label || instance.name || 'Library', type };
    });
};
