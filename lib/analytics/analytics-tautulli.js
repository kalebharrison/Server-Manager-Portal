
import { createTautulliClient } from './tautulli-client.js';

export const createTautulliAnalytics = ({
    app,
    requireAuth,
    requireMember,
    requireAdmin,
    configPath,
    loadFile,
    resolveIntegrationUrlForFetch,
    log,
}) => {
    const CONFIG_PATH = configPath;
    const tautulli = createTautulliClient({ resolveIntegrationUrlForFetch, log });
    
    app.get('/api/tautulli/stats', requireAuth, requireAdmin, async (req, res) => {
        try {
            const config = await loadFile(CONFIG_PATH, null);
            if (!config || !config.tautulliUrl || !config.tautulliApiKey) {
                return res.status(404).json({ error: 'Tautulli is not configured.' });
            }
            const tUrl = await resolveIntegrationUrlForFetch(config.tautulliUrl);
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
            const tUrl = await resolveIntegrationUrlForFetch(config.tautulliUrl);
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

    return tautulli;
};
