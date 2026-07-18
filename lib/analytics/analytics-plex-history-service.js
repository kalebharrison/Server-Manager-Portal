import {
    ANALYTICS_HISTORY_CACHE_VERSION,
    compactAnalyticsHistoryItem,
    mergeAnalyticsHistoryItems,
    matchesAnalyticsHistoryCache,
} from './analytics-history.js';

export const resolveHistoryCutoff = (daysQuery, defaultDays = 30) => {
    if (daysQuery === 'all') return 0;
    const days = parseInt(daysQuery || defaultDays, 10) || defaultDays;
    return Math.floor(Date.now() / 1000) - (days * 24 * 60 * 60);
};

export const historyFetchLimitForPeriod = (daysQuery, defaultDays = 30) => {
    if (daysQuery === 'all') return 250000;
    const days = parseInt(daysQuery || defaultDays, 10) || defaultDays;
    if (days <= 30) return 5000;
    if (days <= 180) return 25000;
    return 100000;
};

const fetchPlexHistory = async (uri, config, {
    accountID = null,
    maxItems = 250000,
    pageSize = 5000,
    stopBeforeTs = 0,
    compact = false,
    log = () => {},
} = {}) => {
    const safePageSize = Math.min(Math.max(Number(pageSize) || 5000, 1), 5000);
    const cutoffTs = Number(stopBeforeTs || 0);
    let historyItems = [];
    let start = 0;

    while (start < maxItems) {
        const params = new URLSearchParams({
            'X-Plex-Token': String(config.plexToken || ''),
            sort: 'viewedAt:desc',
            'X-Plex-Container-Start': String(start),
            'X-Plex-Container-Size': String(safePageSize),
        });
        if (accountID !== null && accountID !== undefined) {
            params.set('accountID', String(accountID));
        }
        const pageRes = await fetch(
            `${uri}/status/sessions/history/all?${params.toString()}`,
            { headers: { Accept: 'application/json' } },
        ).then((r) => r.json()).catch(() => null);

        const pageContainer = pageRes?.MediaContainer;
        const pageItems = Array.isArray(pageContainer?.Metadata) ? pageContainer.Metadata : [];
        if (pageItems.length === 0) break;

        const cutoffIndex = cutoffTs > 0
            ? pageItems.findIndex((item) => Number(item.viewedAt || 0) <= cutoffTs)
            : -1;
        const slice = cutoffIndex >= 0 ? pageItems.slice(0, cutoffIndex) : pageItems;
        historyItems = historyItems.concat(compact ? slice.map(compactAnalyticsHistoryItem) : slice);
        start += pageItems.length;

        const totalSize = Number(pageContainer.totalSize || 0);
        if (cutoffIndex >= 0 || (totalSize > 0 && start >= totalSize) || pageItems.length < safePageSize) break;
        if (historyItems.length >= maxItems) break;
    }

    if (historyItems.length >= maxItems) {
        const subject = accountID == null ? 'server' : `account ${accountID}`;
        log(`Plex history fetch reached safety cap (${maxItems}) for ${subject}.`);
    }

    return historyItems;
};

export const fetchPlexAccountHistory = async (uri, config, accountID, options = {}) => (
    fetchPlexHistory(uri, config, { ...options, accountID })
);

export const fetchPlexServerHistory = async (uri, config, options = {}) => (
    fetchPlexHistory(uri, config, options)
);

export const createAnalyticsHistoryStore = ({
    historyCachePath,
    loadFile,
    saveFile,
    log = () => {},
}) => {
    const loadCache = async (config) => {
        const cached = await loadFile(historyCachePath, null);
        return matchesAnalyticsHistoryCache(cached, config) ? cached : null;
    };

    const saveCache = async (config, items = []) => {
        const newestViewedAt = items.reduce((max, item) => Math.max(max, Number(item.viewedAt || 0)), 0);
        const oldestViewedAt = items.reduce((min, item) => {
            const viewedAt = Number(item.viewedAt || 0);
            if (!viewedAt) return min;
            return min === 0 ? viewedAt : Math.min(min, viewedAt);
        }, 0);
        await saveFile(historyCachePath, {
            version: ANALYTICS_HISTORY_CACHE_VERSION,
            serverIdentifier: String(config.serverIdentifier || ''),
            newestViewedAt,
            oldestViewedAt,
            itemCount: items.length,
            updatedAt: Date.now(),
            items,
        });
    };

    const fetchIncrementalServerHistory = async (uri, config, {
        maxItems = 250000,
        forceFull = false,
    } = {}) => {
        const existing = forceFull ? null : await loadCache(config);
        if (!existing) {
            const full = await fetchPlexHistory(uri, config, { maxItems, compact: true, log });
            if (full.length) await saveCache(config, full);
            return full;
        }

        const stopBeforeTs = Number(existing.newestViewedAt || 0);
        const newer = await fetchPlexHistory(uri, config, {
            maxItems,
            stopBeforeTs: stopBeforeTs > 0 ? stopBeforeTs : 0,
            compact: true,
            log,
        });

        if (!newer.length) {
            log(`[AnalyticsHistory] Reusing cached history (${existing.items.length} items).`);
            return existing.items;
        }

        const merged = mergeAnalyticsHistoryItems(newer, existing.items, maxItems);
        log(`[AnalyticsHistory] Merged ${newer.length} new history item(s) into ${merged.length} total.`);
        await saveCache(config, merged);
        return merged;
    };

    const loadItems = async (config) => {
        const cached = await loadCache(config);
        return cached?.items || null;
    };

    return { fetchIncrementalServerHistory, loadItems, loadCache };
};

export const fetchPlexAccountHistoryPage = async (uri, config, accountID, {
    start = 0,
    limit = 15,
} = {}) => {
    const safeStart = Math.max(0, Number(start) || 0);
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 15));
    const params = new URLSearchParams({
        accountID: String(accountID),
        'X-Plex-Token': String(config.plexToken || ''),
        sort: 'viewedAt:desc',
        'X-Plex-Container-Start': String(safeStart),
        'X-Plex-Container-Size': String(safeLimit),
    });
    const pageRes = await fetch(
        `${uri}/status/sessions/history/all?${params.toString()}`,
        { headers: { Accept: 'application/json' } },
    ).then((r) => r.json()).catch(() => null);
    const container = pageRes?.MediaContainer;
    return {
        items: Array.isArray(container?.Metadata) ? container.Metadata : [],
        total: Number(container?.totalSize || 0),
    };
};
