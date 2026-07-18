export const getHourInTimezone = (unixSec, timeZone, log = () => {}) => {
    try {
        const parts = new Intl.DateTimeFormat('en-GB', {
            timeZone: timeZone || 'UTC',
            hour: 'numeric',
            hour12: false,
        }).formatToParts(new Date(unixSec * 1000));
        const hourPart = parts.find((p) => p.type === 'hour');
        if (hourPart) return Number(hourPart.value);
    } catch (e) {
        log(`Invalid timezone "${timeZone}" for hour stats: ${e.message}`);
    }
    return new Date(unixSec * 1000).getUTCHours();
};

export const getWeekdayInTimezone = (unixSec, timeZone, log = () => {}) => {
    try {
        const weekday = new Intl.DateTimeFormat('en-GB', {
            timeZone: timeZone || 'UTC',
            weekday: 'short',
        }).format(new Date(unixSec * 1000));
        const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
        if (map[weekday] != null) return map[weekday];
    } catch (e) {
        log(`Invalid timezone "${timeZone}" for weekday stats: ${e.message}`);
    }
    return new Date(unixSec * 1000).getUTCDay();
};

export const buildHourStatsFromUnixTimestamps = (timestamps, timeZone, log = () => {}) => {
    const hourDistribution = new Array(24).fill(0);
    let totalHourOfDay = 0;
    for (const ts of timestamps) {
        const hour = getHourInTimezone(ts, timeZone, log);
        totalHourOfDay += hour;
        hourDistribution[hour]++;
    }
    return {
        totalHourOfDay,
        hourCount: timestamps.length,
        hourDistribution,
    };
};

export const resolvePeakHour = (hourDistribution) => {
    if (!Array.isArray(hourDistribution) || hourDistribution.length === 0) return null;
    let peakHour = 0;
    let peakCount = 0;
    for (let h = 0; h < hourDistribution.length; h++) {
        if (hourDistribution[h] > peakCount) {
            peakCount = hourDistribution[h];
            peakHour = h;
        }
    }
    return peakCount > 0 ? peakHour : null;
};

export const resolveTimeOfDayPersona = (hour) => {
    if (hour == null) return 'Night Owl';
    if (hour >= 5 && hour < 12) return 'Early Bird';
    if (hour >= 12 && hour < 18) return 'Afternoon Watcher';
    if (hour >= 18) return 'Evening Streamer';
    return 'Night Owl';
};
