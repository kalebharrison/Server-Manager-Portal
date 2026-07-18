export const createMemoryCache = ({ maxEntries = 250 } = {}) => {
    const entries = new Map();
    const pending = new Map();
    let generation = 0;

    const prune = () => {
        const now = Date.now();
        for (const [key, value] of entries) {
            if (value.staleUntil <= now) entries.delete(key);
        }
        while (entries.size > maxEntries) {
            const oldest = entries.keys().next().value;
            if (!oldest) break;
            entries.delete(oldest);
        }
    };

    return {
        getOrSet: async (key, ttlMs, loader, { staleIfErrorMs = 0 } = {}) => {
            const now = Date.now();
            const cached = entries.get(key);
            if (cached && cached.expiresAt > now) {
                entries.delete(key);
                entries.set(key, cached);
                return cached.value;
            }
            if (pending.has(key)) return pending.get(key);
            const stale = cached && cached.staleUntil > now ? cached : null;
            const loadGeneration = generation;
            let promise;
            promise = Promise.resolve()
                .then(loader)
                .then((value) => {
                    if (loadGeneration === generation) {
                        entries.set(key, {
                            value,
                            expiresAt: Date.now() + ttlMs,
                            staleUntil: Date.now() + ttlMs + Math.max(0, staleIfErrorMs),
                        });
                        prune();
                    }
                    return value;
                })
                .catch((error) => {
                    if (stale) return stale.value;
                    throw error;
                })
                .finally(() => {
                    if (pending.get(key) === promise) pending.delete(key);
                });
            pending.set(key, promise);
            return promise;
        },
        clear: () => {
            generation++;
            entries.clear();
            pending.clear();
        },
        /** Drop matching keys without invalidating unrelated discover/search entries. */
        invalidateMatching: (predicate) => {
            for (const key of [...entries.keys()]) {
                if (predicate(key)) entries.delete(key);
            }
        },
    };
};
