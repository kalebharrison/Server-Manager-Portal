import fs from 'fs/promises';

const fileLocks = new Map();
const fileCache = new Map();

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

export const loadFile = async (path, defaultContent) => {
    const unlock = await lockFile(path);
    try {
        const stats = await fs.stat(path).catch((error) => {
            if (error.code === 'ENOENT') return null;
            throw error;
        });
        if (!stats) {
            await fs.writeFile(path, JSON.stringify(defaultContent, null, 2));
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
    } finally {
        unlock();
    }
};

export const saveFile = async (path, data) => {
    const unlock = await lockFile(path);
    try {
        const tempPath = `${path}.tmp`;
        await fs.writeFile(tempPath, JSON.stringify(data, null, 2));
        await fs.rename(tempPath, path);
        const stats = await fs.stat(path);
        fileCache.set(path, { mtimeMs: stats.mtimeMs, size: stats.size, data: cloneJson(data) });
    } finally {
        unlock();
    }
};
