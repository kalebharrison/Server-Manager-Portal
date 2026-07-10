import fetch from 'node-fetch';

export const fetchPlexAccountHistory = async (uri, config, accountID, { maxItems = 250000, log = () => {} } = {}) => {
    const pageSize = 5000;
    let historyItems = [];
    let start = 0;

    while (start < maxItems) {
        const params = new URLSearchParams({
            accountID: String(accountID),
            'X-Plex-Token': String(config.plexToken || ''),
            sort: 'viewedAt:desc',
            'X-Plex-Container-Start': String(start),
            'X-Plex-Container-Size': String(pageSize),
        });
        const pageRes = await fetch(
            `${uri}/status/sessions/history/all?${params.toString()}`,
            { headers: { Accept: 'application/json' } },
        ).then((r) => r.json()).catch(() => null);

        const pageContainer = pageRes?.MediaContainer;
        const pageItems = Array.isArray(pageContainer?.Metadata) ? pageContainer.Metadata : [];
        if (pageItems.length === 0) break;

        historyItems = historyItems.concat(pageItems);
        start += pageItems.length;

        const totalSize = Number(pageContainer.totalSize || 0);
        if ((totalSize > 0 && start >= totalSize) || pageItems.length < pageSize) break;
    }

    if (historyItems.length >= maxItems) {
        log(`Personal analytics history fetch reached safety cap (${maxItems}) for account ${accountID}.`);
    }

    return historyItems;
};
