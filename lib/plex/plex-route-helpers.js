import { normalizePlexBandwidthKbps } from './plex-bandwidth.js';
import { presentStreamAddress, presentStreamUser } from '../status/stream-privacy.js';
import { createPlexSessionsSnapshot } from './plex-sessions-snapshot.js';
import { tmdbIdFromPlexMedia } from './plex-guid-utils.js';

export const createPlexRouteHelpers = ({
    configPath,
    loadFile,
    getPlexConnectionUri,
    plexSessionsSnapshot = null,
    fetch,
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

    const tmdbIdFromPlex = (media) => tmdbIdFromPlexMedia(media);

    return {
        CONFIG_PATH,
        loadPlexContext,
        loadActiveSessions,
        readLimit,
        explicitPlexMedia,
        tmdbIdFromPlex,
    };
};

export const registerPlexStatsRoutes = ({
    app,
    requireAuth,
    requireMember,
    requireAdmin,
    plexStatsService,
    loadPlexStatsFromDisk,
    buildPlexStatsCache,
}) => {
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
            isBuilding: true,
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
            hasCache: !!stats,
        });
    });
};
