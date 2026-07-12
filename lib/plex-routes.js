import { normalizePlexBandwidthKbps } from './plex-bandwidth.js';
import { presentStreamUser } from './stream-privacy.js';

export const registerPlexRoutes = ({
    app,
    requireAuth,
    requireMember,
    requireAdmin,
    configPath,
    loadFile,
    getPlexConnectionUri,
    fetch,
    fetchWithTimeout,
    plexDashboardService,
    plexStatsService,
    loadPlexStatsFromDisk,
    buildPlexStatsCache,
    log,
}) => {
    const CONFIG_PATH = configPath;

    const loadPlexContext = async () => {
        const config = await loadFile(CONFIG_PATH, null);
        if (!config?.plexToken || !config?.serverIdentifier) throw new Error('Plex not configured');
        const uri = await getPlexConnectionUri(config);
        if (!uri) throw new Error('Cannot connect to Plex');
        return { config, uri };
    };

    const loadActiveSessions = async (config, uri, user) => {
        const sessionsData = await fetch(`${uri}/status/sessions?X-Plex-Token=${config.plexToken}`, { headers: { Accept: 'application/json' } })
            .then((response) => response.ok ? response.json() : null)
            .catch(() => null);
        return (sessionsData?.MediaContainer?.Metadata || []).map((media) => {
            const mediaStream = media.Media?.[0];
            const player = media.Player || {};
            const session = media.Session || {};
            const duration = Number(media.duration) || 0;
            const viewOffset = Number(media.viewOffset) || 0;
            const isTranscoding = media.TranscodeSession || mediaStream?.Part?.[0]?.Stream?.some((stream) => stream.decision === 'transcode');
            const streamUser = presentStreamUser({
                isAdmin: user?.isAdmin,
                mode: config.hideStreamUsers,
                username: media.User?.title,
                thumb: media.User?.thumb || null,
            });
            return {
                sessionId: session.id || media.sessionKey,
                title: media.title,
                type: media.type,
                grandparentTitle: media.grandparentTitle,
                year: media.year,
                thumb: media.grandparentThumb || media.parentThumb || media.thumb,
                ...streamUser,
                playerProduct: player.product || 'Unknown Device',
                playerTitle: player.title || 'Unknown Player',
                playerAddress: player.address || 'Unknown IP',
                sessionLocation: session.location || 'Unknown',
                state: player.state || 'playing',
                isTranscoding: !!isTranscoding,
                videoCodec: mediaStream?.videoCodec || null,
                audioCodec: mediaStream?.audioCodec || null,
                audioChannels: mediaStream?.audioChannels || null,
                container: mediaStream?.container || null,
                videoProfile: mediaStream?.videoProfile || null,
                transcodeVideoDecision: media.TranscodeSession?.videoDecision || null,
                transcodeAudioDecision: media.TranscodeSession?.audioDecision || null,
                resolution: mediaStream?.videoResolution || null,
                season: media.parentIndex,
                episode: media.index,
                progress: duration > 0 ? (viewOffset / duration) * 100 : 0,
                timeRemaining: Math.max(0, duration - viewOffset),
                bandwidth: normalizePlexBandwidthKbps(session.bandwidth || mediaStream?.bitrate || 0),
                plexUrl: `https://app.plex.tv/desktop/#!/server/${config.serverIdentifier}/details?key=${encodeURIComponent(media.key)}`,
            };
        });
    };

    const readLimit = (req) => Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 250);

    app.get('/api/plex/image', requireAuth, requireMember, async (req, res) => {
        const { path: thumbPath, width, height } = req.query;
        if (!thumbPath) return res.status(400).send('path required');
        if (!thumbPath.startsWith('/') || thumbPath.includes('://')) {
            return res.status(400).send('Invalid path');
        }
        try {
            const config = await loadFile(CONFIG_PATH, {});
            const uri = await getPlexConnectionUri(config);

            let url;
            if (width && height) {
                url = `${uri}/photo/:/transcode?url=${encodeURIComponent(thumbPath)}&width=${encodeURIComponent(width)}&height=${encodeURIComponent(height)}&minSize=1&X-Plex-Token=${config.plexToken}`;
            } else {
                url = `${uri}${thumbPath}?X-Plex-Token=${config.plexToken}`;
            }

            const response = await fetchWithTimeout(url, {}, 15000);
            if (!response.ok) throw new Error('fetch failed');
            const buffer = Buffer.from(await response.arrayBuffer());
            res.setHeader('Content-Type', response.headers.get('content-type') || 'image/jpeg');
            res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400');
            res.send(buffer);
        } catch (e) {
            res.status(500).send('');
        }
    });

    app.get('/api/plex/stats', requireAuth, requireMember, async (req, res) => {
        const cachedStats = plexStatsService.getCachedPlexStats();
        if (cachedStats) {
            return res.json(cachedStats);
        }
        const disk = await loadPlexStatsFromDisk();
        if (disk) return res.json(disk);
        return res.json({
            movies: 0, shows: 0, music: 0,
            moviesBytes: 0, showsBytes: 0, musicBytes: 0,
            isBuilding: true
        });
    });
    app.post('/api/plex/stats/rebuild', requireAdmin, async (req, res) => {
        if (plexStatsService.isPlexStatsBuilding()) {
            return res.json({ status: 'already_running', message: 'A rebuild is already in progress.' });
        }
        buildPlexStatsCache();
        return res.json({ status: 'started', message: 'Library size rebuild started in the background.' });
    });
    app.get('/api/plex/stats/status', requireAdmin, async (req, res) => {
        const stats = plexStatsService.getCachedPlexStats() || await loadPlexStatsFromDisk();
        return res.json({
            isBuilding: plexStatsService.isPlexStatsBuilding(),
            lastGeneratedAt: stats?.generatedAt || null,
            hasCache: !!stats
        });
    });

    app.get('/api/plex/libraries', requireAdmin, async (req, res) => {
        try {
            const config = await loadFile(CONFIG_PATH, null);
            if (!config || !config.plexToken || !config.serverIdentifier) {
                return res.status(503).json({ error: 'Plex not configured' });
            }
            const uri = await getPlexConnectionUri(config);
            if (!uri) return res.status(503).json({ error: 'Cannot connect to Plex' });

            const sectionsRes = await fetchWithTimeout(`${uri}/library/sections?X-Plex-Token=${config.plexToken}`, { headers: { 'Accept': 'application/json' } }, 15000).then(r => r.json()).catch(() => null);

            let libraries = [];
            if (sectionsRes && sectionsRes.MediaContainer && sectionsRes.MediaContainer.Directory) {
                libraries = sectionsRes.MediaContainer.Directory.map(s => ({
                    id: s.key,
                    title: s.title,
                    type: s.type
                }));
            }
            res.json(libraries);
        } catch (e) {
            log(`Error fetching Plex libraries: ${e.message}`);
            res.status(500).json({ error: 'Failed to fetch libraries' });
        }
    });

    app.get('/api/plex/library', requireAuth, requireMember, async (req, res) => {
        try {
            const { config, uri } = await loadPlexContext();
            res.json(await plexDashboardService.getRecentData(config, uri, readLimit(req)));
        } catch (error) {
            res.status(503).json({ error: error.message || 'Failed to fetch library data' });
        }
    });

    app.get('/api/plex/sessions', requireAuth, requireMember, async (req, res) => {
        try {
            const { config, uri } = await loadPlexContext();
            res.json({ activeSessions: await loadActiveSessions(config, uri, req.user) });
        } catch (error) {
            res.status(503).json({ error: error.message || 'Failed to fetch active streams' });
        }
    });

    app.get('/api/plex/dashboard', requireAuth, requireMember, async (req, res) => {
        try {
            const { config, uri } = await loadPlexContext();
            const [activeSessions, recentData] = await Promise.all([
                loadActiveSessions(config, uri, req.user),
                plexDashboardService.getRecentData(config, uri, readLimit(req)),
            ]);
            res.json({ activeSessions, ...recentData });
        } catch (error) {
            log(`Error fetching Plex dashboard: ${error.message}`);
            res.status(503).json({ error: error.message || 'Failed to fetch dashboard data' });
        }
    });


    app.post('/api/streams/kill', requireAdmin, async (req, res) => {
        const { sessionId, reason } = req.body;
        try {
            const config = await loadFile(CONFIG_PATH, {});
            const uri = await getPlexConnectionUri(config);
            if (!uri) return res.status(503).json({ error: 'Cannot connect to Plex' });

            const response = await fetch(`${uri}/status/sessions/terminate?sessionId=${encodeURIComponent(sessionId)}&reason=${encodeURIComponent(reason || 'Admin terminated session')}&X-Plex-Token=${config.plexToken}`, {
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            });

            if (response.ok) {
                res.json({ success: true });
            } else {
                res.status(500).json({ error: 'Failed to terminate session' });
            }
        } catch (e) {
            console.error('Error terminating stream:', e);
            res.status(500).json({ error: 'Failed to communicate with Plex' });
        }
    });

};
