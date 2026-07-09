import { randomUUID } from 'crypto';

import { normalizeExternalBaseUrl } from './network-policy.js';
import { createPublicStatusPayload } from './status-monitor.js';

export const registerPublicStatusRoutes = ({
    app,
    publicReadRateLimit,
    requireAuth,
    requireAdmin,
    configPath,
    loadFile,
    statusRuntime,
    getSessionUser,
    getAdminProfile,
    isPortalConfigured,
    getCachedPlexStats,
    loadPlexStatsFromDisk,
}) => {
    const CONFIG_PATH = configPath;

    app.get('/api/public/info', publicReadRateLimit, async (req, res) => {
        try {
            const config = await loadFile(CONFIG_PATH, {});
            const profile = await getAdminProfile(config);
            const isConfigured = isPortalConfigured(config);
            const contactWhatsApp = config.contactWhatsApp || '';
            const contactEmail = config.contactEmail || '';
            let requestUrl = config.requestUrl || 'https://yourdomain.com';
            if ((requestUrl === 'https://yourdomain.com' || !requestUrl) && config.requestAppUrl) {
                requestUrl = config.requestAppUrl;
            }
            res.json({ ...profile, isConfigured, mediaServerType: config.mediaServerType || 'plex', requestUrl, contactWhatsApp, contactEmail });
        } catch (e) {
            res.json({ thumb: null, serverName: 'Server Portal', isConfigured: false, mediaServerType: 'plex', requestUrl: 'https://yourdomain.com' });
        }
    });

    app.get('/api/public/plex/stats', publicReadRateLimit, async (req, res) => {
        const cachedStats = getCachedPlexStats();
        if (cachedStats) return res.json(cachedStats);

        const disk = await loadPlexStatsFromDisk();
        if (disk) return res.json(disk);

        return res.json({
            movies: 0,
            shows: 0,
            music: 0,
            moviesBytes: 0,
            showsBytes: 0,
            musicBytes: 0,
            fourKPercent: 0,
            isBuilding: true,
        });
    });

    app.get('/api/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

    app.get('/api/status', publicReadRateLimit, async (req, res) => {
        const config = await loadFile(CONFIG_PATH, {});
        if (config.publicStatusEnabled === false && !getSessionUser(req)) {
            return res.status(403).json({ error: 'Status monitor requires sign in.' });
        }
        return res.json(createPublicStatusPayload(statusRuntime.getStatusConfig(), statusRuntime.getHealthData()));
    });

    app.get('/api/status/config', requireAuth, requireAdmin, (req, res) => res.json(statusRuntime.getStatusConfig()));

    app.post('/api/status/config', requireAuth, requireAdmin, async (req, res) => {
        try {
            const { services, groups, announcement } = req.body;
            if (!Array.isArray(services) || !Array.isArray(groups)) {
                return res.status(400).json({ error: 'Invalid config structure: services and groups must be arrays.' });
            }
            const sanitizedServices = [];
            for (const service of services) {
                if (!service || typeof service !== 'object') continue;
                let normalizedUrl = '';
                if (service.url) {
                    try {
                        normalizedUrl = normalizeExternalBaseUrl(service.url, { allowPrivate: true, allowHttp: true });
                    } catch (e) {
                        return res.status(400).json({ error: `Invalid service URL for "${service.name || service.id || 'unknown'}": ${e.message}` });
                    }
                }
                sanitizedServices.push({
                    id: String(service.id || randomUUID()),
                    name: String(service.name || 'Service'),
                    url: normalizedUrl,
                    port: Number.isFinite(Number(service.port)) ? Number(service.port) : undefined,
                    type: String(service.type || 'web'),
                    groupId: String(service.groupId || 'core'),
                    description: String(service.description || ''),
                });
            }
            await statusRuntime.saveStatusConfig({ services: sanitizedServices, groups, announcement: announcement || null });
            return res.json({ success: true, message: 'Status configuration updated successfully.' });
        } catch (error) {
            return res.status(500).json({ error: 'Failed to update status configuration' });
        }
    });

    app.post('/api/status/reset', requireAuth, requireAdmin, async (req, res) => {
        try {
            await statusRuntime.resetHealthData();
            res.json({ success: true, message: 'Status statistics reset successfully.' });
        } catch (error) {
            res.status(500).json({ error: 'Failed to reset status statistics' });
        }
    });
};
