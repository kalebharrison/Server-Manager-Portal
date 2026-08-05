import { extractExpectedRuntimeSec } from '../upgrader/qc-integrity-runtime.js';
import { getDefaultArrInstance, getReadyArrInstances } from '../media-stack/arr-instances.js';
import {
    buildScansFromPaths,
    buildTargets,
    classifyArrEvent,
    createBasicAuthMiddleware,
    enqueueScans,
    explainMissingTargets,
    findTriggerByName,
    getDefaultScannerConfig,
    getQueueStats,
    listLog,
    normalizeScannerConfig,
    parseAutoscanYaml,
    pathsFromLidarrEvent,
    pathsFromRadarrEvent,
    pathsFromSonarrEvent,
    processOne,
} from './index.js';

const configuredScanner = (config) => normalizeScannerConfig(config.scanner, getDefaultScannerConfig());

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

/**
 * Attach Arr instance + ratingKey so import baselines land on the same cache keys
 * Integrity coverage uses (`sonarr:<instance>:<id>:file:<fileId>`).
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
 * Best-effort Arr webhook → qc-integrity baselineImport payloads.
 * Never throws for missing optional fields; skips files without a path.
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

export const registerScannerRoutes = ({
    app,
    requireAdmin,
    configPath,
    loadFile,
    resolveConfiguredPlexServerUrl,
    scannerTriggerRateLimit = (_req, _res, next) => next(),
    log = console.log,
    upgrader = null,
    onArrImport = null,
}) => {
    const scannerPortalConfig = (config = {}) => ({
        ...config,
        plexServerUrl: String(config.plexServerUrl || '').trim() || resolveConfiguredPlexServerUrl(config),
    });
    let scannerAuthCache = { username: '', password: '' };
    const refreshScannerAuthCache = async () => {
        const config = await loadFile(configPath, {});
        const scanner = configuredScanner(config);
        scannerAuthCache = { username: scanner.authUsername, password: scanner.authPassword };
    };
    const scannerTriggerAuth = createBasicAuthMiddleware({
        getCredentials: () => scannerAuthCache,
        realm: 'Scanner',
    });
    const requireScanner = async (_req, res, next) => {
        try {
            if (!(await loadFile(configPath, {})).scannerEnabled) {
                return res.status(403).json({ error: 'Scanner is disabled. Enable it in Settings first.' });
            }
            return next();
        } catch {
            return res.status(500).json({ error: 'Failed to check Scanner feature flag.' });
        }
    };
    const requireScannerTrigger = async (_req, res, next) => {
        try {
            const config = await loadFile(configPath, {});
            const integrityHooksEnabled = !!config.upgraderEnabled && !!config.qcIntegrityEnabled;
            // Integrity baselines piggyback on Arr webhooks — allow them even when Plex
            // library scanning is turned off.
            if (!config.scannerEnabled && !integrityHooksEnabled) {
                return res.status(503).json({ error: 'Scanner is disabled' });
            }
            await refreshScannerAuthCache();
            return next();
        } catch {
            return res.status(500).json({ error: 'Scanner unavailable' });
        }
    };
    const parsePaths = {
        sonarr: pathsFromSonarrEvent,
        radarr: pathsFromRadarrEvent,
        lidarr: pathsFromLidarrEvent,
    };
    const handleArrTrigger = async (req, res, kind) => {
        try {
            const config = await loadFile(configPath, {});
            const scanner = configuredScanner(config);
            const trigger = findTriggerByName(scanner, req.params.name || kind);
            if (!trigger || trigger.kind !== kind) return res.status(404).json({ error: `Unknown ${kind} trigger` });
            const paths = parsePaths[kind](req.body || {});
            const event = classifyArrEvent(kind, req.body || {});
            const scans = buildScansFromPaths(paths, {
                ...event,
                priority: trigger.priority,
                source: kind,
                rewrite: trigger.rewrite,
            });
            let queued = 0;
            if (config.scannerEnabled) {
                await enqueueScans(scans);
                queued = scans.length;
            }

            try {
                const baselineImport = onArrImport || upgrader?.integrity?.baselineImport;
                if (
                    (event.action === 'import' || event.action === 'upgrade')
                    && typeof baselineImport === 'function'
                    && config.upgraderEnabled
                    && config.qcIntegrityEnabled
                ) {
                    const payloads = collectArrIntegrityPayloads(kind, req.body || {})
                        .map((payload) => enrichArrIntegrityPayload(config, payload))
                        .filter(Boolean);
                    for (const payload of payloads) {
                        void baselineImport(config, payload).catch((err) => {
                            log(`[scanner] integrity baselineImport failed: ${err?.message || err}`);
                        });
                    }
                }
            } catch (baselineError) {
                log(`[scanner] integrity baseline parse failed: ${baselineError?.message || baselineError}`);
            }

            return res.json({
                ok: true,
                queued,
                scannerEnabled: !!config.scannerEnabled,
                paths: scans.map((scan) => scan.folder),
            });
        } catch (error) {
            log(`[scanner] ${kind} trigger failed: ${error.message}`);
            return res.status(error.status || 500).json({ error: error.message || 'Trigger failed' });
        }
    };

    app.post('/triggers/manual', requireScannerTrigger, scannerTriggerRateLimit, scannerTriggerAuth, async (req, res) => {
        const paths = [...[].concat(req.query.dir || []), ...[].concat(req.body?.dir || []), req.body?.path]
            .map((value) => String(value || '').trim()).filter(Boolean);
        if (!paths.length) return res.status(400).json({ error: 'dir or path is required' });
        const scans = buildScansFromPaths(paths, { source: 'manual', action: 'manual', reason: 'Manual' });
        await enqueueScans(scans);
        res.json({ ok: true, queued: scans.length });
    });
    for (const kind of ['sonarr', 'radarr', 'lidarr']) {
        app.post(`/triggers/${kind}`, requireScannerTrigger, scannerTriggerRateLimit, scannerTriggerAuth, (req, res) => handleArrTrigger(req, res, kind));
    }
    app.post('/triggers/:name', requireScannerTrigger, scannerTriggerRateLimit, scannerTriggerAuth, async (req, res) => {
        const scanner = configuredScanner(await loadFile(configPath, {}));
        const trigger = findTriggerByName(scanner, req.params.name);
        if (!trigger) return res.status(404).json({ error: 'Unknown trigger' });
        return handleArrTrigger(req, res, trigger.kind);
    });

    app.get('/api/scanner/status', requireAdmin, requireScanner, async (_req, res) => {
        try {
            const config = await loadFile(configPath, {});
            const scanner = configuredScanner(config);
            const [stats, activity] = await Promise.all([getQueueStats(), listLog(1)]);
            const configuredSources = Object.entries(scanner.triggers)
                .filter(([, triggers]) => Array.isArray(triggers) && triggers.length)
                .map(([source]) => source);
            res.json({
                enabled: !!config.scannerEnabled,
                minimumAge: scanner.minimumAge,
                targetCount: buildTargets(scannerPortalConfig(config), scanner).length,
                configuredSources,
                showWebhooks: config.scannerWebhooksVisible !== false,
                showManualPath: config.scannerManualPathVisible !== false,
                webhookPaths: {
                    manual: '/triggers/manual',
                    sonarr: (scanner.triggers.sonarr || []).map((trigger) => `/triggers/${trigger.name}`),
                    radarr: (scanner.triggers.radarr || []).map((trigger) => `/triggers/${trigger.name}`),
                    lidarr: (scanner.triggers.lidarr || []).map((trigger) => `/triggers/${trigger.name}`),
                },
                ...stats,
                lastActivity: activity.entries?.[0] || null,
            });
        } catch (error) {
            res.status(500).json({ error: error.message || 'Failed to load scanner status' });
        }
    });
    app.get('/api/scanner/queue', requireAdmin, requireScanner, async (_req, res) => {
        try { res.json(await getQueueStats()); } catch (error) { res.status(500).json({ error: error.message }); }
    });
    app.get('/api/scanner/log', requireAdmin, requireScanner, async (req, res) => {
        try { res.json(await listLog(Math.min(200, Math.max(1, Number.parseInt(req.query.limit, 10) || 50)))); } catch (error) { res.status(500).json({ error: error.message }); }
    });
    app.post('/api/scanner/manual', requireAdmin, requireScanner, async (req, res) => {
        const folder = String(req.body?.path || req.body?.dir || '').trim();
        if (!folder) return res.status(400).json({ error: 'Path is required' });
        await enqueueScans(buildScansFromPaths([folder], { source: 'manual', action: 'manual', reason: 'Manual' }));
        res.json({ ok: true, folder });
    });
    app.post('/api/scanner/process', requireAdmin, requireScanner, async (_req, res) => {
        try {
            const config = await loadFile(configPath, {});
            res.json({ ok: true, ...await processOne(scannerPortalConfig(config), configuredScanner(config)) });
        } catch (error) { res.status(500).json({ error: error.message || 'Process failed' }); }
    });
    app.post('/api/scanner/test-trigger', requireAdmin, requireScanner, async (req, res) => {
        try {
            const kind = String(req.body?.kind || '').toLowerCase();
            if (!parsePaths[kind]) return res.status(400).json({ error: 'Invalid trigger type' });
            const config = await loadFile(configPath, {});
            const scanner = configuredScanner(config);
            const trigger = findTriggerByName(scanner, req.body?.name || kind);
            if (!trigger || trigger.kind !== kind) return res.status(404).json({ error: 'Unknown trigger' });
            const sample = kind === 'radarr'
                ? { eventType: 'Download', movie: { folderPath: '/media/Movies/Scanner Test', title: 'Scanner Test' } }
                : kind === 'sonarr'
                    ? { eventType: 'Download', series: { path: '/media/TV/Scanner Test', title: 'Scanner Test' } }
                    : { eventType: 'Download', artist: { path: '/media/Music/Scanner Test', name: 'Scanner Test' } };
            const parsedPaths = parsePaths[kind](sample);
            const rewrittenPaths = buildScansFromPaths(parsedPaths, { rewrite: trigger.rewrite }).map((scan) => scan.folder);
            const targets = await Promise.all(buildTargets(scannerPortalConfig(config), scanner).map(async (target) => {
                try { await target.available(); return { type: target.type, ok: true }; } catch (error) { return { type: target.type, ok: false, error: error.message }; }
            }));
            res.json({ ok: targets.every((target) => target.ok), trigger: { parsedPaths, rewrittenPaths }, targets });
        } catch (error) { res.status(500).json({ error: error.message || 'Trigger test failed' }); }
    });
    app.post('/api/scanner/import-yaml', requireAdmin, async (req, res) => {
        const yaml = String(req.body?.yaml || '');
        if (!yaml.trim()) return res.status(400).json({ error: 'yaml is required' });
        res.json({ imported: parseAutoscanYaml(yaml) });
    });

    return { refreshScannerAuthCache };
};
