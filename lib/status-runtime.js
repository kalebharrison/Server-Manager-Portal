import fs from 'fs/promises';
import http from 'http';
import https from 'https';
import { createDefaultStatusConfig, reconcileBuiltInStatusConfig } from './status-monitor.js';

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
        healthData = {};
        await saveHealthData();
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
            const appConfig = await loadFile(configPath, {});
            const reconciled = reconcileBuiltInStatusConfig(statusConfig, appConfig);
            if (JSON.stringify(reconciled) !== JSON.stringify(statusConfig)) {
                statusConfig = reconciled;
                await saveFile(statusConfigPath, statusConfig);
            }
        }

        try {
            const healthRaw = await fs.readFile(healthPath, 'utf-8');
            healthData = JSON.parse(healthRaw);
        } catch (e) {
            healthData = {};
        }
    };

    const saveHealthData = async () => {
        try {
            await saveFile(healthPath, healthData);
        } catch (e) { }
    };

    const performSingleProbe = async (service) => {
        let resolvedUrl = '';
        if (resolveServiceUrl) {
            try {
                resolvedUrl = await resolveServiceUrl(service);
            } catch { /* fall back to the configured URL */ }
        }
        return new Promise((resolve) => {
            const rawUrl = service.id === 'portal'
                ? `http://127.0.0.1:${port}${basePath}/api/health`
                : (resolvedUrl || service.url);
            if (!rawUrl) return resolve({ status: 'offline', latency: 0, httpCode: 0 });

            let targetUrl = rawUrl;
            try {
                targetUrl = normalizeExternalBaseUrl(rawUrl, { allowPrivate: true, allowHttp: true });
            } catch (e) {
                return resolve({ status: 'offline', latency: 0, httpCode: 0 });
            }
            if (service.port) {
                try {
                    const u = new URL(targetUrl);
                    u.port = service.port;
                    targetUrl = u.toString();
                } catch (e) { }
            }

            let parsedUrl;
            try {
                parsedUrl = new URL(targetUrl);
            } catch (e) {
                return resolve({ status: 'offline', latency: 0, httpCode: 0 });
            }

            const lib = parsedUrl.protocol === 'https:' ? https : http;
            const start = Date.now();

            const request = lib.get(targetUrl, {
                headers: { 'User-Agent': 'SubZero-Monitor/1.0', 'Cache-Control': 'no-cache', 'Connection': 'close' },
                timeout: 8000,
                rejectUnauthorized: true
            }, (response) => {
                response.resume();
                const latency = Math.round(Date.now() - start);
                const code = response.statusCode || 0;
                let status = (code >= 200 && code < 400) || code === 401 || code === 403 ? 'online' : (code >= 500 ? 'degraded' : 'offline');
                resolve({ status, latency, httpCode: code });
            });

            request.on('error', () => resolve({ status: 'offline', latency: 0, httpCode: 0 }));
            request.on('timeout', () => { request.destroy(); resolve({ status: 'offline', latency: 0, httpCode: 408 }); });
        });
    };

    const runMonitorCycle = async () => {
        if (!statusConfig.services || statusConfig.services.length === 0) return;

        const now = Date.now();
        const todayStr = new Date(now).toISOString().split('T')[0];

        if (!healthData._meta) {
            healthData._meta = { lastCheck: now };
        }

        const gapMs = now - healthData._meta.lastCheck;
        const cycleMs = 15000;

        if (gapMs > 120000) {
            const missedChecks = Math.floor(gapMs / cycleMs);

            for (const service of statusConfig.services) {
                if (!healthData[service.id]) {
                    healthData[service.id] = { serviceId: service.id, currentStatus: 'unknown', lastCheck: 0, dailyHistory: {}, uptimePercentage: 100 };
                }
                const record = healthData[service.id];
                if (!record.dailyHistory) record.dailyHistory = {};
                if (!record.dailyHistory[todayStr]) record.dailyHistory[todayStr] = { up: 0, down: 0, total: 0 };

                record.dailyHistory[todayStr].down += missedChecks;
                record.dailyHistory[todayStr].total += missedChecks;
            }
        }

        const probeResults = await Promise.all(statusConfig.services.map(async (service) => ({
            service,
            result: await performSingleProbe(service),
        })));
        for (const { service, result } of probeResults) {
            if (!healthData[service.id]) {
                healthData[service.id] = { serviceId: service.id, currentStatus: 'unknown', lastCheck: 0, dailyHistory: {}, uptimePercentage: 100 };
            }
            const record = healthData[service.id];
            if (!record.dailyHistory) record.dailyHistory = {};
            if (!record.dailyHistory[todayStr]) record.dailyHistory[todayStr] = { up: 0, down: 0, total: 0 };

            record.currentStatus = result.status;
            record.lastCheck = now;
            record.latency = result.latency;
            record.httpCode = result.httpCode;

            if (result.status === 'online') {
                record.dailyHistory[todayStr].up += 1;
            } else {
                record.dailyHistory[todayStr].down += 1;
            }
            record.dailyHistory[todayStr].total += 1;

            const ninetyDaysAgo = now - (90 * 24 * 60 * 60 * 1000);
            for (const dateStr of Object.keys(record.dailyHistory)) {
                if (new Date(dateStr).getTime() < ninetyDaysAgo) {
                    delete record.dailyHistory[dateStr];
                }
            }

            let totalUp = 0;
            let totalChecks = 0;
            for (const stat of Object.values(record.dailyHistory)) {
                totalUp += stat.up;
                totalChecks += stat.total;
            }
            record.uptimePercentage = totalChecks > 0 ? Math.round((totalUp / totalChecks) * 100) : 100;
        }

        healthData._meta.lastCheck = now;
        await saveHealthData();
    };

    return {
        getStatusConfig,
        getHealthData,
        saveStatusConfig,
        resetHealthData,
        loadStatusState,
        runMonitorCycle,
    };
};
