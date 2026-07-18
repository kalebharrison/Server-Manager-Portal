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
    'plex-stats.json',
    'subzero-health.json',
    'media-issues.json',
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

const lockFile = async (path) => {
    while (fileLocks.get(path)) {
        await fileLocks.get(path);
    }
    let resolve;
    const promise = new Promise(r => resolve = r);
    fileLocks.set(path, promise);
    return () => {
        if (fileLocks.get(path) === promise) {
            fileLocks.delete(path);
        }
        resolve();
    };
};

const loadFileUnlocked = async (path, defaultContent) => {
    const stats = await fs.stat(path).catch((error) => {
        if (error.code === 'ENOENT') return null;
        throw error;
    });
    if (!stats) {
        await fs.writeFile(path, serializeJson(path, defaultContent), { mode: 0o600 });
        const writtenStats = await fs.stat(path);
        const data = cloneJson(defaultContent);
        fileCache.set(path, { mtimeMs: writtenStats.mtimeMs, size: writtenStats.size, data });
        return cloneJson(data);
    }

    const cached = fileCache.get(path);
    if (cached && cached.mtimeMs === stats.mtimeMs && cached.size === stats.size) {
        return cloneJson(cached.data);
    }

    const content = await fs.readFile(path, 'utf-8');
    const data = JSON.parse(content);
    const value = data === null ? defaultContent : data;
    fileCache.set(path, { mtimeMs: stats.mtimeMs, size: stats.size, data: cloneJson(value) });
    return cloneJson(value);
};

const saveFileUnlocked = async (path, data) => {
    const tempPath = `${path}.tmp`;
    await fs.writeFile(tempPath, serializeJson(path, data), { mode: 0o600 });
    await fs.rename(tempPath, path);
    await fs.chmod(path, 0o600).catch((error) => {
        if (!['EPERM', 'EACCES'].includes(error.code)) throw error;
    });
    const stats = await fs.stat(path);
    fileCache.set(path, { mtimeMs: stats.mtimeMs, size: stats.size, data: cloneJson(data) });
};

export const loadFile = async (path, defaultContent) => {
    const unlock = await lockFile(path);
    try {
        return await loadFileUnlocked(path, defaultContent);
    } finally {
        unlock();
    }
};

export const saveFile = async (path, data) => {
    const unlock = await lockFile(path);
    try {
        await saveFileUnlocked(path, data);
    } finally {
        unlock();
    }
};

export const updateFile = async (path, defaultContent, mutate) => {
    const unlock = await lockFile(path);
    try {
        const current = await loadFileUnlocked(path, defaultContent);
        const mutated = await mutate(current);
        const next = mutated === undefined ? current : mutated;
        await saveFileUnlocked(path, next);
        return cloneJson(next);
    } finally {
        unlock();
    }
};
