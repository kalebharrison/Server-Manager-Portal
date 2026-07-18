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
    PLEX_STATS_CACHE_PATH,
    STATUS_CONFIG_PATH,
    TRENDING_CACHE_PATH,
    USERS_PATH,
} from '../config/data-paths.js';

export const BACKUP_SCHEMA_VERSION = 2;
const SUPPORTED_BACKUP_SCHEMA_VERSIONS = new Set([1, BACKUP_SCHEMA_VERSION]);

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
];

export const createBackupService = ({
    loadFile,
    saveFile,
    sealBackup = (backup) => backup,
    openBackup = (backup) => backup,
    rootDir = process.cwd(),
}) => {
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
        await fs.mkdir(backupDir, { recursive: true, mode: 0o700 });
        await fs.chmod(backupDir, 0o700).catch((error) => {
            if (!['EPERM', 'EACCES'].includes(error.code)) throw error;
        });
    };

    const createBackupObject = async (createdBy = 'system', reason = 'manual') => sealBackup({
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

    const secureStoredBackups = async () => {
        await ensureBackupDir();
        const backups = await listBackupFiles();
        let migrated = 0;
        for (const backupFile of backups) {
            const raw = await fs.readFile(backupFile.filePath, 'utf8');
            const backup = JSON.parse(raw);
            if (!backup?.encrypted) {
                const sealed = sealBackup(backup);
                await fs.writeFile(backupFile.filePath, JSON.stringify(sealed, null, 2), { encoding: 'utf8', mode: 0o600 });
                migrated++;
            }
            await fs.chmod(backupFile.filePath, 0o600).catch((error) => {
                if (!['EPERM', 'EACCES'].includes(error.code)) throw error;
            });
        }
        return migrated;
    };

    const applyBackupPayload = async (backup) => {
        const openedBackup = openBackup(backup);
        if (!openedBackup || !SUPPORTED_BACKUP_SCHEMA_VERSIONS.has(openedBackup.schemaVersion) || !openedBackup.data) {
            throw new Error('Unsupported backup schema.');
        }
        for (const target of BACKUP_TARGETS) {
            if (openedBackup.data[target.key] !== undefined) {
                let value = openedBackup.data[target.key];
                if (target.key === 'config' && value && typeof value === 'object' && !Array.isArray(value)) {
                    value = { ...value };
                    delete value.requestAppFetchUrl;
                    delete value.maintenanceExperimentalEnabled;
                }
                await saveFile(target.path, value);
            }
        }
        if (openedBackup.data.logoPngBase64 && typeof openedBackup.data.logoPngBase64 === 'string') {
            await fs.writeFile(logoPath, Buffer.from(openedBackup.data.logoPngBase64, 'base64'));
        }
        return openedBackup;
    };

    const writeBackupToFolder = async (backup) => {
        await ensureBackupDir();
        const filename = getBackupFilename(backup);
        const filePath = path.join(backupDir, filename);
        await fs.writeFile(filePath, JSON.stringify(backup, null, 2), { encoding: 'utf8', mode: 0o600 });
        return { filename, filePath };
    };

    return {
        applyBackupPayload,
        createBackupObject,
        enforceBackupRetention,
        listBackupFiles,
        secureStoredBackups,
        writeBackupToFolder,
        backupDir,
    };
};
