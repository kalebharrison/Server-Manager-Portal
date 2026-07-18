import { createTautulliHourStats } from './tautulli-hour-stats.js';
import {
    getHourInTimezone,
    getWeekdayInTimezone,
    resolvePeakHour,
    resolveTimeOfDayPersona,
} from './tautulli-time-helpers.js';

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
        const tUrl = await resolveIntegrationUrlForFetch(config.tautulliUrl);
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
        const tUrl = await resolveIntegrationUrlForFetch(config.tautulliUrl);
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

    const { resolveTautulliHourStats } = createTautulliHourStats({
        resolveIntegrationUrlForFetch,
        fetchTautulliUsers,
        resolveTautulliUserId,
        fetchTautulliTimezone,
        log,
    });

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
