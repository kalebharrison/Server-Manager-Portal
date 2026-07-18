export const homeLibraryCacheKey = (sessionInfo: any, publicConfig: any) => `homeLibrary:${sessionInfo?.session?.accountId || sessionInfo?.session?.username || 'member'}:${sessionInfo?.serverName || 'server'}:${publicConfig?.mediaServerType || 'plex'}`;

export const homeServerStatsCacheKey = (publicConfig: any) => `homeServerStats:${String(publicConfig?.mediaServerType || 'plex').toLowerCase()}`;

export const readCachedHomeLibrary = (key: string) => {
    try {
        return JSON.parse(sessionStorage.getItem(key) || 'null');
    } catch {
        return null;
    }
};

export const analyticsCacheKey = (sessionInfo: any, days: number | 'all') => `homeAnalytics:${sessionInfo?.session?.accountId || sessionInfo?.session?.username || 'member'}:${days}`;

export const readCachedHomeAnalytics = (sessionInfo: any, days: number | 'all') => {
    try {
        return JSON.parse(sessionStorage.getItem(analyticsCacheKey(sessionInfo, days)) || 'null');
    } catch {
        return null;
    }
};

export const readCachedHomeServerStats = (publicConfig: any) => {
    try {
        return JSON.parse(sessionStorage.getItem(homeServerStatsCacheKey(publicConfig)) || 'null');
    } catch {
        return null;
    }
};
