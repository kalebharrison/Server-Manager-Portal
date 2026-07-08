import fs from 'fs/promises';

const fileLocks = new Map();

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
        const content = await fs.readFile(path, 'utf-8');
        const data = JSON.parse(content);
        return data === null ? defaultContent : data;
    } catch (error) {
        if (error.code === 'ENOENT') {
            await fs.writeFile(path, JSON.stringify(defaultContent, null, 2));
            return defaultContent;
        }
        throw error;
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
    } finally {
        unlock();
    }
};
