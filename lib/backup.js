import fs from 'fs/promises';
import path from 'path';

import {
    ANALYTICS_CACHE_PATH,
    AUDIT_LOG_PATH,
    CONFIG_PATH,
    DELETED_USERS_PATH,
    EMAIL_LOG_PATH,
    HEALTH_PATH,
    INVITES_PATH,
    KILL_RULES_PATH,
    MAINTENANCE_MEDIA_INDEX_PATH,
    MAINTENANCE_PREFS_PATH,
    MAINTENANCE_REQUEST_INDEX_PATH,
    MAINTENANCE_RULES_PATH,
    MAINTENANCE_RUNS_PATH,
    PLEX_STATS_CACHE_PATH,
    STATUS_CONFIG_PATH,
    TRENDING_CACHE_PATH,
    USERS_PATH,
} from './data-paths.js';

export const BACKUP_SCHEMA_VERSION = 1;

const BACKUP_TARGETS = [
    { key: 'config', path: CONFIG_PATH },
    { key: 'users', path: USERS_PATH },
    { key: 'invites', path: INVITES_PATH },
    { key: 'deletedUsers', path: DELETED_USERS_PATH },
    { key: 'auditLog', path: AUDIT_LOG_PATH },
    { key: 'emailLog', path: EMAIL_LOG_PATH },
    { key: 'statusConfig', path: STATUS_CONFIG_PATH },
    { key: 'health', path: HEALTH_PATH },
    { key: 'trendingCache', path: TRENDING_CACHE_PATH },
    { key: 'analyticsCache', path: ANALYTICS_CACHE_PATH },
    { key: 'killRules', path: KILL_RULES_PATH },
    { key: 'plexStats', path: PLEX_STATS_CACHE_PATH },
    { key: 'maintenanceRules', path: MAINTENANCE_RULES_PATH },
    { key: 'maintenanceMediaIndex', path: MAINTENANCE_MEDIA_INDEX_PATH },
    { key: 'maintenanceRuns', path: MAINTENANCE_RUNS_PATH },
    { key: 'maintenanceRequestIndex', path: MAINTENANCE_REQUEST_INDEX_PATH },
    { key: 'maintenancePreferences', path: MAINTENANCE_PREFS_PATH },
];

export const createBackupService = ({ loadFile, saveFile, rootDir = process.cwd() }) => {
    const backupDir = path.join(rootDir, 'backup');
    const logoPath = path.join(rootDir, 'static', 'logo.png');

    const readBackupPayload = async () => {
        const payload = {};
        for (const target of BACKUP_TARGETS) {
            payload[target.key] = await loadFile(target.path, null);
        }
        try {
            const logoBuffer = await fs.readFile(logoPath);
            payload.logoPngBase64 = logoBuffer.toString('base64');
        } catch (e) {
            payload.logoPngBase64 = null;
        }
        return payload;
    };

    const ensureBackupDir = async () => {
        await fs.mkdir(backupDir, { recursive: true });
    };

    const createBackupObject = async (createdBy = 'system', reason = 'manual') => ({
        schemaVersion: BACKUP_SCHEMA_VERSION,
        createdAt: new Date().toISOString(),
        createdBy,
        reason,
        data: await readBackupPayload(),
    });

    const getBackupFilename = (backup) => {
        const stamp = (backup.createdAt || new Date().toISOString()).replace(/[:.]/g, '-');
        return `portal-backup-${stamp}.json`;
    };

    const listBackupFiles = async () => {
        await ensureBackupDir();
        const entries = await fs.readdir(backupDir).catch(() => []);
        const jsonFiles = entries.filter(name => name.toLowerCase().endsWith('.json'));
        const backups = await Promise.all(jsonFiles.map(async (filename) => {
            const filePath = path.join(backupDir, filename);
            try {
                const stat = await fs.stat(filePath);
                return {
                    filename,
                    filePath,
                    size: stat.size,
                    createdAt: stat.mtime.toISOString(),
                };
            } catch (e) {
                return null;
            }
        }));
        return backups.filter(Boolean).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    };

    const enforceBackupRetention = async (keepCount) => {
        const backups = await listBackupFiles();
        const toDelete = backups.slice(Math.max(0, keepCount));
        for (const backup of toDelete) {
            await fs.unlink(backup.filePath).catch(() => { });
        }
    };

    const applyBackupPayload = async (backup) => {
        if (!backup || backup.schemaVersion !== BACKUP_SCHEMA_VERSION || !backup.data) {
            throw new Error('Unsupported backup schema.');
        }
        for (const target of BACKUP_TARGETS) {
            if (backup.data[target.key] !== undefined) {
                await saveFile(target.path, backup.data[target.key]);
            }
        }
        if (backup.data.logoPngBase64 && typeof backup.data.logoPngBase64 === 'string') {
            await fs.writeFile(logoPath, Buffer.from(backup.data.logoPngBase64, 'base64'));
        }
    };

    const writeBackupToFolder = async (backup) => {
        await ensureBackupDir();
        const filename = getBackupFilename(backup);
        const filePath = path.join(backupDir, filename);
        await fs.writeFile(filePath, JSON.stringify(backup, null, 2), 'utf8');
        return { filename, filePath };
    };

    return {
        applyBackupPayload,
        createBackupObject,
        enforceBackupRetention,
        listBackupFiles,
        writeBackupToFolder,
        backupDir,
    };
};
