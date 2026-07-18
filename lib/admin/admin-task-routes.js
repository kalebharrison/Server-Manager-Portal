export const registerAdminTaskRoutes = ({
    app,
    requireAdmin,
    adminSensitiveRateLimit = (req, res, next) => next(),
    configPath,
    loadFile,
    getTasksSnapshot,
    findRunnableTask,
    markTaskStart,
    markTaskEnd,
    syncUsers,
    checkAndSendNotifications,
    checkAndRevoke,
    checkAndSendNewsletter,
    checkAndCleanupInactive,
    calculateAnalyticsStats,
    calculateTrendingStats,
    buildPlexStatsCache,
    runAutoBackupCycle,
    log,
}) => {
    const CONFIG_PATH = configPath;

    app.get('/api/tasks', requireAdmin, async (req, res) => {
        const config = await loadFile(CONFIG_PATH, {});
        res.json(getTasksSnapshot(config));
    });

    app.post('/api/tasks/run/:taskId', requireAdmin, adminSensitiveRateLimit, async (req, res) => {
        const { taskId } = req.params;
        const match = findRunnableTask(taskId);
        if (!match) return res.status(404).json({ error: 'Task not found' });

        const { task, kind } = match;

        if (task.running) {
            return res.status(400).json({ error: `Task "${task.name}" is already running.` });
        }

        markTaskStart(task);
        res.json({ message: `Task "${task.name}" started in the background.`, task });

        (async () => {
            try {
                const currentConfig = await loadFile(CONFIG_PATH, {});

                if (kind === 'scheduled') {
                    try {
                        switch (taskId) {
                            case 'syncPlexUsers': await syncUsers(currentConfig); break;
                            case 'checkAndSendNotifications': await checkAndSendNotifications(currentConfig); break;
                            case 'checkAndRevoke': await checkAndRevoke(currentConfig); break;
                            case 'checkAndSendNewsletter': await checkAndSendNewsletter(currentConfig, true); break;
                            case 'checkAndCleanupInactive': await checkAndCleanupInactive(currentConfig); break;
                            default:
                                markTaskEnd(task, new Error('Invalid task'));
                                return;
                        }
                        markTaskEnd(task, null);
                    } catch (e) {
                        markTaskEnd(task, e);
                        log(`[Tasks] Scheduled task "${task.name}" failed: ${e.message}`);
                    }
                } else {
                    switch (taskId) {
                        case 'analyticsCache': await calculateAnalyticsStats(); break;
                        case 'trendingCache': await calculateTrendingStats(); break;
                        case 'plexStats': await buildPlexStatsCache(); break;
                        case 'autoBackup': await runAutoBackupCycle('manual', { force: true }); break;
                    }
                    if (task.running) markTaskEnd(task, null);
                }
            } catch (e) {
                if (task.running) markTaskEnd(task, e);
                log(`[Tasks] Fatal error in background task execution wrapper for "${task.name}": ${e.message}`);
            }
        })();
    });

};
