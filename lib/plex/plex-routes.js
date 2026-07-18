import { normalizePlexBandwidthKbps } from './plex-bandwidth.js';
import { presentStreamAddress, presentStreamUser } from '../status/stream-privacy.js';
import { createPlexSessionsSnapshot } from './plex-sessions-snapshot.js';

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
    plexSessionsSnapshot = null,
    plexImageService,
    plexDashboardService,
    plexStatsService,
    loadPlexStatsFromDisk,
    buildPlexStatsCache,
    withBasePath = (value) => value,
    log,
}) => {
    const CONFIG_PATH = configPath;
    const sessionsSnapshot = plexSessionsSnapshot || createPlexSessionsSnapshot({ fetchImpl: fetch });

    const loadPlexContext = async () => {
        const config = await loadFile(CONFIG_PATH, null);
        if (!config?.plexToken || !config?.serverIdentifier) throw new Error('Plex not configured');
        const uri = await getPlexConnectionUri(config);
        if (!uri) throw new Error('Cannot connect to Plex');
        return { config, uri };
    };

    const loadActiveSessions = async (config, uri, user) => {
        const metadata = await sessionsSnapshot.fetchSessionsMetadata(config, uri);
        return metadata.map((media) => {
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
                playerAddress: presentStreamAddress({ isAdmin: user?.isAdmin, playerAddress: player.address }),
                sessionLocation: user?.isAdmin ? (session.location || 'Unknown') : null,
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
    const explicitPlexMedia = (media) => {
        const rating = String(media?.contentRating || '').trim().toLowerCase();
        const tags = [...(media?.Genre || []), ...(media?.Label || [])].map((entry) => String(entry?.tag || '').trim().toLowerCase());
        return ['x', 'xxx', 'adult', 'porn'].includes(rating) || tags.some((tag) => ['adult', 'porn', 'pornography'].includes(tag));
    };
    const tmdbIdFromPlex = (media) => {
        const ids = [...(media?.Guid || []), media?.guid ? { id: media.guid } : null].filter(Boolean);
        const match = ids.map((entry) => String(entry.id || '')).find((id) => /^tmdb:\/\/\d+$/.test(id));
        return match ? Number(match.split('//')[1]) : null;
    };

    app.get('/api/plex/image', requireAuth, requireMember, async (req, res) => {
        const { path: thumbPath, width, height } = req.query;
        if (!thumbPath) return res.status(400).send('path required');
        try {
            const { config, uri } = await loadPlexContext();
            const image = await plexImageService.request({ config, uri, path: thumbPath, width, height });
            res.setHeader('Content-Type', image.contentType);
            res.setHeader('Cache-Control', 'private, max-age=604800, stale-while-revalidate=86400');
            res.send(image.body);
        } catch (e) {
            res.status(e.message === 'Invalid Plex image path' ? 400 : 502).send('');
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

    app.get('/api/plex/search', requireAuth, requireMember, async (req, res) => {
        const query = String(req.query.query || '').trim();
        if (query.length < 2) return res.json({ results: [] });
        try {
            const { config, uri } = await loadPlexContext();
            const sectionsResponse = await fetchWithTimeout(`${uri}/library/sections?X-Plex-Token=${config.plexToken}`, { headers: { Accept: 'application/json' } }, 15000);
            const sectionsPayload = sectionsResponse.ok ? await sectionsResponse.json() : null;
            const sections = (sectionsPayload?.MediaContainer?.Directory || []).filter((section) => ['movie', 'show'].includes(section.type));
            const payloads = await Promise.all(sections.map(async (section) => {
                const params = new URLSearchParams({
                    title: query,
                    includeGuids: '1',
                    'X-Plex-Container-Start': '0',
                    'X-Plex-Container-Size': '30',
                    'X-Plex-Token': config.plexToken,
                });
                const response = await fetchWithTimeout(`${uri}/library/sections/${encodeURIComponent(section.key)}/all?${params}`, { headers: { Accept: 'application/json' } }, 15000);
                return response.ok ? await response.json() : null;
            }));
            const seen = new Set();
            const results = payloads.flatMap((payload) => payload?.MediaContainer?.Metadata || []).flatMap((media) => {
                const ratingKey = String(media.ratingKey || '');
                if (!ratingKey || seen.has(ratingKey) || explicitPlexMedia(media)) return [];
                seen.add(ratingKey);
                const type = media.type === 'show' ? 'tv' : 'movie';
                const tmdbId = tmdbIdFromPlex(media);
                return [{
                    id: tmdbId || Number(ratingKey) || 0,
                    tmdbId,
                    ratingKey,
                    mediaType: type,
                    title: media.title || 'Unknown title',
                    year: media.year ? String(media.year) : null,
                    overview: media.summary || '',
                    posterUrl: media.thumb ? withBasePath(`/api/plex/image?path=${encodeURIComponent(media.thumb)}&width=342&height=513`) : '',
                    plexUrl: `https://app.plex.tv/desktop/#!/server/${config.serverIdentifier}/details?key=${encodeURIComponent(media.key || `/library/metadata/${ratingKey}`)}`,
                    available: true,
                    canRequest: false,
                    source: 'plex',
                }];
            });
            res.setHeader('Cache-Control', 'private, max-age=30, stale-while-revalidate=120');
            res.json({ results });
        } catch (error) {
            res.status(503).json({ error: error.message || 'Failed to search Plex library' });
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
