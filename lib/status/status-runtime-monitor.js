export const runStatusMonitorCycle = async ({
    statusConfig,
    healthData,
    schemaVersion,
    performSingleProbe,
    saveHealthData,
}) => {
    if (!statusConfig.services || statusConfig.services.length === 0) return;

    const now = Date.now();
    const todayStr = new Date(now).toISOString().split('T')[0];

    if (!healthData._meta) healthData._meta = {};
    healthData._meta.schemaVersion = schemaVersion;

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
