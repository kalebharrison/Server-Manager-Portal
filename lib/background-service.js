export const createBackgroundService = ({
    configPath,
    usersPath,
    maintenanceRulesPath,
    loadFile,
    saveFile,
    fetch,
    getPlexConnectionUri,
    syncUsers,
    checkAndSendNotifications,
    checkAndRevoke,
    checkAndSendNewsletter,
    isMaintenanceExperimentalEnabled,
    executeMaintenanceRunBatch,
    createBackupObject,
    writeBackupToFolder,
    enforceBackupRetention,
    computeNextBackupRun,
    tasksInfo,
    systemJobs,
    markTaskStart,
    markTaskEnd,
    appendAuditLog,
    log,
}) => {
    const CONFIG_PATH = configPath;
    const USERS_PATH = usersPath;
    const MAINTENANCE_RULES_PATH = maintenanceRulesPath;

    let serviceIntervalId = null;

    const checkAndCleanupInactive = async (config) => {
        if (!config.inactiveCleanupEnabled) return;

        const thresholdDays = parseInt(config.inactiveCleanupDays) || 90;
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - thresholdDays);
        const cutoffMs = cutoffDate.getTime();

        log(`Running automated inactive cleanup check (threshold: ${thresholdDays} days)...`);

        let users = await loadFile(USERS_PATH, []);
        let usersUpdated = false;

        const uri = await getPlexConnectionUri(config);
        if (!uri) return;

        for (const user of users) {
            const plexUserId = user.plexId || user.id;
            if (user.isAdmin || user.exemptFromCleanup || !plexUserId) continue;
            // Only consider users with active access; pending/revoked users aren't relevant.
            if (user.plexAccessStatus !== 'active') continue;

            try {
                // Get last session from Plex directly
                const historyRes = await fetch(`${uri}/status/sessions/history/all?X-Plex-Token=${config.plexToken}&accountID=${plexUserId}&sort=viewedAt:desc&limit=1`, { headers: { 'Accept': 'application/json' } }).then(r => r.json()).catch(() => null);

                let lastWatchedMs = 0;
                if (historyRes && historyRes.MediaContainer && historyRes.MediaContainer.Metadata && historyRes.MediaContainer.Metadata.length > 0) {
                    const session = historyRes.MediaContainer.Metadata[0];
                    lastWatchedMs = session.viewedAt * 1000;
                }

                // Only act if we know they have a lastWatched date AND it's older than cutoff
                // (If they've literally never watched anything ever, lastWatchedMs is 0. We'll count that as inactive too if they've been on the server long enough)
                const joinedAtMs = new Date(user.joiningDate || user.linkedAt || user.createdAt || Date.now()).getTime();

                if ((lastWatchedMs > 0 && lastWatchedMs < cutoffMs) || (lastWatchedMs === 0 && joinedAtMs < cutoffMs)) {
                    log(`[INACTIVE CLEANUP] User ${user.email} last watched: ${lastWatchedMs > 0 ? new Date(lastWatchedMs).toISOString() : 'Never'}. Removing access.`);

                    // Set expiry date to now so the main revocation loop catches them
                    user.expiryDate = new Date().toISOString();
                    usersUpdated = true;

                    await appendAuditLog('user_inactive_cleanup', { username: 'System', email: 'system@local' }, user, {
                        reason: `Inactive for > ${thresholdDays} days`,
                        lastWatched: lastWatchedMs > 0 ? new Date(lastWatchedMs).toISOString() : 'Never'
                    });
                }
            } catch (e) {
                log(`Failed to check history for user ${user.email}: ${e.message}`);
            }
        }

        if (usersUpdated) {
            await saveFile(USERS_PATH, users);
        }
    };

    const runAutoBackupCycle = async (reason = 'auto', { force = false } = {}) => {
        const job = systemJobs.autoBackup;
        markTaskStart(job);
        try {
            const config = await loadFile(CONFIG_PATH, {});
            if (!config.autoBackupEnabled && !force) {
                job.nextRun = null;
                markTaskEnd(job, null);
                return;
            }
            const backup = await createBackupObject('system', reason);
            const result = await writeBackupToFolder(backup);
            config.autoBackupLastRunAt = backup.createdAt;
            await saveFile(CONFIG_PATH, config);
            await enforceBackupRetention(Math.max(1, Number(config.autoBackupRetentionCount) || 10));
            job.nextRun = computeNextBackupRun(config);
            markTaskEnd(job, null);
            await appendAuditLog('backup_auto_created', null, null, { filename: result.filename, reason });
        } catch (e) {
            markTaskEnd(job, e);
            log(`Auto backup failed: ${e.message}`);
        }
    };

    const startBackgroundService = async () => {
        if (serviceIntervalId) clearInterval(serviceIntervalId);

        const config = await loadFile(CONFIG_PATH, null);
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
                } else if (t.id === 'maintenanceRuleRun') {
                    t.nextRun = isMaintenanceExperimentalEnabled(currentConfig) ? nextRun : null;
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
                if (isMaintenanceExperimentalEnabled(currentConfig)) {
                    await runManagedTask('maintenanceRuleRun', async () => {
                        const rules = await loadFile(MAINTENANCE_RULES_PATH, []);
                        const hasEnabledRules = Array.isArray(rules) && rules.some(r => r.enabled !== false);
                        if (!hasEnabledRules) return;
                        await executeMaintenanceRunBatch({ actor: { username: 'System', email: 'system@local' }, dryRun: true });
                    }, 'maintenance rules');
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
                const currentConfig = await loadFile(CONFIG_PATH, config);
                await runBatch(currentConfig);
            } catch (e) {
                log(`Error during hourly check: ${e.message}`);
            }
        }, intervalMs);
    };


    return {
        checkAndCleanupInactive,
        runAutoBackupCycle,
        startBackgroundService,
    };
};
