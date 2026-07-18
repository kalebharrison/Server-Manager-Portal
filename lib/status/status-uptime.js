export const calculateUptime30Days = (healthDataObj) => {
    if (!healthDataObj) return 100;

    let totalUp = 0;
    let totalChecks = 0;
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);

    for (const [key, service] of Object.entries(healthDataObj)) {
        if (key === '_meta' || !service.dailyHistory) continue;

        for (const [dateStr, stat] of Object.entries(service.dailyHistory)) {
            if (new Date(dateStr).getTime() >= thirtyDaysAgo) {
                totalUp += stat.up || 0;
                totalChecks += stat.total || 0;
            }
        }
    }

    if (totalChecks === 0) return 100;
    return (totalUp / totalChecks) * 100;
};
