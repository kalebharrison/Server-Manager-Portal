export const emptyPersonalAnalytics = () => ({ totalPlays: 0, topLibraries: [], topWatched: [], topMusic: [], recentHistory: [] });

export const normalizeAnalyticsPeriod = (value) => value === 'all'
    ? 'all'
    : String(Math.min(3650, Math.max(1, parseInt(value, 10) || 30)));

export const buildPrivateLeaderboardNeighbourhood = (entries = [], accountId) => entries.map((entry) => {
    const isMe = String(entry.accountId) === String(accountId);
    return {
        rank: entry.rank,
        plays: entry.plays,
        isMe,
        username: isMe ? 'You' : `Viewer ${entry.rank}`,
    };
});

export const buildRecentHistory = (historyItems = [], serverIdentifier, limit = 50) => {
    const recent = [];
    const seriesEntries = new Map();
    const safeLimit = Math.max(1, Number(limit) || 50);
    // Walk newest-first plays and stop after `limit` distinct titles (shows collapse
    // to one row). Do NOT slice raw plays first — a binge would hide everything else.
    for (const item of (Array.isArray(historyItems) ? historyItems : [])) {
        const isEpisode = item.type === 'episode';
        const seriesKey = isEpisode
            ? String(item.grandparentRatingKey || item.grandparentKey || item.grandparentTitle || item.parentTitle || item.title)
            : null;
        if (seriesKey && seriesEntries.has(seriesKey)) {
            seriesEntries.get(seriesKey).watchedCount += 1;
            continue;
        }
        if (recent.length >= safeLimit) break;

        const metadataKey = item.key
            || item.grandparentKey
            || item.parentKey
            || (item.ratingKey ? `/library/metadata/${item.ratingKey}` : '');
        const targetKey = isEpisode
            ? (item.grandparentKey || item.parentKey || metadataKey)
            : metadataKey;
        const entry = {
            historyKey: `${item.type}:${seriesKey || item.ratingKey || item.key || item.viewedAt}`,
            title: isEpisode
                ? (item.grandparentTitle || item.parentTitle || item.title)
                : item.type === 'track'
                    ? (item.parentTitle || item.grandparentTitle || item.title)
                    : item.title,
            episodeTitle: item.type === 'track' ? item.title : null,
            viewedAt: item.viewedAt,
            thumb: isEpisode
                ? (item.grandparentThumb || item.parentThumb || item.thumb)
                : item.type === 'track'
                    ? (item.parentThumb || item.grandparentThumb || item.thumb)
                    : item.thumb,
            type: item.type,
            watchedCount: 1,
            plexUrl: targetKey
                ? `https://app.plex.tv/desktop/#!/server/${serverIdentifier}/details?key=${encodeURIComponent(targetKey)}`
                : '',
        };
        recent.push(entry);
        if (seriesKey) seriesEntries.set(seriesKey, entry);
    }
    recent.forEach((entry) => {
        if (entry.type === 'episode') {
            entry.episodeTitle = entry.watchedCount > 1
                ? `${entry.watchedCount} episodes watched`
                : 'TV series';
        }
    });
    return recent;
};
