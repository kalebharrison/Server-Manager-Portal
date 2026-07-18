export const toNumber = (value, fallback = 0) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
};

export const calculateDelta = (current, previous) => {
    const currentVal = toNumber(current, 0);
    const previousVal = Math.max(0, toNumber(previous, 0));
    const absolute = currentVal - previousVal;
    const percent = previousVal > 0 ? Number(((absolute / previousVal) * 100).toFixed(1)) : null;
    return { current: currentVal, previous: previousVal, absolute, percent };
};

export const sumLibraryPlays = (libraries = []) => (libraries || []).reduce((sum, lib) => sum + toNumber(lib.plays, 0), 0);

export const shouldObfuscateAnalyticsViewers = (sessionUser) => !sessionUser?.isAdmin;

export const obfuscateAnalyticsTopUser = (user, index, shouldObfuscate) => {
    if (!shouldObfuscate) return user;
    return {
        id: `viewer-${index + 1}`,
        username: `Viewer ${index + 1}`,
        thumb: null,
        plays: toNumber(user?.plays, 0),
    };
};

export const aggregateAnalyticsWindow = (historyItems, { afterTs = 0, beforeTs = null }, ctx, { includePortalUsers = false } = {}) => {
    const { accountsMap, sectionsMap, devicesMap, users, config } = ctx;
    const userCounts = {};
    const libraryCounts = {};
    const contentCountsMovies = {};
    const contentCountsShows = {};
    const contentCountsMusic = {};
    const deviceCounts = {};
    const peakHours = new Array(24).fill(0);
    let totalPlaybacks = 0;

    historyItems.forEach(item => {
        if (afterTs > 0 && item.viewedAt != null && item.viewedAt < afterTs) return;
        if (beforeTs != null && item.viewedAt != null && item.viewedAt >= beforeTs) return;
        if (afterTs > 0 && item.viewedAt == null) return;

        totalPlaybacks++;

        if (item.viewedAt) {
            const hour = new Date(item.viewedAt * 1000).getHours();
            peakHours[hour]++;
        }

        let deviceName = 'Unknown Platform';
        if (item.deviceID && devicesMap[item.deviceID]) deviceName = devicesMap[item.deviceID];
        else if (item.Player && item.Player.product) deviceName = item.Player.product;
        else if (item.client) deviceName = item.client;

        if (!deviceCounts[deviceName]) deviceCounts[deviceName] = { name: deviceName, plays: 0 };
        deviceCounts[deviceName].plays++;

        if (item.accountID) {
            const userFromDb = users.find(u => u.id === String(item.accountID));
            const accountFromPlex = accountsMap[item.accountID];
            let username = `User ${item.accountID}`;
            let thumb = null;

            if (userFromDb) {
                username = userFromDb.username;
                thumb = userFromDb.thumb;
            } else if (accountFromPlex) {
                username = accountFromPlex.name;
                thumb = accountFromPlex.thumb;
            }

            if (!userCounts[item.accountID]) userCounts[item.accountID] = { id: item.accountID, username, thumb, plays: 0 };
            userCounts[item.accountID].plays++;
        }

        if (item.librarySectionID) {
            const libTitle = sectionsMap[item.librarySectionID] || `Library ${item.librarySectionID}`;
            if (!libraryCounts[item.librarySectionID]) libraryCounts[item.librarySectionID] = { id: item.librarySectionID, title: libTitle, plays: 0 };
            libraryCounts[item.librarySectionID].plays++;
        }

        const contentKey = item.type === 'episode' ? (item.grandparentKey || item.parentKey || item.ratingKey) : item.type === 'track' ? (item.parentKey || item.grandparentKey || item.ratingKey) : item.ratingKey;
        const contentTitle = item.type === 'episode' ? (item.grandparentTitle || item.parentTitle || item.title) : item.type === 'track' ? (item.parentTitle || item.grandparentTitle || item.title) : item.title;
        const contentThumb = item.type === 'episode' ? (item.grandparentThumb || item.parentThumb || item.thumb) : item.type === 'track' ? (item.parentThumb || item.grandparentThumb || item.thumb) : item.thumb;
        if (contentKey) {
            let targetDict = null;
            if (item.type === 'movie') targetDict = contentCountsMovies;
            else if (item.type === 'episode') targetDict = contentCountsShows;
            else if (item.type === 'track') targetDict = contentCountsMusic;
            else targetDict = contentCountsMovies;

            if (!targetDict[contentKey]) {
                targetDict[contentKey] = {
                    key: contentKey,
                    title: contentTitle,
                    type: item.type === 'episode' ? 'show' : item.type === 'track' ? 'track' : item.type,
                    thumb: contentThumb,
                    plays: 0,
                    plexUrl: `https://app.plex.tv/desktop/#!/server/${config.serverIdentifier}/details?key=${encodeURIComponent('/library/metadata/' + contentKey.split('/').pop())}`
                };
            }
            targetDict[contentKey].plays++;
        }
    });

    if (includePortalUsers) {
        users.forEach((u) => {
            if (!u || !u.id) return;
            if (!userCounts[u.id]) {
                userCounts[u.id] = {
                    id: String(u.id),
                    username: u.username || `User ${u.id}`,
                    thumb: u.thumb || null,
                    plays: 0
                };
            }
        });
    }

    return {
        totalPlaybacks,
        peakHours,
        topUsers: Object.values(userCounts).sort((a, b) => b.plays - a.plays),
        topLibraries: Object.values(libraryCounts).sort((a, b) => b.plays - a.plays).slice(0, 10),
        topDevices: Object.values(deviceCounts).sort((a, b) => b.plays - a.plays).slice(0, 10),
        contentCountsMovies,
        contentCountsShows,
        contentCountsMusic
    };
};

export const summarizeLibraryHealth = (topLibraries = [], stats = {}, cachedData = {}) => {
    const libraryPlays = (topLibraries || []).reduce((sum, lib) => sum + toNumber(lib.plays, 0), 0);
    const leadingLibraryPlays = toNumber(topLibraries?.[0]?.plays, 0);
    const concentrationPct = libraryPlays > 0 ? Number(((leadingLibraryPlays / libraryPlays) * 100).toFixed(1)) : 0;
    const activeLibraries = (topLibraries || []).filter(lib => toNumber(lib.plays, 0) > 0).length;
    const totalCatalogItems = toNumber(stats.movies) + toNumber(stats.shows) + toNumber(stats.music);
    const totalCatalogBytes = toNumber(stats.moviesBytes) + toNumber(stats.showsBytes) + toNumber(stats.musicBytes);
    const sizeGB = Number((totalCatalogBytes / (1024 * 1024 * 1024)).toFixed(1));
    const fourKPercent = toNumber(stats.fourKPercent, 0);

    const uniqueWatchedItems = Object.keys(cachedData.contentCountsMovies || {}).length + 
                               Object.keys(cachedData.contentCountsShows || {}).length + 
                               Object.keys(cachedData.contentCountsMusic || {}).length;
    const totalPlayableItems = toNumber(stats.movies) + toNumber(stats.episodes) + toNumber(stats.tracks);
    const catalogWatchedPct = totalPlayableItems > 0 ? Number(((uniqueWatchedItems / totalPlayableItems) * 100).toFixed(1)) : 0;

    let healthLabel = 'Concentrated';
    if (activeLibraries >= 5 && concentrationPct <= 55 && fourKPercent >= 20) {
        healthLabel = 'Excellent';
    } else if (activeLibraries >= 3 && concentrationPct <= 70) {
        healthLabel = 'Balanced';
    }

    return {
        activeLibraries,
        concentrationPct,
        totalCatalogItems,
        totalCatalogBytes,
        sizeGB,
        fourKPercent,
        healthLabel,
        catalogWatchedPct,
        movies: toNumber(stats.movies, 0),
        shows: toNumber(stats.shows, 0),
        episodes: toNumber(stats.episodes, 0),
        artists: toNumber(stats.artists || stats.music, 0),
        albums: toNumber(stats.albums, 0),
        tracks: toNumber(stats.tracks, 0),
        deltas: stats.deltas || {},
        resolutions: stats.resolutions || null,
        codecs: stats.codecs || null,
        fileSizes: stats.fileSizes || null
    };
};

export const getUniqueActiveViewers = (users = []) => (users || []).filter(u => toNumber(u.plays, 0) > 0).length;
