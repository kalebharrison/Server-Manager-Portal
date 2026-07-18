import fs from 'fs/promises';

export const ANALYTICS_CACHE_VERSION = 1;

export const HOT_ANALYTICS_TIMEFRAMES = [1, 7, 30, 60];
export const COLD_ANALYTICS_TIMEFRAMES = [90, 180, 365, 1825, 'all'];
export const ANALYTICS_COLD_CACHE_INTERVAL_MS = 12 * 60 * 60 * 1000;

export const TRENDING_CACHE_INTERVAL_MS = 12 * 60 * 60 * 1000;
export const ANALYTICS_CACHE_INTERVAL_MS = 30 * 60 * 1000;
export const INITIAL_CACHE_BUILD_DELAY_MS = 10 * 1000;

export const matchesCacheIdentity = (cache, config) => {
    const serverIdentifier = String(config?.serverIdentifier || '');
    return !!serverIdentifier
        && cache?.version === ANALYTICS_CACHE_VERSION
        && String(cache?.serverIdentifier || '') === serverIdentifier;
};

export const getCacheAgeMs = async (filePath, parsed, timestampFields = ['lastUpdated', 'generatedAt']) => {
    for (const field of timestampFields) {
        const value = parsed?.[field];
        if (value) return Date.now() - Number(value);
    }
    try {
        const stat = await fs.stat(filePath);
        return Date.now() - stat.mtimeMs;
    } catch {
        return null;
    }
};

export const isValidTrendingCache = (data) => (
    data && typeof data === 'object' && !!data.lastUpdated && Array.isArray(data.trending7Days)
);

export const isValidAnalyticsCache = (data) => {
    if (!data || typeof data !== 'object') return false;
    return data.all !== undefined || data['7'] !== undefined || data['30'] !== undefined || data[7] !== undefined || data[30] !== undefined;
};
