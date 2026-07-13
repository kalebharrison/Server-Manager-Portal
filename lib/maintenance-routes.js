import { registerMaintenanceMutationRoutes } from './maintenance-route-mutations.js';
import { registerMaintenanceReadRoutes } from './maintenance-route-reads.js';

export const registerMaintenanceRoutes = (options) => {
    const {
        app,
        requireAdmin,
        configPath,
        loadFile,
        maintenanceService,
        withCache,
    } = options;
    const { isMaintenanceExperimentalEnabled } = maintenanceService;

    let maintenanceCacheVersion = 0;
    const bumpMaintenanceCache = () => {
        maintenanceCacheVersion += 1;
    };
    const cachedMaintenanceRead = (name, ttlMs, variant, fetcher) => {
        const key = `maintenance:${maintenanceCacheVersion}:${name}:${variant || 'default'}`;
        return withCache ? withCache(key, ttlMs, fetcher) : fetcher();
    };

    const requireMaintenanceExperimental = async (req, res, next) => {
        try {
            const config = await loadFile(configPath, {});
            if (!isMaintenanceExperimentalEnabled(config)) {
                return res.status(403).json({ error: 'Maintenance Experimental Mode is disabled. Enable it in Settings first.' });
            }
            return next();
        } catch (e) {
            return res.status(500).json({ error: 'Failed to check Maintenance feature flag.' });
        }
    };

    app.use('/api/maintenance', requireAdmin, requireMaintenanceExperimental);

    const routeOptions = {
        ...options,
        bumpMaintenanceCache,
        cachedMaintenanceRead,
    };
    registerMaintenanceReadRoutes(routeOptions);
    registerMaintenanceMutationRoutes(routeOptions);
};
