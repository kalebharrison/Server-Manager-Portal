export const ANALYTICS_HISTORY_CACHE_VERSION = 2;

export const compactAnalyticsHistoryItem = (item = {}) => ({
    viewedAt: item.viewedAt ?? null,
    accountID: item.accountID ?? null,
    librarySectionID: item.librarySectionID ?? null,
    deviceID: item.deviceID ?? null,
    client: item.client || null,
    type: item.type || null,
    ratingKey: item.ratingKey || null,
    parentRatingKey: item.parentRatingKey || null,
    grandparentRatingKey: item.grandparentRatingKey || null,
    key: item.key || null,
    parentKey: item.parentKey || null,
    grandparentKey: item.grandparentKey || null,
    title: item.title || null,
    parentTitle: item.parentTitle || null,
    grandparentTitle: item.grandparentTitle || null,
    thumb: item.thumb || null,
    parentThumb: item.parentThumb || null,
    grandparentThumb: item.grandparentThumb || null,
    Player: item.Player?.product ? { product: item.Player.product } : undefined,
    // Keep true history identity separate from metadata key.
    historyKey: item.historyKey || null,
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

export const filterHistoryByCutoff = (items = [], stopBeforeTs = 0) => {
    const cutoff = Number(stopBeforeTs || 0);
    if (!cutoff) return Array.isArray(items) ? items : [];
    return (Array.isArray(items) ? items : []).filter((item) => Number(item?.viewedAt || 0) >= cutoff);
};

export const filterHistoryByAccount = (items = [], accountID, stopBeforeTs = 0) => {
    const id = String(accountID ?? '');
    if (!id) return [];
    return filterHistoryByCutoff(items, stopBeforeTs).filter((item) => String(item?.accountID ?? '') === id);
};

/** Keep plays for any of the local Plex account IDs (owner + name-matched aliases). */
export const filterHistoryByAccounts = (items = [], accountIDs = [], stopBeforeTs = 0) => {
    const ids = new Set(
        (Array.isArray(accountIDs) ? accountIDs : [accountIDs])
            .map((value) => String(value ?? '').trim())
            .filter(Boolean),
    );
    if (!ids.size) return [];
    return filterHistoryByCutoff(items, stopBeforeTs).filter((item) => ids.has(String(item?.accountID ?? '')));
};

export const buildWatchStatsFromHistory = (items = []) => {
    const map = new Map();
    for (const item of items) {
        const rawKey = item?.type === 'episode'
            ? (item.grandparentRatingKey || item.grandparentKey || item.parentRatingKey || item.parentKey || item.ratingKey)
            : item?.ratingKey;
        const raw = String(rawKey || '').trim();
        if (!raw) continue;
        const parts = raw.split('/');
        const key = String(parts[parts.length - 1] || '').trim();
        if (!key) continue;
        const viewedAt = Number(item.viewedAt || 0);
        const existing = map.get(key) || { watchCount: 0, lastViewedAt: null };
        existing.watchCount += 1;
        if (viewedAt > Number(existing.lastViewedAt || 0)) existing.lastViewedAt = viewedAt;
        map.set(key, existing);
    }
    return map;
};
