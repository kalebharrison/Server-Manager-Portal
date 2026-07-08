const INTEGRATION_LABELS: Record<string, string> = {
    jellyfinConfigured: 'Jellyfin',
    plexConfigured: 'Plex',
    sonarrConfigured: 'Sonarr',
    radarrConfigured: 'Radarr',
    tautulliConfigured: 'Tautulli',
    jellystatConfigured: 'Jellystat',
    requestAppConfigured: 'Request App',
};

const trackedIntegrationKeys = (mediaServerType: string) => {
    const mediaKey = mediaServerType === 'jellyfin' ? 'jellyfinConfigured' : 'plexConfigured';
    const analyticsKey = mediaServerType === 'jellyfin' ? 'jellystatConfigured' : 'tautulliConfigured';
    return [mediaKey, 'sonarrConfigured', 'radarrConfigured', analyticsKey, 'requestAppConfigured'];
};

export const calculateSystemHealth = ({
    diagnostics,
    maintenanceExperimentalEnabled,
    mediaServerType,
}: {
    diagnostics: any;
    maintenanceExperimentalEnabled: boolean;
    mediaServerType: string;
}) => {
    if (!diagnostics) {
        return {
            score: 0,
            status: 'Unknown',
            alerts: ['Diagnostics have not been loaded yet.'],
            integrationsConfigured: 0,
            integrationsTotal: 0,
            cacheHealthy: 0,
            cacheTotal: 0,
            runningJobs: 0,
            failingJobs: 0
        };
    }

    const integrations = diagnostics.integrations || {};
    const trackedIntegrations = trackedIntegrationKeys(mediaServerType)
        .filter((key) => key !== 'requestAppConfigured' || integrations.requestAppEnabled)
        .map((key) => [key, !!integrations[key]] as const);
    const cacheEntries = Object.entries(diagnostics.caches || {}).filter(([key]) => {
        if (!maintenanceExperimentalEnabled && key.startsWith('maintenance')) return false;
        if (mediaServerType === 'jellyfin' && key === 'plexStats') return false;
        return true;
    });
    const cacheValues = cacheEntries.map(([, entry]: any) => !!entry?.exists);
    const jobs = Array.isArray(diagnostics.jobs) ? diagnostics.jobs : [];
    const integrationsConfigured = trackedIntegrations.filter(([, configured]) => configured).length;
    const integrationsTotal = trackedIntegrations.length;
    const cacheHealthy = cacheValues.filter(Boolean).length;
    const cacheTotal = cacheValues.length;
    const runningJobs = jobs.filter((job: any) => !!job.running).length;
    const failingJobs = jobs.filter((job: any) => !!job.lastError).length;
    const alerts: string[] = [];

    if (integrationsConfigured < integrationsTotal) {
        const missingNames = trackedIntegrations
            .filter(([, configured]) => !configured)
            .map(([key]) => INTEGRATION_LABELS[key]);
        alerts.push(`${missingNames.join(', ')} not configured.`);
    }
    if (cacheHealthy < cacheTotal) {
        alerts.push(`${cacheTotal - cacheHealthy} cache file(s) are missing.`);
    }
    if (failingJobs > 0) {
        alerts.push(`${failingJobs} background job(s) reported recent errors.`);
    }
    if (diagnostics?.backup?.enabled && !diagnostics?.backup?.lastRunAt) {
        alerts.push('Auto backup is enabled but has not completed a run yet.');
    }

    const maxPenalty = 55;
    const integrationPenalty = integrationsTotal > 0 ? Math.round(((integrationsTotal - integrationsConfigured) / integrationsTotal) * 25) : 0;
    const cachePenalty = cacheTotal > 0 ? Math.round(((cacheTotal - cacheHealthy) / cacheTotal) * 20) : 0;
    const jobPenalty = Math.min(10, failingJobs * 5);
    const penalty = Math.min(maxPenalty, integrationPenalty + cachePenalty + jobPenalty);
    const score = Math.max(0, 100 - penalty);
    const status = score >= 85 ? 'Healthy' : score >= 65 ? 'Watch' : 'Needs Attention';

    return {
        score,
        status,
        alerts,
        integrationsConfigured,
        integrationsTotal,
        cacheHealthy,
        cacheTotal,
        runningJobs,
        failingJobs
    };
};
