import { getReadyArrInstances } from '../media-stack/arr-instances.js';
import { librariesForArrInstance } from './upgrader-library.js';
import { libraryKeyForItem, libraryLabelForItem } from './upgrader-hunt-queue.js';
import {
    buildIndexByEntity,
    countDownloadsByLibrary,
    fetchArrQueueRecords,
    libraryKeyForQueueRecord,
    maxDownloadsPerLibraryFromConfig,
} from './upgrader-hunt-downloads.js';
import { createUpgraderTrash } from './upgrader-trash.js';
import { resolvePortalBoosts } from './upgrader-media-flags.js';

const enabled = (config) => config.upgraderEnabled === true;
const arrayParam = (value) => String(value || '').split(',').map((entry) => entry.trim().toLowerCase()).filter(Boolean);

const findItem = (index, ratingKey) => (index.items || []).find((item) => item.ratingKey === String(ratingKey));

export const registerUpgraderRoutes = ({
    app,
    requireAdmin,
    configPath,
    loadFile,
    appendAuditLog = async () => {},
    upgrader,
}) => {
    const trash = createUpgraderTrash({ log: console.log });
    const requireUpgrader = async (_req, res, next) => {
        try {
            if (!enabled(await loadFile(configPath, {}))) {
                return res.status(403).json({ error: 'Quality Control is disabled. Enable it in Settings first.' });
            }
            return next();
        } catch {
            return res.status(500).json({ error: 'Failed to check Quality Control feature flag.' });
        }
    };
    const config = () => loadFile(configPath, {});
    const resolveInstance = async (instanceId) => {
        const cfg = await config();
        return getReadyArrInstances(cfg).find((instance) => String(instance.id) === String(instanceId)) || null;
    };

    app.get('/api/upgrader/status', requireAdmin, requireUpgrader, async (_req, res) => {
        const cfg = await config();
        const index = await upgrader.loadIndex();
        const prefs = resolvePortalBoosts(cfg);
        const maxDownloadsPerLibrary = maxDownloadsPerLibraryFromConfig(cfg);
        const maxStrikes = Math.max(1, Number(cfg.qcMaxStrikes) || 3);
        const qcThresholds = {
            metaDlMinutes: Math.max(1, Number(cfg.qcMetaDlMinutes) || 10),
            stalledHours: Math.max(1, Number(cfg.qcStalledHours) || 2),
            completedNotImportingMinutes: Math.max(1, Number(cfg.qcCompletedNotImportingMinutes) || 20),
            orphanGraceMinutes: Math.max(0, Number(cfg.qcOrphanGraceMinutes ?? 15) || 0),
            maxStrikes,
            researchThrottleHours: Math.max(1, Number(cfg.qcResearchThrottleHours) || 24),
            snoozeDefaultHours: Math.max(1, Number(cfg.qcSnoozeDefaultHours) || 24),
        };

        const labelByKey = new Map();
        for (const item of (index.items || [])) {
            const key = libraryKeyForItem(item);
            if (!labelByKey.has(key)) labelByKey.set(key, libraryLabelForItem(item));
        }
        for (const instance of getReadyArrInstances(cfg)) {
            for (const lib of librariesForArrInstance(instance)) {
                if (!labelByKey.has(lib.key)) labelByKey.set(lib.key, lib.name);
            }
        }

        let activeDownloadsByLibrary = [];
        let activeDownloadTotal = 0;
        try {
            const queueRecords = await fetchArrQueueRecords(cfg, upgrader.request);
            const counts = countDownloadsByLibrary(queueRecords, {
                instances: getReadyArrInstances(cfg),
                indexItems: index.items || [],
            });
            // Ensure libraries with zero active DLs still appear when indexed/configured.
            for (const key of labelByKey.keys()) {
                if (!counts.has(key)) counts.set(key, 0);
            }
            // Catch queue-only libraries not in the index yet.
            const indexByEntity = buildIndexByEntity(index.items || []);
            const instances = getReadyArrInstances(cfg);
            for (const record of queueRecords) {
                const instance = instances.find((entry) => (
                    String(entry.id) === String(record.arrInstanceId)
                )) || { id: record.arrInstanceId, type: record.arrType, name: record.arrInstanceName };
                const key = libraryKeyForQueueRecord(record, instance, indexByEntity);
                if (!labelByKey.has(key)) {
                    labelByKey.set(key, record.arrInstanceName || key);
                }
                if (!counts.has(key)) counts.set(key, 0);
            }
            activeDownloadsByLibrary = [...counts.entries()]
                .map(([key, active]) => ({
                    key,
                    label: labelByKey.get(key) || key,
                    active: Number(active) || 0,
                    cap: maxDownloadsPerLibrary,
                    remaining: Math.max(0, maxDownloadsPerLibrary - (Number(active) || 0)),
                }))
                .sort((a, b) => {
                    if (b.active !== a.active) return b.active - a.active;
                    return a.label.localeCompare(b.label);
                });
            activeDownloadTotal = activeDownloadsByLibrary.reduce((sum, row) => sum + row.active, 0);
        } catch {
            activeDownloadsByLibrary = [...labelByKey.entries()].map(([key, label]) => ({
                key,
                label,
                active: 0,
                cap: maxDownloadsPerLibrary,
                remaining: maxDownloadsPerLibrary,
            }));
        }

        const storedPrefs = await upgrader.loadPrefs();
        res.json({
            enabled: true,
            mediaServerType: cfg.mediaServerType || 'plex',
            generatedAt: index.generatedAt,
            itemCount: index.itemCount || 0,
            rebuildInProgress: upgrader.running,
            arrConfigured: getReadyArrInstances(cfg).some((instance) => ['sonarr', 'radarr', 'lidarr'].includes(instance.type)),
            automationEnabled: !!cfg.upgraderAutomationEnabled,
            cleanupAutomationEnabled: !!cfg.qcCleanupAutomationEnabled,
            integrityEnabled: !!cfg.qcIntegrityEnabled,
            integrityAutomationEnabled: !!cfg.qcIntegrityAutomationEnabled,
            huntMissingEpisodes: cfg.upgraderHuntMissingEpisodes !== false,
            huntAvailableMovies: cfg.upgraderHuntAvailableMovies !== false,
            integrity: upgrader.integrity
                ? await upgrader.integrity.getStatus(cfg)
                : null,
            qcMetrics: {
                killsByReason: storedPrefs.qcMetrics?.killsByReason || {},
                lastCleanupAt: storedPrefs.qcMetrics?.lastCleanupAt || null,
            },
            qcThresholds,
            activeDownloadsByLibrary,
            activeDownloadTotal,
            clientsConfigured: {
                qbit: !!(cfg.qcQbitUrl && String(cfg.qcQbitUrl).trim()),
                sab: !!(cfg.qcSabUrl && cfg.qcSabApiKey),
            },
            discordDigestEnabled: !!cfg.qcDiscordDigestEnabled,
            preferImportDiscordOnly: cfg.qcPreferImportDiscordOnly !== false,
            profileMapConfigured: Object.keys(cfg.upgraderProfileMap || {}).length > 0,
            maxActionsPerHour: Math.max(1, Number(cfg.upgraderMaxActionsPerHour) || 25),
            maxDownloadsPerLibrary,
            minScoreDelta: Math.max(0, Number(cfg.upgraderMinScoreDelta ?? 10) || 0),
            preferences: prefs,
            recentUpgradeCount: upgrader.hunt.actionsRemaining
                ? Math.max(0, Math.max(1, Number(cfg.upgraderMaxActionsPerHour) || 25) - upgrader.hunt.actionsRemaining(cfg))
                : 0,
            defaultPreset: cfg.upgraderDefaultPreset || 'score_gap',
            defaultSort: cfg.upgraderDefaultSort || 'sizeGB',
            minSizeGB: Math.max(0, Number(cfg.upgraderMinSizeGB) || 0),
            plexConfigured: !!(cfg.serverIdentifier || cfg.plexServerUrl),
        });
    });

    app.get('/api/upgrader/summary', requireAdmin, requireUpgrader, async (_req, res) => {
        const cfg = await config();
        const index = await upgrader.loadIndex();
        const items = index.items || [];
        const withFiles = items.filter((item) => item.hasFile || item.episodeCount > 0);
        const nonHevc = withFiles.filter((item) => !item.isHevc);
        const libraryMap = new Map();
        for (const item of items) {
            const key = libraryKeyForItem(item);
            if (!libraryMap.has(key)) {
                libraryMap.set(key, {
                    id: key,
                    key,
                    name: libraryLabelForItem(item),
                    type: item.arrType || 'arr',
                    indexed: 0,
                    withFiles: 0,
                });
            }
            const lib = libraryMap.get(key);
            lib.indexed += 1;
            const episodeCount = Number(item.episodeCount || item.totalEpisodeCount || 0);
            if (item.hasFile || (item.mediaType === 'show' && episodeCount > 0)) lib.withFiles += 1;
        }
        res.json({
            generatedAt: index.generatedAt,
            totalItems: index.itemCount || 0,
            upgradeCandidates: withFiles.length,
            nonHevcCount: nonHevc.length,
            hevcCount: withFiles.filter((item) => item.isHevc).length,
            nonHevc4kCount: nonHevc.filter((item) => item.videoResolution === '4k').length,
            nonHevcHdrCount: nonHevc.filter((item) => item.hasHdr).length,
            arrMappedCount: withFiles.length,
            arrUnmappedCount: 0,
            estimatedReclaimableGB: withFiles.reduce((sum, item) => sum + Number(item.sizeGB || 0), 0),
            minSizeGB: Math.max(0, Number(cfg.upgraderMinSizeGB) || 0),
            avgCustomFormatScore: (() => {
                const scored = withFiles
                    .map((item) => item.avgCustomFormatScore ?? item.customFormatScore)
                    .filter((score) => score != null && Number.isFinite(Number(score)));
                if (!scored.length) return 0;
                return Math.round(scored.reduce((sum, score) => sum + Number(score), 0) / scored.length);
            })(),
            libraries: [...libraryMap.values()]
                .filter((lib) => Number(lib.withFiles || 0) > 0)
                .sort((a, b) => a.name.localeCompare(b.name)),
            scoreUnknownCount: items.filter((item) => item.scoreUnknown).length,
        });
    });

    app.get('/api/upgrader/items', requireAdmin, requireUpgrader, async (req, res) => {
        const [index, prefs, cfg] = await Promise.all([upgrader.loadIndex(), upgrader.loadPrefs(), config()]);
        const codecs = arrayParam(req.query.codecs);
        const resolutions = arrayParam(req.query.resolutions);
        const features = arrayParam(req.query.features);
        const qualities = arrayParam(req.query.qualities);
        const mediaType = String(req.query.mediaType || 'all');
        const libraryId = String(req.query.libraryId || 'all');
        const search = String(req.query.search || '').toLowerCase();
        const minSizeGB = Math.max(0, Number(req.query.minSizeGB ?? cfg.upgraderMinSizeGB) || 0);
        const excluded = new Set([
            ...(prefs.excludedRatingKeys || []),
            ...Object.keys(prefs.snoozed || {}).filter((key) => Date.parse(prefs.snoozed[key]) > Date.now()),
        ]);
        let items = (index.items || []).filter((item) => !excluded.has(item.ratingKey));
        if (mediaType !== 'all') items = items.filter((item) => item.mediaType === mediaType);
        if (libraryId !== 'all') {
            items = items.filter((item) => (
                libraryKeyForItem(item) === libraryId
                || String(item.arrInstanceId) === libraryId
            ));
        }
        if (search) items = items.filter((item) => item.title.toLowerCase().includes(search));
        if (minSizeGB > 0) items = items.filter((item) => Number(item.sizeGB || 0) >= minSizeGB);
        if (codecs.length) {
            items = items.filter((item) => codecs.some((codec) => {
                if (codec === 'hevc') return item.isHevc || String(item.videoCodec || '').toLowerCase().includes('265');
                if (codec === 'non_hevc' || codec === 'h264') return !item.isHevc;
                return String(item.videoCodec || '').toLowerCase().includes(codec);
            }));
        }
        if (resolutions.length) {
            items = items.filter((item) => resolutions.some((resolution) => String(item.videoResolution || '').includes(resolution.replace('4k', '4k')) || (resolution === '4k' && item.videoResolution === '4k')));
        }
        if (features.length) {
            items = items.filter((item) => features.some((feature) => {
                if (feature === 'non_hevc') return !item.isHevc;
                if (feature === 'hdr') return item.hasHdr;
                if (feature === 'dolby_vision') return item.hasDolbyVision;
                if (feature === 'large') return Number(item.sizeGB || 0) >= Math.max(minSizeGB, 20);
                return false;
            }));
        }
        if (qualities.length) {
            items = items.filter((item) => qualities.some((quality) => String(item.sourceTier || item.qualityName || '').toLowerCase().includes(quality)));
        }

        const sort = String(req.query.sort || cfg.upgraderDefaultSort || 'sizeGB');
        items.sort((a, b) => {
            if (sort === 'title') return a.title.localeCompare(b.title);
            if (sort === 'score' || sort === 'customFormatScore') {
                return Number(a.avgCustomFormatScore ?? a.customFormatScore ?? 0) - Number(b.avgCustomFormatScore ?? b.customFormatScore ?? 0);
            }
            return Number(b.sizeGB || 0) - Number(a.sizeGB || 0);
        });

        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 48));
        const libraries = [...new Map((index.items || []).map((item) => [item.arrInstanceId, {
            id: item.arrInstanceId,
            title: item.arrInstanceName,
            count: 0,
        }])).values()];
        for (const entry of libraries) {
            entry.count = (index.items || []).filter((item) => item.arrInstanceId === entry.id).length;
        }

        const mapped = items.map((item) => ({
            ...item,
            libraryTitle: item.arrInstanceName,
            libraryId: item.arrInstanceId,
            thumb: item.thumbUrl,
            displayTags: [
                item.videoResolution === '4k' ? '4K' : item.videoResolution,
                item.sourceTier && item.sourceTier !== 'unknown' ? item.sourceTier : null,
                item.hasDolbyVision ? 'DV' : (item.hasHdr ? 'HDR' : null),
                item.hasAtmos ? 'Atmos' : null,
            ].filter(Boolean),
            arrMapped: true,
            dataSource: item.arrType,
            arrEntityId: item.entityId,
            arrQualityProfileId: item.qualityProfileId,
            plexUrl: null,
            watchCount: 0,
            // Drop heavy episode payloads from list responses.
            episodes: undefined,
        }));

        res.json({
            items: mapped.slice((page - 1) * limit, page * limit),
            total: mapped.length,
            libraries,
        });
    });

    app.get('/api/upgrader/items/:ratingKey/detail', requireAdmin, requireUpgrader, async (req, res) => {
        const index = await upgrader.loadIndex();
        const item = findItem(index, req.params.ratingKey);
        if (!item) return res.status(404).json({ error: 'Item not found in upgrader index. Rebuild the index.' });
        res.json({
            item: {
                ...item,
                libraryTitle: item.arrInstanceName,
                libraryId: item.arrInstanceId,
                thumb: item.thumbUrl,
                arrMapped: true,
            },
            episodes: (item.episodes || []).map((episode) => ({
                ratingKey: `${item.ratingKey}:S${episode.seasonNumber}E${episode.episodeNumber}`,
                title: episode.title,
                showTitle: item.title,
                seasonNumber: episode.seasonNumber,
                episodeNumber: episode.episodeNumber,
                mediaType: 'episode',
                videoCodec: episode.videoCodec,
                videoResolution: episode.videoResolution,
                sizeGB: episode.sizeGB,
                isHevc: episode.isHevc,
                hasHdr: episode.hasHdr,
                hasDolbyVision: episode.hasDolbyVision,
                hasAtmos: episode.hasAtmos,
                customFormatScore: episode.customFormatScore,
                displayTags: [episode.videoResolution, episode.sourceTier, `score ${episode.customFormatScore}`].filter(Boolean),
                plexUrl: null,
            })),
            seasons: item.seasons || [],
        });
    });

    app.post('/api/upgrader/preview', requireAdmin, requireUpgrader, async (req, res) => {
        const cfg = await config();
        const index = await upgrader.loadIndex();
        const keys = Array.isArray(req.body?.ratingKeys) ? req.body.ratingKeys : [];
        const results = [];
        for (const key of keys) {
            const item = findItem(index, key);
            if (!item) {
                results.push({ ratingKey: key, success: false, reason: 'Not found in index' });
                continue;
            }
            results.push(await upgrader.hunt.previewItem(cfg, item));
        }
        res.json({
            dryRun: true,
            results,
            totals: {
                succeeded: results.filter((entry) => entry.success).length,
                failed: results.filter((entry) => !entry.success).length,
            },
        });
    });

    app.post('/api/upgrader/upgrade', requireAdmin, requireUpgrader, async (req, res) => {
        const cfg = await config();
        if (!cfg.upgraderAutomationEnabled) {
            return res.status(403).json({ error: 'Enable automated upgrades in Settings first.' });
        }
        const index = await upgrader.loadIndex();
        const keys = Array.isArray(req.body?.ratingKeys) ? req.body.ratingKeys : [];
        const results = [];
        for (const key of keys) {
            const item = findItem(index, key);
            if (!item) {
                results.push({ ratingKey: key, success: false, reason: 'Not found in index' });
                continue;
            }
            results.push(await upgrader.hunt.upgradeItem(cfg, item));
        }
        res.json({
            results,
            totals: {
                succeeded: results.filter((entry) => entry.success && entry.grabbed).length,
                failed: results.filter((entry) => !entry.success || !entry.grabbed).length,
            },
        });
    });

    app.post('/api/upgrader/search', requireAdmin, requireUpgrader, async (req, res) => {
        const cfg = await config();
        const index = await upgrader.loadIndex();
        const item = findItem(index, req.body?.ratingKey);
        if (!item) return res.status(404).json({ error: 'Item not found in upgrader index.' });
        const result = await upgrader.hunt.searchItem(cfg, item, req.body || {});
        res.json(result);
    });

    app.post('/api/upgrader/rebuild', requireAdmin, requireUpgrader, async (req, res) => {
        if (upgrader.running) return res.status(409).json({ error: 'An index rebuild is already running.' });
        const cfg = await config();
        void upgrader.buildIndex(cfg, { actor: req.user });
        res.json({ ok: true });
    });

    app.post('/api/upgrader/hunt', requireAdmin, requireUpgrader, async (req, res) => {
        const cfg = await config();
        const dryRun = req.body?.dryRun !== false; // default dry-run for safety
        if (!dryRun && !cfg.upgraderAutomationEnabled) {
            return res.status(403).json({ error: 'Enable auto-hunt in Settings before running a live hunt.' });
        }
        const limit = req.body?.limit != null ? Number(req.body.limit) : null;
        const result = await upgrader.hunt.runHunt(cfg, { dryRun, limit });
        res.json(result);
    });

    app.get('/api/upgrader/audit', requireAdmin, requireUpgrader, async (req, res) => {
        const audit = await upgrader.loadAudit();
        const index = await upgrader.loadIndex();
        const byKey = new Map((index.items || []).map((item) => [String(item.ratingKey), item]));
        const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
        const entries = (audit.entries || []).slice(0, limit).map((entry) => {
            const item = byKey.get(String(entry.ratingKey || ''));
            return {
                ...entry,
                timestamp: entry.timestamp || entry.at || null,
                thumbUrl: entry.thumbUrl || item?.thumbUrl || null,
            };
        });
        res.json({ entries });
    });

    app.get('/api/upgrader/preferences', requireAdmin, requireUpgrader, async (_req, res) => {
        res.json({ upgrader: await upgrader.loadPrefs() });
    });
    app.post('/api/upgrader/preferences', requireAdmin, requireUpgrader, async (req, res) => {
        const prefs = { ...(await upgrader.loadPrefs()), ...(req.body?.upgrader || req.body || {}) };
        await upgrader.savePrefs(prefs);
        await appendAuditLog('upgrader_preferences_updated', req.user, null, {});
        res.json({ success: true, upgrader: prefs });
    });
    app.post('/api/upgrader/snooze', requireAdmin, requireUpgrader, async (req, res) => {
        const prefs = await upgrader.loadPrefs();
        const ratingKey = String(req.body?.ratingKey || '');
        if (!ratingKey) return res.status(400).json({ error: 'ratingKey is required' });
        prefs.snoozed = {
            ...(prefs.snoozed || {}),
            [ratingKey]: new Date(Date.now() + Math.max(1, Number(req.body?.days) || 30) * 86400000).toISOString(),
        };
        await upgrader.savePrefs(prefs);
        res.json({ success: true, upgrader: prefs });
    });
    app.post('/api/upgrader/unsnooze', requireAdmin, requireUpgrader, async (req, res) => {
        const prefs = await upgrader.loadPrefs();
        delete prefs.snoozed?.[String(req.body?.ratingKey || '')];
        await upgrader.savePrefs(prefs);
        res.json({ success: true, upgrader: prefs });
    });

    app.get('/api/upgrader/profiles', requireAdmin, requireUpgrader, async (_req, res) => {
        const cfg = await config();
        // CF profile mapping is Sonarr/Radarr-only; library list includes Lidarr too.
        const profileReady = getReadyArrInstances(cfg)
            .filter((instance) => ['sonarr', 'radarr'].includes(instance.type));
        const libraryReady = getReadyArrInstances(cfg)
            .filter((instance) => ['sonarr', 'radarr', 'lidarr'].includes(instance.type));
        const instances = profileReady.map((instance) => ({
            id: instance.id,
            name: instance.name,
            type: instance.type,
            hevcProfileId: cfg.upgraderProfileMap?.[instance.id]?.hevcProfileId ?? null,
            fallbackProfileId: cfg.upgraderProfileMap?.[instance.id]?.fallbackProfileId ?? null,
            profiles: [],
        }));
        const libraries = libraryReady.flatMap((instance) => librariesForArrInstance(instance));
        res.json({ instances, libraries });
    });

    app.get('/api/upgrader/arr/:instanceId/customformats', requireAdmin, requireUpgrader, async (req, res) => {
        const instance = await resolveInstance(req.params.instanceId);
        if (!instance) return res.status(404).json({ error: 'Arr instance not found' });
        const formats = await upgrader.request(instance, '/api/v3/customformat');
        res.json({ formats: Array.isArray(formats) ? formats : [] });
    });
    app.post('/api/upgrader/arr/:instanceId/customformats', requireAdmin, requireUpgrader, async (req, res) => {
        const instance = await resolveInstance(req.params.instanceId);
        if (!instance) return res.status(404).json({ error: 'Arr instance not found' });
        const created = await upgrader.request(instance, '/api/v3/customformat', { method: 'POST', body: req.body });
        res.status(201).json({ format: created });
    });
    app.put('/api/upgrader/arr/:instanceId/customformats/:formatId', requireAdmin, requireUpgrader, async (req, res) => {
        const instance = await resolveInstance(req.params.instanceId);
        if (!instance) return res.status(404).json({ error: 'Arr instance not found' });
        const updated = await upgrader.request(instance, `/api/v3/customformat/${encodeURIComponent(req.params.formatId)}`, {
            method: 'PUT',
            body: { ...req.body, id: Number(req.params.formatId) },
        });
        res.json({ format: updated });
    });

    app.get('/api/upgrader/arr/:instanceId/qualityprofiles', requireAdmin, requireUpgrader, async (req, res) => {
        const instance = await resolveInstance(req.params.instanceId);
        if (!instance) return res.status(404).json({ error: 'Arr instance not found' });
        const profiles = await upgrader.request(instance, '/api/v3/qualityprofile');
        res.json({ profiles: Array.isArray(profiles) ? profiles : [] });
    });
    app.put('/api/upgrader/arr/:instanceId/qualityprofiles/:profileId', requireAdmin, requireUpgrader, async (req, res) => {
        const instance = await resolveInstance(req.params.instanceId);
        if (!instance) return res.status(404).json({ error: 'Arr instance not found' });
        const updated = await upgrader.request(instance, `/api/v3/qualityprofile/${encodeURIComponent(req.params.profileId)}`, {
            method: 'PUT',
            body: { ...req.body, id: Number(req.params.profileId) },
        });
        res.json({ profile: updated });
    });
    app.get('/api/upgrader/arr/:instanceId/schema', requireAdmin, requireUpgrader, async (req, res) => {
        const instance = await resolveInstance(req.params.instanceId);
        if (!instance) return res.status(404).json({ error: 'Arr instance not found' });
        const schema = await upgrader.request(instance, '/api/v3/customformat/schema').catch(() => []);
        res.json({ schema: Array.isArray(schema) ? schema : [] });
    });

    app.get('/api/upgrader/trash/sonarr/catalog', requireAdmin, requireUpgrader, async (req, res) => {
        const catalog = await trash.loadCatalog({ refresh: String(req.query.refresh || '') === '1' });
        res.json({
            categories: catalog.categories,
            itemCount: catalog.itemCount,
            source: catalog.source,
            error: catalog.error || null,
        });
    });
    app.get('/api/upgrader/trash/sonarr/catalog/:slug', requireAdmin, requireUpgrader, async (req, res) => {
        try {
            const payload = await trash.loadFormat(req.params.slug);
            res.json(payload);
        } catch (error) {
            res.status(404).json({ error: error.message || 'Format not found' });
        }
    });

    const downloadHealth = () => upgrader.downloadHealth;

    app.get('/api/upgrader/qc/downloads', requireAdmin, requireUpgrader, async (req, res) => {
        try {
            const cfg = await config();
            const dryRun = String(req.query.dryRun || '') === '1' || String(req.query.dryRun || '') === 'true';
            const payload = dryRun
                ? await downloadHealth().dryRunCleanup(cfg)
                : await downloadHealth().collectSnapshot(cfg);
            res.json(payload);
        } catch (error) {
            res.status(500).json({ error: error.message || 'Failed to load download health' });
        }
    });

    app.post('/api/upgrader/qc/cleanup', requireAdmin, requireUpgrader, async (req, res) => {
        try {
            const cfg = await config();
            const dryRun = req.body?.dryRun !== false && req.body?.dryRun !== 0;
            const itemKeys = Array.isArray(req.body?.itemKeys) ? req.body.itemKeys : null;
            if (!dryRun && !cfg.qcCleanupAutomationEnabled && !req.body?.force) {
                // Allow manual live cleanup from the UI even when automation is off.
            }
            const live = req.body?.dryRun === false || req.body?.live === true;
            const result = await downloadHealth().runCleanup(cfg, {
                dryRun: !live,
                itemKeys,
            });
            await appendAuditLog({
                action: live ? 'qc_cleanup_live' : 'qc_cleanup_dry_run',
                actor: req.user?.username || req.user?.id || null,
                count: result.count,
                killed: result.killed,
            }).catch(() => {});
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message || 'Cleanup failed' });
        }
    });

    app.post('/api/upgrader/qc/snooze', requireAdmin, requireUpgrader, async (req, res) => {
        try {
            const cfg = await config();
            const key = String(req.body?.key || '');
            const hours = Number(req.body?.hours ?? cfg.qcSnoozeDefaultHours ?? 24) || 24;
            const result = await downloadHealth().snoozeItem(key, hours);
            res.json(result);
        } catch (error) {
            res.status(400).json({ error: error.message || 'Snooze failed' });
        }
    });

    app.post('/api/upgrader/qc/snooze/clear', requireAdmin, requireUpgrader, async (req, res) => {
        try {
            const result = await downloadHealth().clearSnooze(String(req.body?.key || ''));
            res.json(result);
        } catch (error) {
            res.status(400).json({ error: error.message || 'Clear snooze failed' });
        }
    });

    app.get('/api/upgrader/qc/metrics', requireAdmin, requireUpgrader, async (_req, res) => {
        const prefs = await upgrader.loadPrefs();
        res.json(downloadHealth().getMetrics(prefs));
    });

    app.get('/api/upgrader/qc/integrity', requireAdmin, requireUpgrader, async (req, res) => {
        try {
            const cfg = await config();
            const status = await upgrader.integrity.getStatus(cfg);
            res.json(status);
        } catch (error) {
            res.status(500).json({ error: error.message || 'Failed to load integrity status' });
        }
    });

    app.post('/api/upgrader/qc/integrity/scan', requireAdmin, requireUpgrader, async (req, res) => {
        try {
            const cfg = await config();
            const live = req.body?.dryRun === false || req.body?.live === true;
            const replaceFindings = live && (req.body?.replace === true || req.body?.replaceFindings === true);
            if (live && replaceFindings && !cfg.qcIntegrityAutomationEnabled && !req.body?.force) {
                // Manual live replace from UI is allowed even when automation is off.
            }
            const result = await upgrader.integrity.scanIntegrity(cfg, {
                dryRun: !live || !replaceFindings,
                replaceFindings: !!replaceFindings,
                limit: req.body?.limit ?? null,
                force: !!req.body?.force,
            });
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message || 'Integrity scan failed' });
        }
    });

    app.post('/api/upgrader/qc/integrity/replace', requireAdmin, requireUpgrader, async (req, res) => {
        try {
            const cfg = await config();
            const finding = req.body?.finding || req.body;
            if (!finding?.filePath || !finding?.arrType) {
                return res.status(400).json({ error: 'finding with filePath and arrType is required' });
            }
            const result = await upgrader.integrity.replaceCorrupt(cfg, finding, {
                dryRun: req.body?.dryRun === true,
            });
            if (!result.success) return res.status(400).json(result);
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message || 'Integrity replace failed' });
        }
    });

    app.get('/api/upgrader/qc/extensions', requireAdmin, requireUpgrader, async (_req, res) => {
        try {
            const cfg = await config();
            res.json(await downloadHealth().getExtensionPolicy(cfg));
        } catch (error) {
            res.status(500).json({ error: error.message || 'Failed to read extension policy' });
        }
    });

    app.post('/api/upgrader/qc/extensions', requireAdmin, requireUpgrader, async (req, res) => {
        try {
            const cfg = await config();
            const extensions = Array.isArray(req.body?.extensions)
                ? req.body.extensions
                : String(req.body?.extensionsText || '')
                    .split(/[\s,;]+/)
                    .map((entry) => entry.trim())
                    .filter(Boolean);
            const result = await downloadHealth().applyExtensionPolicy(cfg, extensions);
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message || 'Failed to apply extension policy' });
        }
    });

    app.get('/api/upgrader/qc/condemned', requireAdmin, requireUpgrader, async (_req, res) => {
        const prefs = await upgrader.loadPrefs();
        const now = Date.now();
        const condemned = {};
        for (const [key, until] of Object.entries(prefs.condemned || {})) {
            if (downloadHealth().isCondemned(prefs, key, now)) condemned[key] = until;
        }
        res.json({ condemned });
    });
};
