export const createBackgroundServiceScheduler = ({
    configPath,
    loadFile,
    syncUsers,
    checkAndSendNotifications,
    checkAndRevoke,
    checkAndSendNewsletter,
    checkAndCleanupInactive,
    backgroundExtras,
    tasksInfo,
    markTaskStart,
    markTaskEnd,
    log,
}) => {
    let serviceIntervalId = null;

    const startBackgroundService = async () => {
        if (serviceIntervalId) clearInterval(serviceIntervalId);

        const config = await loadFile(configPath, null);
        if (!config || !config.plexToken || !config.serverIdentifier) {
            log('Plex is not configured. Background service will not start.');
            return;
        }

        const intervalMinutes = config.checkIntervalMinutes || 60;
        const intervalMs = intervalMinutes * 60 * 1000;

        const updateNextRun = (currentConfig) => {
            const nextRun = new Date(Date.now() + intervalMs).toISOString();
            tasksInfo.forEach(t => {
                if (t.id === 'checkAndSendNewsletter') {
                    if (!currentConfig.newsletterFrequency || currentConfig.newsletterFrequency === 'disabled') {
                        t.nextRun = null;
                    } else {
                        const now = new Date();
                        let nextDate = new Date(now);
                        const todayStr = now.toISOString().split('T')[0];

                        if (currentConfig.newsletterFrequency === 'weekly') {
                            const targetDay = Number(currentConfig.newsletterDay);
                            const currentDay = now.getDay();
                            let daysUntil = targetDay - currentDay;
                            if (daysUntil < 0 || (daysUntil === 0 && currentConfig.lastNewsletterSent === todayStr)) {
                                daysUntil += 7;
                            }
                            nextDate.setDate(now.getDate() + daysUntil);
                        } else if (currentConfig.newsletterFrequency === 'monthly') {
                            const targetDay = Number(currentConfig.newsletterDay);
                            const currentDay = now.getDate();
                            if (currentDay > targetDay || (currentDay === targetDay && currentConfig.lastNewsletterSent === todayStr)) {
                                nextDate.setMonth(now.getMonth() + 1);
                            }
                            // Handle end of month edge cases
                            const daysInMonth = new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 0).getDate();
                            nextDate.setDate(Math.min(targetDay, daysInMonth));
                        }
                        t.nextRun = nextDate.toISOString();
                    }
                } else if (t.id === 'checkAndCleanupInactive' && !currentConfig.inactiveCleanupEnabled) {
                    t.nextRun = null;
                } else if (t.id === 'checkAndSendNotifications' && (!currentConfig.smtpHost || !currentConfig.smtpUser || !currentConfig.smtpPass)) {
                    t.nextRun = null;
                } else {
                    t.nextRun = nextRun;
                }
            });
        };

        let batchRunning = false;
        const runBatch = async (currentConfig) => {
            if (batchRunning) {
                log('Skipping scheduled check: a previous run is still in progress.');
                return;
            }
            batchRunning = true;
            try {
                const runManagedTask = async (taskId, runner, logPrefix) => {
                    const task = tasksInfo.find(t => t.id === taskId);
                    if (!task) return;
                    markTaskStart(task);
                    try {
                        await runner();
                        markTaskEnd(task, null);
                    } catch (e) {
                        markTaskEnd(task, e);
                        log(`Error during ${logPrefix}: ${e.message}`);
                    }
                };

                await runManagedTask('syncPlexUsers', () => syncUsers(currentConfig), 'sync');
                await runManagedTask('checkAndSendNotifications', () => checkAndSendNotifications(currentConfig), 'notifications');
                await runManagedTask('checkAndRevoke', () => checkAndRevoke(currentConfig), 'revoke');
                await runManagedTask('checkAndSendNewsletter', () => checkAndSendNewsletter(currentConfig), 'newsletter');
                await runManagedTask('checkAndCleanupInactive', () => checkAndCleanupInactive(currentConfig), 'inactive cleanup');
                if (typeof backgroundExtras?.checkWatchlistAvailability === 'function' && backgroundExtras?.requestAppService) {
                    try {
                        await backgroundExtras.checkWatchlistAvailability(currentConfig, backgroundExtras.requestAppService);
                    } catch (e) {
                        log(`Error during watchlist availability: ${e.message}`);
                    }
                }

                updateNextRun(currentConfig);
            } finally {
                batchRunning = false;
            }
        };

        log(`Service started successfully. Checks will run every ${intervalMinutes} minute(s).`);

        await runBatch(config);

        serviceIntervalId = setInterval(async () => {
            try {
                const currentConfig = await loadFile(configPath, config);
                await runBatch(currentConfig);
            } catch (e) {
                log(`Error during hourly check: ${e.message}`);
            }
        }, intervalMs);
    };

    return { startBackgroundService };
};
