export const DEFAULT_CACHE_REFRESH_MINUTES = 5;
export const MIN_CACHE_REFRESH_MINUTES = 1;
export const MAX_CACHE_REFRESH_MINUTES = 60;

export const normalizeCacheRefreshMinutes = (value) => {
    const minutes = Number.parseInt(value, 10);
    if (!Number.isFinite(minutes)) return DEFAULT_CACHE_REFRESH_MINUTES;
    return Math.min(MAX_CACHE_REFRESH_MINUTES, Math.max(MIN_CACHE_REFRESH_MINUTES, minutes));
};

export const cacheRefreshMs = (config = {}) => normalizeCacheRefreshMinutes(config.cacheRefreshMinutes) * 60 * 1000;

export const startAdaptiveCacheWarmer = ({ loadConfig, warm, log = () => {} }) => {
    let timer = null;
    let stopped = false;

    const run = async () => {
        let config = {};
        try {
            config = await loadConfig();
            await warm(config || {});
        } catch (error) {
            log(`Cache refresh failed: ${error.message}`);
        } finally {
            if (!stopped) {
                timer = setTimeout(run, cacheRefreshMs(config));
                timer.unref?.();
            }
        }
    };

    void run();
    return () => {
        stopped = true;
        if (timer) clearTimeout(timer);
    };
};
