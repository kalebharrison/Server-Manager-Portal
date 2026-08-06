import fs from 'fs/promises';
import path from 'path';

const fileLocks = new Map();
const fileCache = new Map();

const COMPACT_JSON_BASENAMES = new Set([
    'analytics-cache.json',
    'analytics-history-cache.json',
    'personal-analytics-cache.json',
    'trending-cache.json',
    'plex-dashboard-cache.json',
    'discover-home-cache.json',
    'discovery-availability-cache.json',
    'plex-stats.json',
    'subzero-health.json',
    'media-issues.json',
    'upgrader-index.json',
    'upgrader-integrity-cache.json',
]);

const shouldPrettyPrint = (filePath) => !COMPACT_JSON_BASENAMES.has(path.basename(String(filePath || '')));

const serializeJson = (filePath, data) => (
    shouldPrettyPrint(filePath) ? JSON.stringify(data, null, 2) : JSON.stringify(data)
);

const cloneJson = (value) => {
    if (value === null || value === undefined) return value;
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
};

const lockFile = async (filePath) => {
    while (fileLocks.get(filePath)) {
        await fileLocks.get(filePath);
    }
    let resolve;
    const promise = new Promise((r) => { resolve = r; });
    fileLocks.set(filePath, promise);
    return () => {
        if (fileLocks.get(filePath) === promise) {
            fileLocks.delete(filePath);
        }
        resolve();
    };
};

const readCachedEntry = (filePath, stats) => {
    const cached = fileCache.get(filePath);
    if (cached && cached.mtimeMs === stats.mtimeMs && cached.size === stats.size) {
        return cached;
    }
    return null;
};

const readCachedClone = (filePath, stats) => {
    const cached = readCachedEntry(filePath, stats);
    return cached ? cloneJson(cached.data) : null;
};

const loadFileUnlocked = async (filePath, defaultContent) => {
    const stats = await fs.stat(filePath).catch((error) => {
        if (error.code === 'ENOENT') return null;
        throw error;
    });
    if (!stats) {
        await fs.writeFile(filePath, serializeJson(filePath, defaultContent), { mode: 0o600 });
        const writtenStats = await fs.stat(filePath);
        const data = cloneJson(defaultContent);
        fileCache.set(filePath, { mtimeMs: writtenStats.mtimeMs, size: writtenStats.size, data });
        return cloneJson(data);
    }

    const hit = readCachedClone(filePath, stats);
    if (hit !== null) return hit;

    const content = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(content);
    const value = data === null ? defaultContent : data;
    fileCache.set(filePath, { mtimeMs: stats.mtimeMs, size: stats.size, data: cloneJson(value) });
    return cloneJson(value);
};

const saveFileUnlocked = async (filePath, data) => {
    const tempPath = `${filePath}.tmp`;
    await fs.writeFile(tempPath, serializeJson(filePath, data), { mode: 0o600 });
    await fs.rename(tempPath, filePath);
    await fs.chmod(filePath, 0o600).catch((error) => {
        if (!['EPERM', 'EACCES'].includes(error.code)) throw error;
    });
    const stats = await fs.stat(filePath);
    fileCache.set(filePath, { mtimeMs: stats.mtimeMs, size: stats.size, data: cloneJson(data) });
};

const loadFileSharedUnlocked = async (filePath, defaultContent) => {
    const stats = await fs.stat(filePath).catch((error) => {
        if (error.code === 'ENOENT') return null;
        throw error;
    });
    if (!stats) {
        await fs.writeFile(filePath, serializeJson(filePath, defaultContent), { mode: 0o600 });
        const writtenStats = await fs.stat(filePath);
        const data = cloneJson(defaultContent);
        fileCache.set(filePath, { mtimeMs: writtenStats.mtimeMs, size: writtenStats.size, data });
        return data;
    }

    const cached = readCachedEntry(filePath, stats);
    if (cached) return cached.data;

    const content = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    const value = parsed === null ? defaultContent : parsed;
    const data = cloneJson(value);
    fileCache.set(filePath, { mtimeMs: stats.mtimeMs, size: stats.size, data });
    return data;
};

export const loadFile = async (filePath, defaultContent) => {
    // Lock-free fast path: hot files (users/config) are almost always cache-fresh.
    const stats = await fs.stat(filePath).catch((error) => {
        if (error.code === 'ENOENT') return null;
        throw error;
    });
    if (stats) {
        const hit = readCachedClone(filePath, stats);
        if (hit !== null) return hit;
    }

    const unlock = await lockFile(filePath);
    try {
        return await loadFileUnlocked(filePath, defaultContent);
    } finally {
        unlock();
    }
};

/**
 * Like loadFile but returns the cached in-memory object on cache hits (no structuredClone).
 * Callers must treat the result as read-only and must not mutate nested fields.
 */
export const loadFileShared = async (filePath, defaultContent) => {
    const stats = await fs.stat(filePath).catch((error) => {
        if (error.code === 'ENOENT') return null;
        throw error;
    });
    if (stats) {
        const cached = readCachedEntry(filePath, stats);
        if (cached) return cached.data;
    }

    const unlock = await lockFile(filePath);
    try {
        return await loadFileSharedUnlocked(filePath, defaultContent);
    } finally {
        unlock();
    }
};

export const saveFile = async (filePath, data) => {
    const unlock = await lockFile(filePath);
    try {
        await saveFileUnlocked(filePath, data);
    } finally {
        unlock();
    }
};

export const updateFile = async (filePath, defaultContent, mutate) => {
    const unlock = await lockFile(filePath);
    try {
        const current = await loadFileUnlocked(filePath, defaultContent);
        const mutated = await mutate(current);
        const next = mutated === undefined ? current : mutated;
        await saveFileUnlocked(filePath, next);
        return cloneJson(next);
    } finally {
        unlock();
    }
};
