import { getReadyArrInstances } from '../media-stack/arr-instances.js';

const enabled = (config) => config.upgraderEnabled === true;
const arrayParam = (value) => String(value || '').split(',').map((entry) => entry.trim().toLowerCase()).filter(Boolean);

export const registerUpgraderRoutes = ({
    app,
    requireAdmin,
    configPath,
    loadFile,
    appendAuditLog = async () => {},
    upgrader,
}) => {
    const requireUpgrader = async (_req, res, next) => {
        try {
            if (!enabled(await loadFile(configPath, {}))) return res.status(403).json({ error: 'Library Upgrader is disabled. Enable it in Settings first.' });
            return next();
        } catch {
            return res.status(500).json({ error: 'Failed to check Upgrader feature flag.' });
        }
    };
    const config = () => loadFile(configPath, {});
    app.get('/api/upgrader/status', requireAdmin, requireUpgrader, async (_req, res) => {
        const cfg = await config();
        const index = await upgrader.loadIndex();
        res.json({
            enabled: true, mediaServerType: cfg.mediaServerType || 'plex', generatedAt: index.generatedAt,
            itemCount: index.itemCount || 0, rebuildInProgress: upgrader.running,
            arrConfigured: getReadyArrInstances(cfg).some((instance) => ['sonarr', 'radarr'].includes(instance.type)),
            automationEnabled: !!cfg.upgraderAutomationEnabled,
            profileMapConfigured: Object.keys(cfg.upgraderProfileMap || {}).length > 0,
            maxActionsPerHour: Math.max(1, Number(cfg.upgraderMaxActionsPerHour) || 25),
            recentUpgradeCount: 0,
        });
    });
    app.get('/api/upgrader/summary', requireAdmin, requireUpgrader, async (_req, res) => {
        const index = await upgrader.loadIndex();
        const candidates = (index.items || []).filter((item) => !item.isHevc);
        res.json({ generatedAt: index.generatedAt, totalItems: index.itemCount || 0, nonHevcCount: candidates.length, estimatedReclaimableGB: candidates.reduce((sum, item) => sum + Number(item.sizeGB || 0), 0) });
    });
    app.get('/api/upgrader/items', requireAdmin, requireUpgrader, async (req, res) => {
        const [index, prefs] = await Promise.all([upgrader.loadIndex(), upgrader.loadPrefs()]);
        const codecs = arrayParam(req.query.codecs);
        const mediaType = String(req.query.mediaType || 'all');
        const libraryId = String(req.query.libraryId || 'all');
        const search = String(req.query.search || '').toLowerCase();
        const excluded = new Set([...(prefs.excludedRatingKeys || []), ...Object.keys(prefs.snoozed || {}).filter((key) => Date.parse(prefs.snoozed[key]) > Date.now())]);
        let items = (index.items || []).filter((item) => !excluded.has(item.ratingKey));
        if (mediaType !== 'all') items = items.filter((item) => item.mediaType === mediaType);
        if (libraryId !== 'all') items = items.filter((item) => item.arrInstanceId === libraryId);
        if (search) items = items.filter((item) => item.title.toLowerCase().includes(search));
        if (codecs.length) items = items.filter((item) => codecs.some((codec) => item.videoCodec.toLowerCase().includes(codec === 'hevc' ? '265' : codec) || (codec === 'hevc' && item.isHevc)));
        const sort = String(req.query.sort || 'sizeGB');
        items.sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title) : Number(b.sizeGB || 0) - Number(a.sizeGB || 0));
        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 48));
        const libraries = [...new Map((index.items || []).map((item) => [item.arrInstanceId, { id: item.arrInstanceId, title: item.arrInstanceName, count: 0 }])).values()];
        for (const entry of libraries) entry.count = (index.items || []).filter((item) => item.arrInstanceId === entry.id).length;
        res.json({ items: items.slice((page - 1) * limit, page * limit), total: items.length, libraries });
    });
    app.post('/api/upgrader/rebuild', requireAdmin, requireUpgrader, async (req, res) => {
        if (upgrader.running) return res.status(409).json({ error: 'An index rebuild is already running.' });
        const cfg = await config();
        void upgrader.buildIndex(cfg, { actor: req.user });
        res.json({ ok: true });
    });
    app.get('/api/upgrader/audit', requireAdmin, requireUpgrader, async (_req, res) => res.json(await upgrader.loadAudit()));
    app.get('/api/upgrader/preferences', requireAdmin, requireUpgrader, async (_req, res) => res.json({ upgrader: await upgrader.loadPrefs() }));
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
        prefs.snoozed = { ...(prefs.snoozed || {}), [ratingKey]: new Date(Date.now() + Math.max(1, Number(req.body?.days) || 30) * 86400000).toISOString() };
        await upgrader.savePrefs(prefs);
        res.json({ success: true, upgrader: prefs });
    });
    app.post('/api/upgrader/unsnooze', requireAdmin, requireUpgrader, async (req, res) => {
        const prefs = await upgrader.loadPrefs();
        delete prefs.snoozed?.[String(req.body?.ratingKey || '')];
        await upgrader.savePrefs(prefs);
        res.json({ success: true, upgrader: prefs });
    });
};
