import express from 'express';
import fs from 'fs/promises';
import path from 'path';

import { BACKUP_SCHEMA_VERSION } from './backup.js';

export const registerAdminBackupRoutes = ({
    app,
    requireAdmin,
    configDir,
    configPath,
    usersPath,
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
    getTasksSnapshot,
    listBackupFiles,
    createBackupObject,
    writeBackupToFolder,
    enforceBackupRetention,
    applyBackupPayload,
    backupDir,
    appendAuditLog,
}) => {
    const CONFIG_DIR = configDir;
    const CONFIG_PATH = configPath;
    const USERS_PATH = usersPath;
    const ANALYTICS_CACHE_PATH = analyticsCachePath;
    const TRENDING_CACHE_PATH = trendingCachePath;
    const PLEX_STATS_CACHE_PATH = plexStatsCachePath;
    const MAINTENANCE_MEDIA_INDEX_PATH = maintenanceMediaIndexPath;
    const MAINTENANCE_RULES_PATH = maintenanceRulesPath;
    const MAINTENANCE_RUNS_PATH = maintenanceRunsPath;
    const MAINTENANCE_REQUEST_INDEX_PATH = maintenanceRequestIndexPath;
    const MAINTENANCE_PREFS_PATH = maintenancePrefsPath;
    const BACKUP_DIR = backupDir;

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
                    lidarrConfigured: !!(config.lidarrUrl && config.lidarrApiKey),
                    tautulliConfigured: !!(config.tautulliUrl && config.tautulliApiKey),
                    jellystatConfigured: !!(config.jellystatUrl && config.jellystatApiKey),
                    tmdbConfigured: !!config.tmdbApiKey,
                    tvdbConfigured: !!config.tvdbApiKey,
                    requestAppEnabled: !!(config.requestAppType && config.requestAppType !== 'none'),
                    requestAppConfigured: !!(config.requestAppType && config.requestAppType !== 'none' && config.requestAppUrl && config.requestAppApiKey),
                    ombiConfigured: !!(config.ombiUrl && config.ombiApiKey)
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
            const restoredBackup = await applyBackupPayload(backup);

            await appendAuditLog('backup_restored', req.user, null, {
                schemaVersion: restoredBackup.schemaVersion,
                createdAt: restoredBackup.createdAt || null
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
            const restoredBackup = await applyBackupPayload(backup);
            await appendAuditLog('backup_restored_file', req.user, null, {
                filename,
                schemaVersion: restoredBackup.schemaVersion || null,
                createdAt: restoredBackup.createdAt || null
            });
            res.json({ success: true, message: 'Backup restored from file successfully.' });
        } catch (e) {
            res.status(500).json({ error: `Failed to restore backup file: ${e.message}` });
        }
    });

};
