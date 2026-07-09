import express from 'express';
import fs from 'fs/promises';
import path from 'path';

import { BACKUP_SCHEMA_VERSION } from './backup.js';
import { addDays, addMonths, addYears, getDaysUntilExpiry } from './date-utils.js';
import { getDeletedUserKey, isDeletedUser } from './deleted-users.js';

export const registerAdminRoutes = ({
    app,
    requireAdmin,
    requireAuth,
    requireMember,
    configDir,
    configPath,
    usersPath,
    deletedUsersPath,
    auditLogPath,
    emailLogPath,
    analyticsCachePath,
    trendingCachePath,
    plexStatsCachePath,
    maintenanceMediaIndexPath,
    maintenanceRulesPath,
    maintenanceRunsPath,
    maintenanceRequestIndexPath,
    maintenancePrefsPath,
    appVersion,
    loadFile,
    saveFile,
    getTasksSnapshot,
    findRunnableTask,
    markTaskStart,
    markTaskEnd,
    syncUsers,
    checkAndSendNotifications,
    checkAndRevoke,
    checkAndSendNewsletter,
    checkAndCleanupInactive,
    isMaintenanceExperimentalEnabled,
    executeMaintenanceRunBatch,
    calculateAnalyticsStats,
    calculateTrendingStats,
    buildPlexStatsCache,
    runAutoBackupCycle,
    buildMaintenanceMediaIndex,
    applyBackupPayload,
    createBackupObject,
    enforceBackupRetention,
    listBackupFiles,
    writeBackupToFolder,
    backupDir,
    appendAuditLog,
    sendAdjustmentEmail,
    inviteUserToPlex,
    revokePlexAccess,
    rememberDeletedUser,
    resolveCurrentAdmin,
    clearSessionCookie,
    log,
}) => {
    const CONFIG_DIR = configDir;
    const CONFIG_PATH = configPath;
    const USERS_PATH = usersPath;
    const DELETED_USERS_PATH = deletedUsersPath;
    const AUDIT_LOG_PATH = auditLogPath;
    const EMAIL_LOG_PATH = emailLogPath;
    const ANALYTICS_CACHE_PATH = analyticsCachePath;
    const TRENDING_CACHE_PATH = trendingCachePath;
    const PLEX_STATS_CACHE_PATH = plexStatsCachePath;
    const MAINTENANCE_MEDIA_INDEX_PATH = maintenanceMediaIndexPath;
    const MAINTENANCE_RULES_PATH = maintenanceRulesPath;
    const MAINTENANCE_RUNS_PATH = maintenanceRunsPath;
    const MAINTENANCE_REQUEST_INDEX_PATH = maintenanceRequestIndexPath;
    const MAINTENANCE_PREFS_PATH = maintenancePrefsPath;
    const BACKUP_DIR = backupDir;

    // User data endpoints
    app.get('/api/users', requireAdmin, async (req, res) => {
        const users = await loadFile(USERS_PATH, []);
        res.json(users);
    });
    
    app.get('/api/deleted-users', requireAdmin, async (req, res) => {
        const deletedUsers = await loadFile(DELETED_USERS_PATH, []);
        res.json(deletedUsers.map(user => ({ ...user, blockId: getDeletedUserKey(user) })));
    });
    
    app.get('/api/tasks', requireAdmin, async (req, res) => {
        const config = await loadFile(CONFIG_PATH, {});
        res.json(getTasksSnapshot(config));
    });
    
    app.post('/api/tasks/run/:taskId', requireAdmin, async (req, res) => {
        const { taskId } = req.params;
        const match = findRunnableTask(taskId);
        if (!match) return res.status(404).json({ error: 'Task not found' });
    
        const { task, kind } = match;
    
        if (task.running) {
            return res.status(400).json({ error: `Task "${task.name}" is already running.` });
        }
    
        // Respond to the client immediately
        res.json({ message: `Task "${task.name}" started in the background.`, task });
    
        // Execute the task in the background
        (async () => {
            try {
                const currentConfig = await loadFile(CONFIG_PATH, {});
    
                if (kind === 'scheduled') {
                    markTaskStart(task);
                    try {
                        switch (taskId) {
                            case 'syncPlexUsers': await syncUsers(currentConfig); break;
                            case 'checkAndSendNotifications': await checkAndSendNotifications(currentConfig); break;
                            case 'checkAndRevoke': await checkAndRevoke(currentConfig); break;
                            case 'checkAndSendNewsletter': await checkAndSendNewsletter(currentConfig, true); break;
                            case 'checkAndCleanupInactive': await checkAndCleanupInactive(currentConfig); break;
                            case 'maintenanceRuleRun':
                                if (!isMaintenanceExperimentalEnabled(currentConfig)) {
                                    throw new Error('Maintenance module is disabled. Enable it in Settings → System first.');
                                }
                                await executeMaintenanceRunBatch({ actor: req.user, dryRun: true });
                                break;
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
                    // system jobs handle their own markTaskStart / markTaskEnd inside their functions
                    switch (taskId) {
                        case 'analyticsCache': await calculateAnalyticsStats(); break;
                        case 'trendingCache': await calculateTrendingStats(); break;
                        case 'plexStats': await buildPlexStatsCache(); break;
                        case 'autoBackup': await runAutoBackupCycle('manual', { force: true }); break;
                        case 'maintenanceIndex': await buildMaintenanceMediaIndex({ actor: req.user, force: true }); break;
                    }
                }
            } catch (e) {
                log(`[Tasks] Fatal error in background task execution wrapper for "${task.name}": ${e.message}`);
            }
        })();
    });
    
    app.get('/api/admin/diagnostics', requireAdmin, async (req, res) => {
        try {
            const config = await loadFile(CONFIG_PATH, {});
            const now = Date.now();
            const statFile = async (filePath) => {
                try {
                    const stat = await fs.stat(filePath);
                    return { exists: true, size: stat.size, modifiedAt: stat.mtime.toISOString() };
                } catch (e) {
                    return { exists: false, size: 0, modifiedAt: null };
                }
            };
    
            const [analyticsFile, trendingFile, plexStatsFile, maintenanceIndexFile, maintenanceRulesFile, maintenanceRunsFile, requestIndexFile, maintenancePrefsFile, usersFile, configFile, backups] = await Promise.all([
                statFile(ANALYTICS_CACHE_PATH),
                statFile(TRENDING_CACHE_PATH),
                statFile(PLEX_STATS_CACHE_PATH),
                statFile(MAINTENANCE_MEDIA_INDEX_PATH),
                statFile(MAINTENANCE_RULES_PATH),
                statFile(MAINTENANCE_RUNS_PATH),
                statFile(MAINTENANCE_REQUEST_INDEX_PATH),
                statFile(MAINTENANCE_PREFS_PATH),
                statFile(USERS_PATH),
                statFile(CONFIG_PATH),
                listBackupFiles().catch(() => [])
            ]);
    
            res.json({
                app: {
                    version: appVersion,
                    uptimeSeconds: Math.floor(process.uptime()),
                    nodeVersion: process.version,
                    memoryRssMB: Math.round(process.memoryUsage().rss / (1024 * 1024)),
                    configDataDir: CONFIG_DIR
                },
                integrations: {
                    mediaServerType: config.mediaServerType || 'plex',
                    plexConfigured: !!(config.plexToken && config.serverIdentifier),
                    jellyfinConfigured: !!(config.jellyfinUrl && config.jellyfinApiKey),
                    smtpConfigured: !!(config.smtpHost && config.smtpUser && config.smtpPass),
                    sonarrConfigured: !!(config.sonarrUrl && config.sonarrApiKey),
                    radarrConfigured: !!(config.radarrUrl && config.radarrApiKey),
                    tautulliConfigured: !!(config.tautulliUrl && config.tautulliApiKey),
                    jellystatConfigured: !!(config.jellystatUrl && config.jellystatApiKey),
                    requestAppEnabled: !!(config.requestAppType && config.requestAppType !== 'none'),
                    requestAppConfigured: !!(config.requestAppType && config.requestAppType !== 'none' && config.requestAppUrl && config.requestAppApiKey)
                },
                caches: {
                    analytics: analyticsFile,
                    trending: trendingFile,
                    plexStats: plexStatsFile,
                    maintenanceIndex: maintenanceIndexFile,
                    maintenanceRules: maintenanceRulesFile,
                    maintenanceRuns: maintenanceRunsFile,
                    maintenanceRequestIndex: requestIndexFile,
                    maintenancePreferences: maintenancePrefsFile
                },
                files: {
                    users: usersFile,
                    config: configFile
                },
                backup: {
                    enabled: !!config.autoBackupEnabled,
                    intervalDays: Math.max(1, Number(config.autoBackupIntervalDays) || 2),
                    retentionCount: Math.max(1, Number(config.autoBackupRetentionCount) || 10),
                    lastRunAt: config.autoBackupLastRunAt || null,
                    availableBackups: backups.length
                },
                jobs: getTasksSnapshot(config),
                checkedAt: new Date(now).toISOString()
            });
        } catch (e) {
            res.status(500).json({ error: `Failed to load diagnostics: ${e.message}` });
        }
    });
    
    app.get('/api/admin/backup', requireAdmin, async (req, res) => {
        try {
            const backup = await createBackupObject(req.user?.username || req.user?.email || 'admin', 'manual-download');
            await appendAuditLog('backup_exported', req.user, null, { schemaVersion: BACKUP_SCHEMA_VERSION });
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename=\"portal-backup-${Date.now()}.json\"`);
            res.send(JSON.stringify(backup, null, 2));
        } catch (e) {
            res.status(500).json({ error: `Failed to create backup: ${e.message}` });
        }
    });
    
    app.get('/api/admin/backups', requireAdmin, async (req, res) => {
        try {
            const backups = await listBackupFiles();
            res.json(backups.map(({ filename, size, createdAt }) => ({ filename, size, createdAt })));
        } catch (e) {
            res.status(500).json({ error: `Failed to list backups: ${e.message}` });
        }
    });
    
    app.post('/api/admin/backups/create', requireAdmin, async (req, res) => {
        try {
            const backup = await createBackupObject(req.user?.username || req.user?.email || 'admin', 'manual-create');
            const result = await writeBackupToFolder(backup);
            const config = await loadFile(CONFIG_PATH, {});
            await enforceBackupRetention(Math.max(1, Number(config.autoBackupRetentionCount) || 10));
            await appendAuditLog('backup_created', req.user, null, { filename: result.filename });
            res.json({ success: true, filename: result.filename });
        } catch (e) {
            res.status(500).json({ error: `Failed to create backup file: ${e.message}` });
        }
    });
    
    app.post('/api/admin/backup/restore', requireAdmin, express.text({ type: '*/*', limit: '25mb' }), async (req, res) => {
        try {
            const rawBody = typeof req.body === 'string' ? req.body : '';
            if (!rawBody) return res.status(400).json({ error: 'Missing backup payload.' });
    
            let backup;
            try {
                backup = JSON.parse(rawBody);
            } catch (e) {
                return res.status(400).json({ error: 'Backup payload is not valid JSON.' });
            }
    
            const confirmRestore = req.query.confirm === 'true' || req.headers['x-confirm-restore'] === 'true';
            if (!confirmRestore) {
                return res.status(400).json({ error: 'Restore requires explicit confirmation.' });
            }
            await applyBackupPayload(backup);
    
            await appendAuditLog('backup_restored', req.user, null, {
                schemaVersion: backup.schemaVersion,
                createdAt: backup.createdAt || null
            });
            res.json({ success: true, message: 'Backup restored successfully.' });
        } catch (e) {
            res.status(500).json({ error: `Failed to restore backup: ${e.message}` });
        }
    });
    
    app.post('/api/admin/backups/restore-file', requireAdmin, async (req, res) => {
        try {
            const { filename, confirm } = req.body || {};
            if (!confirm) return res.status(400).json({ error: 'Restore requires explicit confirmation.' });
            if (!filename || typeof filename !== 'string') return res.status(400).json({ error: 'Backup filename is required.' });
            if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
                return res.status(400).json({ error: 'Invalid backup filename.' });
            }
            const filePath = path.join(BACKUP_DIR, filename);
            const raw = await fs.readFile(filePath, 'utf8');
            const backup = JSON.parse(raw);
            await applyBackupPayload(backup);
            await appendAuditLog('backup_restored_file', req.user, null, {
                filename,
                schemaVersion: backup.schemaVersion || null,
                createdAt: backup.createdAt || null
            });
            res.json({ success: true, message: 'Backup restored from file successfully.' });
        } catch (e) {
            res.status(500).json({ error: `Failed to restore backup file: ${e.message}` });
        }
    });
    
    app.delete('/api/deleted-users/:blockId', requireAdmin, async (req, res) => {
        const { blockId } = req.params;
        const deletedUsers = await loadFile(DELETED_USERS_PATH, []);
        const deletedUser = deletedUsers.find(user => getDeletedUserKey(user) === blockId);
        if (!deletedUser) return res.status(404).json({ error: 'Deleted user record not found.' });
    
        await saveFile(DELETED_USERS_PATH, deletedUsers.filter(user => getDeletedUserKey(user) !== blockId));
        await appendAuditLog('deleted_user_unblocked', req.user, deletedUser);
        res.status(204).send();
    });
    
    app.get('/api/audit-log', requireAdmin, async (req, res) => {
        const auditLog = await loadFile(AUDIT_LOG_PATH, []);
        res.json(auditLog.slice(0, 200));
    });
    
    app.put('/api/users/:id', requireAdmin, async (req, res) => {
        const { id } = req.params;
        const { expiryDate, exemptFromCleanup, optOutNewsletter } = req.body;
        let users = await loadFile(USERS_PATH, []);
        const userIndex = users.findIndex(u => u.id === id);
        if (userIndex === -1) return res.status(404).json({ error: 'User not found.' });
    
        const previousExpiryDate = users[userIndex].expiryDate;
    
        if (expiryDate !== undefined) {
            users[userIndex].expiryDate = expiryDate;
        }
        if (exemptFromCleanup !== undefined) {
            users[userIndex].exemptFromCleanup = !!exemptFromCleanup;
        }
        if (optOutNewsletter !== undefined) {
            users[userIndex].optOutNewsletter = !!optOutNewsletter;
        }
    
        await saveFile(USERS_PATH, users);
    
        if (expiryDate !== undefined && expiryDate !== previousExpiryDate) {
            await appendAuditLog('user_expiry_updated', req.user, users[userIndex], { previousExpiryDate, expiryDate });
            // Send adjustment email
            const config = await loadFile(CONFIG_PATH, {});
            const logoPath = path.join(process.cwd(), 'static', 'logo.png');
            let hasLogo = false;
            try { await fs.access(logoPath); hasLogo = true; } catch (e) { }
            await sendAdjustmentEmail(config, users[userIndex], hasLogo);
    
            // Auto re-invite if revoked and new date is in the future
            if (users[userIndex].plexAccessStatus === 'revoked') {
                const days = getDaysUntilExpiry(users[userIndex].expiryDate);
                if (days === null || days >= 0) {
                    const invited = await inviteUserToPlex(users[userIndex], config, config.defaultLibraryIds);
                    if (invited) {
                        users[userIndex].plexAccessStatus = 'pending';
                        await saveFile(USERS_PATH, users);
                        await appendAuditLog('relink_invite_sent', req.user, users[userIndex]);
                    }
                }
            }
        }
    
        res.json(users[userIndex]);
    });
    
    const applyBulkAction = (user, action, customDate) => {
        const baseDate = user.expiryDate ? new Date(user.expiryDate) : new Date();
    
        switch (action) {
            case 'addMonth':
                user.expiryDate = addMonths(baseDate, 1).toISOString();
                break;
            case 'addYear':
                user.expiryDate = addYears(baseDate, 1).toISOString();
                break;
            case 'unlimited':
                user.expiryDate = null;
                break;
            case 'custom':
                user.expiryDate = customDate ? new Date(customDate).toISOString() : null;
                break;
        }
    };
    
    app.post('/api/users/bulk-update', requireAdmin, async (req, res) => {
        const { userIds, action, customDate } = req.body;
        if (!Array.isArray(userIds) || userIds.length === 0 || !['addMonth', 'addYear', 'unlimited', 'custom'].includes(action)) {
            return res.status(400).json({ error: 'Invalid request body.' });
        }
        if (action === 'custom' && !customDate) {
            return res.status(400).json({ error: 'customDate is required for custom action.' });
        }
    
        try {
            let users = await loadFile(USERS_PATH, []);
            let updatedCount = 0;
            const config = await loadFile(CONFIG_PATH, {});
            const logoPath = path.join(process.cwd(), 'static', 'logo.png');
            let hasLogo = false;
            try { await fs.access(logoPath); hasLogo = true; } catch (e) { }
    
            for (const user of users) {
                if (userIds.includes(user.id)) {
                    applyBulkAction(user, action, customDate);
                    updatedCount++;
                    await appendAuditLog('user_bulk_updated', req.user, user, { action, customDate: customDate || null });
                    await sendAdjustmentEmail(config, user, hasLogo);
    
                    // Auto re-invite if revoked and new date is in the future
                    if (user.plexAccessStatus === 'revoked') {
                        const days = getDaysUntilExpiry(user.expiryDate);
                        if (days === null || days >= 0) {
                            const invited = await inviteUserToPlex(user, config, config.defaultLibraryIds);
                            if (invited) {
                                user.plexAccessStatus = 'pending';
                                await appendAuditLog('relink_invite_sent', req.user, user);
                            }
                        }
                    }
                }
            }
    
            await saveFile(USERS_PATH, users);
            log(`Bulk updated ${updatedCount} users with action: ${action}`);
            res.json({ message: `Successfully updated ${updatedCount} users.` });
        } catch (error) {
            res.status(500).json({ error: 'Failed to process bulk update.' });
        }
    });
    
    app.delete('/api/users/:id', requireAdmin, async (req, res) => {
        const { id } = req.params;
        const config = await loadFile(CONFIG_PATH, null);
        let users = await loadFile(USERS_PATH, []);
        const user = users.find(u => u.id === id);
        if (!user) return res.status(404).json({ error: 'User not found.' });
    
        if (config && config.serverIdentifier && config.plexToken) {
            const revoked = await revokePlexAccess(user, config);
            if (!revoked) {
                return res.status(500).json({ error: 'Failed to revoke Plex access before deleting user.' });
            }
        }
    
        await rememberDeletedUser(user, req.user);
        await saveFile(USERS_PATH, users.filter(u => u.id !== id));
        await appendAuditLog('user_deleted_blocked', req.user, user, { plexAccessRevoked: !!(config && config.serverIdentifier && config.plexToken) });
        res.status(204).send();
    });
    
    app.post('/api/users/:id/revoke', requireAdmin, async (req, res) => {
        const { id } = req.params;
        const config = await loadFile(CONFIG_PATH, null);
        if (!config) return res.status(400).json({ error: 'App not configured.' });
        let users = await loadFile(USERS_PATH, []);
        const user = users.find(u => u.id === id);
        if (!user) return res.status(404).json({ error: 'User not found.' });
    
        const revoked = await revokePlexAccess(user, config);
        if (revoked) {
            user.plexAccessStatus = 'revoked';
            await saveFile(USERS_PATH, users);
            await appendAuditLog('plex_access_revoked', req.user, user);
            res.json(user);
        } else {
            res.status(500).json({ error: 'Failed to revoke access via Plex API.' });
        }
    });
    
    app.post('/api/users/request-invite', requireAuth, async (req, res) => {
        const config = await loadFile(CONFIG_PATH, null);
        if (!config || !config.serverIdentifier) return res.status(400).json({ error: 'App not configured.' });
        req.user.isAdmin = await resolveCurrentAdmin(req.user, config);
    
        if (!config.allowTemporaryAccess) {
            return res.status(403).json({ error: 'New registrations are currently disabled.' });
        }
    
        let users = await loadFile(USERS_PATH, []);
        const existingUser = users.find(u => u.email === req.user.email || u.username === req.user.username);
        const deletedUsers = await loadFile(DELETED_USERS_PATH, []);
    
        if (existingUser) {
            await appendAuditLog('trial_request_blocked_existing_user', req.user, existingUser);
            return res.status(400).json({ error: 'You are already registered.' });
        }
        if (!req.user.isAdmin && isDeletedUser(deletedUsers, req.user)) {
            await appendAuditLog('trial_request_blocked_deleted_user', req.user, req.user);
            clearSessionCookie(req, res);
            return res.status(403).json({ error: 'Your portal session has expired. Please contact the admin for access.' });
        }
    
        const expiryDate = addDays(new Date(), 3);
    
        const newUser = {
            id: req.user.plexId.toString(),
            username: req.user.username,
            email: req.user.email,
            joiningDate: new Date().toISOString(),
            expiryDate: expiryDate.toISOString(),
            plexAccessStatus: 'pending',
            isTrial: true
        };
    
        try {
            const staleAccessRevoked = await revokePlexAccess(newUser, config);
            if (!staleAccessRevoked) {
                await appendAuditLog('trial_request_failed_stale_access', req.user, newUser);
                return res.status(500).json({ error: 'Failed to clear existing Plex access before sending invite.' });
            }
    
            log(`Inviting new user ${newUser.username} to server...`);
            await inviteUserToPlex(newUser, config, config.defaultLibraryIds).catch(e => log('Failed to invite trial user: ' + e.message));
    
            users.push(newUser);
            await saveFile(USERS_PATH, users);
            await appendAuditLog('trial_invite_sent', req.user, newUser, { expiryDate: newUser.expiryDate });
    
            // Optional: send welcome email here
    
            res.json({ message: 'Invite sent successfully', user: newUser });
        } catch (e) {
            log('Error requesting invite: ' + e.message);
            res.status(500).json({ error: 'Failed to request invite.' });
        }
    });
    
    app.post('/api/users/relink', requireAuth, requireMember, async (req, res) => {
        const config = await loadFile(CONFIG_PATH, null);
        if (!config || !config.serverIdentifier) return res.status(400).json({ error: 'App not configured.' });
    
        let users = await loadFile(USERS_PATH, []);
        const user = users.find(u => u.email === req.user.email || u.username === req.user.username);
        const deletedUsers = await loadFile(DELETED_USERS_PATH, []);
    
        if (!user && !req.user.isAdmin && isDeletedUser(deletedUsers, req.user)) {
            await appendAuditLog('relink_blocked_deleted_user', req.user, req.user);
            clearSessionCookie(req, res);
            return res.status(403).json({ error: 'Your portal session has expired. Please contact the admin for access.' });
        }
        if (!user) {
            await appendAuditLog('relink_failed_user_not_found', req.user, req.user);
            return res.status(404).json({ error: 'User not found.' });
        }
    
        const days = getDaysUntilExpiry(user.expiryDate);
        if (days === null || days < 0) {
            await appendAuditLog('relink_blocked_expired', req.user, user, { days });
            return res.status(400).json({ error: 'Your access has expired.' });
        }
    
        try {
            log(`Re-linking user ${user.username}...`);
            await inviteUserToPlex(user, config, config.defaultLibraryIds).catch(e => log('Failed to re-link user: ' + e.message));
    
            user.plexAccessStatus = 'pending';
            await saveFile(USERS_PATH, users);
            await appendAuditLog('relink_invite_sent', req.user, user);
    
            res.json({ message: 'Account re-linked successfully.', user });
        } catch (e) {
            log('Error re-linking account: ' + e.message);
            res.status(500).json({ error: 'Failed to re-link account.' });
        }
    });
};
