export const ANALYTICS_HISTORY_CACHE_VERSION = 1;

export const compactAnalyticsHistoryItem = (item = {}) => ({
    viewedAt: item.viewedAt ?? null,
    accountID: item.accountID ?? null,
    librarySectionID: item.librarySectionID ?? null,
    deviceID: item.deviceID ?? null,
    client: item.client || null,
    type: item.type || null,
    ratingKey: item.ratingKey || null,
    parentKey: item.parentKey || null,
    grandparentKey: item.grandparentKey || null,
    title: item.title || null,
    parentTitle: item.parentTitle || null,
    grandparentTitle: item.grandparentTitle || null,
    thumb: item.thumb || null,
    parentThumb: item.parentThumb || null,
    grandparentThumb: item.grandparentThumb || null,
    Player: item.Player?.product ? { product: item.Player.product } : undefined,
    historyKey: item.historyKey || item.key || null,
});

export const analyticsHistoryItemIdentity = (item = {}) => {
    if (item.historyKey) return `h:${item.historyKey}`;
    return [
        item.accountID ?? '',
        item.viewedAt ?? '',
        item.ratingKey || item.grandparentKey || item.parentKey || '',
        item.type || '',
    ].join('|');
};

export const mergeAnalyticsHistoryItems = (newerItems = [], olderItems = [], maxItems = 250000) => {
    const merged = [];
    const seen = new Set();
    for (const item of [...newerItems, ...olderItems]) {
        const id = analyticsHistoryItemIdentity(item);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        merged.push(item);
        if (merged.length >= maxItems) break;
    }
    return merged;
};

export const matchesAnalyticsHistoryCache = (cached, config, version = ANALYTICS_HISTORY_CACHE_VERSION) => (
    !!cached
    && cached.version === version
    && String(cached.serverIdentifier || '') === String(config?.serverIdentifier || '')
    && Array.isArray(cached.items)
    && cached.items.length > 0
);
