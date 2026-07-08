export const createLruCache = ({ maxEntries = 500 } = {}) => {
    const store = new Map();

    const get = (key) => {
        const value = store.get(key);
        if (value) {
            store.delete(key);
            store.set(key, value);
        }
        return value;
    };

    const set = (key, value) => {
        if (value === null || value === undefined) return;
        if (store.has(key)) store.delete(key);
        while (store.size >= maxEntries) {
            const oldestKey = store.keys().next().value;
            if (!oldestKey) break;
            store.delete(oldestKey);
        }
        store.set(key, value);
    };

    return { get, set, size: () => store.size };
};

export const createTtlCache = ({ maxEntries = 500 } = {}) => {
    const store = new Map();

    const getOrSet = async (key, ttlMs, fetcher) => {
        const now = Date.now();
        const entry = store.get(key);
        if (entry) {
            if (now < entry.expiresAt) {
                store.delete(key);
                store.set(key, entry);
                return entry.data;
            }
            store.delete(key);
        }

        const data = await fetcher();
        if (data !== null && data !== undefined) {
            if (store.has(key)) store.delete(key);
            while (store.size >= maxEntries) {
                const oldestKey = store.keys().next().value;
                if (!oldestKey) break;
                store.delete(oldestKey);
            }
            store.set(key, { data, expiresAt: now + ttlMs });
        }
        return data;
    };

    return { getOrSet, size: () => store.size };
};
