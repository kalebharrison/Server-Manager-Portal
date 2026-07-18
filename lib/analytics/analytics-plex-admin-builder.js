export const buildAdminUserAnalytics = async ({
    historyItems,
    cutoffDate,
    config,
    uri,
    plexImageUrl,
    getHourInTimezone,
    getWeekdayInTimezone,
    fetchTautulliTimezone,
}) => {
    const sectionsRes = await fetch(`${uri}/library/sections?X-Plex-Token=${config.plexToken}`, { headers: { 'Accept': 'application/json' } }).then(r => r.json()).catch(() => null);

    if (!historyItems.length) {
        return { totalPlays: 0, topLibraries: [], topWatched: [], topMusic: [], recentHistory: [] };
    }

    const sectionsMap = {};
    if (sectionsRes && sectionsRes.MediaContainer && sectionsRes.MediaContainer.Directory) {
        sectionsRes.MediaContainer.Directory.forEach(s => sectionsMap[s.key] = s.title);
    }

    let totalPlays = 0;
    const libraryCounts = {};
    const contentCounts = {};
    const recentHistory = [];

    const dayOfWeekCounts = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    const hourDistribution = new Array(24).fill(0);
    const statsTimezone = await fetchTautulliTimezone(config);

    historyItems.forEach(item => {
        if (cutoffDate > 0 && item.viewedAt < cutoffDate) return;
        totalPlays++;

        const hour = getHourInTimezone(item.viewedAt, statsTimezone);
        hourDistribution[hour]++;

        const day = getWeekdayInTimezone(item.viewedAt, statsTimezone);
        if (day >= 0 && day <= 6) dayOfWeekCounts[day]++;

        if (recentHistory.length < 50) {
            recentHistory.push({
                title: item.type === 'episode' ? (item.grandparentTitle || item.parentTitle || item.title) : item.type === 'track' ? (item.parentTitle || item.grandparentTitle || item.title) : item.title,
                episodeTitle: item.type === 'episode' || item.type === 'track' ? item.title : null,
                viewedAt: item.viewedAt,
                thumb: item.type === 'episode' ? (item.grandparentThumb || item.parentThumb || item.thumb) : item.type === 'track' ? (item.parentThumb || item.grandparentThumb || item.thumb) : item.thumb,
                type: item.type,
                plexUrl: `https://app.plex.tv/desktop/#!/server/${config.serverIdentifier}/details?key=${encodeURIComponent(item.key)}`
            });
        }

        if (item.librarySectionID) {
            const libTitle = sectionsMap[item.librarySectionID] || `Library ${item.librarySectionID}`;
            if (!libraryCounts[item.librarySectionID]) libraryCounts[item.librarySectionID] = { id: item.librarySectionID, title: libTitle, plays: 0 };
            libraryCounts[item.librarySectionID].plays++;
        }

        const contentKey = item.type === 'episode' ? (item.grandparentKey || item.parentKey || item.ratingKey) : item.type === 'track' ? (item.parentKey || item.grandparentKey || item.ratingKey) : item.ratingKey;
        const contentTitle = item.type === 'episode' ? (item.grandparentTitle || item.parentTitle || item.title) : item.type === 'track' ? (item.parentTitle || item.grandparentTitle || item.title) : item.title;
        const contentThumb = item.type === 'episode' ? (item.grandparentThumb || item.parentThumb || item.thumb) : item.type === 'track' ? (item.parentThumb || item.grandparentThumb || item.thumb) : item.thumb;
        const contentArt = item.type === 'episode' ? (item.grandparentArt || item.parentArt || item.art) : item.type === 'track' ? (item.parentArt || item.grandparentArt || item.art) : item.art;

        if (contentKey) {
            if (!contentCounts[contentKey]) {
                contentCounts[contentKey] = {
                    key: contentKey,
                    title: contentTitle,
                    type: item.type === 'episode' ? 'show' : item.type === 'track' ? 'track' : item.type,
                    thumb: contentThumb,
                    art: contentArt,
                    plays: 0,
                    plexUrl: `https://app.plex.tv/desktop/#!/server/${config.serverIdentifier}/details?key=${encodeURIComponent('/library/metadata/' + contentKey.split('/').pop())}`
                };
            }
            contentCounts[contentKey].plays++;
        }
    });

    const topLibraries = Object.values(libraryCounts).sort((a, b) => b.plays - a.plays).slice(0, 5);
    const topMovies = Object.values(contentCounts).filter(c => c.type === 'movie').sort((a, b) => b.plays - a.plays).slice(0, 6).map(c => {
        if (c.thumb) c.thumbUrl = plexImageUrl(c.thumb);
        if (c.art) c.artUrl = plexImageUrl(c.art);
        return c;
    });
    const topShows = Object.values(contentCounts).filter(c => c.type === 'show').sort((a, b) => b.plays - a.plays).slice(0, 6).map(c => {
        if (c.thumb) c.thumbUrl = plexImageUrl(c.thumb);
        if (c.art) c.artUrl = plexImageUrl(c.art);
        return c;
    });
    const topMusic = Object.values(contentCounts).filter(c => c.type === 'track').sort((a, b) => b.plays - a.plays).slice(0, 6).map(c => {
        if (c.thumb) c.thumbUrl = plexImageUrl(c.thumb);
        if (c.art) c.artUrl = plexImageUrl(c.art);
        return c;
    });

    return {
        totalPlays,
        topLibraries,
        topMovies,
        topShows,
        topMusic,
        dayOfWeekCounts,
        hourDistribution,
        recentHistory: recentHistory.map(h => {
            if (h.thumb) h.thumbUrl = plexImageUrl(h.thumb);
            return h;
        })
    };
};
