import fs from 'fs/promises';
import { createDefaultStatusConfig, reconcileBuiltInStatusConfig } from './status-monitor.js';
import { createStatusServiceProbe } from './status-runtime-probe.js';
import { runStatusMonitorCycle } from './status-runtime-monitor.js';

export const STATUS_HEALTH_SCHEMA_VERSION = 2;

export const createStatusRuntime = ({
    configPath,
    statusConfigPath,
    healthPath,
    loadFile,
    saveFile,
    normalizeExternalBaseUrl,
    port = 2121,
    basePath = '',
    resolveServiceUrl,
    probeService,
}) => {
    let statusConfig = createDefaultStatusConfig();
    let healthData = {};

    const getStatusConfig = () => statusConfig;
    const getHealthData = () => healthData;

    const saveStatusConfig = async (nextConfig) => {
        statusConfig = nextConfig;
        await saveFile(statusConfigPath, statusConfig);
    };

    const resetHealthData = async () => {
        healthData = { _meta: { schemaVersion: STATUS_HEALTH_SCHEMA_VERSION, lastCheck: Date.now() } };
        await saveHealthData({ force: true });
    };

    const reconcileStatusConfig = async () => {
        const appConfig = await loadFile(configPath, {});
        const reconciled = reconcileBuiltInStatusConfig(statusConfig, appConfig);
        if (JSON.stringify(reconciled) !== JSON.stringify(statusConfig)) await saveStatusConfig(reconciled);
        return statusConfig;
    };

    const loadStatusState = async () => {
        try {
            const configData = await fs.readFile(statusConfigPath, 'utf-8');
            statusConfig = JSON.parse(configData);
        } catch (e) {
            const appConfig = await loadFile(configPath, {});
            statusConfig = createDefaultStatusConfig(appConfig);
            await saveFile(statusConfigPath, statusConfig);
        }

        if (!Array.isArray(statusConfig.services) || statusConfig.services.length === 0) {
            const appConfig = await loadFile(configPath, {});
            statusConfig = createDefaultStatusConfig(appConfig);
            await saveFile(statusConfigPath, statusConfig);
        } else {
            await reconcileStatusConfig();
        }

        try {
            const healthRaw = await fs.readFile(healthPath, 'utf-8');
            healthData = JSON.parse(healthRaw);
        } catch (e) {
            healthData = { _meta: { schemaVersion: STATUS_HEALTH_SCHEMA_VERSION, lastCheck: Date.now() } };
        }
        if (healthData?._meta?.schemaVersion !== STATUS_HEALTH_SCHEMA_VERSION) {
            // Legacy history counted time while the portal was stopped as service downtime.
            healthData = { _meta: { schemaVersion: STATUS_HEALTH_SCHEMA_VERSION, lastCheck: Date.now() } };
            await saveFile(healthPath, healthData);
        }
    };

    let healthSaveTimer = null;
    let healthDirty = false;
    const HEALTH_SAVE_DEBOUNCE_MS = 60_000;

    const flushHealthData = async () => {
        healthDirty = false;
        try {
            await saveFile(healthPath, healthData);
        } catch (e) { }
    };

    const saveHealthData = async ({ force = false } = {}) => {
        if (force) {
            if (healthSaveTimer) {
                clearTimeout(healthSaveTimer);
                healthSaveTimer = null;
            }
            await flushHealthData();
            return;
        }
        healthDirty = true;
        if (healthSaveTimer) return;
        healthSaveTimer = setTimeout(() => {
            healthSaveTimer = null;
            if (healthDirty) void flushHealthData();
        }, HEALTH_SAVE_DEBOUNCE_MS);
        if (typeof healthSaveTimer.unref === 'function') healthSaveTimer.unref();
    };

    const performSingleProbe = createStatusServiceProbe({
        port,
        basePath,
        normalizeExternalBaseUrl,
        resolveServiceUrl,
        probeService,
    });

    const runMonitorCycle = async () => runStatusMonitorCycle({
        statusConfig,
        healthData,
        schemaVersion: STATUS_HEALTH_SCHEMA_VERSION,
        performSingleProbe,
        saveHealthData,
    });

    return {
        getStatusConfig,
        getHealthData,
        saveStatusConfig,
        resetHealthData,
        loadStatusState,
        reconcileStatusConfig,
        runMonitorCycle,
    };
};
