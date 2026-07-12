import { enrichRecentItemsWithMediaTags, extractMediaDisplayTags } from './plex-media-tags.js';
import { scopedCacheKey } from './cache-key.js';
import { normalizePlexBandwidthKbps } from './plex-bandwidth.js';

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
    withCache,
    plexStatsService,
    loadPlexStatsFromDisk,
    buildPlexStatsCache,
    log,
}) => {
    const CONFIG_PATH = configPath;

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

    app.get('/api/plex/dashboard', requireAuth, requireMember, async (req, res) => {
        try {
            const config = await loadFile(CONFIG_PATH, null);
            if (!config || !config.plexToken || !config.serverIdentifier) {
                return res.status(503).json({ error: 'Plex not configured' });
            }

            const uri = await getPlexConnectionUri(config);
            if (!uri) return res.status(503).json({ error: 'Cannot connect to Plex' });

            const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 250);

            const recentCacheKey = scopedCacheKey('plex_dashboard_recent_data', [config.serverIdentifier, uri, config.plexToken, limit]);
            const [sessionsData, recentData] = await Promise.all([
                fetch(`${uri}/status/sessions?X-Plex-Token=${config.plexToken}`, { headers: { 'Accept': 'application/json' } }).then(r => r.json()).catch(() => null),
                withCache(recentCacheKey, 60_000, async () => {
                    const sectionsData = await fetch(`${uri}/library/sections?X-Plex-Token=${config.plexToken}`, { headers: { 'Accept': 'application/json' } }).then(r => r.json()).catch(() => null);
                    const sections = sectionsData?.MediaContainer?.Directory || [];
                    const recentSectionTypes = new Set(['movie', 'show', 'artist']);
                    const recentSections = sections.filter(section => recentSectionTypes.has(section.type));
                    const recentSectionResults = await Promise.all(recentSections.map(section =>
                        fetch(`${uri}/library/sections/${section.key}/recentlyAdded?X-Plex-Token=${config.plexToken}&X-Plex-Container-Start=0&X-Plex-Container-Size=${limit}`, { headers: { 'Accept': 'application/json' } })
                            .then(r => r.json())
                            .then(data => ({ sectionType: section.type, data }))
                            .catch(() => ({ sectionType: section.type, data: null }))
                    ));
                    const recentMovies = [];
                    const recentShows = [];
                    const recentMusic = [];
                    recentSectionResults.forEach(({ sectionType, data }) => {
                        const metadata = data?.MediaContainer?.Metadata || [];
                        metadata.forEach((m) => {
                            const ratingKey = String(m.grandparentRatingKey || m.parentRatingKey || m.ratingKey || '');
                            const isMusic = sectionType === 'artist';
                            const item = {
                                ratingKey,
                                sourceRatingKey: String(m.ratingKey || ''),
                                title: isMusic ? (m.title || m.parentTitle || m.grandparentTitle) : (m.grandparentTitle || m.parentTitle || m.title),
                                parentTitle: isMusic ? (m.parentTitle || m.grandparentTitle || null) : undefined,
                                type: m.type,
                                year: m.year,
                                thumb: m.grandparentThumb || m.parentThumb || m.thumb,
                                addedAt: m.addedAt,
                                tags: extractMediaDisplayTags(m),
                                plexUrl: `https://app.plex.tv/desktop/#!/server/${config.serverIdentifier}/details?key=${encodeURIComponent(m.key)}`
                            };
                            if (sectionType === 'movie') recentMovies.push(item);
                            else if (sectionType === 'show') recentShows.push(item);
                            else if (sectionType === 'artist') recentMusic.push(item);
                        });
                    });
                    const processList = (list) => {
                        const unique = [];
                        const seen = new Set();
                        list.sort((a, b) => b.addedAt - a.addedAt);
                        for (const item of list) {
                            const dedupeKey = item.ratingKey || item.title;
                            if (!seen.has(dedupeKey)) {
                                seen.add(dedupeKey);
                                unique.push(item);
                                if (unique.length >= limit) break;
                            }
                        }
                        return unique;
                    };
                    const [taggedMovies, taggedShows] = await Promise.all([
                        enrichRecentItemsWithMediaTags(uri, config, processList(recentMovies)),
                        enrichRecentItemsWithMediaTags(uri, config, processList(recentShows))
                    ]);
                    return { recentMovies: taggedMovies, recentShows: taggedShows, recentMusic: processList(recentMusic) };
                })
            ]);

            let activeSessions = [];
            if (sessionsData && sessionsData.MediaContainer && sessionsData.MediaContainer.Metadata) {
                activeSessions = sessionsData.MediaContainer.Metadata.map(m => {
                    const isTranscoding = m.TranscodeSession || (m.Media && m.Media[0] && m.Media[0].Part && m.Media[0].Part[0] && m.Media[0].Part[0].Stream && m.Media[0].Part[0].Stream.some(s => s.decision === 'transcode'));
                    const player = m.Player || {};
                    const session = m.Session || {};
                    const duration = m.duration || 0;
                    const viewOffset = m.viewOffset || 0;
                    const progress = duration > 0 ? (viewOffset / duration) * 100 : 0;
                    const plexUrl = `https://app.plex.tv/desktop/#!/server/${config.serverIdentifier}/details?key=${encodeURIComponent(m.key)}`;

                    const hideConfig = config.hideStreamUsers === true ? 'anonymous' : (config.hideStreamUsers || 'false');
                    const isHidden = !req.user.isAdmin && (hideConfig === 'anonymous' || hideConfig === 'hidden');

                    return {
                        sessionId: session.id || m.sessionKey,
                        title: m.title,
                        type: m.type,
                        grandparentTitle: m.grandparentTitle,
                        year: m.year,
                        thumb: m.grandparentThumb || m.parentThumb || m.thumb,
                        user: (isHidden && hideConfig === 'hidden') ? null : (isHidden ? 'Anonymous' : (m.User ? m.User.title : 'Unknown User')),
                        userThumb: isHidden ? null : (m.User ? m.User.thumb : null),
                        playerProduct: player.product || 'Unknown Device',
                        playerTitle: player.title || 'Unknown Player',
                        playerAddress: player.address || 'Unknown IP',
                        sessionLocation: session.location || 'Unknown',
                        state: player.state || 'playing',
                        isTranscoding: !!isTranscoding,
                        videoCodec: m.Media && m.Media[0] ? m.Media[0].videoCodec : null,
                        audioCodec: m.Media && m.Media[0] ? m.Media[0].audioCodec : null,
                        audioChannels: m.Media && m.Media[0] ? m.Media[0].audioChannels : null,
                        container: m.Media && m.Media[0] ? m.Media[0].container : null,
                        videoProfile: m.Media && m.Media[0] ? m.Media[0].videoProfile : null,
                        transcodeVideoDecision: m.TranscodeSession ? m.TranscodeSession.videoDecision : null,
                        transcodeAudioDecision: m.TranscodeSession ? m.TranscodeSession.audioDecision : null,
                        resolution: (m.Media && m.Media[0] && m.Media[0].videoResolution) ? m.Media[0].videoResolution : null,
                        season: m.parentIndex,
                        episode: m.index,
                        progress: progress,
                        timeRemaining: Math.max(0, duration - viewOffset),
                        bandwidth: normalizePlexBandwidthKbps((session && session.bandwidth) || (m.Media && m.Media[0] && m.Media[0].bitrate) || 0),
                        plexUrl: plexUrl
                    };
                });
            }

            res.json({ activeSessions, ...recentData });
        } catch (e) {
            log(`Error fetching Plex dashboard: ${e.message}`);
            res.status(500).json({ error: 'Failed to fetch dashboard data' });
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
