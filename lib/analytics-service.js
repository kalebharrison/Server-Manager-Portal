import fs from 'fs/promises';
import fetch from 'node-fetch';

export const createAnalyticsService = ({
    app,
    requireAuth,
    requireMember,
    requireAdmin,
    configPath,
    usersPath,
    analyticsCachePath,
    trendingCachePath,
    plexStatsCachePath,
    loadFile,
    saveFile,
    getPlexConnectionUri,
    resolveIntegrationUrlForFetch,
    fetchWithTimeout,
    fetchPlexServerAccounts,
    resolveLocalPlexAccountId,
    resolveCurrentAdmin,
    plexImageUrl,
    withBasePath,
    jellyfinItemUrl,
    isJellyfinConfigured,
    buildPlexStatsCache,
    getCachedPlexMetadata,
    setCachedPlexMetadata,
    enrichRecentItemsWithMediaTags,
    sendEmail,
    escapeHtmlAttr,
    markTaskStart,
    markTaskEnd,
    systemJobs,
    log,
}) => {
    const CONFIG_PATH = configPath;
    const USERS_PATH = usersPath;
    const ANALYTICS_CACHE_PATH = analyticsCachePath;
    const TRENDING_CACHE_PATH = trendingCachePath;
    const PLEX_STATS_CACHE_PATH = plexStatsCachePath;

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
    
    const toNumber = (value, fallback = 0) => {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    };
    
    const calculateDelta = (current, previous) => {
        const currentVal = toNumber(current, 0);
        const previousVal = Math.max(0, toNumber(previous, 0));
        const absolute = currentVal - previousVal;
        const percent = previousVal > 0 ? Number(((absolute / previousVal) * 100).toFixed(1)) : null;
        return { current: currentVal, previous: previousVal, absolute, percent };
    };
    
    const sumLibraryPlays = (libraries = []) => (libraries || []).reduce((sum, lib) => sum + toNumber(lib.plays, 0), 0);
    
    const normalizeAnalyticsDaysForJellystat = (days) => {
        if (String(days) === 'all') return 36500;
        return Math.min(Math.max(parseInt(days, 10) || 30, 1), 36500);
    };
    
    const jellystatHeaders = (apiKey) => ({
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-API-Token': apiKey,
    });
    
    const fetchJellystatJson = async (config, endpoint, { method = 'GET', body = null, query = null } = {}) => {
        if (!config?.jellystatUrl || !config?.jellystatApiKey) {
            throw new Error('Jellystat is not configured');
        }
        const baseUrl = resolveIntegrationUrlForFetch(config.jellystatUrl);
        const params = query ? `?${new URLSearchParams(query).toString()}` : '';
        const response = await fetchWithTimeout(`${baseUrl}${endpoint}${params}`, {
            method,
            headers: jellystatHeaders(config.jellystatApiKey),
            ...(body ? { body: JSON.stringify(body) } : {}),
        }, 15000);
        if (!response.ok) throw new Error(`Jellystat returned HTTP ${response.status} for ${endpoint}`);
        return response.json().catch(() => null);
    };
    
    const sumJellystatRowCounts = (row = {}) => Object.entries(row)
        .filter(([key]) => key !== 'Key')
        .reduce((sum, [, value]) => sum + toNumber(value?.count, 0), 0);
    
    const buildJellystatLibraryHealth = (topLibraries = [], overview = [], metadata = [], libraryTypeTotals = {}) => {
        const metadataById = new Map((Array.isArray(metadata) ? metadata : []).map((item) => [String(item.Id), item]));
        const libraries = Array.isArray(overview) ? overview : [];
        const totalCatalogBytes = libraries.reduce((sum, lib) => sum + toNumber(metadataById.get(String(lib.Id))?.Size, 0), 0);
        const movies = libraries
            .filter((lib) => String(lib.CollectionType || '').toLowerCase() === 'movies')
            .reduce((sum, lib) => sum + toNumber(lib.Library_Count, 0), 0);
        const shows = libraries
            .filter((lib) => String(lib.CollectionType || '').toLowerCase() === 'tvshows')
            .reduce((sum, lib) => sum + toNumber(lib.Library_Count, 0), 0);
        const episodes = libraries.reduce((sum, lib) => sum + toNumber(lib.Episode_Count, 0), 0);
        const libraryPlays = sumLibraryPlays(topLibraries);
        const leadingLibraryPlays = toNumber(topLibraries?.[0]?.plays, 0);
        const concentrationPct = libraryPlays > 0 ? Number(((leadingLibraryPlays / libraryPlays) * 100).toFixed(1)) : 0;
        const activeLibraries = topLibraries.filter((lib) => toNumber(lib.plays, 0) > 0).length;
        const watchedItemsEstimate = toNumber(libraryTypeTotals.Movie, 0) + toNumber(libraryTypeTotals.Series, 0) + toNumber(libraryTypeTotals.Audio, 0);
        const totalPlayableItems = movies + episodes;
        const catalogWatchedPct = totalPlayableItems > 0 ? Number(((watchedItemsEstimate / totalPlayableItems) * 100).toFixed(1)) : 0;
        let healthLabel = 'Concentrated';
        if (activeLibraries >= 5 && concentrationPct <= 55) healthLabel = 'Balanced';
        if (activeLibraries >= 8 && concentrationPct <= 40) healthLabel = 'Excellent';
    
        return {
            activeLibraries,
            concentrationPct,
            totalCatalogItems: movies + shows,
            totalCatalogBytes,
            sizeGB: Number((totalCatalogBytes / (1024 * 1024 * 1024)).toFixed(1)),
            fourKPercent: 0,
            healthLabel,
            catalogWatchedPct,
            movies,
            shows,
            episodes,
            artists: 0,
            albums: 0,
            tracks: 0,
        };
    };
    
    const mapJellystatContent = (config, items = [], type = 'movie') => (Array.isArray(items) ? items : []).slice(0, 10).map((item) => ({
        key: item.Id || item.Name,
        title: item.Name || 'Untitled',
        type,
        thumb: item.Id || null,
        thumbUrl: item.Id ? withBasePath(`/api/jellyfin/image?itemId=${encodeURIComponent(item.Id)}&width=300&height=450`) : '',
        plays: toNumber(item.Plays ?? item.times_played ?? item.unique_viewers, 0),
        plexUrl: jellyfinItemUrl(config, item.Id),
    }));
    
    const aggregateAnalyticsWindow = (historyItems, { afterTs = 0, beforeTs = null }, ctx, { includePortalUsers = false } = {}) => {
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
    
    const summarizeLibraryHealth = (topLibraries = [], stats = {}, cachedData = {}) => {
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
    
    const getUniqueActiveViewers = (users = []) => (users || []).filter(u => toNumber(u.plays, 0) > 0).length;
    
    app.get('/api/jellystat/analytics', requireAuth, requireMember, async (req, res) => {
        try {
            const config = await loadFile(CONFIG_PATH, {});
            if (!isJellyfinConfigured(config)) {
                return res.status(503).json({ error: 'Jellyfin not configured' });
            }
            if (!config.jellystatUrl || !config.jellystatApiKey) {
                return res.status(503).json({ error: 'Jellystat is not configured' });
            }
    
            const requestedDays = req.query.days || 30;
            const days = normalizeAnalyticsDaysForJellystat(requestedDays);
            const postBody = { days };
            const [
                libraryTypeTotals,
                viewsByHour,
                libraryOverview,
                libraryMetadata,
                mostViewedLibraries,
                mostActiveUsers,
                mostUsedClients,
                mostViewedMovies,
                mostViewedShows,
                mostViewedMusic,
                playbackMethods,
            ] = await Promise.all([
                fetchJellystatJson(config, '/stats/getViewsByLibraryType', { query: { days } }).catch((e) => { log(e.message); return {}; }),
                fetchJellystatJson(config, '/stats/getViewsByHour', { query: { days } }).catch((e) => { log(e.message); return {}; }),
                fetchJellystatJson(config, '/stats/getLibraryOverview', { query: { days } }).catch((e) => { log(e.message); return []; }),
                fetchJellystatJson(config, '/stats/getLibraryMetadata').catch((e) => { log(e.message); return []; }),
                fetchJellystatJson(config, '/stats/getMostViewedLibraries', { method: 'POST', body: postBody }).catch((e) => { log(e.message); return []; }),
                fetchJellystatJson(config, '/stats/getMostActiveUsers', { method: 'POST', body: postBody }).catch((e) => { log(e.message); return []; }),
                fetchJellystatJson(config, '/stats/getMostUsedClient', { method: 'POST', body: postBody }).catch((e) => { log(e.message); return []; }),
                fetchJellystatJson(config, '/stats/getMostViewedByType', { method: 'POST', body: { ...postBody, type: 'Movie' } }).catch((e) => { log(e.message); return []; }),
                fetchJellystatJson(config, '/stats/getMostViewedByType', { method: 'POST', body: { ...postBody, type: 'Series' } }).catch((e) => { log(e.message); return []; }),
                fetchJellystatJson(config, '/stats/getMostViewedByType', { method: 'POST', body: { ...postBody, type: 'Audio' } }).catch((e) => { log(e.message); return []; }),
                fetchJellystatJson(config, '/stats/getPlaybackMethodStats', { method: 'POST', body: postBody }).catch((e) => { log(e.message); return []; }),
            ]);
    
            const peakHours = new Array(24).fill(0);
            if (Array.isArray(viewsByHour?.stats)) {
                viewsByHour.stats.forEach((row) => {
                    const hour = parseInt(row.Key, 10);
                    if (hour >= 0 && hour < 24) peakHours[hour] = sumJellystatRowCounts(row);
                });
            }
    
            const shouldObfuscateUsernames = !req.user?.isAdmin;
            const topUsers = (Array.isArray(mostActiveUsers) ? mostActiveUsers : []).map((user, index) => ({
                id: user.UserId || user.Id || user.Name || `user-${index}`,
                username: shouldObfuscateUsernames ? `Viewer ${index + 1}` : (user.Name || user.UserName || `User ${index + 1}`),
                thumb: user.UserId ? withBasePath(`/api/jellyfin/user-image?userId=${encodeURIComponent(user.UserId)}`) : null,
                plays: toNumber(user.Plays ?? user.TotalPlays, 0),
            }));
    
            const topLibraries = (Array.isArray(mostViewedLibraries) ? mostViewedLibraries : []).map((library, index) => ({
                id: library.Id || library.Name || `library-${index}`,
                title: library.Name || `Library ${index + 1}`,
                plays: toNumber(library.Plays ?? library.Count, 0),
            })).sort((a, b) => b.plays - a.plays).slice(0, 10);
    
            const topDevices = (Array.isArray(mostUsedClients) ? mostUsedClients : []).map((device, index) => ({
                name: device.Client || device.Name || `Client ${index + 1}`,
                plays: toNumber(device.Plays ?? device.Count, 0),
            })).sort((a, b) => b.plays - a.plays).slice(0, 10);
    
            const playbackCounts = {};
            (Array.isArray(playbackMethods) ? playbackMethods : []).forEach((method) => {
                playbackCounts[String(method.Name || '').toLowerCase()] = Math.max(playbackCounts[String(method.Name || '').toLowerCase()] || 0, toNumber(method.Count, 0));
            });
    
            const totalPlaybacks = sumLibraryPlays(topLibraries) || Object.values(libraryTypeTotals || {}).reduce((sum, value) => sum + toNumber(value, 0), 0);
            const libraryHealth = buildJellystatLibraryHealth(topLibraries, libraryOverview, libraryMetadata, libraryTypeTotals);
    
            res.json({
                topUsers,
                topLibraries,
                topMovies: mapJellystatContent(config, mostViewedMovies, 'movie'),
                topShows: mapJellystatContent(config, mostViewedShows, 'show'),
                topMusic: mapJellystatContent(config, mostViewedMusic, 'track'),
                topDevices,
                peakHours,
                totalPlaybacks,
                maxConcurrentStreams: 0,
                maxDirectPlays: toNumber(playbackCounts.directplay, 0),
                maxTranscodes: toNumber(playbackCounts.transcode, 0),
                compare: null,
                libraryHealth,
                requestedPeriodDays: requestedDays,
                cachePeriodDays: requestedDays,
                cacheFallback: false,
                source: 'jellystat',
                jellystatInsights: {
                    streamsRecord: 0,
                    transcodeRecord: toNumber(playbackCounts.transcode, 0),
                    directPlayRecord: toNumber(playbackCounts.directplay, 0),
                    directStreamRecord: toNumber(playbackCounts.directstream, 0),
                    totalPlays: totalPlaybacks,
                    tvPlays: toNumber(libraryTypeTotals.Series, 0),
                    moviePlays: toNumber(libraryTypeTotals.Movie, 0),
                    musicPlays: toNumber(libraryTypeTotals.Audio, 0),
                    totalTimeStr: '',
                },
            });
        } catch (e) {
            log(`Jellystat analytics error: ${e.message}`);
            res.status(500).json({ error: 'Failed to fetch Jellystat analytics' });
        }
    });
    
    const fetchPlexAccountHistory = async (uri, config, accountID, { maxItems = 250000 } = {}) => {
        const pageSize = 5000;
        let historyItems = [];
        let start = 0;
    
        while (start < maxItems) {
            const pageRes = await fetch(
                `${uri}/status/sessions/history/all?accountID=${accountID}&X-Plex-Token=${config.plexToken}&sort=viewedAt:desc&X-Plex-Container-Start=${start}&X-Plex-Container-Size=${pageSize}`,
                { headers: { Accept: 'application/json' } },
            ).then((r) => r.json()).catch(() => null);
    
            const pageContainer = pageRes?.MediaContainer;
            const pageItems = Array.isArray(pageContainer?.Metadata) ? pageContainer.Metadata : [];
            if (pageItems.length === 0) break;
    
            historyItems = historyItems.concat(pageItems);
            start += pageItems.length;
    
            const totalSize = Number(pageContainer.totalSize || 0);
            if ((totalSize > 0 && start >= totalSize) || pageItems.length < pageSize) break;
        }
    
        if (historyItems.length >= maxItems) {
            log(`Personal analytics history fetch reached safety cap (${maxItems}) for account ${accountID}.`);
        }
    
        return historyItems;
    };
    
    app.get('/api/plex/analytics', requireAuth, requireMember, async (req, res) => {
        try {
            const statsData = await loadFile(ANALYTICS_CACHE_PATH, {});
            const reqDays = req.query.days || 30;
            const hasRequestedPeriod = statsData[reqDays] != null;
            const cachedPeriod = hasRequestedPeriod ? reqDays : (statsData[30] != null ? 30 : null);
            const cachedData = statsData[reqDays] || statsData[30] || { topUsers: [], topLibraries: [], topMovies: [], topShows: [], topMusic: [], topDevices: [], peakHours: new Array(24).fill(0), totalPlaybacks: 0 };
            
            const config = await loadFile(CONFIG_PATH, {});
            const showUsernames = !!config.showUsernamesInAnalytics;
            const shouldObfuscateUsernames = !req.user?.isAdmin && !showUsernames;
            const topUsers = (cachedData.topUsers || []).map((user, index) => ({
                ...user,
                username: shouldObfuscateUsernames ? `Viewer ${index + 1}` : (user.username || `User ${index + 1}`)
            }));
            const data = {
                ...cachedData,
                topUsers,
                requestedPeriodDays: reqDays,
                cachePeriodDays: cachedPeriod,
                cacheFallback: cachedPeriod != null && String(cachedPeriod) !== String(reqDays),
            };
            
            // attach max stats dynamically
            const stats = await loadFile(PLEX_STATS_CACHE_PATH, {});
            if (stats.episodes === undefined || stats.resolutions === undefined) {
                buildPlexStatsCache().catch(() => {});
            }
            data.maxConcurrentStreams = stats.maxConcurrentStreams || 0;
            data.maxDirectPlays = stats.maxDirectPlays || 0;
            data.maxTranscodes = stats.maxTranscodes || 0;
            data.libraryHealth = summarizeLibraryHealth(data.topLibraries || [], stats, cachedData);
    
            const priorPeriod = cachedData.priorPeriod;
            if (priorPeriod && reqDays !== 'all') {
                const currentUniqueViewers = getUniqueActiveViewers(cachedData.topUsers || []);
                const priorUniqueViewers = getUniqueActiveViewers(priorPeriod.topUsers || []);
                const currentLibraryPlays = sumLibraryPlays(cachedData.topLibraries);
                const priorLibraryPlays = sumLibraryPlays(priorPeriod.topLibraries);
    
                data.compare = {
                    previousPeriodDays: String(reqDays),
                    totalPlaybacks: calculateDelta(toNumber(data.totalPlaybacks, 0), priorPeriod.totalPlaybacks),
                    uniqueViewers: calculateDelta(currentUniqueViewers, priorUniqueViewers),
                    libraryPlays: calculateDelta(currentLibraryPlays, priorLibraryPlays)
                };
            } else {
                data.compare = null;
            }
    
            res.json(data);
        } catch (e) {
            log(`Error fetching analytics: ${e.message}`);
            res.status(500).json({ error: 'Analytics error' });
        }
    });
    
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
    
            const historyItems = await fetchPlexAccountHistory(uri, config, accountID);
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
    
            // Build a neighbourhood snapshot: the 2 users above and 2 below
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
                topShows,
                topMovies,
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
    
    app.get('/api/plex/analytics/user/:id/history', requireAdmin, async (req, res) => {
        try {
            const config = await loadFile(CONFIG_PATH, null);
            if (!config || !config.plexToken || !config.serverIdentifier) return res.status(503).json({ error: 'Plex not configured' });
    
            const uri = await getPlexConnectionUri(config);
            if (!uri) return res.status(503).json({ error: 'Cannot connect to Plex' });
    
            const accountID = req.params.id;
            const page = parseInt(req.query.page, 10) || 1;
            const limit = parseInt(req.query.limit, 10) || 15;
            const search = (req.query.search || '').trim().toLowerCase();
    
            let historyData = [];
            let totalRecords = 0;
    
            let usedTautulli = false;
            if (config.tautulliUrl && config.tautulliApiKey) {
                const tUrl = resolveIntegrationUrlForFetch(config.tautulliUrl);
                const { list: plexAccounts } = await fetchPlexServerAccounts(uri, config);
                const plexAccountName = plexAccounts.find((a) => String(a.id) === String(accountID))?.name || null;
                
                const users = await loadFile(USERS_PATH, []);
                const targetUser = users.find(u => String(u.plexAccountId) === String(accountID));
                const tUsers = await fetchTautulliUsers(config);
                const tautulliUserId = resolveTautulliUserId(tUsers, { username: targetUser?.username, email: targetUser?.email, plexAccountName });
    
                if (tautulliUserId) {
                    const params = new URLSearchParams({
                        apikey: config.tautulliApiKey,
                        cmd: 'get_history',
                        order_column: 'date',
                        order_dir: 'desc',
                        start: String((page - 1) * limit),
                        length: String(limit),
                        user_id: String(tautulliUserId),
                        search: search
                    });
                    const tRes = await fetch(`${tUrl}/api/v2?${params.toString()}`, { headers: { Accept: 'application/json' } })
                        .then(r => r.json()).catch(() => null);
                    
                    if (tRes && tRes.response && tRes.response.data && tRes.response.data.data) {
                        totalRecords = tRes.response.data.recordsFiltered;
                        historyData = tRes.response.data.data.map(item => ({
                            title: item.title,
                            parentTitle: item.grandparent_title || item.parent_title,
                            type: item.media_type,
                            viewedAt: item.date,
                            thumbUrl: item.thumb ? plexImageUrl(item.thumb) : null,
                            duration: item.duration,
                            percentComplete: item.percent_complete
                        }));
                        usedTautulli = true;
                    }
                }
            }
    
            if (!usedTautulli) {
                const allHistory = await fetchPlexAccountHistory(uri, config, accountID, { maxItems: 10000 });
                
                const mapHistoryToRecent = (item) => ({
                    title: item.type === 'episode' ? (item.grandparentTitle || item.parentTitle || item.title) : item.type === 'track' ? (item.parentTitle || item.grandparentTitle || item.title) : item.title,
                    episodeTitle: item.type === 'episode' || item.type === 'track' ? item.title : null,
                    viewedAt: item.viewedAt,
                    type: item.type,
                    thumbUrl: item.thumb ? plexImageUrl(item.thumb) : null
                });
    
                let filtered = allHistory.map(mapHistoryToRecent);
                if (search) {
                    filtered = filtered.filter(item => 
                        (item.title && item.title.toLowerCase().includes(search)) || 
                        (item.episodeTitle && item.episodeTitle.toLowerCase().includes(search))
                    );
                }
                
                totalRecords = filtered.length;
                historyData = filtered.slice((page - 1) * limit, page * limit);
            }
    
            res.json({
                data: historyData,
                total: totalRecords,
                page,
                limit,
                source: usedTautulli ? 'tautulli' : 'plex'
            });
        } catch (e) {
            log(`Error fetching user history API: ${e.message}`);
            res.status(500).json({ error: 'Failed to fetch history' });
        }
    });
    
    app.post('/api/plex/report-issue', requireAuth, requireMember, async (req, res) => {
        try {
            const config = await loadFile(CONFIG_PATH, null);
            if (!config || !config.smtpUser) return res.status(503).json({ error: 'SMTP not configured' });
    
            const { title, key, issue } = req.body;
            if (!title || !issue) return res.status(400).json({ error: 'Missing title or issue' });
    
            const safeTitle = escapeHtmlAttr(String(title || ''));
            const safeKey = key ? escapeHtmlAttr(String(key)) : '';
            const safeUsername = escapeHtmlAttr(String(req.user.username || 'Unknown'));
            const safeIssue = escapeHtmlAttr(String(issue || '')).replace(/\n/g, '<br/>');
            const subject = `Plex Issue Report: ${String(title || '').slice(0, 120)}`;
            const html = `
                <h2>Issue Reported by ${safeUsername}</h2>
                <p><strong>Media:</strong> ${safeTitle}</p>
                ${safeKey ? `<p><strong>Key:</strong> ${safeKey}</p>` : ''}
                <p><strong>User's Note:</strong></p>
                <blockquote style="background: #f9f9f9; padding: 10px; border-left: 5px solid #E5A00D;">
                    ${safeIssue}
                </blockquote>
            `;
    
            await sendEmail(config, config.smtpUser, subject, html);
            res.json({ success: true });
        } catch (e) {
            log(`Error reporting issue: ${e.message}`);
            res.status(500).json({ error: 'Failed to report issue' });
        }
    });
    
    app.get('/api/plex/analytics/user/:id', requireAdmin, async (req, res) => {
        try {
            const config = await loadFile(CONFIG_PATH, null);
            if (!config || !config.plexToken || !config.serverIdentifier) return res.status(503).json({ error: 'Plex not configured' });
    
            const uri = await getPlexConnectionUri(config);
            if (!uri) return res.status(503).json({ error: 'Cannot connect to Plex' });
    
            const accountID = req.params.id;
            const limit = req.query.days === 'all' ? 999999 : 5000;
    
            const historyRes = await fetch(`${uri}/status/sessions/history/all?accountID=${accountID}&X-Plex-Token=${config.plexToken}&sort=viewedAt:desc&limit=${limit}`, { headers: { 'Accept': 'application/json' } }).then(r => r.json()).catch(() => null);
            const sectionsRes = await fetch(`${uri}/library/sections?X-Plex-Token=${config.plexToken}`, { headers: { 'Accept': 'application/json' } }).then(r => r.json()).catch(() => null);
    
            if (!historyRes || !historyRes.MediaContainer || !historyRes.MediaContainer.Metadata) {
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
            const recentHistory = [];
    
            const dayOfWeekCounts = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
            const hourDistribution = new Array(24).fill(0);
            const statsTimezone = await fetchTautulliTimezone(config);
    
            historyRes.MediaContainer.Metadata.forEach(item => {
                if (cutoffDate > 0 && item.viewedAt < cutoffDate) return;
                totalPlays++;
    
                const hour = getHourInTimezone(item.viewedAt, statsTimezone);
                hourDistribution[hour]++;
    
                const day = getWeekdayInTimezone(item.viewedAt, statsTimezone);
                if (day >= 0 && day <= 6) dayOfWeekCounts[day]++;
    
                // Recent history
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
    
                // Library aggregation
                if (item.librarySectionID) {
                    const libTitle = sectionsMap[item.librarySectionID] || `Library ${item.librarySectionID}`;
                    if (!libraryCounts[item.librarySectionID]) libraryCounts[item.librarySectionID] = { id: item.librarySectionID, title: libTitle, plays: 0 };
                    libraryCounts[item.librarySectionID].plays++;
                }
    
                // Content aggregation
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
    
            res.json({
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
            });
        } catch (e) {
            log(`Error fetching user analytics: ${e.message}`);
            res.status(500).json({ error: 'Analytics error' });
        }
    });

    app.get('/api/media-stack/trending', requireAuth, requireMember, async (req, res) => {
        const stats = await loadFile(TRENDING_CACHE_PATH, { movies: 0, series: 0 });
        res.json(stats);
    });
    
    // (Endpoints moved up before wildcard route)
    
    let isBuildingAnalyticsStats = false;
    let isBuildingTrendingStats = false;
    
    async function calculateAnalyticsStats() {
        if (isBuildingAnalyticsStats) {
            log('[AnalyticsStats] Build already in progress, skipping.');
            return;
        }
        isBuildingAnalyticsStats = true;
        try {
            markTaskStart(systemJobs.analyticsCache);
            const config = await loadFile(CONFIG_PATH, null);
            if (!config || !config.plexToken || !config.serverIdentifier) {
                markTaskEnd(systemJobs.analyticsCache, null);
                return;
            }
            
            const uri = await getPlexConnectionUri(config);
            if (!uri) {
                markTaskEnd(systemJobs.analyticsCache, null);
                return;
            }
    
            log('Starting background calculation of Plex Analytics Stats...');
    
            const pageSize = 5000;
            const maxHistoryItems = 250000;
            let historyItems = [];
            let start = 0;
    
            while (start < maxHistoryItems) {
                const pageRes = await fetch(
                    `${uri}/status/sessions/history/all?X-Plex-Token=${config.plexToken}&sort=viewedAt:desc&X-Plex-Container-Start=${start}&X-Plex-Container-Size=${pageSize}`,
                    { headers: { 'Accept': 'application/json' } }
                ).then(r => r.json()).catch(() => null);
    
                const pageContainer = pageRes && pageRes.MediaContainer ? pageRes.MediaContainer : null;
                const pageItems = pageContainer && Array.isArray(pageContainer.Metadata) ? pageContainer.Metadata : [];
                if (pageItems.length === 0) break;
    
                historyItems = historyItems.concat(pageItems);
                start += pageItems.length;
    
                const totalSize = Number(pageContainer.totalSize || 0);
                if ((totalSize > 0 && start >= totalSize) || pageItems.length < pageSize) break;
            }
    
            if (historyItems.length >= maxHistoryItems) {
                log(`Analytics history fetch reached safety cap (${maxHistoryItems}). Results may be truncated.`);
            }
    
            const sectionsRes = await fetch(`${uri}/library/sections?X-Plex-Token=${config.plexToken}`, { headers: { 'Accept': 'application/json' } }).then(r => r.json()).catch(() => null);
            const accountsRes = await fetch(`${uri}/accounts?X-Plex-Token=${config.plexToken}`, { headers: { 'Accept': 'application/json' } }).then(r => r.json()).catch(() => null);
            const devicesRes = await fetch(`${uri}/devices?X-Plex-Token=${config.plexToken}`, { headers: { 'Accept': 'application/json' } }).then(r => r.json()).catch(() => null);
            const users = await loadFile(USERS_PATH, []);
    
            if (!Array.isArray(historyItems) || historyItems.length === 0) {
                markTaskEnd(systemJobs.analyticsCache, null);
                return;
            }
    
            const accountsMap = {};
            if (accountsRes && accountsRes.MediaContainer && accountsRes.MediaContainer.Account) {
                accountsRes.MediaContainer.Account.forEach(acc => accountsMap[acc.id] = { name: acc.name, thumb: acc.thumb });
            }
    
            const sectionsMap = {};
            if (sectionsRes && sectionsRes.MediaContainer && sectionsRes.MediaContainer.Directory) {
                sectionsRes.MediaContainer.Directory.forEach(s => sectionsMap[s.key] = s.title);
            }
    
            const devicesMap = {};
            if (devicesRes && devicesRes.MediaContainer && devicesRes.MediaContainer.Device) {
                devicesRes.MediaContainer.Device.forEach(d => devicesMap[d.id] = d.name || d.platform || 'Unknown Device');
            }
    
            const fetchRichMetadata = async (c) => {
                if (c.thumb) c.thumbUrl = plexImageUrl(c.thumb);
                try {
                    const metadataId = c.key.split('/').pop();
                    const metaRes = await fetch(`${uri}/library/metadata/${metadataId}?X-Plex-Token=${config.plexToken}`, { headers: { 'Accept': 'application/json' } }).then(r => r.json()).catch(() => null);
                    if (metaRes && metaRes.MediaContainer && metaRes.MediaContainer.Metadata && metaRes.MediaContainer.Metadata.length > 0) {
                        const meta = metaRes.MediaContainer.Metadata[0];
                        c.summary = meta.summary || '';
                        c.year = meta.year || '';
                        c.rating = meta.rating || meta.audienceRating || '';
                        c.contentRating = meta.contentRating || '';
                        c.duration = meta.duration || 0;
                        c.genres = meta.Genre ? meta.Genre.map(g => g.tag) : [];
                    }
                } catch (e) {}
                return c;
            };
    
            const timeframes = [1, 7, 30, 60, 90, 180, 365, 1825, 'all'];
            const statsData = {};
            const nowSec = Math.floor(Date.now() / 1000);
            const aggCtx = { accountsMap, sectionsMap, devicesMap, users, config };
    
            for (const days of timeframes) {
                const afterTs = days === 'all' ? 0 : nowSec - (days * 24 * 60 * 60);
                const windowStats = aggregateAnalyticsWindow(historyItems, { afterTs, beforeTs: null }, aggCtx, { includePortalUsers: true });
    
                const topMovies = await Promise.all(Object.values(windowStats.contentCountsMovies).sort((a, b) => b.plays - a.plays).slice(0, 10).map(fetchRichMetadata));
                const topShows = await Promise.all(Object.values(windowStats.contentCountsShows).sort((a, b) => b.plays - a.plays).slice(0, 10).map(fetchRichMetadata));
                const topMusic = await Promise.all(Object.values(windowStats.contentCountsMusic).sort((a, b) => b.plays - a.plays).slice(0, 10).map(fetchRichMetadata));
    
                const entry = {
                    topUsers: windowStats.topUsers,
                    topLibraries: windowStats.topLibraries,
                    topMovies,
                    topShows,
                    topMusic,
                    topDevices: windowStats.topDevices,
                    peakHours: windowStats.peakHours,
                    totalPlaybacks: windowStats.totalPlaybacks
                };
    
                if (days !== 'all') {
                    const daySeconds = Number(days) * 24 * 60 * 60;
                    const priorStats = aggregateAnalyticsWindow(
                        historyItems,
                        { afterTs: nowSec - daySeconds * 2, beforeTs: nowSec - daySeconds },
                        aggCtx,
                        { includePortalUsers: false }
                    );
                    entry.priorPeriod = {
                        totalPlaybacks: priorStats.totalPlaybacks,
                        topUsers: priorStats.topUsers,
                        topLibraries: priorStats.topLibraries
                    };
                }
    
                statsData[days] = entry;
            }
    
            statsData.lastUpdated = Date.now();
            await saveFile(ANALYTICS_CACHE_PATH, statsData);
            log('Successfully calculated and cached Plex Analytics Stats.');
            markTaskEnd(systemJobs.analyticsCache, null);
    
        } catch (e) {
            log(`Error calculating analytics stats: ${e.message}`);
            markTaskEnd(systemJobs.analyticsCache, e);
        } finally {
            isBuildingAnalyticsStats = false;
        }
    }
    
    async function calculateTrendingStats() {
        if (isBuildingTrendingStats) {
            log('[TrendingStats] Build already in progress, skipping.');
            return;
        }
        isBuildingTrendingStats = true;
        try {
            markTaskStart(systemJobs.trendingCache);
            const config = await loadFile(CONFIG_PATH, null);
            if (!config || !config.plexToken || !config.serverIdentifier) {
                markTaskEnd(systemJobs.trendingCache, null);
                return;
            }
    
            const uri = await getPlexConnectionUri(config);
            if (!uri) {
                markTaskEnd(systemJobs.trendingCache, null);
                return;
            }
    
            log('Starting background calculation of Plex Trending Stats...');
    
            // Fetch up to 10,000 most recent history items
            const response = await fetch(`${uri}/status/sessions/history/all?sort=viewedAt%3Adesc&limit=10000&X-Plex-Token=${config.plexToken}`, { headers: { 'Accept': 'application/json' } }).catch(() => null);
            if (!response) {
                markTaskEnd(systemJobs.trendingCache, null);
                return;
            }
            const historyRes = await response.json().catch(() => null);
            if (!historyRes || !historyRes.MediaContainer || !historyRes.MediaContainer.Metadata) {
                log('No history found or failed to parse history JSON.');
                markTaskEnd(systemJobs.trendingCache, null);
                return;
            }
    
            const history = historyRes.MediaContainer.Metadata;
    
            const now = Date.now() / 1000;
            const days7 = now - (7 * 24 * 60 * 60);
            const days30 = now - (30 * 24 * 60 * 60);
            const days60 = now - (60 * 24 * 60 * 60);
            const days90 = now - (90 * 24 * 60 * 60);
            const days180 = now - (180 * 24 * 60 * 60);
            const days365 = now - (365 * 24 * 60 * 60);
    
            const counts = {
                trending7Days: {},
                movies30Days: {},
                shows30Days: {},
                top365Days: {},
                allTime: {},
                weekendWarriors: {},
                nightOwls: {},
                retroHits: {},
                cultClassics: {}
            };
            const userPlays = {
                '7': {},
                '30': {},
                '60': {},
                '90': {},
                '180': {},
                '365': {},
                'all': {}
            };
    
            history.forEach(item => {
                const viewedAt = item.viewedAt;
                const isMovie = item.type === 'movie';
                const isEpisode = item.type === 'episode';
    
                if (!isMovie && !isEpisode) return;
    
                const groupKey = isMovie ? item.ratingKey : item.grandparentKey;
    
                const metaId = String(groupKey).split('/').pop();
                const baseItem = {
                    ratingKey: metaId,
                    title: isMovie ? item.title : item.grandparentTitle,
                    thumb: isMovie ? item.thumb : (item.grandparentThumb || item.parentThumb || item.thumb),
                    type: isMovie ? 'movie' : 'show',
                    plexUrl: `https://app.plex.tv/desktop/#!/server/${config.serverIdentifier}/details?key=${encodeURIComponent('/library/metadata/' + metaId)}`
                };
    
                const increment = (obj) => {
                    if (!obj[groupKey]) {
                        obj[groupKey] = { ...baseItem, views: 0, users: new Set() };
                    }
                    obj[groupKey].views++;
                    obj[groupKey].users.add(item.accountID);
                };
    
                increment(counts.allTime); // All time gets incremented for every view
                userPlays['all'][item.accountID] = (userPlays['all'][item.accountID] || 0) + 1;
    
                // Time-based stats
                if (viewedAt >= days7) {
                    increment(counts.trending7Days);
                    userPlays['7'][item.accountID] = (userPlays['7'][item.accountID] || 0) + 1;
                }
                if (viewedAt >= days30) userPlays['30'][item.accountID] = (userPlays['30'][item.accountID] || 0) + 1;
                if (viewedAt >= days60) userPlays['60'][item.accountID] = (userPlays['60'][item.accountID] || 0) + 1;
                if (viewedAt >= days90) userPlays['90'][item.accountID] = (userPlays['90'][item.accountID] || 0) + 1;
                if (viewedAt >= days180) userPlays['180'][item.accountID] = (userPlays['180'][item.accountID] || 0) + 1;
                if (viewedAt >= days365) {
                    increment(counts.top365Days);
                    userPlays['365'][item.accountID] = (userPlays['365'][item.accountID] || 0) + 1;
                }
    
                // Movie / Show 30 days
                if (viewedAt >= days30) {
                    if (item.type === 'movie') increment(counts.movies30Days);
                    if (item.type === 'episode') increment(counts.shows30Days);
                }
    
                // Wacky Stats Logic
                const date = new Date(viewedAt * 1000);
                const dayOfWeek = date.getDay(); // 0 is Sunday, 5 is Friday, 6 is Saturday
                const hourOfDay = date.getHours(); // 0 to 23
    
                // Weekend Warriors (Friday, Saturday, Sunday)
                if (dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6) {
                    increment(counts.weekendWarriors);
                }
    
                // Night Owl Club (Midnight to 5am)
                if (hourOfDay >= 0 && hourOfDay < 5) {
                    increment(counts.nightOwls);
                }
    
                // Blast from the Past (Retro Hits - released before 2000)
                if (item.originallyAvailableAt && item.originallyAvailableAt.startsWith('19')) {
                    increment(counts.retroHits);
                }
    
                // Cult Classics (Track all-time for density later)
                increment(counts.cultClassics);
            });
    
            const excludedKeys = new Set();
    
            const getTopUnique = (obj, limit = 20) => {
                const sorted = Object.values(obj).sort((a, b) => b.views - a.views);
                const result = [];
                for (const item of sorted) {
                    if (result.length >= limit) break;
                    if (!excludedKeys.has(item.ratingKey)) {
                        result.push(item);
                        excludedKeys.add(item.ratingKey);
                    }
                }
                return result;
            };
    
            const getCultClassicsUnique = (obj) => {
                const sorted = Object.values(obj)
                    .filter(a => a.views > 10 && a.users.size <= 2)
                    .sort((a, b) => (b.views / b.users.size) - (a.views / a.users.size));
    
                const result = [];
                for (const item of sorted) {
                    if (result.length >= 20) break;
                    if (!excludedKeys.has(item.ratingKey)) {
                        result.push(item);
                        excludedKeys.add(item.ratingKey);
                    }
                }
                return result;
            };
    
            const leaderboards = {};
            const leaderboardsSorted = {};
            const totalActiveUsers = {};
            Object.keys(userPlays).forEach(period => {
                const sortedUsers = Object.entries(userPlays[period]).sort((a, b) => b[1] - a[1]);
                leaderboards[period] = {};
                leaderboardsSorted[period] = sortedUsers.map(([accountId, plays], index) => ({ accountId, plays, rank: index + 1 }));
                sortedUsers.forEach(([accountId, plays], index) => {
                    leaderboards[period][accountId] = { rank: index + 1, plays };
                });
                totalActiveUsers[period] = sortedUsers.length;
            });
    
            // Replace the in-memory `users` Set with a serializable count, since a Set
            // becomes {} under JSON.stringify and loses its size on reload.
            const stripUsers = (arr) => arr.map(({ users, ...rest }) => ({
                ...rest,
                userCount: users instanceof Set ? users.size : (rest.userCount || 0)
            }));
    
            const trendingLists = await Promise.all([
                enrichRecentItemsWithMediaTags(uri, config, stripUsers(getTopUnique(counts.trending7Days))),
                enrichRecentItemsWithMediaTags(uri, config, stripUsers(getTopUnique(counts.movies30Days))),
                enrichRecentItemsWithMediaTags(uri, config, stripUsers(getTopUnique(counts.shows30Days))),
                enrichRecentItemsWithMediaTags(uri, config, stripUsers(getTopUnique(counts.top365Days))),
                enrichRecentItemsWithMediaTags(uri, config, stripUsers(getTopUnique(counts.allTime))),
                enrichRecentItemsWithMediaTags(uri, config, stripUsers(getTopUnique(counts.weekendWarriors))),
                enrichRecentItemsWithMediaTags(uri, config, stripUsers(getTopUnique(counts.nightOwls))),
                enrichRecentItemsWithMediaTags(uri, config, stripUsers(getTopUnique(counts.retroHits))),
                enrichRecentItemsWithMediaTags(uri, config, stripUsers(getCultClassicsUnique(counts.cultClassics)))
            ]);
            const [
                trending7Days,
                movies30Days,
                shows30Days,
                top365Days,
                allTime,
                weekendWarriors,
                nightOwls,
                retroHits,
                cultClassics
            ] = trendingLists;
    
            const stats = {
                trending7Days,
                movies30Days,
                shows30Days,
                top365Days,
                allTime,
                weekendWarriors,
                nightOwls,
                retroHits,
                cultClassics,
                leaderboards,
                leaderboardsSorted,
                totalActiveUsers,
                lastUpdated: Date.now()
            };
    
            await saveFile(TRENDING_CACHE_PATH, stats);
            log('Successfully calculated and cached Plex Trending Stats.');
            markTaskEnd(systemJobs.trendingCache, null);
        } catch (e) {
            log(`Error calculating trending stats: ${e.message}`);
            markTaskEnd(systemJobs.trendingCache, e);
        } finally {
            isBuildingTrendingStats = false;
        }
    }
    
    const TRENDING_CACHE_INTERVAL_MS = 12 * 60 * 60 * 1000;
    const ANALYTICS_CACHE_INTERVAL_MS = 30 * 60 * 1000;
    const INITIAL_CACHE_BUILD_DELAY_MS = 10 * 1000;
    
    let trendingRebuildTimer = null;
    let analyticsRebuildTimer = null;
    
    const getCacheAgeMs = async (filePath, parsed, timestampFields = ['lastUpdated', 'generatedAt']) => {
        for (const field of timestampFields) {
            const value = parsed?.[field];
            if (value) return Date.now() - Number(value);
        }
        try {
            const stat = await fs.stat(filePath);
            return Date.now() - stat.mtimeMs;
        } catch {
            return null;
        }
    };
    
    const isValidTrendingCache = (data) => (
        data && typeof data === 'object' && !!data.lastUpdated && Array.isArray(data.trending7Days)
    );
    
    const isValidAnalyticsCache = (data) => {
        if (!data || typeof data !== 'object') return false;
        return data.all !== undefined || data['7'] !== undefined || data['30'] !== undefined || data[7] !== undefined || data[30] !== undefined;
    };
    
    const scheduleTrendingRebuild = (delayMs) => {
        if (trendingRebuildTimer) clearTimeout(trendingRebuildTimer);
        const safeDelay = Math.max(0, delayMs);
        systemJobs.trendingCache.nextRun = new Date(Date.now() + safeDelay).toISOString();
        trendingRebuildTimer = setTimeout(async () => {
            await calculateTrendingStats();
            scheduleTrendingRebuild(TRENDING_CACHE_INTERVAL_MS);
        }, safeDelay);
    };
    
    const scheduleAnalyticsRebuild = (delayMs) => {
        if (analyticsRebuildTimer) clearTimeout(analyticsRebuildTimer);
        const safeDelay = Math.max(0, delayMs);
        systemJobs.analyticsCache.nextRun = new Date(Date.now() + safeDelay).toISOString();
        analyticsRebuildTimer = setTimeout(async () => {
            await calculateAnalyticsStats();
            scheduleAnalyticsRebuild(ANALYTICS_CACHE_INTERVAL_MS);
        }, safeDelay);
    };
    
    const startTrendingStatsBackgroundTask = async () => {
        let existing = null;
        try {
            const loaded = await loadFile(TRENDING_CACHE_PATH, null);
            if (isValidTrendingCache(loaded)) existing = loaded;
        } catch { /* no cache yet */ }
    
        if (existing) {
            const ageMs = await getCacheAgeMs(TRENDING_CACHE_PATH, existing);
            if (ageMs == null) {
                log('[TrendingStats] Loaded existing cache.');
                scheduleTrendingRebuild(TRENDING_CACHE_INTERVAL_MS);
                return;
            }
            const remainingMs = Math.max(0, TRENDING_CACHE_INTERVAL_MS - ageMs);
            log(`[TrendingStats] Loaded existing cache (age: ${Math.round(ageMs / 60000)} min). Next rebuild in ${Math.round(remainingMs / 60000)} min.`);
            if (ageMs >= TRENDING_CACHE_INTERVAL_MS) {
                log('[TrendingStats] Cache is stale — triggering immediate rebuild.');
                scheduleTrendingRebuild(0);
            } else {
                scheduleTrendingRebuild(remainingMs);
            }
            return;
        }
    
        log('[TrendingStats] No cache found — triggering initial build.');
        scheduleTrendingRebuild(INITIAL_CACHE_BUILD_DELAY_MS);
    };
    
    const startAnalyticsStatsBackgroundTask = async () => {
        let existing = null;
        try {
            const loaded = await loadFile(ANALYTICS_CACHE_PATH, null);
            if (isValidAnalyticsCache(loaded)) existing = loaded;
        } catch { /* no cache yet */ }
    
        if (existing) {
            const ageMs = await getCacheAgeMs(ANALYTICS_CACHE_PATH, existing);
            if (ageMs == null) {
                log('[AnalyticsStats] Loaded existing cache.');
                scheduleAnalyticsRebuild(ANALYTICS_CACHE_INTERVAL_MS);
                return;
            }
            const remainingMs = Math.max(0, ANALYTICS_CACHE_INTERVAL_MS - ageMs);
            log(`[AnalyticsStats] Loaded existing cache (age: ${Math.round(ageMs / 60000)} min). Next rebuild in ${Math.round(remainingMs / 60000)} min.`);
            if (ageMs >= ANALYTICS_CACHE_INTERVAL_MS) {
                log('[AnalyticsStats] Cache is stale — triggering immediate rebuild.');
                scheduleAnalyticsRebuild(0);
            } else {
                scheduleAnalyticsRebuild(remainingMs);
            }
            return;
        }
    
        log('[AnalyticsStats] No cache found — triggering initial build.');
        scheduleAnalyticsRebuild(INITIAL_CACHE_BUILD_DELAY_MS + 5000);
    };
    
    app.get('/api/plex/stats/trending', requireAuth, requireMember, async (req, res) => {
        try {
            const stats = await loadFile(TRENDING_CACHE_PATH, {
                trending7Days: [],
                movies30Days: [],
                shows30Days: [],
                top365Days: [],
                allTime: [],
                weekendWarriors: [],
                nightOwls: [],
                retroHits: [],
                cultClassics: []
            });
            res.json(stats);
        } catch (e) {
            res.status(500).json({ error: 'Failed to load trending stats' });
        }
    });

    return {
        calculateAnalyticsStats,
        calculateTrendingStats,
        startTrendingStatsBackgroundTask,
        startAnalyticsStatsBackgroundTask,
    };
};
