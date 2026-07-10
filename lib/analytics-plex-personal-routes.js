import fetch from 'node-fetch';

import { fetchPlexAccountHistory } from './analytics-plex-history-service.js';

export const registerPlexPersonalAnalyticsRoutes = ({
    app,
    requireAuth,
    requireMember,
    configPath,
    usersPath,
    trendingCachePath,
    loadFile,
    getPlexConnectionUri,
    fetchPlexServerAccounts,
    resolveLocalPlexAccountId,
    resolveCurrentAdmin,
    plexImageUrl,
    getCachedPlexMetadata,
    setCachedPlexMetadata,
    tautulli,
    log,
}) => {
    const CONFIG_PATH = configPath;
    const USERS_PATH = usersPath;
    const TRENDING_CACHE_PATH = trendingCachePath;
    const {
        getHourInTimezone,
        getWeekdayInTimezone,
        resolvePeakHour,
        resolveTimeOfDayPersona,
        fetchTautulliTimezone,
        resolveTautulliHourStats,
    } = tautulli;

    app.get('/api/plex/analytics/me', requireAuth, requireMember, async (req, res) => {
        try {
            const config = await loadFile(CONFIG_PATH, null);
            if (!config || !config.plexToken || !config.serverIdentifier) return res.status(503).json({ error: 'Plex not configured' });

            const uri = await getPlexConnectionUri(config);
            if (!uri) return res.status(503).json({ error: 'Cannot connect to Plex' });

            req.user.isAdmin = await resolveCurrentAdmin(req.user, config);
            const accountID = await resolveLocalPlexAccountId(config, uri, req.user);

            if (!accountID) {
                return res.json({ totalPlays: 0, topLibraries: [], topWatched: [], topMusic: [], recentHistory: [] });
            }

            const historyItems = await fetchPlexAccountHistory(uri, config, accountID, { log });
            const sectionsRes = await fetch(`${uri}/library/sections?X-Plex-Token=${config.plexToken}`, { headers: { 'Accept': 'application/json' } }).then(r => r.json()).catch(() => null);

            if (!historyItems.length) {
                return res.json({ totalPlays: 0, topLibraries: [], topWatched: [], topMusic: [], recentHistory: [] });
            }

            const sectionsMap = {};
            if (sectionsRes && sectionsRes.MediaContainer && sectionsRes.MediaContainer.Directory) {
                sectionsRes.MediaContainer.Directory.forEach(s => sectionsMap[s.key] = s.title);
            }

            let cutoffDate = 0;
            if (req.query.days && req.query.days !== 'all') {
                const days = parseInt(req.query.days, 10) || 30;
                cutoffDate = Math.floor(Date.now() / 1000) - (days * 24 * 60 * 60);
            } else if (!req.query.days) {
                cutoffDate = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);
            }

            let totalPlays = 0;
            const libraryCounts = {};
            const contentCounts = {};

            const mapHistoryToRecent = (item) => ({
                title: item.type === 'episode' ? (item.grandparentTitle || item.parentTitle || item.title) : item.type === 'track' ? (item.parentTitle || item.grandparentTitle || item.title) : item.title,
                episodeTitle: item.type === 'episode' || item.type === 'track' ? item.title : null,
                viewedAt: item.viewedAt,
                thumb: item.type === 'episode' ? (item.grandparentThumb || item.parentThumb || item.thumb) : item.type === 'track' ? (item.parentThumb || item.grandparentThumb || item.thumb) : item.thumb,
                type: item.type,
                plexUrl: `https://app.plex.tv/desktop/#!/server/${config.serverIdentifier}/details?key=${encodeURIComponent(item.key)}`
            });
            const recentHistory = historyItems.slice(0, 50).map(mapHistoryToRecent);

            let plexTotalHourOfDay = 0;
            let plexHourCount = 0;
            const plexHourDistribution = new Array(24).fill(0);
            let totalHourOfDay = 0;
            let hourCount = 0;
            const hourDistribution = new Array(24).fill(0);

            const dayOfWeekCounts = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
            let moviesCount = 0;
            let showsCount = 0;
            let musicCount = 0;

            const statsTimezone = await fetchTautulliTimezone(config);
            const { list: plexAccounts } = await fetchPlexServerAccounts(uri, config);
            const plexAccountName = plexAccounts.find((a) => String(a.id) === String(accountID))?.name || null;

            historyItems.forEach(item => {
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

            const allUsersMap = await loadFile(USERS_PATH, []);
            const targetDbUser = allUsersMap.find(u => String(u.plexAccountId) === String(accountID));

            const tautulliHourStats = await resolveTautulliHourStats(config, {
                username: targetDbUser?.username,
                email: targetDbUser?.email,
                plexAccountName,
                days: req.query.days || 30,
                afterUnixSec: cutoffDate,
                maxItems: historyItems.length,
                plexPlayCount: totalPlays,
            });
            if (tautulliHourStats?.hourCount > 0) {
                totalHourOfDay = tautulliHourStats.totalHourOfDay;
                hourCount = tautulliHourStats.hourCount;
                hourDistribution.splice(0, 24, ...tautulliHourStats.hourDistribution);
            } else {
                totalHourOfDay = plexTotalHourOfDay;
                hourCount = plexHourCount;
                hourDistribution.splice(0, 24, ...plexHourDistribution);
            }

            const allLibraries = Object.values(libraryCounts).sort((a, b) => b.plays - a.plays);
            const topLibraries = allLibraries.slice(0, 5);
            const topWatched = Object.values(contentCounts).filter(c => c.type !== 'track').sort((a, b) => b.plays - a.plays).slice(0, 30).map(c => {
                if (c.thumb) c.thumbUrl = plexImageUrl(c.thumb);
                return c;
            });
            const topMusic = Object.values(contentCounts).filter(c => c.type === 'track').sort((a, b) => b.plays - a.plays).slice(0, 30).map(c => {
                if (c.thumb) c.thumbUrl = plexImageUrl(c.thumb);
                return c;
            });

            const avgHour = hourCount > 0 ? (totalHourOfDay / hourCount) : null;
            const peakHour = resolvePeakHour(hourDistribution);
            const timeOfDay = resolveTimeOfDayPersona(peakHour);

            const allShowsList = Object.values(contentCounts).filter(c => c.type === 'show').sort((a, b) => b.plays - a.plays);
            let topShowsRaw = allShowsList.slice(0, 5);
            await Promise.all(topShowsRaw.map(async (s, i) => {
                if (!s.art || i === 0) {
                    const metaPath = s.key.startsWith('/library/metadata/') ? s.key : `/library/metadata/${s.key}`;

                    let data = getCachedPlexMetadata(metaPath);
                    if (!data) {
                        const metaRes = await fetch(`${uri}${metaPath}?X-Plex-Token=${config.plexToken}`, { headers: { 'Accept': 'application/json' } }).then(r => r.json()).catch(() => null);
                        if (metaRes && metaRes.MediaContainer && metaRes.MediaContainer.Metadata && metaRes.MediaContainer.Metadata[0]) {
                            data = metaRes.MediaContainer.Metadata[0];
                            setCachedPlexMetadata(metaPath, data);
                        }
                    }

                    if (data) {
                        s.art = data.art || data.grandparentArt || data.parentArt || s.art;
                        if (i === 0) {
                            s.summary = data.summary || data.parentSummary || data.grandparentSummary;
                            s.year = data.year || data.parentYear || data.grandparentYear;
                        }
                    }
                }
            }));
            const topShows = topShowsRaw.map(s => ({ ...s, artUrl: s.art ? plexImageUrl(s.art) : null, thumbUrl: s.thumb ? plexImageUrl(s.thumb) : null }));
            const topBinge = topShows.length > 0 ? topShows[0] : null;

            const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            let maxDayIndex = 0;
            let maxDayCount = 0;
            for (let i = 0; i < 7; i++) {
                if (dayOfWeekCounts[i] > maxDayCount) {
                    maxDayCount = dayOfWeekCounts[i];
                    maxDayIndex = i;
                }
            }
            const popularDay = maxDayCount > 0 ? daysOfWeek[maxDayIndex] : 'Unknown';

            const favoriteLibrary = topLibraries.length > 0 ? topLibraries[0].title : 'None';

            let mediaPreference = 'Mixed Bag';
            const totalPrefCount = moviesCount + showsCount + musicCount;
            if (totalPrefCount > 0) {
                if (moviesCount / totalPrefCount >= 0.6) mediaPreference = 'Movie Buff';
                else if (showsCount / totalPrefCount >= 0.6) mediaPreference = 'TV Show Binger';
                else if (musicCount / totalPrefCount >= 0.6) mediaPreference = 'Music Lover';
            }

            const allMoviesList = Object.values(contentCounts).filter(c => c.type === 'movie').sort((a, b) => b.plays - a.plays);
            let topMoviesRaw = allMoviesList.slice(0, 5);
            await Promise.all(topMoviesRaw.map(async (m, i) => {
                if (!m.art || i === 0) {
                    const metaPath = m.key.startsWith('/library/metadata/') ? m.key : `/library/metadata/${m.key}`;

                    let data = getCachedPlexMetadata(metaPath);
                    if (!data) {
                        const metaRes = await fetch(`${uri}${metaPath}?X-Plex-Token=${config.plexToken}`, { headers: { 'Accept': 'application/json' } }).then(r => r.json()).catch(() => null);
                        if (metaRes && metaRes.MediaContainer && metaRes.MediaContainer.Metadata && metaRes.MediaContainer.Metadata[0]) {
                            data = metaRes.MediaContainer.Metadata[0];
                            setCachedPlexMetadata(metaPath, data);
                        }
                    }

                    if (data) {
                        m.art = data.art || data.grandparentArt || data.parentArt || m.art;
                        if (i === 0) {
                            m.summary = data.summary;
                            m.year = data.year;
                            m.tagline = data.tagline;
                        }
                    }
                }
            }));
            const topMovies = topMoviesRaw.map(m => ({ ...m, artUrl: m.art ? plexImageUrl(m.art) : null, thumbUrl: m.thumb ? plexImageUrl(m.thumb) : null }));
            const topMovie = topMovies.length > 0 ? topMovies[0] : null;

            let watchStyle = 'Explorer';
            const uniqueTitles = Object.keys(contentCounts).length;
            if (totalPlays > 0) {
                if (totalPlays / uniqueTitles > 3) watchStyle = 'Comfort Binger';
                else if (totalPlays / uniqueTitles > 1.5) watchStyle = 'Loyal Fan';
            }

            let streamingHabit = 'Balanced Streamer';
            const weekendPlays = dayOfWeekCounts[0] + dayOfWeekCounts[6];
            const weekdayPlays = totalPlays - weekendPlays;
            if (totalPlays > 0) {
                if (weekendPlays / totalPlays >= 0.5) streamingHabit = 'Weekend Warrior';
                else if (weekdayPlays / totalPlays >= 0.8) streamingHabit = 'Weekday Streamer';
            }

            const trendingStats = await loadFile(TRENDING_CACHE_PATH, {});

            let periodKey = '30';
            if (req.query.days === 'all') periodKey = 'all';
            else if (req.query.days) periodKey = req.query.days;

            const userEntry = trendingStats.leaderboards && trendingStats.leaderboards[periodKey] && accountID
                ? trendingStats.leaderboards[periodKey][accountID]
                : null;
            const leaderboardRank = userEntry ? (typeof userEntry === 'object' ? userEntry.rank : userEntry) : null;
            const myPlaysOnLeaderboard = userEntry ? (typeof userEntry === 'object' ? userEntry.plays : null) : null;
            const totalActiveUsers = trendingStats.totalActiveUsers && trendingStats.totalActiveUsers[periodKey]
                ? trendingStats.totalActiveUsers[periodKey]
                : 0;

            const users = await loadFile(USERS_PATH, []);
            const usernameMap = {};
            users.forEach(u => { if (u.plexAccountId) usernameMap[u.plexAccountId] = u.username || u.email || 'Unknown'; });

            let leaderboardNeighbourhood = [];
            const sortedBoard = trendingStats.leaderboardsSorted && trendingStats.leaderboardsSorted[periodKey] ? trendingStats.leaderboardsSorted[periodKey] : [];
            if (leaderboardRank && sortedBoard.length > 0) {
                const myIdx = leaderboardRank - 1;
                const start = Math.max(0, myIdx - 2);
                const end = Math.min(sortedBoard.length - 1, myIdx + 2);
                leaderboardNeighbourhood = sortedBoard.slice(start, end + 1).map(entry => ({
                    rank: entry.rank,
                    plays: entry.plays,
                    isMe: entry.accountId === String(accountID),
                    username: usernameMap[entry.accountId] || `User ${entry.rank}`
                }));
            }

            res.json({
                totalPlays,
                topLibraries,
                topWatched,
                topMusic,
                topBinge,
                topMovie,
                topShows,
                topMovies,
                timeOfDay,
                popularDay,
                favoriteLibrary,
                mediaPreference,
                watchStyle,
                streamingHabit,
                leaderboardRank,
                totalActiveUsers,
                myPlaysOnLeaderboard,
                leaderboardNeighbourhood,
                moviesCount,
                showsCount,
                musicCount,
                weekendPlays,
                weekdayPlays,
                uniqueTitles,
                avgHour,
                peakHour,
                dayOfWeekCounts,
                hourDistribution,
                allLibraries,
                recentHistory: recentHistory.map(h => {
                    if (h.thumb) h.thumbUrl = plexImageUrl(h.thumb);
                    return h;
                })
            });
        } catch (e) {
            log(`Error fetching personal analytics: ${e.message}`);
            res.status(500).json({ error: 'Analytics error' });
        }
    });
};
