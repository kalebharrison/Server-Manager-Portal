const PERIOD_DAYS = [7, 30, 60, 90, 180, 365];

const createPeriodBuckets = () => Object.fromEntries([...PERIOD_DAYS.map(String), 'all'].map((period) => [period, {}]));

const addUserPlay = (buckets, period, accountId) => {
    if (accountId === undefined || accountId === null || accountId === '') return;
    buckets[period][accountId] = (buckets[period][accountId] || 0) + 1;
};

const rankUsers = (userPlays) => {
    const leaderboards = {};
    const leaderboardsSorted = {};
    const totalActiveUsers = {};
    Object.entries(userPlays).forEach(([period, playsByUser]) => {
        const sorted = Object.entries(playsByUser).sort((a, b) => b[1] - a[1]);
        leaderboards[period] = {};
        leaderboardsSorted[period] = sorted.map(([accountId, plays], index) => ({ accountId, plays, rank: index + 1 }));
        sorted.forEach(([accountId, plays], index) => {
            leaderboards[period][accountId] = { rank: index + 1, plays };
        });
        totalActiveUsers[period] = sorted.length;
    });
    return { leaderboards, leaderboardsSorted, totalActiveUsers };
};

const topItems = (items, limit = 20) => Object.values(items)
    .sort((a, b) => (b.views - a.views) || String(a.title || '').localeCompare(String(b.title || '')))
    .slice(0, limit)
    .map(({ users, ...item }) => ({
        ...item,
        userCount: users instanceof Set ? users.size : 0,
    }));

export const buildTrendingStats = async ({
    history,
    uri,
    config,
    enrichRecentItemsWithMediaTags,
    nowMs = Date.now(),
    hiddenAccountIds = null,
}) => {
    const now = nowMs / 1000;
    const cutoffs = Object.fromEntries(PERIOD_DAYS.map((days) => [String(days), now - (days * 24 * 60 * 60)]));
    const counts = { trending7Days: {}, movies30Days: {}, shows30Days: {} };
    const userPlays = createPeriodBuckets();
    const hiddenIds = hiddenAccountIds instanceof Set
        ? hiddenAccountIds
        : new Set(Array.isArray(hiddenAccountIds) ? hiddenAccountIds.map(String) : []);

    for (const item of history) {
        const isMovie = item.type === 'movie';
        const isEpisode = item.type === 'episode';
        if (!isMovie && !isEpisode) continue;

        const groupKey = isMovie ? item.ratingKey : item.grandparentKey;
        if (!groupKey) continue;
        const accountId = item.accountID;
        const viewedAt = Number(item.viewedAt) || 0;
        const hideFromLeaderboard = accountId !== undefined && accountId !== null && accountId !== ''
            && hiddenIds.has(String(accountId));
        const metaId = String(groupKey).split('/').pop();
        const baseItem = {
            ratingKey: metaId,
            title: isMovie ? item.title : item.grandparentTitle,
            thumb: isMovie ? item.thumb : (item.grandparentThumb || item.parentThumb || item.thumb),
            type: isMovie ? 'movie' : 'show',
            plexUrl: `https://app.plex.tv/desktop/#!/server/${config.serverIdentifier}/details?key=${encodeURIComponent(`/library/metadata/${metaId}`)}`,
        };
        const increment = (bucket) => {
            if (!bucket[groupKey]) bucket[groupKey] = { ...baseItem, views: 0, users: new Set() };
            bucket[groupKey].views += 1;
            if (accountId !== undefined && accountId !== null && accountId !== '') bucket[groupKey].users.add(accountId);
        };

        if (!hideFromLeaderboard) {
            addUserPlay(userPlays, 'all', accountId);
            PERIOD_DAYS.forEach((days) => {
                if (viewedAt >= cutoffs[String(days)]) addUserPlay(userPlays, String(days), accountId);
            });
        }
        if (viewedAt >= cutoffs['7']) increment(counts.trending7Days);
        if (viewedAt >= cutoffs['30']) increment(isMovie ? counts.movies30Days : counts.shows30Days);
    }

    const [trending7Days, movies30Days, shows30Days] = await Promise.all([
        enrichRecentItemsWithMediaTags(uri, config, topItems(counts.trending7Days)),
        enrichRecentItemsWithMediaTags(uri, config, topItems(counts.movies30Days)),
        enrichRecentItemsWithMediaTags(uri, config, topItems(counts.shows30Days)),
    ]);

    return {
        trending7Days,
        movies30Days,
        shows30Days,
        ...rankUsers(userPlays),
        lastUpdated: Date.now(),
    };
};
