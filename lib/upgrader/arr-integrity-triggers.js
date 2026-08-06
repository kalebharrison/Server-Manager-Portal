import { timingSafeEqual } from 'crypto';
import { extractExpectedRuntimeSec } from './qc-integrity-runtime.js';
import { getDefaultArrInstance, getReadyArrInstances } from '../media-stack/arr-instances.js';

const ARR_KINDS = Object.freeze(['sonarr', 'radarr', 'lidarr']);

const safeEqualString = (a, b) => {
    const left = Buffer.from(String(a ?? ''), 'utf8');
    const right = Buffer.from(String(b ?? ''), 'utf8');
    if (left.length !== right.length) {
        timingSafeEqual(left, left);
        return false;
    }
    return timingSafeEqual(left, right);
};

const createBasicAuthMiddleware = ({ getCredentials, realm = 'Integrity' }) => (
    (req, res, next) => {
        const creds = getCredentials() || {};
        const username = String(creds.username || '');
        const password = String(creds.password || '');

        if (!username || !password) {
            res.status(503).json({ error: 'Integrity webhook auth is not configured' });
            return;
        }

        const header = req.headers.authorization || '';
        if (!header.startsWith('Basic ')) {
            res.set('WWW-Authenticate', `Basic realm="${realm}"`);
            res.status(401).send('Authentication required');
            return;
        }

        let decoded = '';
        try {
            decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
        } catch {
            res.status(401).send('Invalid authorization');
            return;
        }

        const sep = decoded.indexOf(':');
        const user = sep >= 0 ? decoded.slice(0, sep) : decoded;
        const pass = sep >= 0 ? decoded.slice(sep + 1) : '';

        if (!safeEqualString(user, username) || !safeEqualString(pass, password)) {
            res.set('WWW-Authenticate', `Basic realm="${realm}"`);
            res.status(401).send('Invalid credentials');
            return;
        }

        next();
    }
);

const asArray = (...groups) => groups.flatMap((group) => (Array.isArray(group) ? group : group ? [group] : []));

const pickFilePath = (file) => {
    const raw = file?.path || file?.Path || '';
    return raw ? String(raw).replace(/\\/g, '/') : '';
};

const dedupeByKey = (items, keyOf) => {
    const seen = new Set();
    const out = [];
    for (const item of items) {
        const key = keyOf(item);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push(item);
    }
    return out;
};

/** Integrity webhook basic auth from dedicated QC settings only. */
export const resolveIntegrityWebhookAuth = (config = {}) => ({
    username: String(config.qcIntegrityWebhookUsername || '').trim(),
    password: String(config.qcIntegrityWebhookPassword || ''),
});

/**
 * Classify an Arr webhook enough to gate Integrity baselines.
 */
export const classifyArrImportEvent = (kind, event = {}) => {
    const eventType = String(event?.eventType || event?.EventType || '');
    const isUpgrade = !!(event?.isUpgrade ?? event?.IsUpgrade);
    if (/^(Download|AlbumDownload|ReleaseImport)$/i.test(eventType)) {
        return {
            eventType,
            action: isUpgrade ? 'upgrade' : 'import',
            isUpgrade,
        };
    }
    if (/^Test$/i.test(eventType)) {
        return { eventType, action: 'test', isUpgrade: false };
    }
    return { eventType, action: 'other', isUpgrade: false };
};

/**
 * Best-effort Arr webhook → qc-integrity baselineImport payloads.
 */
export const collectArrIntegrityPayloads = (kind, body = {}) => {
    const downloadId = body.downloadId ?? body.DownloadId ?? null;
    const releaseTitle = body.release?.releaseTitle
        || body.release?.ReleaseTitle
        || body.Release?.releaseTitle
        || body.Release?.ReleaseTitle
        || null;
    const k = String(kind || '').toLowerCase();

    if (k === 'radarr') {
        const movie = body.movie || body.Movie || {};
        const files = dedupeByKey(
            asArray(body.movieFiles, body.MovieFiles, body.movieFile, body.MovieFile),
            (file) => String(file?.id ?? file?.Id ?? pickFilePath(file) ?? ''),
        );
        return files.map((file) => {
            const filePath = pickFilePath(file);
            if (!filePath) return null;
            return {
                arrType: 'radarr',
                mediaType: 'movie',
                mediaKind: 'video',
                entityId: movie.id ?? movie.Id ?? null,
                movieFileId: file.id ?? file.Id ?? null,
                filePath,
                title: movie.title || movie.Title || null,
                expectedRuntimeSec: extractExpectedRuntimeSec({ file, record: movie, mediaKind: 'video' }),
                downloadId,
                sourceTitle: releaseTitle || file.sceneName || file.SceneName || null,
            };
        }).filter(Boolean);
    }

    if (k === 'sonarr') {
        const series = body.series || body.Series || {};
        const episodes = asArray(body.episodes, body.Episodes);
        const files = dedupeByKey(
            asArray(body.episodeFiles, body.EpisodeFiles, body.episodeFile, body.EpisodeFile),
            (file) => String(file?.id ?? file?.Id ?? pickFilePath(file) ?? ''),
        );
        return files.map((file, index) => {
            const filePath = pickFilePath(file);
            if (!filePath) return null;
            const episodeIds = asArray(file.episodeIds, file.EpisodeIds).map(Number).filter((id) => id > 0);
            const episode = episodes.find((ep) => episodeIds.includes(Number(ep?.id ?? ep?.Id)))
                || episodes[index]
                || episodes[0]
                || null;
            return {
                arrType: 'sonarr',
                mediaType: 'show',
                mediaKind: 'video',
                entityId: series.id ?? series.Id ?? null,
                episodeId: episode?.id ?? episode?.Id ?? episodeIds[0] ?? null,
                episodeFileId: file.id ?? file.Id ?? null,
                filePath,
                title: series.title || series.Title || null,
                expectedRuntimeSec: extractExpectedRuntimeSec({
                    file,
                    record: series,
                    episode,
                    mediaKind: 'video',
                }),
                downloadId,
                sourceTitle: releaseTitle || file.sceneName || file.SceneName || null,
            };
        }).filter(Boolean);
    }

    if (k === 'lidarr') {
        const album = body.album || body.Album || body.albums?.[0] || body.Albums?.[0] || {};
        const artist = body.artist || body.Artist || {};
        const files = dedupeByKey(
            asArray(body.trackFiles, body.TrackFiles, body.trackFile, body.TrackFile),
            (file) => String(file?.id ?? file?.Id ?? pickFilePath(file) ?? ''),
        );
        return files.map((file) => {
            const filePath = pickFilePath(file);
            if (!filePath) return null;
            return {
                arrType: 'lidarr',
                mediaType: 'album',
                mediaKind: 'audio',
                entityId: album.id ?? album.Id ?? null,
                trackFileId: file.id ?? file.Id ?? null,
                filePath,
                title: album.title || album.Title || artist.name || artist.Name || null,
                expectedRuntimeSec: extractExpectedRuntimeSec({
                    file,
                    record: album,
                    track: file,
                    mediaKind: 'audio',
                }),
                downloadId,
                sourceTitle: releaseTitle || file.sceneName || file.SceneName || null,
            };
        }).filter(Boolean);
    }

    return [];
};

/**
 * Attach Arr instance + ratingKey so import baselines land on coverage cache keys.
 */
export const enrichArrIntegrityPayload = (config, payload) => {
    if (!payload || typeof payload !== 'object') return null;
    const arrType = String(payload.arrType || '').toLowerCase();
    if (!arrType) return payload;
    const instance = getDefaultArrInstance(config, arrType)
        || getReadyArrInstances(config, arrType)[0]
        || null;
    const arrInstanceId = payload.arrInstanceId || instance?.id || null;
    const entityId = payload.entityId;
    const fileId = payload.movieFileId || payload.episodeFileId || payload.trackFileId || null;
    const ratingKey = payload.ratingKey
        || (arrInstanceId && entityId != null && entityId !== ''
            ? `${arrType}:${arrInstanceId}:${entityId}`
            : null);
    const key = payload.key
        || (ratingKey && fileId != null ? `${ratingKey}:file:${fileId}` : null);
    return {
        ...payload,
        arrInstanceId,
        arrInstanceName: payload.arrInstanceName || instance?.name || null,
        ratingKey,
        key,
    };
};

/**
 * Arr webhook endpoints used only for Integrity import/upgrade baselines.
 * Keeps legacy /triggers/{sonarr,radarr,lidarr} paths Arr already points at.
 */
export const registerArrIntegrityTriggerRoutes = ({
    app,
    configPath,
    loadFile,
    log = console.log,
    upgrader = null,
    triggerRateLimit = (_req, _res, next) => next(),
} = {}) => {
    let authCache = { username: '', password: '' };
    const refreshAuthCache = async () => {
        const config = await loadFile(configPath, {});
        authCache = resolveIntegrityWebhookAuth(config);
    };
    const triggerAuth = createBasicAuthMiddleware({
        getCredentials: () => authCache,
        realm: 'Integrity',
    });

    const requireIntegrityTriggers = async (_req, res, next) => {
        try {
            const config = await loadFile(configPath, {});
            if (!config.upgraderEnabled || !config.qcIntegrityEnabled) {
                return res.status(503).json({ error: 'Integrity import hooks are disabled' });
            }
            await refreshAuthCache();
            return next();
        } catch {
            return res.status(500).json({ error: 'Integrity triggers unavailable' });
        }
    };

    const handleArrTrigger = async (req, res, kind) => {
        try {
            const config = await loadFile(configPath, {});
            if (!config.upgraderEnabled || !config.qcIntegrityEnabled) {
                return res.status(503).json({ error: 'Integrity import hooks are disabled' });
            }

            const event = classifyArrImportEvent(kind, req.body || {});
            let baselined = 0;
            const baselineImport = upgrader?.integrity?.baselineImport;
            if (
                (event.action === 'import' || event.action === 'upgrade')
                && typeof baselineImport === 'function'
            ) {
                const payloads = collectArrIntegrityPayloads(kind, req.body || {})
                    .map((payload) => enrichArrIntegrityPayload(config, payload))
                    .filter(Boolean);
                baselined = payloads.length;
                for (const payload of payloads) {
                    void baselineImport(config, payload).catch((err) => {
                        log(`[integrity] baselineImport failed: ${err?.message || err}`);
                    });
                }
            }

            return res.json({
                ok: true,
                kind,
                action: event.action,
                baselined,
            });
        } catch (error) {
            log(`[integrity] ${kind} trigger failed: ${error.message}`);
            return res.status(error.status || 500).json({ error: error.message || 'Trigger failed' });
        }
    };

    for (const kind of ARR_KINDS) {
        app.post(
            `/triggers/${kind}`,
            requireIntegrityTriggers,
            triggerRateLimit,
            triggerAuth,
            (req, res) => handleArrTrigger(req, res, kind),
        );
    }

    // Legacy custom Scanner trigger names still map to the Arr kind when possible.
    app.post(
        '/triggers/:name',
        requireIntegrityTriggers,
        triggerRateLimit,
        triggerAuth,
        async (req, res) => {
            const name = String(req.params.name || '').toLowerCase();
            const kind = ARR_KINDS.includes(name)
                ? name
                : ARR_KINDS.find((entry) => name.includes(entry)) || null;
            if (!kind) {
                return res.status(404).json({ error: 'Unknown trigger' });
            }
            return handleArrTrigger(req, res, kind);
        },
    );
};
