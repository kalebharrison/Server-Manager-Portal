import { buildPrivateLeaderboardNeighbourhood } from './personal-analytics-helpers.js';

export const buildPersonalInsights = ({
    totalPlays,
    contentCounts,
    dayOfWeekCounts,
    topLibraries,
    moviesCount,
    showsCount,
    musicCount,
    hourDistribution,
    resolvePeakHour,
    resolveTimeOfDayPersona,
}) => {
    const avgHour = hourDistribution.hourCount > 0 ? (hourDistribution.totalHourOfDay / hourDistribution.hourCount) : null;
    const peakHour = resolvePeakHour(hourDistribution.hourDistribution);
    const timeOfDay = resolveTimeOfDayPersona(peakHour);

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

    const uniqueTitles = Object.keys(contentCounts).length;
    let watchStyle = 'Explorer';
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

    return {
        timeOfDay,
        popularDay,
        favoriteLibrary,
        mediaPreference,
        watchStyle,
        streamingHabit,
        weekendPlays,
        weekdayPlays,
        uniqueTitles,
        avgHour,
        peakHour,
    };
};

export const resolveLeaderboardContext = (trendingStats, period, accountID) => {
    let periodKey = '30';
    if (period === 'all') periodKey = 'all';
    else if (period) periodKey = period;

    const userEntry = trendingStats.leaderboards?.[periodKey] && accountID
        ? trendingStats.leaderboards[periodKey][accountID]
        : null;
    const leaderboardRank = userEntry ? (typeof userEntry === 'object' ? userEntry.rank : userEntry) : null;
    const myPlaysOnLeaderboard = userEntry ? (typeof userEntry === 'object' ? userEntry.plays : null) : null;
    const totalActiveUsers = trendingStats.totalActiveUsers?.[periodKey] || 0;

    let leaderboardNeighbourhood = [];
    const sortedBoard = trendingStats.leaderboardsSorted?.[periodKey] || [];
    if (leaderboardRank && sortedBoard.length > 0) {
        const myIdx = leaderboardRank - 1;
        const start = Math.max(0, myIdx - 2);
        const end = Math.min(sortedBoard.length - 1, myIdx + 2);
        leaderboardNeighbourhood = buildPrivateLeaderboardNeighbourhood(sortedBoard.slice(start, end + 1), accountID);
    }

    return { leaderboardRank, myPlaysOnLeaderboard, totalActiveUsers, leaderboardNeighbourhood };
};
