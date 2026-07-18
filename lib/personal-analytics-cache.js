const CACHE_VERSION = 1;
const DEFAULT_REFRESH_INTERVAL_MS = 30 * 60 * 1000;

const normalizePeriod = (period) => period === 'all'
    ? 'all'
    : String(Math.min(3650, Math.max(1, parseInt(period, 10) || 30)));

export const personalAnalyticsCacheKey = ({ serverIdentifier, accountId, period }) =>
    `${String(serverIdentifier)}:${String(accountId)}:${normalizePeriod(period)}`;

export const createPersonalAnalyticsCache = ({
    cachePath,
    loadFile,
    saveFile,
    refreshIntervalMs = DEFAULT_REFRESH_INTERVAL_MS,
    log = () => {},
}) => {
    let snapshot = null;
    let loadPromise = null;
    let refreshTimer = null;
    const inFlight = new Map();
    const loaders = new Map();

    const loadSnapshot = async () => {
        if (snapshot) return snapshot;
        if (!loadPromise) {
            loadPromise = loadFile(cachePath, null).then((stored) => {
                snapshot = stored?.version === CACHE_VERSION && stored?.entries
                    ? stored
                    : { version: CACHE_VERSION, entries: {} };
                return snapshot;
            }).finally(() => {
                loadPromise = null;
            });
        }
        return loadPromise;
    };

    const refresh = async (key, loader) => {
        if (inFlight.has(key)) return inFlight.get(key);
        const task = Promise.resolve().then(loader).then(async (data) => {
            const store = await loadSnapshot();
            store.entries[key] = { generatedAt: Date.now(), data };
            await saveFile(cachePath, store);
            return data;
        }).catch((error) => {
            log(`[PersonalAnalyticsCache] Refresh failed: ${error.message}`);
            throw error;
        }).finally(() => {
            inFlight.delete(key);
        });
        inFlight.set(key, task);
        return task;
    };

    const get = async (identity, loader) => {
        const key = personalAnalyticsCacheKey(identity);
        loaders.set(key, loader);
        const store = await loadSnapshot();
        const cached = store.entries[key];
        if (cached?.data) {
            if (Date.now() - Number(cached.generatedAt || 0) >= refreshIntervalMs) {
                void refresh(key, loader).catch(() => {});
            }
            return cached.data;
        }
        return refresh(key, loader);
    };

    const refreshKnownEntries = () => {
        for (const [key, loader] of loaders) void refresh(key, loader).catch(() => {});
    };

    const start = async () => {
        await loadSnapshot();
        if (!refreshTimer) refreshTimer = setInterval(refreshKnownEntries, refreshIntervalMs);
    };

    const stop = () => {
        if (refreshTimer) clearInterval(refreshTimer);
        refreshTimer = null;
    };

    return { get, start, stop };
};
