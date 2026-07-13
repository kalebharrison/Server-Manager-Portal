export const cacheRefreshMs = (config: any) => {
    const minutes = Number(config?.cacheRefreshMinutes) || 5;
    return Math.min(60, Math.max(1, minutes)) * 60_000;
};
