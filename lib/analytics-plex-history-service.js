import fetch from 'node-fetch';

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
            ? pageItems.findIndex((item) => Number(item.viewedAt || 0) < cutoffTs)
            : -1;
        historyItems = historyItems.concat(cutoffIndex >= 0 ? pageItems.slice(0, cutoffIndex) : pageItems);
        start += pageItems.length;

        const totalSize = Number(pageContainer.totalSize || 0);
        if (cutoffIndex >= 0 || (totalSize > 0 && start >= totalSize) || pageItems.length < safePageSize) break;
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
