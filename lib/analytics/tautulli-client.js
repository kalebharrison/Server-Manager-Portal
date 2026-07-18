import {
    buildHourStatsFromUnixTimestamps,
    getHourInTimezone,
    getWeekdayInTimezone,
    resolvePeakHour,
    resolveTimeOfDayPersona,
} from './tautulli-time-helpers.js';

const TAUTULLI_HISTORY_PAGE_SIZE = 500;

export const createTautulliClient = ({ resolveIntegrationUrlForFetch, log }) => {
    let cachedTautulliUsers = null;
    let cachedTautulliUsersAt = 0;
    let cachedTautulliTimezone = null;
    let cachedTautulliTimezoneAt = 0;

    const getHour = (unixSec, timeZone) => getHourInTimezone(unixSec, timeZone, log);
    const getWeekday = (unixSec, timeZone) => getWeekdayInTimezone(unixSec, timeZone, log);

    const fetchTautulliUsers = async (config) => {
        if (!config?.tautulliUrl || !config?.tautulliApiKey) return [];
        if (cachedTautulliUsers && (Date.now() - cachedTautulliUsersAt < 15 * 60 * 1000)) {
            return cachedTautulliUsers;
        }
        const tUrl = resolveIntegrationUrlForFetch(config.tautulliUrl);
        if (!tUrl) return [];
        const response = await fetch(`${tUrl}/api/v2?apikey=${encodeURIComponent(config.tautulliApiKey)}&cmd=get_users`, {
            headers: { Accept: 'application/json' },
        }).then((r) => r.json()).catch(() => null);
        const users = Array.isArray(response?.response?.data) ? response.response.data : [];
        cachedTautulliUsers = users;
        cachedTautulliUsersAt = Date.now();
        return users;
    };

    const resolveTautulliUserId = (users, { username, email, plexAccountName }) => {
        const norm = (v) => String(v || '').trim().toLowerCase();
        if (!Array.isArray(users) || users.length === 0) return null;

        const candidates = [username, plexAccountName, email].filter(Boolean).map(norm);
        for (const candidate of candidates) {
            const match = users.find((u) =>
                norm(u.username) === candidate
                || norm(u.friendly_name) === candidate
                || norm(u.email) === candidate,
            );
            if (match?.user_id != null && match.user_id !== '') return String(match.user_id);
        }
        return null;
    };

    const fetchTautulliTimezone = async (config) => {
        if (!config?.tautulliUrl || !config?.tautulliApiKey) {
            return process.env.PORTAL_TIMEZONE || process.env.TZ || 'UTC';
        }
        if (cachedTautulliTimezone && (Date.now() - cachedTautulliTimezoneAt < 60 * 60 * 1000)) {
            return cachedTautulliTimezone;
        }
        const tUrl = resolveIntegrationUrlForFetch(config.tautulliUrl);
        if (!tUrl) return process.env.PORTAL_TIMEZONE || process.env.TZ || 'UTC';

        const response = await fetch(`${tUrl}/api/v2?apikey=${encodeURIComponent(config.tautulliApiKey)}&cmd=get_settings`, {
            headers: { Accept: 'application/json' },
        }).then((r) => r.json()).catch(() => null);
        const settings = response?.response?.data || {};
        const timezone = settings?.timezone
            || settings?.General?.timezone
            || settings?.General?.TIMEZONE
            || process.env.PORTAL_TIMEZONE
            || process.env.TZ
            || 'UTC';
        cachedTautulliTimezone = timezone;
        cachedTautulliTimezoneAt = Date.now();
        return timezone;
    };

    const fetchTautulliPlaysByHourOfDay = async (config, tUrl, tautulliUserId, timeRangeDays) => {
        const timeRange = timeRangeDays === 'all' ? 'all' : String(timeRangeDays || 30);
        const params = new URLSearchParams({
            apikey: config.tautulliApiKey,
            cmd: 'get_plays_by_hourofday',
            time_range: timeRange,
            y_axis: 'plays',
            user_id: String(tautulliUserId),
            grouping: '0',
        });
        const response = await fetch(`${tUrl}/api/v2?${params.toString()}`, {
            headers: { Accept: 'application/json' },
        }).then((r) => r.json()).catch(() => null);
        const data = response?.response?.data;
        if (!data?.series || !Array.isArray(data.series)) return null;

        const hourDistribution = new Array(24).fill(0);
        for (const series of data.series) {
            if (!Array.isArray(series.data)) continue;
            series.data.forEach((count, idx) => {
                if (idx < 24) hourDistribution[idx] += Number(count) || 0;
            });
        }
        const hourCount = hourDistribution.reduce((sum, count) => sum + count, 0);
        if (hourCount === 0) return null;

        let totalHourOfDay = 0;
        for (let h = 0; h < 24; h++) totalHourOfDay += h * hourDistribution[h];
        return { totalHourOfDay, hourCount, hourDistribution };
    };

    const fetchTautulliUserHistoryStarts = async (config, tUrl, tautulliUserId, { afterUnixSec = 0, maxItems = 5000 } = {}) => {
        const startedTimestamps = [];
        let offset = 0;
        let done = false;

        while (!done && startedTimestamps.length < maxItems) {
            const length = Math.min(TAUTULLI_HISTORY_PAGE_SIZE, maxItems - startedTimestamps.length);
            const params = new URLSearchParams({
                apikey: config.tautulliApiKey,
                cmd: 'get_history',
                order_column: 'started',
                order_dir: 'desc',
                start: String(offset),
                length: String(length),
                user_id: String(tautulliUserId),
                grouping: '0',
            });

            const response = await fetch(`${tUrl}/api/v2?${params.toString()}`, { headers: { Accept: 'application/json' } })
                .then((r) => r.json())
                .catch(() => null);

            const rows = response?.response?.data?.data;
            if (!Array.isArray(rows) || rows.length === 0) break;

            for (const row of rows) {
                const started = Number(row.started || row.date || 0);
                if (!started) continue;
                if (afterUnixSec > 0 && started < afterUnixSec) {
                    done = true;
                    break;
                }
                startedTimestamps.push(started);
                if (startedTimestamps.length >= maxItems) {
                    done = true;
                    break;
                }
            }

            if (rows.length < length) break;
            offset += rows.length;
        }

        return startedTimestamps;
    };

    const tautulliHourStatsMatchPlexPlays = (tautulliCount, plexCount) => {
        if (!tautulliCount || !plexCount) return false;
        if (tautulliCount === plexCount) return true;
        const tolerance = Math.max(2, Math.ceil(plexCount * 0.25));
        return Math.abs(tautulliCount - plexCount) <= tolerance;
    };

    const resolveTautulliHourStats = async (config, { username, email, plexAccountName, days, afterUnixSec, maxItems = 5000, plexPlayCount = 0 }) => {
        if (!config?.tautulliUrl || !config?.tautulliApiKey) return null;
        const tUrl = resolveIntegrationUrlForFetch(config.tautulliUrl);
        if (!tUrl) return null;

        const users = await fetchTautulliUsers(config);
        const tautulliUserId = resolveTautulliUserId(users, { username, email, plexAccountName });
        if (!tautulliUserId) {
            log(`Tautulli hour stats: no matching user for "${username || plexAccountName || email || 'unknown'}".`);
            return null;
        }

        const timeRangeDays = days === 'all' ? 'all' : (parseInt(days, 10) || 30);
        let stats = await fetchTautulliPlaysByHourOfDay(config, tUrl, tautulliUserId, timeRangeDays);
        if (!stats) {
            const timezone = await fetchTautulliTimezone(config);
            const starts = await fetchTautulliUserHistoryStarts(config, tUrl, tautulliUserId, { afterUnixSec, maxItems });
            if (starts.length > 0) stats = buildHourStatsFromUnixTimestamps(starts, timezone, log);
        }

        if (!stats?.hourCount) return null;
        if (plexPlayCount > 0 && !tautulliHourStatsMatchPlexPlays(stats.hourCount, plexPlayCount)) {
            log(`Tautulli hour stats count (${stats.hourCount}) mismatches Plex plays (${plexPlayCount}) for user ${tautulliUserId}; ignoring Tautulli hours.`);
            return null;
        }
        return stats;
    };

    return {
        getHourInTimezone: getHour,
        getWeekdayInTimezone: getWeekday,
        resolvePeakHour,
        resolveTimeOfDayPersona,
        fetchTautulliTimezone,
        fetchTautulliUsers,
        resolveTautulliUserId,
        resolveTautulliHourStats,
    };
};
