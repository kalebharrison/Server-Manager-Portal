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

export const registerScannerRoutes = ({
    app,
    requireAdmin,
    configPath,
    loadFile,
    resolveConfiguredPlexServerUrl,
    scannerTriggerRateLimit = (_req, _res, next) => next(),
    log = console.log,
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
            if (!config.scannerEnabled) return res.status(503).json({ error: 'Scanner is disabled' });
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
            await enqueueScans(scans);
            return res.json({ ok: true, queued: scans.length, paths: scans.map((scan) => scan.folder) });
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
