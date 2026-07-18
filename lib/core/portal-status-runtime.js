import { createStatusRuntime } from '../status/status-runtime.js';
import {
    CONFIG_PATH,
    STATUS_CONFIG_PATH,
    HEALTH_PATH,
} from '../config/data-paths.js';

export const createPortalStatusRuntime = ({
    basePath,
    port,
    loadFile,
    saveFile,
    getPlexConnectionUri,
    metadataHealthProbe,
    resolveIntegrationUrlForFetch,
}) => {
    return createStatusRuntime({
        configPath: CONFIG_PATH,
        statusConfigPath: STATUS_CONFIG_PATH,
        healthPath: HEALTH_PATH,
        loadFile,
        saveFile,
        resolveIntegrationUrlForFetch,
        port,
        basePath,
        resolveServiceUrl: async (service) => {
            if (service?.id !== 'plex') return '';
            const appConfig = await loadFile(CONFIG_PATH, {});
            return getPlexConnectionUri(appConfig);
        },
        probeService: (service) => metadataHealthProbe(service),
    });
};
