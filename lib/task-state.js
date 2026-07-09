export const tasksInfo = [
    { id: 'syncPlexUsers', name: 'Sync Plex Users', description: 'Fetches latest user data from Plex.', lastRun: null, nextRun: null, running: false, lastDurationMs: null, lastError: null },
    { id: 'checkAndSendNotifications', name: 'Expiry Notifications', description: 'Sends warning emails to users nearing expiry.', lastRun: null, nextRun: null, running: false, lastDurationMs: null, lastError: null },
    { id: 'checkAndRevoke', name: 'Revoke Access', description: 'Removes Plex access for expired users.', lastRun: null, nextRun: null, running: false, lastDurationMs: null, lastError: null },
    { id: 'checkAndSendNewsletter', name: 'Send Newsletter', description: 'Generates and sends automated newsletters.', lastRun: null, nextRun: null, running: false, lastDurationMs: null, lastError: null },
    { id: 'checkAndCleanupInactive', name: 'Inactive Cleanup', description: 'Revokes access for users who have not watched anything recently.', lastRun: null, nextRun: null, running: false, lastDurationMs: null, lastError: null },
    { id: 'maintenanceRuleRun', name: 'Maintenance Rule Run', description: 'Evaluates maintenance rules and executes eligible actions.', lastRun: null, nextRun: null, running: false, lastDurationMs: null, lastError: null }
];

export const systemJobs = {
    analyticsCache: { id: 'analyticsCache', name: 'Analytics Cache Builder', description: 'Rebuilds server analytics cache snapshots every 30 minutes.', lastRun: null, nextRun: null, running: false, lastDurationMs: null, lastError: null },
    trendingCache: { id: 'trendingCache', name: 'Trending Cache Builder', description: 'Rebuilds trending and leaderboard data every 12 hours.', lastRun: null, nextRun: null, running: false, lastDurationMs: null, lastError: null },
    plexStats: { id: 'plexStats', name: 'Plex Stats Builder', description: 'Rebuilds cached library size and usage totals every 24 hours.', lastRun: null, nextRun: null, running: false, lastDurationMs: null, lastError: null },
    autoBackup: { id: 'autoBackup', name: 'Auto Rolling Backup', description: 'Creates rolling backup snapshots on configured interval.', lastRun: null, nextRun: null, running: false, lastDurationMs: null, lastError: null },
    maintenanceIndex: { id: 'maintenanceIndex', name: 'Maintenance Media Index', description: 'Builds per-item media and request index for cleanup rules.', lastRun: null, nextRun: null, running: false, lastDurationMs: null, lastError: null }
};

export const markTaskStart = (task) => {
    task.running = true;
    task.lastError = null;
    task._startedAt = Date.now();
    task.lastRun = new Date(task._startedAt).toISOString();
};

export const markTaskEnd = (task, error = null) => {
    task.running = false;
    if (task._startedAt) {
        task.lastDurationMs = Date.now() - task._startedAt;
        delete task._startedAt;
    }
    task.lastError = error ? (error.message || String(error)) : null;
};

export const computeNextBackupRun = (config) => {
    const days = Math.max(1, Number(config?.autoBackupIntervalDays) || 2);
    const intervalMs = days * 24 * 60 * 60 * 1000;
    const last = config?.autoBackupLastRunAt ? Date.parse(config.autoBackupLastRunAt) : null;
    const base = Number.isFinite(last) ? last : Date.now();
    return new Date(base + intervalMs).toISOString();
};

const decorateTaskForConfig = (task, config = {}) => {
    const mediaServerType = String(config.mediaServerType || 'plex').toLowerCase();
    const next = { ...task };
    if (next.id === 'syncPlexUsers') {
        if (mediaServerType === 'jellyfin') {
            next.name = 'Sync Jellyfin Users';
            next.description = 'Fetches latest user data and profile images from Jellyfin.';
        } else {
            next.name = 'Sync Plex Users';
            next.description = 'Fetches latest user data from Plex.';
        }
    }
    if (next.id === 'checkAndRevoke') {
        next.description = mediaServerType === 'jellyfin'
            ? 'Revokes expired portal access for Jellyfin users.'
            : 'Removes Plex access for expired users.';
    }
    if (next.id === 'checkAndCleanupInactive') {
        next.description = mediaServerType === 'jellyfin'
            ? 'Revokes portal access for Jellyfin users who have not watched anything recently.'
            : 'Revokes access for users who have not watched anything recently.';
    }
    return next;
};

export const getTasksSnapshot = (config = {}) => {
    const mediaServerType = String(config.mediaServerType || 'plex').toLowerCase();
    const systemJobList = Object.values(systemJobs)
        .filter(job => !(mediaServerType === 'jellyfin' && job.id === 'plexStats'));
    return [
        ...tasksInfo.map(task => decorateTaskForConfig(task, config)),
        ...systemJobList.map(job => ({ ...job }))
    ];
};

export const findRunnableTask = (taskId) => {
    const scheduled = tasksInfo.find(t => t.id === taskId);
    if (scheduled) return { task: scheduled, kind: 'scheduled' };
    const systemJob = systemJobs[taskId] || Object.values(systemJobs).find(j => j.id === taskId);
    if (systemJob) return { task: systemJob, kind: 'system' };
    return null;
};
