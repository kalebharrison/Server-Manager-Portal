export const aggregatePersonalHistory = (historyItems, sectionsMap, { getHourInTimezone, getWeekdayInTimezone, statsTimezone, cutoffDate, serverIdentifier }) => {
    let totalPlays = 0;
    const libraryCounts = {};
    const contentCounts = {};
    let plexTotalHourOfDay = 0;
    let plexHourCount = 0;
    const plexHourDistribution = new Array(24).fill(0);
    const dayOfWeekCounts = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    let moviesCount = 0;
    let showsCount = 0;
    let musicCount = 0;

    historyItems.forEach((item) => {
        if (cutoffDate > 0 && item.viewedAt < cutoffDate) return;
        totalPlays++;

        const hour = getHourInTimezone(item.viewedAt, statsTimezone);
        plexTotalHourOfDay += hour;
        plexHourCount++;
        plexHourDistribution[hour]++;
        dayOfWeekCounts[getWeekdayInTimezone(item.viewedAt, statsTimezone)]++;

        if (item.type === 'movie') moviesCount++;
        else if (item.type === 'episode') showsCount++;
        else if (item.type === 'track') musicCount++;

        if (item.librarySectionID) {
            const libTitle = sectionsMap[item.librarySectionID] || `Library ${item.librarySectionID}`;
            if (!libraryCounts[item.librarySectionID]) {
                libraryCounts[item.librarySectionID] = { id: item.librarySectionID, title: libTitle, plays: 0 };
            }
            libraryCounts[item.librarySectionID].plays++;
        }

        const contentKey = item.type === 'episode'
            ? (item.grandparentKey || item.parentKey || item.ratingKey)
            : item.type === 'track'
                ? (item.parentKey || item.grandparentKey || item.ratingKey)
                : item.ratingKey;
        const contentTitle = item.type === 'episode'
            ? (item.grandparentTitle || item.parentTitle || item.title)
            : item.type === 'track'
                ? (item.parentTitle || item.grandparentTitle || item.title)
                : item.title;
        const contentThumb = item.type === 'episode'
            ? (item.grandparentThumb || item.parentThumb || item.thumb)
            : item.type === 'track'
                ? (item.parentThumb || item.grandparentThumb || item.thumb)
                : item.thumb;
        const contentArt = item.type === 'episode'
            ? (item.grandparentArt || item.parentArt || item.art)
            : item.type === 'track'
                ? (item.parentArt || item.grandparentArt || item.art)
                : item.art;

        if (contentKey) {
            if (!contentCounts[contentKey]) {
                contentCounts[contentKey] = {
                    key: contentKey,
                    title: contentTitle,
                    type: item.type === 'episode' ? 'show' : item.type === 'track' ? 'track' : item.type,
                    thumb: contentThumb || null,
                    art: contentArt || null,
                    plays: 0,
                    plexUrl: `https://app.plex.tv/desktop/#!/server/${serverIdentifier}/details?key=${encodeURIComponent('/library/metadata/' + contentKey.split('/').pop())}`,
                };
            } else {
                // First play often lacks grandparentThumb; later plays may have it.
                if (!contentCounts[contentKey].thumb && contentThumb) {
                    contentCounts[contentKey].thumb = contentThumb;
                }
                if (!contentCounts[contentKey].art && contentArt) {
                    contentCounts[contentKey].art = contentArt;
                }
            }
            contentCounts[contentKey].plays++;
        }
    });

    return {
        totalPlays,
        libraryCounts,
        contentCounts,
        plexTotalHourOfDay,
        plexHourCount,
        plexHourDistribution,
        dayOfWeekCounts,
        moviesCount,
        showsCount,
        musicCount,
    };
};

export const resolveHourDistribution = (tautulliHourStats, plexTotals) => {
    const hourDistribution = new Array(24).fill(0);
    if (tautulliHourStats?.hourCount > 0) {
        hourDistribution.splice(0, 24, ...tautulliHourStats.hourDistribution);
        return {
            totalHourOfDay: tautulliHourStats.totalHourOfDay,
            hourCount: tautulliHourStats.hourCount,
            hourDistribution,
        };
    }
    hourDistribution.splice(0, 24, ...plexTotals.plexHourDistribution);
    return {
        totalHourOfDay: plexTotals.plexTotalHourOfDay,
        hourCount: plexTotals.plexHourCount,
        hourDistribution,
    };
};
