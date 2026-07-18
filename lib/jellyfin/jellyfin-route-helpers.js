import { scopedCacheKey } from '../cache/cache-key.js';
import { presentStreamAddress, presentStreamUser } from '../status/stream-privacy.js';
import { readImageResponse } from '../http/image-response.js';
import { createBoundedBufferCache } from '../cache/bounded-buffer-cache.js';
import { cacheRefreshMs } from '../cache/cache-refresh.js';
import { imageCacheMaxBytes } from '../http/image-cache-limit.js';

export const createJellyfinRouteHelpers = ({
    configPath,
    loadFile,
    isJellyfinConfigured,
    resolveIntegrationUrlForFetch,
    fetchWithTimeout,
    withCache,
    jellyfinHeaders,
    withBasePath,
    jellyfinItemUrl,
}) => {
    const CONFIG_PATH = configPath;
    const imageCache = createBoundedBufferCache({ maxBytes: imageCacheMaxBytes(64) });

    const loadJellyfinImage = async (config, relativePath, cacheKey, fallbackContentType) => imageCache.get(cacheKey, async () => {
        const baseUrl = await resolveIntegrationUrlForFetch(config.jellyfinUrl);
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
        const baseUrl = await resolveIntegrationUrlForFetch(config.jellyfinUrl);
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
        const baseUrl = await resolveIntegrationUrlForFetch(config.jellyfinUrl);
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
                playerAddress: presentStreamAddress({ isAdmin: user?.isAdmin, playerAddress: session.RemoteEndPoint }),
                sessionLocation: user?.isAdmin ? 'remote' : null,
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

    const proxyJellyfinBrandingAsset = async (res, paths, fallbackContentType = 'image/png') => {
        const config = await loadFile(CONFIG_PATH, {});
        if (!isJellyfinConfigured(config)) return res.status(503).send('');
        const baseUrl = await resolveIntegrationUrlForFetch(config.jellyfinUrl);
        for (const path of paths) {
            const image = await loadJellyfinImage(config, path, `${baseUrl}:${path}`, fallbackContentType).catch(() => null);
            if (!image) continue;
            res.setHeader('Content-Type', image.contentType);
            res.setHeader('Cache-Control', 'public, max-age=3600');
            return res.send(image.body);
        }
        return res.status(404).send('');
    };

    return {
        CONFIG_PATH,
        loadJellyfinImage,
        warmJellyfinPosters,
        mapJellyfinItemForDiscover,
        fetchJellyfinItems,
        loadActiveSessions,
        proxyJellyfinBrandingAsset,
    };
};
