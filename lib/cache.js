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
            if (entry.inFlight) return entry.data !== undefined ? entry.data : entry.inFlight;
        }

        const inFlight = (async () => {
            try {
                const data = await fetcher();
                if (data !== null && data !== undefined) {
                    if (store.has(key)) store.delete(key);
                    while (store.size >= maxEntries) {
                        const oldestKey = store.keys().next().value;
                        if (!oldestKey) break;
                        store.delete(oldestKey);
                    }
                    store.set(key, { data, expiresAt: Date.now() + ttlMs });
                } else {
                    store.delete(key);
                }
                return data;
            } catch (error) {
                if (entry?.data !== undefined) {
                    store.set(key, { data: entry.data, expiresAt: Date.now() + Math.min(ttlMs, 30_000) });
                    return entry.data;
                }
                store.delete(key);
                throw error;
            }
        })();

        store.set(key, { data: entry?.data, expiresAt: 0, inFlight });
        return entry?.data !== undefined ? entry.data : inFlight;
    };

    return { getOrSet, size: () => store.size };
};
