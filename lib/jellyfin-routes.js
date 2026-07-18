import { scopedCacheKey } from './cache-key.js';
import { presentStreamUser } from './stream-privacy.js';
import { readImageResponse } from './image-response.js';
import { createBoundedBufferCache } from './bounded-buffer-cache.js';
import { cacheRefreshMs } from './cache-refresh.js';
import { imageCacheMaxBytes } from './image-cache-limit.js';

export const registerJellyfinRoutes = ({
    app,
    requireAuth,
    requireMember,
    publicReadRateLimit,
    configPath,
    loadFile,
    isJellyfinConfigured,
    resolveIntegrationUrlForFetch,
    fetchWithTimeout,
    withCache,
    jellyfinHeaders,
    withBasePath,
    jellyfinItemUrl,
    log,
}) => {
    const CONFIG_PATH = configPath;
    const imageCache = createBoundedBufferCache({ maxBytes: imageCacheMaxBytes(64) });

    const loadJellyfinImage = async (config, relativePath, cacheKey, fallbackContentType) => imageCache.get(cacheKey, async () => {
        const baseUrl = resolveIntegrationUrlForFetch(config.jellyfinUrl);
        const response = await fetchWithTimeout(`${baseUrl}${relativePath}`, {
            headers: jellyfinHeaders(config.jellyfinApiKey, { Accept: 'image/avif,image/webp,image/*' }),
            redirect: 'error',
            size: 5 * 1024 * 1024,
        }, 15000);
        return readImageResponse(response, { source: 'Jellyfin', fallbackContentType });
    });

    const warmJellyfinPosters = async (config, baseUrl, items) => {
        const queue = [...items];
        await Promise.all(Array.from({ length: Math.min(6, queue.length) }, async () => {
            while (queue.length) {
                const item = queue.shift();
                const url = new URL(item.thumbUrl, 'http://portal');
                const itemId = url.searchParams.get('itemId');
                const width = url.searchParams.get('width');
                const height = url.searchParams.get('height');
                const relativePath = `/Items/${encodeURIComponent(itemId)}/Images/Primary?fillWidth=${width}&fillHeight=${height}&quality=90`;
                await loadJellyfinImage(config, relativePath, `${baseUrl}:${relativePath}`, 'image/jpeg').catch(() => null);
            }
        }));
    };

    const mapJellyfinItemForDiscover = (config, item = {}, type = '') => {
        const id = item.Id || '';
        const posterId = type === 'episode' && item.SeriesId ? item.SeriesId : id;
        const title = type === 'episode'
            ? (item.SeriesName ? `${item.SeriesName} - ${item.Name}` : item.Name)
            : (item.Name || 'Untitled');
        const tags = [];
        const width = Number(item.Width || item.MediaStreams?.find?.((s) => s.Type === 'Video')?.Width || 0);
        const height = Number(item.Height || item.MediaStreams?.find?.((s) => s.Type === 'Video')?.Height || 0);
        if (width >= 3800 || height >= 2000) tags.push('4K');
        else if (height >= 1000) tags.push('1080p');
        else if (height >= 700) tags.push('720p');
        const videoCodec = item.MediaStreams?.find?.((s) => s.Type === 'Video')?.Codec || item.MediaSources?.[0]?.VideoCodec;
        if (videoCodec) tags.push(String(videoCodec).toUpperCase());

        return {
            ratingKey: id,
            sourceRatingKey: id,
            title,
            parentTitle: item.Album || item.SeriesName || null,
            type: item.Type,
            year: item.ProductionYear,
            thumb: posterId,
            thumbUrl: posterId ? withBasePath(`/api/jellyfin/image?itemId=${encodeURIComponent(posterId)}&width=300&height=${type === 'music' ? 300 : 450}`) : '',
            addedAt: item.DateCreated ? Date.parse(item.DateCreated) / 1000 : 0,
            tags: [...new Set(tags)].slice(0, 4),
            plexUrl: jellyfinItemUrl(config, id),
        };
    };

    const fetchJellyfinItems = async (config, includeItemTypes, limit) => {
        const baseUrl = resolveIntegrationUrlForFetch(config.jellyfinUrl);
        const params = new URLSearchParams({
            Recursive: 'true',
            IncludeItemTypes: includeItemTypes,
            SortBy: 'DateCreated',
            SortOrder: 'Descending',
            Limit: String(limit),
            Fields: 'DateCreated,PrimaryImageAspectRatio,ProductionYear,SeriesName,Album,MediaSources,MediaStreams',
            ImageTypeLimit: '1',
            EnableImageTypes: 'Primary,Thumb,Backdrop',
        });
        const response = await fetchWithTimeout(`${baseUrl}/Items?${params.toString()}`, {
            headers: jellyfinHeaders(config.jellyfinApiKey),
        }, 15000);
        if (!response.ok) throw new Error(`Jellyfin Items returned HTTP ${response.status}`);
        const data = await response.json();
        return Array.isArray(data.Items) ? data.Items : [];
    };

    const loadActiveSessions = async (config, user) => {
        const baseUrl = resolveIntegrationUrlForFetch(config.jellyfinUrl);
        const sessions = await withCache(scopedCacheKey('jellyfin_sessions', [baseUrl, config.jellyfinApiKey]), 2000, async () =>
            fetchWithTimeout(`${baseUrl}/Sessions`, { headers: jellyfinHeaders(config.jellyfinApiKey) }, 15000)
                .then((response) => response.ok ? response.json() : [])
        );
        return (Array.isArray(sessions) ? sessions : []).filter((session) => session.NowPlayingItem).map((session) => {
            const item = session.NowPlayingItem || {};
            const playState = session.PlayState || {};
            const runtime = Number(item.RunTimeTicks || 0) / 10000;
            const position = Number(playState.PositionTicks || 0) / 10000;
            const streamBitrate = (Array.isArray(item.MediaStreams) ? item.MediaStreams : [])
                .filter((stream) => stream.Type === 'Video' || stream.Type === 'Audio')
                .reduce((total, stream) => total + Number(stream.BitRate || stream.Bitrate || 0), 0);
            const mediaSourceBitrate = (Array.isArray(item.MediaSources) ? item.MediaSources : [])
                .reduce((max, source) => Math.max(max, Number(source.Bitrate || source.VideoBitrate || 0) + Number(source.AudioBitrate || 0)), 0);
            const reportedBitrate = Number(session.TranscodingInfo?.Bitrate || item.Bitrate || streamBitrate || mediaSourceBitrate || 0);
            const streamUser = presentStreamUser({
                isAdmin: user.isAdmin,
                mode: config.hideStreamUsers,
                username: session.UserName,
                thumb: session.UserId ? withBasePath(`/api/jellyfin/user-image?userId=${encodeURIComponent(session.UserId)}`) : null,
            });
            return {
                sessionId: session.Id,
                title: item.Name,
                type: item.Type,
                grandparentTitle: item.SeriesName || item.Album || null,
                year: item.ProductionYear,
                thumb: item.Id,
                thumbUrl: item.Id ? withBasePath(`/api/jellyfin/image?itemId=${encodeURIComponent(item.Id)}&width=300&height=450`) : '',
                ...streamUser,
                playerProduct: session.Client || 'Jellyfin',
                playerTitle: session.DeviceName || session.Client || 'Jellyfin Player',
                playerAddress: session.RemoteEndPoint || 'Unknown IP',
                sessionLocation: 'remote',
                state: playState.IsPaused ? 'paused' : 'playing',
                isTranscoding: !!session.TranscodingInfo,
                videoCodec: session.TranscodingInfo?.VideoCodec || null,
                audioCodec: session.TranscodingInfo?.AudioCodec || null,
                resolution: item.Height ? `${item.Height}p` : null,
                progress: runtime > 0 ? Math.min(100, Math.max(0, (position / runtime) * 100)) : 0,
                timeRemaining: Math.max(0, runtime - position),
                bandwidth: Math.round(reportedBitrate / 1000),
                plexUrl: jellyfinItemUrl(config, item.Id),
            };
        });
    };

    app.get('/api/jellyfin/image', requireAuth, requireMember, async (req, res) => {
        const itemId = String(req.query.itemId || '').trim();
        const width = Math.min(Math.max(parseInt(req.query.width, 10) || 300, 64), 1200);
        const height = Math.min(Math.max(parseInt(req.query.height, 10) || 450, 64), 1600);
        if (!itemId || !/^[A-Za-z0-9_-]+$/.test(itemId)) return res.status(400).send('Invalid itemId');
        try {
            const config = await loadFile(CONFIG_PATH, {});
            if (!isJellyfinConfigured(config)) return res.status(503).send('');
            const baseUrl = resolveIntegrationUrlForFetch(config.jellyfinUrl);
            const relativePath = `/Items/${encodeURIComponent(itemId)}/Images/Primary?fillWidth=${width}&fillHeight=${height}&quality=90`;
            const image = await loadJellyfinImage(config, relativePath, `${baseUrl}:${relativePath}`, 'image/jpeg');
            res.setHeader('Content-Type', image.contentType);
            res.setHeader('Cache-Control', 'private, max-age=86400');
            res.send(image.body);
        } catch (e) {
            res.status(500).send('');
        }
    });

    app.get('/api/jellyfin/user-image', requireAuth, requireMember, async (req, res) => {
        const userId = String(req.query.userId || '').trim();
        if (!userId || !/^[A-Za-z0-9_-]+$/.test(userId)) return res.status(400).send('Invalid userId');
        try {
            const config = await loadFile(CONFIG_PATH, {});
            if (!isJellyfinConfigured(config)) return res.status(503).send('');
            const baseUrl = resolveIntegrationUrlForFetch(config.jellyfinUrl);
            const relativePath = `/Users/${encodeURIComponent(userId)}/Images/Primary?fillWidth=128&fillHeight=128&quality=90`;
            const image = await loadJellyfinImage(config, relativePath, `${baseUrl}:${relativePath}`, 'image/jpeg');
            res.setHeader('Content-Type', image.contentType);
            res.setHeader('Cache-Control', 'private, max-age=86400');
            res.send(image.body);
        } catch (e) {
            res.status(500).send('');
        }
    });

    const proxyJellyfinBrandingAsset = async (res, paths, fallbackContentType = 'image/png') => {
        const config = await loadFile(CONFIG_PATH, {});
        if (!isJellyfinConfigured(config)) return res.status(503).send('');
        const baseUrl = resolveIntegrationUrlForFetch(config.jellyfinUrl);
        for (const path of paths) {
            const image = await loadJellyfinImage(config, path, `${baseUrl}:${path}`, fallbackContentType).catch(() => null);
            if (!image) continue;
            res.setHeader('Content-Type', image.contentType);
            res.setHeader('Cache-Control', 'public, max-age=3600');
            return res.send(image.body);
        }
        return res.status(404).send('');
    };

    app.get('/api/jellyfin/branding/splash', publicReadRateLimit, async (req, res) => {
        try {
            await proxyJellyfinBrandingAsset(res, ['/Branding/Splashscreen'], 'image/jpeg');
        } catch (e) {
            res.status(500).send('');
        }
    });

    app.get('/api/jellyfin/branding/icon', publicReadRateLimit, async (req, res) => {
        try {
            await proxyJellyfinBrandingAsset(res, ['/web/icon-transparent.png', '/web/assets/img/icon-transparent.png', '/web/favicon.ico'], 'image/png');
        } catch (e) {
            res.status(500).send('');
        }
    });

    app.get('/api/jellyfin/branding/favicon', publicReadRateLimit, async (req, res) => {
        try {
            await proxyJellyfinBrandingAsset(res, ['/web/favicon.ico', '/web/icon-transparent.png', '/web/assets/img/icon-transparent.png'], 'image/x-icon');
        } catch (e) {
            res.status(500).send('');
        }
    });

    app.get('/api/jellyfin/sessions', requireAuth, requireMember, async (req, res) => {
        try {
            const config = await loadFile(CONFIG_PATH, {});
            if (!isJellyfinConfigured(config)) return res.status(503).json({ error: 'Jellyfin not configured' });
            res.json({ activeSessions: await loadActiveSessions(config, req.user) });
        } catch (e) {
            log(`Error fetching Jellyfin sessions: ${e.message}`);
            res.status(503).json({ error: 'Failed to fetch active streams' });
        }
    });

    app.get('/api/jellyfin/dashboard', requireAuth, requireMember, async (req, res) => {
        try {
            const config = await loadFile(CONFIG_PATH, {});
            if (!isJellyfinConfigured(config)) {
                return res.status(503).json({ error: 'Jellyfin not configured' });
            }

            const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 250);
            const baseUrl = resolveIntegrationUrlForFetch(config.jellyfinUrl);
            const cacheKey = scopedCacheKey('jellyfin_dashboard_data', [baseUrl, config.jellyfinApiKey, limit]);
            const [activeSessions, {
                movies,
                episodes,
                music,
            }] = await Promise.all([
                loadActiveSessions(config, req.user),
                withCache(cacheKey, cacheRefreshMs(config), async () => {
                    const [movies, episodes, music] = await Promise.all([
                        fetchJellyfinItems(config, 'Movie', limit).catch((e) => { log(`Jellyfin movies fetch failed: ${e.message}`); return []; }),
                        fetchJellyfinItems(config, 'Episode', limit).catch((e) => { log(`Jellyfin episodes fetch failed: ${e.message}`); return []; }),
                        fetchJellyfinItems(config, 'MusicAlbum,Audio', limit).catch((e) => { log(`Jellyfin music fetch failed: ${e.message}`); return []; }),
                    ]);
                    return { movies, episodes, music };
                }),
            ]);

            const recent = {
                activeSessions,
                recentMovies: movies.map((item) => mapJellyfinItemForDiscover(config, item, 'movie')),
                recentShows: episodes.map((item) => mapJellyfinItemForDiscover(config, item, 'episode')),
                recentMusic: music.map((item) => mapJellyfinItemForDiscover(config, item, 'music')),
            };
            void warmJellyfinPosters(config, baseUrl, [...recent.recentMovies.slice(0, 16), ...recent.recentShows.slice(0, 10), ...recent.recentMusic.slice(0, 6)]);
            res.json(recent);
        } catch (e) {
            log(`Error fetching Jellyfin dashboard: ${e.message}`);
            res.status(500).json({ error: 'Failed to fetch Jellyfin dashboard data' });
        }
    });

};
