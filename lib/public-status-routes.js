import { randomUUID } from 'crypto';

import { normalizeExternalBaseUrl } from './network-policy.js';
import { createPublicStatusPayload } from './status-monitor.js';

export const canExposePublicServerStats = (config = {}) => config.showLoginServerStats === true;
export const canExposePublicStatus = (config = {}) => (
    config.publicStatusEnabled === true && config.publicStatusExplicitlyConfigured === true
);

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
            res.json({ ...profile, isConfigured, mediaServerType: config.mediaServerType || 'plex' });
        } catch (e) {
            res.json({ thumb: null, serverName: 'Server Portal', isConfigured: false, mediaServerType: 'plex' });
        }
    });

    app.get('/api/public/plex/stats', publicReadRateLimit, async (req, res) => {
        const config = await loadFile(CONFIG_PATH, {});
        if (!canExposePublicServerStats(config)) {
            return res.status(403).json({ error: 'Public server statistics are disabled.' });
        }
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
        if (!canExposePublicStatus(config) && !getSessionUser(req)) {
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
            if (services.length > 50 || groups.length > 20) {
                return res.status(400).json({ error: 'Status configuration exceeds the service or group limit.' });
            }
            const cleanText = (value, maxLength) => String(value || '').trim().slice(0, maxLength);
            const usedGroupIds = new Set();
            const sanitizedGroups = groups.map((group, index) => {
                const candidate = cleanText(group?.id, 80) || randomUUID();
                const id = usedGroupIds.has(candidate) ? randomUUID() : candidate;
                usedGroupIds.add(id);
                return {
                    id,
                    name: cleanText(group?.name, 80) || `Group ${index + 1}`,
                    order: index,
                };
            });
            const sanitizedServices = [];
            const usedServiceIds = new Set();
            for (const service of services) {
                if (!service || typeof service !== 'object') continue;
                const candidate = cleanText(service.id, 80) || randomUUID();
                const id = usedServiceIds.has(candidate) ? randomUUID() : candidate;
                usedServiceIds.add(id);
                let normalizedUrl = '';
                if (service.url || !['portal', 'plex'].includes(id)) {
                    try {
                        normalizedUrl = normalizeExternalBaseUrl(service.url, { allowPrivate: true, allowHttp: true });
                        const parsed = new URL(normalizedUrl);
                        if (parsed.username || parsed.password) throw new Error('embedded credentials are not allowed');
                    } catch (e) {
                        return res.status(400).json({ error: `Invalid service URL for "${cleanText(service.name || service.id, 80) || 'unknown'}": ${e.message}` });
                    }
                }
                const requestedPort = Number(service.port);
                sanitizedServices.push({
                    id,
                    name: cleanText(service.name, 100) || 'Service',
                    url: normalizedUrl,
                    port: Number.isInteger(requestedPort) && requestedPort >= 1 && requestedPort <= 65535 ? requestedPort : undefined,
                    type: 'web',
                    groupId: usedGroupIds.has(String(service.groupId)) ? String(service.groupId) : (sanitizedGroups[0]?.id || null),
                    description: cleanText(service.description, 240),
                });
            }
            await statusRuntime.saveStatusConfig({ services: sanitizedServices, groups: sanitizedGroups, announcement: cleanText(announcement, 500) || null });
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
