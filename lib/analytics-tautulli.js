import fetch from 'node-fetch';

export const createTautulliAnalytics = ({
    app,
    requireAuth,
    requireMember,
    configPath,
    loadFile,
    resolveIntegrationUrlForFetch,
    log,
}) => {
    const CONFIG_PATH = configPath;

    const TAUTULLI_HISTORY_PAGE_SIZE = 500;
    let cachedTautulliUsers = null;
    let cachedTautulliUsersAt = 0;
    let cachedTautulliTimezone = null;
    let cachedTautulliTimezoneAt = 0;
    
    const getHourInTimezone = (unixSec, timeZone) => {
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
    
    const getWeekdayInTimezone = (unixSec, timeZone) => {
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
    
    const buildHourStatsFromUnixTimestamps = (timestamps, timeZone) => {
        const hourDistribution = new Array(24).fill(0);
        let totalHourOfDay = 0;
        for (const ts of timestamps) {
            const hour = getHourInTimezone(ts, timeZone);
            totalHourOfDay += hour;
            hourDistribution[hour]++;
        }
        return {
            totalHourOfDay,
            hourCount: timestamps.length,
            hourDistribution,
        };
    };
    
    const resolvePeakHour = (hourDistribution) => {
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
    
    const resolveTimeOfDayPersona = (hour) => {
        if (hour == null) return 'Night Owl';
        if (hour >= 5 && hour < 12) return 'Early Bird';
        if (hour >= 12 && hour < 18) return 'Afternoon Watcher';
        if (hour >= 18) return 'Evening Streamer';
        return 'Night Owl';
    };
    
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
            if (starts.length > 0) stats = buildHourStatsFromUnixTimestamps(starts, timezone);
        }
    
        if (!stats?.hourCount) return null;
        if (plexPlayCount > 0 && !tautulliHourStatsMatchPlexPlays(stats.hourCount, plexPlayCount)) {
            log(`Tautulli hour stats count (${stats.hourCount}) mismatches Plex plays (${plexPlayCount}) for user ${tautulliUserId}; ignoring Tautulli hours.`);
            return null;
        }
        return stats;
    };
    
    app.get('/api/tautulli/stats', requireAuth, requireMember, async (req, res) => {
        try {
            const config = await loadFile(CONFIG_PATH, null);
            if (!config || !config.tautulliUrl || !config.tautulliApiKey) {
                return res.status(404).json({ error: 'Tautulli is not configured.' });
            }
            const tUrl = resolveIntegrationUrlForFetch(config.tautulliUrl);
            const response = await fetch(`${tUrl}/api/v2?apikey=${config.tautulliApiKey}&cmd=get_home_stats`, { headers: { 'Accept': 'application/json' } }).then(r => r.json());
    
            if (response && response.response && response.response.data) {
                const stats = response.response.data;
                let streamsRecord = 0;
                let totalPlays = 0;
                let totalTimeStr = '';
    
                let tvPlays = 0;
                let moviePlays = 0;
                let musicPlays = 0;
                let totalDurationSec = 0;
    
                let transcodeRecord = 0;
                let directPlayRecord = 0;
                let directStreamRecord = 0;
    
                const concurrent = stats.find(s => s.stat_id === 'most_concurrent');
                if (concurrent && concurrent.rows) {
                    const c = concurrent.rows.find(r => r.title === 'Concurrent Streams');
                    if (c) streamsRecord = c.count;
    
                    const tr = concurrent.rows.find(r => r.title === 'Concurrent Transcodes');
                    if (tr) transcodeRecord = tr.count;
    
                    const dp = concurrent.rows.find(r => r.title === 'Concurrent Direct Plays');
                    if (dp) directPlayRecord = dp.count;
    
                    const ds = concurrent.rows.find(r => r.title === 'Concurrent Direct Streams');
                    if (ds) directStreamRecord = ds.count;
                }
    
                const libraries = stats.find(s => s.stat_id === 'top_libraries');
                if (libraries && libraries.rows) {
                    libraries.rows.forEach(lib => {
                        totalPlays += lib.total_plays || 0;
                        totalDurationSec += lib.total_duration || 0;
    
                        if (lib.section_type === 'show') tvPlays += lib.total_plays || 0;
                        else if (lib.section_type === 'movie') moviePlays += lib.total_plays || 0;
                        else if (lib.section_type === 'artist') musicPlays += lib.total_plays || 0;
                    });
                }
    
                if (totalDurationSec > 0) {
                    const days = Math.floor(totalDurationSec / 86400);
                    const hrs = Math.floor((totalDurationSec % 86400) / 3600);
                    if (days > 0) totalTimeStr = `${days} days, ${hrs} hrs`;
                    else totalTimeStr = `${hrs} hrs`;
                }
    
                return res.json({ streamsRecord, transcodeRecord, directPlayRecord, directStreamRecord, totalPlays, tvPlays, moviePlays, musicPlays, totalTimeStr });
            }
            res.status(500).json({ error: 'Invalid response from Tautulli' });
        } catch (e) {
            log(`Tautulli Error: ${e.message}`);
            res.status(500).json({ error: 'Failed to connect to Tautulli' });
        }
    });
    
    app.get('/api/tautulli/graphs', requireAuth, requireMember, async (req, res) => {
        try {
            const config = await loadFile(CONFIG_PATH, null);
            if (!config || !config.tautulliUrl || !config.tautulliApiKey) {
                return res.status(404).json({ error: 'Tautulli is not configured.' });
            }
            const tUrl = resolveIntegrationUrlForFetch(config.tautulliUrl);
            const days = req.query.days || 30;
            const yAxis = req.query.y_axis || 'plays';
    
            const endpoints = [
                'get_plays_by_date',
                'get_plays_by_dayofweek',
                'get_plays_by_hourofday',
                'get_plays_by_stream_type',
                'get_plays_by_stream_resolution',
                'get_plays_by_top_10_platforms',
                'get_concurrent_streams_by_stream_type',
                'get_plays_by_source_resolution',
                'get_plays_by_top_10_users'
            ];
            const results = await Promise.all(
                endpoints.map(cmd => {
                    let url = `${tUrl}/api/v2?apikey=${config.tautulliApiKey}&cmd=${cmd}&time_range=${days}`;
                    if (cmd !== 'get_concurrent_streams_by_stream_type') {
                        url += `&y_axis=${yAxis}`;
                    }
                    return fetch(url, { headers: { 'Accept': 'application/json' } })
                        .then(r => r.json())
                        .then(j => ({ cmd, data: j?.response?.data || {} }))
                        .catch(e => ({ cmd, data: {} }));
                })
            );
    
            const payload = {};
            results.forEach(r => {
                payload[r.cmd] = r.data;
            });
            if (!req.user?.isAdmin && payload.get_plays_by_top_10_users && Array.isArray(payload.get_plays_by_top_10_users.series)) {
                payload.get_plays_by_top_10_users.series = payload.get_plays_by_top_10_users.series.map((series, index) => ({
                    ...series,
                    name: `Viewer ${index + 1}`
                }));
            }
    
            return res.json(payload);
        } catch (e) {
            log(`Tautulli Graphs Error: ${e.message}`);
            res.status(500).json({ error: 'Failed to fetch graphs from Tautulli' });
        }
    });

    return {
        getHourInTimezone,
        getWeekdayInTimezone,
        resolvePeakHour,
        resolveTimeOfDayPersona,
        fetchTautulliTimezone,
        fetchTautulliUsers,
        resolveTautulliUserId,
        resolveTautulliHourStats,
    };
};
