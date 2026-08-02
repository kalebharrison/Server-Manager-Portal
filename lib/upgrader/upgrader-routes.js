import { getReadyArrInstances } from '../media-stack/arr-instances.js';
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
                return res.status(403).json({ error: 'Library Upgrader is disabled. Enable it in Settings first.' });
            }
            return next();
        } catch {
            return res.status(500).json({ error: 'Failed to check Upgrader feature flag.' });
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
        res.json({
            enabled: true,
            mediaServerType: cfg.mediaServerType || 'plex',
            generatedAt: index.generatedAt,
            itemCount: index.itemCount || 0,
            rebuildInProgress: upgrader.running,
            arrConfigured: getReadyArrInstances(cfg).some((instance) => ['sonarr', 'radarr'].includes(instance.type)),
            automationEnabled: !!cfg.upgraderAutomationEnabled,
            profileMapConfigured: Object.keys(cfg.upgraderProfileMap || {}).length > 0,
            maxActionsPerHour: Math.max(1, Number(cfg.upgraderMaxActionsPerHour) || 25),
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
        if (libraryId !== 'all') items = items.filter((item) => item.arrInstanceId === libraryId);
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
        const instances = getReadyArrInstances(cfg)
            .filter((instance) => ['sonarr', 'radarr'].includes(instance.type))
            .map((instance) => ({
                id: instance.id,
                name: instance.name,
                type: instance.type,
                hevcProfileId: cfg.upgraderProfileMap?.[instance.id]?.hevcProfileId ?? null,
                fallbackProfileId: cfg.upgraderProfileMap?.[instance.id]?.fallbackProfileId ?? null,
                profiles: [],
            }));
        res.json({ instances });
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
};
