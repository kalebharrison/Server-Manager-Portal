import path from 'path';
import fs from 'fs/promises';

/** Root directory for all runtime JSON data files. Override with CONFIG_DIR env var. */
export const CONFIG_DIR = process.env.CONFIG_DIR
    ? path.resolve(process.env.CONFIG_DIR)
    : path.join(process.cwd(), 'config');

const dataPath = (filename) => path.join(CONFIG_DIR, filename);

/** Primary application settings (Plex, SMTP, feature flags). */
export const CONFIG_PATH = dataPath('config.json');
export const INVITES_PATH = dataPath('invites.json');
export const USERS_PATH = dataPath('users.json');
export const DELETED_USERS_PATH = dataPath('deleted-users.json');
export const AUDIT_LOG_PATH = dataPath('audit-log.json');
export const EMAIL_LOG_PATH = dataPath('email_log.json');
export const STATUS_CONFIG_PATH = dataPath('status.json');
export const HEALTH_PATH = dataPath('subzero-health.json');
export const TRENDING_CACHE_PATH = dataPath('trending-cache.json');
export const ANALYTICS_CACHE_PATH = dataPath('analytics-cache.json');
export const PERSONAL_ANALYTICS_CACHE_PATH = dataPath('personal-analytics-cache.json');
export const KILL_RULES_PATH = dataPath('kill-rules.json');
export const MAINTENANCE_RULES_PATH = dataPath('maintenance-rules.json');
export const MAINTENANCE_MEDIA_INDEX_PATH = dataPath('maintenance-media-index.json');
export const MAINTENANCE_RUNS_PATH = dataPath('maintenance-runs.json');
export const MAINTENANCE_REQUEST_INDEX_PATH = dataPath('maintenance-request-index.json');
export const MAINTENANCE_PREFS_PATH = dataPath('maintenance-prefs.json');
export const PLEX_STATS_CACHE_PATH = dataPath('plex-stats.json');
export const PLEX_DASHBOARD_CACHE_PATH = dataPath('plex-dashboard-cache.json');

/** Canonical filenames stored under CONFIG_DIR. */
export const DATA_FILES = [
    'config.json',
    'invites.json',
    'users.json',
    'deleted-users.json',
    'audit-log.json',
    'email_log.json',
    'status.json',
    'subzero-health.json',
    'trending-cache.json',
    'analytics-cache.json',
    'personal-analytics-cache.json',
    'kill-rules.json',
    'maintenance-rules.json',
    'maintenance-media-index.json',
    'maintenance-runs.json',
    'maintenance-request-index.json',
    'maintenance-prefs.json',
    'plex-stats.json',
    'plex-dashboard-cache.json',
];

/** Older installs may have used alternate root-level filenames. */
export const LEGACY_ALIASES = [
    { legacy: 'deleted_users.json', target: 'deleted-users.json' },
    { legacy: 'status-config.json', target: 'status.json' },
    { legacy: 'subzero-status-config.json', target: 'status.json' },
];

const fileExists = async (filePath) => {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
};

const hasNoGroupOrOtherPermissions = async (filePath) => {
    const stat = await fs.stat(filePath);
    return (stat.mode & 0o077) === 0;
};

/**
 * On first run after upgrade, move JSON data files from the project root into CONFIG_DIR.
 * Skips files that already exist in CONFIG_DIR. Safe to call on every startup.
 */
export const migrateConfigFiles = async (log = () => {}) => {
    await fs.mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
    await fs.chmod(CONFIG_DIR, 0o700).catch((error) => {
        if (!['EPERM', 'EACCES'].includes(error.code)) throw error;
        return hasNoGroupOrOtherPermissions(CONFIG_DIR).then((isPrivate) => {
            if (!isPrivate) log(`Could not enforce owner-only permissions on ${CONFIG_DIR}; verify host mount permissions.`);
        });
    });

    let migrated = 0;

    const tryMigrate = async (fromPath, toPath, label) => {
        const [destExists, sourceExists] = await Promise.all([
            fileExists(toPath),
            fileExists(fromPath),
        ]);
        if (destExists || !sourceExists) return false;
        await fs.rename(fromPath, toPath);
        log(`Migrated ${label} -> ${path.relative(process.cwd(), toPath)}`);
        return true;
    };

    for (const filename of DATA_FILES) {
        const legacyPath = path.join(process.cwd(), filename);
        const newPath = dataPath(filename);
        if (await tryMigrate(legacyPath, newPath, filename)) migrated++;
    }

    for (const { legacy, target } of LEGACY_ALIASES) {
        const legacyPath = path.join(process.cwd(), legacy);
        const newPath = dataPath(target);
        if (await tryMigrate(legacyPath, newPath, legacy)) migrated++;
    }

    let warnedAboutPermissions = false;
    await Promise.all(DATA_FILES.map((filename) => fs.chmod(dataPath(filename), 0o600).catch((error) => {
        if (error.code === 'ENOENT') return;
        if (!['EPERM', 'EACCES'].includes(error.code)) throw error;
        return hasNoGroupOrOtherPermissions(dataPath(filename)).then((isPrivate) => {
            if (!isPrivate && !warnedAboutPermissions) {
                warnedAboutPermissions = true;
                log('Could not enforce owner-only data-file permissions; verify host mount permissions.');
            }
        });
    })));

    if (migrated > 0) {
        log(`Config migration complete: ${migrated} file(s) now in ${path.relative(process.cwd(), CONFIG_DIR) || 'config'}/`);
    }

    return migrated;
};
