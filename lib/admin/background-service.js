import { createInactiveCleanupRunner } from './background-service-cleanup.js';
import { createBackgroundServiceScheduler } from './background-service-scheduler.js';

export const createBackgroundService = ({
    configPath,
    usersPath,
    loadFile,
    saveFile,
    fetch,
    getPlexConnectionUri,
    syncUsers,
    checkAndSendNotifications,
    checkAndRevoke,
    checkAndSendNewsletter,
    backgroundExtras = null,
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
    const checkAndCleanupInactive = createInactiveCleanupRunner({
        usersPath,
        loadFile,
        saveFile,
        fetch,
        getPlexConnectionUri,
        appendAuditLog,
        log,
    });

    const runAutoBackupCycle = async (reason = 'auto', { force = false } = {}) => {
        const job = systemJobs.autoBackup;
        markTaskStart(job);
        try {
            const config = await loadFile(configPath, {});
            if (!config.autoBackupEnabled && !force) {
                job.nextRun = null;
                markTaskEnd(job, null);
                return;
            }
            const backup = await createBackupObject('system', reason);
            const result = await writeBackupToFolder(backup);
            config.autoBackupLastRunAt = backup.createdAt;
            await saveFile(configPath, config);
            await enforceBackupRetention(Math.max(1, Number(config.autoBackupRetentionCount) || 10));
            job.nextRun = computeNextBackupRun(config);
            markTaskEnd(job, null);
            await appendAuditLog('backup_auto_created', null, null, { filename: result.filename, reason });
        } catch (e) {
            markTaskEnd(job, e);
            log(`Auto backup failed: ${e.message}`);
        }
    };

    const { startBackgroundService } = createBackgroundServiceScheduler({
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
    });

    return {
        checkAndCleanupInactive,
        runAutoBackupCycle,
        startBackgroundService,
    };
};
