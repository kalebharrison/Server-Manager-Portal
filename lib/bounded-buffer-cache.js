export const createBoundedBufferCache = ({ maxBytes, sizeOf = (value) => value?.body?.byteLength || 0 }) => {
    const entries = new Map();
    const pending = new Map();
    let totalBytes = 0;

    const touch = (key, value) => {
        entries.delete(key);
        entries.set(key, value);
    };

    const prune = () => {
        while (totalBytes > maxBytes && entries.size) {
            const key = entries.keys().next().value;
            const value = entries.get(key);
            entries.delete(key);
            totalBytes -= sizeOf(value);
        }
    };

    const get = async (key, loader) => {
        const cached = entries.get(key);
        if (cached) {
            touch(key, cached);
            return cached;
        }
        if (pending.has(key)) return pending.get(key);
        const request = Promise.resolve(loader()).then((value) => {
            entries.set(key, value);
            totalBytes += sizeOf(value);
            prune();
            return value;
        }).finally(() => pending.delete(key));
        pending.set(key, request);
        return request;
    };

    const peek = (key) => {
        const cached = entries.get(key) || null;
        if (cached) touch(key, cached);
        return cached;
    };

    const warm = async (tasks, concurrency = 6) => {
        const queue = [...new Map(tasks.map((task) => [task.key, task])).values()];
        await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
            while (queue.length) {
                const task = queue.shift();
                await get(task.key, task.load).catch(() => null);
            }
        }));
    };

    return { get, peek, warm };
};
