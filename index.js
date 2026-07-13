

import express from 'express';
import fetch from 'node-fetch';
import { randomUUID } from 'crypto';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import compression from 'compression';
import { execSync } from 'child_process';
import fsSync from 'fs';
import { createBasePathHelpers, deriveBasePath } from './lib/base-path.js';
import { createBroadcastService } from './lib/broadcast-service.js';
import { createLruCache, createTtlCache } from './lib/cache.js';
import { addDays, getDaysUntilExpiry } from './lib/date-utils.js';
import { createDeletedUserRegistry, isDeletedUser, normalized } from './lib/deleted-users.js';
import { createEmailService } from './lib/email-service.js';
import { createMediaUserService } from './lib/media-user-service.js';
import { createMaintenanceService } from './lib/maintenance-service.js';
import { createNewsletterService } from './lib/newsletter-service.js';
import { escapeHtmlAttr } from './lib/html-shell.js';
import { createSecurityHeadersMiddleware, secureTokenEquals } from './lib/http-security.js';
import { createSerialJobQueue } from './lib/job-queue.js';
import { loadFile as loadJsonFile, saveFile as saveJsonFile } from './lib/json-file-store.js';
import { createConfigSecretProtector } from './lib/config-secrets.js';
import { normalizeArrConfig } from './lib/arr-instances.js';
import { isLoopbackAddress, normalizeExternalBaseUrl, resolveIntegrationUrlForFetch } from './lib/network-policy.js';
import { enrichRecentItemsWithMediaTags } from './lib/plex-media-tags.js';
import { createPlexStatsService } from './lib/plex-stats-service.js';
import { createPlexDashboardService } from './lib/plex-dashboard-service.js';
import { createPlexConnectionService } from './lib/plex-connection-service.js';
import { registerAuthRoutes } from './lib/auth-routes.js';
import { registerInviteRoutes } from './lib/invite-routes.js';
import { registerAdminRoutes } from './lib/admin-routes.js';
import { registerConfigRoutes } from './lib/config-routes.js';
import { createAdminProfileService } from './lib/admin-profile-service.js';
import { registerPublicStatusRoutes } from './lib/public-status-routes.js';
import { registerPlexRoutes } from './lib/plex-routes.js';
import { registerJellyfinRoutes } from './lib/jellyfin-routes.js';
import { registerMaintenanceRoutes } from './lib/maintenance-routes.js';
import { registerMediaStackRoutes } from './lib/media-stack-routes.js';
import { createRequestAppService } from './lib/request-app-service.js';
import { createTvdbService } from './lib/tvdb-service.js';
import { createMetadataHealthProbe } from './lib/metadata-health.js';
import { registerRequestAppRoutes } from './lib/request-app-routes.js';
import { registerStaticShellRoutes } from './lib/static-shell-routes.js';
import { createBackgroundService } from './lib/background-service.js';
import { registerCommunicationRoutes } from './lib/communication-routes.js';
import { registerSpeedtestRoutes } from './lib/speedtest-routes.js';
import { registerKillRuleRoutes } from './lib/kill-rule-routes.js';
import { createAnalyticsService } from './lib/analytics-service.js';
import { createRateLimiter } from './lib/rate-limit.js';
import { createAuditLogger } from './lib/audit-log.js';
import { isImpersonatingSession } from './lib/impersonation.js';
import { createStatusRuntime } from './lib/status-runtime.js';
import { createStreamMonitor } from './lib/stream-monitor.js';
import { computeNextBackupRun, findRunnableTask, getTasksSnapshot, markTaskEnd, markTaskStart, systemJobs, tasksInfo } from './lib/task-state.js';

const resolveAppVersion = () => {
    let pkgVersion = '1.0.0';
    try {
        const pkg = JSON.parse(fsSync.readFileSync('package.json', 'utf8'));
        if (pkg?.version) pkgVersion = String(pkg.version);
    } catch {
        // package metadata may be absent in unusual deployments
    }

    try {
        const stamped = fsSync.readFileSync('version.txt', 'utf8').trim();
        const expectedPrefix = `v${pkgVersion}`;
        if (stamped === expectedPrefix || stamped.startsWith(`${expectedPrefix}-`)) {
            return stamped;
        }
    } catch {
        // version.txt is optional; fall back to package.json plus commit hash
    }

    const isTagBuild = String(process.env.GITHUB_REF || '').startsWith('refs/tags/');
    try {
        const gitHash = execSync('git rev-parse --short HEAD', { stdio: 'pipe' }).toString().trim();
        return isTagBuild ? `v${pkgVersion}` : `v${pkgVersion}-${gitHash}`;
    } catch {
        return `v${pkgVersion}`;
    }
};

const appVersion = resolveAppVersion();

const app = express();
app.use(compression());
const PORT = parseInt(process.env.PORT || '2121', 10);
const BIND_HOST = process.env.BIND_HOST || '0.0.0.0';
const SETUP_TOKEN = process.env.SETUP_TOKEN || '';
const ALLOW_PRIVATE_INTEGRATION_URLS = String(process.env.ALLOW_PRIVATE_INTEGRATION_URLS || '').toLowerCase() === 'true';
const FORCE_SECURE_COOKIES = String(process.env.FORCE_SECURE_COOKIES || '').toLowerCase() === 'true';
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || '';
const REQUEST_APP_INTERNAL_URL = process.env.REQUEST_APP_INTERNAL_URL || '';

const BASE_PATH = deriveBasePath({ envBasePath: process.env.BASE_PATH, publicBaseUrl: PUBLIC_BASE_URL });
const { withBasePath, stripBasePathFromUrl } = createBasePathHelpers(BASE_PATH);

const plexImageUrl = (mediaPath) => withBasePath(`/api/plex/image?path=${encodeURIComponent(mediaPath)}`);

// Sentinel sent to the admin UI in place of stored secrets so raw credentials
// never leave the server. When the UI posts this value back unchanged on save,
// the existing stored secret is preserved instead of being overwritten.
const SECRET_MASK = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022';

// --- Security: JWT secret must be explicitly set in the environment ---
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
    console.error('FATAL: JWT_SECRET environment variable must be set and at least 32 characters long.');
    console.error('Set it in a .env file or your process environment before starting the server.');
    process.exit(1);
}
const CONFIG_ENCRYPTION_KEY = process.env.CONFIG_ENCRYPTION_KEY || JWT_SECRET;
if (CONFIG_ENCRYPTION_KEY.length < 32) {
    console.error('FATAL: CONFIG_ENCRYPTION_KEY must be at least 32 characters long.');
    process.exit(1);
}
const configSecretProtector = createConfigSecretProtector(CONFIG_ENCRYPTION_KEY);
const loadFile = async (filePath, defaultContent) => {
    const value = await loadJsonFile(filePath, defaultContent);
    return filePath === CONFIG_PATH ? normalizeArrConfig(configSecretProtector.unprotectConfig(value)) : value;
};
const saveFile = async (filePath, value) => saveJsonFile(
    filePath,
    filePath === CONFIG_PATH ? configSecretProtector.protectConfig(normalizeArrConfig(value)) : value,
);
const secureConfigAtRest = async () => {
    const stored = await loadJsonFile(CONFIG_PATH, {});
    const hadPlaintextSecrets = configSecretProtector.hasPlaintextSecrets(stored);
    const runtimeConfig = normalizeArrConfig(configSecretProtector.unprotectConfig(stored));
    await saveJsonFile(CONFIG_PATH, configSecretProtector.protectConfig(runtimeConfig));
    return hadPlaintextSecrets;
};

let CLIENT_ID = process.env.CLIENT_ID || 'plex-expiry-manager-client-id'; // Now dynamically generated if missing

app.use(createSecurityHeadersMiddleware({ forceHsts: FORCE_SECURE_COOKIES }));

const authRateLimit = createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 10 });
const authCallbackRateLimit = createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 40 });
const jellyfinQuickConnectPollRateLimit = createRateLimiter({ windowMs: 5 * 60 * 1000, maxRequests: 140 });
const publicReadRateLimit = createRateLimiter({ windowMs: 60 * 1000, maxRequests: 120 });
const speedtestRateLimit = createRateLimiter({ windowMs: 60 * 1000, maxRequests: 12 });
const setupRateLimit = createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 30 });

const hasValidSetupToken = (req) => {
    if (!SETUP_TOKEN) return false;
    const provided = req.headers['x-setup-token'] || req.body?.setupToken;
    return secureTokenEquals(provided, SETUP_TOKEN);
};

// Use the raw TCP peer address for setup authorization. req.ip honors the
// client-supplied X-Forwarded-For header (trust proxy is enabled), which an
// attacker could spoof to impersonate localhost during the unconfigured window.
const getSocketPeerIp = (req) => (req.socket && req.socket.remoteAddress) || 'unknown';
const canRunInitialSetup = (req) => hasValidSetupToken(req) || isLoopbackAddress(getSocketPeerIp(req));

const sanitizeIntegrationUrl = (rawUrl) => {
    if (!rawUrl) return '';
    return normalizeExternalBaseUrl(rawUrl, { allowPrivate: ALLOW_PRIVATE_INTEGRATION_URLS, allowHttp: true });
};

// Only mark cookies Secure when explicitly enabled. Auto-detecting HTTPS breaks plain
// HTTP LAN access (e.g. http://192.168.x.x:2121) when FORCE_SECURE_COOKIES was left on.
const sessionCookieBase = () => ({
    httpOnly: true,
    secure: FORCE_SECURE_COOKIES,
    sameSite: 'lax',
    path: BASE_PATH || '/',
});

const clearSessionCookie = (req, res) => {
    res.clearCookie('session', sessionCookieBase());
};

const setSessionCookie = (req, res, token, { maxAgeMs = 7 * 24 * 60 * 60 * 1000 } = {}) => {
    res.cookie('session', token, {
        ...sessionCookieBase(),
        maxAge: maxAgeMs,
    });
};

app.use(express.json({ limit: '50kb' })); // Middleware to parse JSON bodies (with size limit)
app.use(cookieParser()); // Middleware to parse cookies

// Trust the first proxy (e.g. Nginx/Caddy) so req.secure reflects HTTPS correctly
app.set('trust proxy', 1);

if (BASE_PATH) {
    app.use((req, res, next) => {
        req.url = stripBasePathFromUrl(req.url);
        next();
    });
}

const plexMetadataCache = createLruCache({ maxEntries: 500 });
const getCachedPlexMetadata = (key) => plexMetadataCache.get(key);
const setCachedPlexMetadata = (key, value) => plexMetadataCache.set(key, value);

import {
    CONFIG_DIR,
    CONFIG_PATH,
    INVITES_PATH,
    USERS_PATH,
    DELETED_USERS_PATH,
    AUDIT_LOG_PATH,
    EMAIL_LOG_PATH,
    STATUS_CONFIG_PATH,
    HEALTH_PATH,
    TRENDING_CACHE_PATH,
    ANALYTICS_CACHE_PATH,
    PERSONAL_ANALYTICS_CACHE_PATH,
    KILL_RULES_PATH,
    MAINTENANCE_RULES_PATH,
    MAINTENANCE_MEDIA_INDEX_PATH,
    MAINTENANCE_RUNS_PATH,
    MAINTENANCE_REQUEST_INDEX_PATH,
    MAINTENANCE_PREFS_PATH,
    PLEX_STATS_CACHE_PATH,
    PLEX_DASHBOARD_CACHE_PATH,
    migrateConfigFiles,
} from './lib/data-paths.js';
import { createBackupService } from './lib/backup.js';
import { DEFAULT_DASHBOARD_LAYOUT, normalizeSectionLayout } from './lib/dashboard-layout.js';
const PLEX_API = 'https://plex.tv/api';

// --- Helper Functions ---
const log = (message) => console.log(`[${new Date().toISOString()}] ${message}`);
const heavyJobQueue = createSerialJobQueue({ log });

const apiCache = createTtlCache({ maxEntries: 500 });

/**
 * Wraps an expensive async fetcher function with a TTL cache.
 * @param {string} key Unique cache key
 * @param {number} ttlMs Time to live in milliseconds
 * @param {Function} fetcher Async function returning data to cache
 */
const withCache = async (key, ttlMs, fetcher) => {
    return apiCache.getOrSet(key, ttlMs, fetcher);
};

const appendAuditLog = createAuditLogger({ auditLogPath: AUDIT_LOG_PATH, loadFile, saveFile, log });
const { rememberDeletedUser } = createDeletedUserRegistry({ deletedUsersPath: DELETED_USERS_PATH, loadFile, saveFile });
const statusRuntime = createStatusRuntime({
    configPath: CONFIG_PATH,
    statusConfigPath: STATUS_CONFIG_PATH,
    healthPath: HEALTH_PATH,
    loadFile,
    saveFile,
    normalizeExternalBaseUrl,
    port: PORT,
    basePath: BASE_PATH,
    resolveServiceUrl: async (service) => {
        if (service?.id !== 'plex') return '';
        const appConfig = await loadFile(CONFIG_PATH, {});
        return getPlexConnectionUri(appConfig);
    },
    probeService: (service) => metadataHealthProbe(service),
});

const { sendEmail, checkAndSendNotifications, sendExpiryEmail, sendAdjustmentEmail } = createEmailService({
    usersPath: USERS_PATH,
    emailLogPath: EMAIL_LOG_PATH,
    loadFile,
    saveFile,
    appendAuditLog,
    getDaysUntilExpiry,
    escapeHtmlAttr,
    log,
});
const { startBroadcast, sendTestBroadcast } = createBroadcastService({
    configPath: CONFIG_PATH,
    usersPath: USERS_PATH,
    loadFile,
    sendEmail,
    log,
});


// --- Plex API Functions (Server-side only) ---
const apiFetch = (url, token, options = {}) => {
    const headers = {
        'Accept': 'application/json',
        ...(options.headers || {}),
        'X-Plex-Token': token,
        'X-Plex-Client-Identifier': CLIENT_ID
    };
    return fetch(url, { ...options, headers });
};

const jellyfinAuthorizationHeader = (token = '') => {
    const parts = [
        'MediaBrowser Client="Server Manager Portal"',
        'Device="Web"',
        `DeviceId="${CLIENT_ID}"`,
        `Version="${appVersion}"`,
    ];
    if (token) parts.push(`Token="${token}"`);
    return parts.join(', ');
};

const jellyfinHeaders = (token = '', extra = {}) => ({
    Accept: 'application/json',
    'X-Emby-Authorization': jellyfinAuthorizationHeader(token),
    ...(token ? { 'X-Emby-Token': token } : {}),
    ...extra,
});

let cachedAdminId = null;

const syncAdminPlexIdFromConfigToken = async (config, { persist = false } = {}) => {
    if (!config?.plexToken || config.plexToken === SECRET_MASK) return config;
    try {
        const ownerRes = await apiFetch('https://plex.tv/api/v2/user', config.plexToken);
        if (!ownerRes.ok) return config;
        const ownerData = await ownerRes.json();
        const ownerId = ownerData?.id ? String(ownerData.id) : '';
        if (!ownerId) return config;
        if (String(config.adminPlexId || '') !== ownerId) {
            log(`Syncing adminPlexId -> ${ownerId} from configured Plex token (was ${config.adminPlexId || 'unset'})`);
            config.adminPlexId = ownerId;
            cachedAdminId = ownerId;
            if (persist) await saveFile(CONFIG_PATH, config);
        } else {
            cachedAdminId = ownerId;
        }
    } catch (e) {
        log(`Admin Plex ID sync skipped: ${e.message}`);
    }
    return config;
};

const getAdminId = async (config) => {
    if (config?.adminPlexId) return String(config.adminPlexId);
    if (!config || !config.plexToken || config.plexToken === SECRET_MASK) return null;
    try {
        const res = await apiFetch('https://plex.tv/api/v2/user', config.plexToken);
        if (!res.ok) return null;
        const data = await res.json();
        return data?.id ? String(data.id) : null;
    } catch (e) {
        log('Failed to fetch admin info: ' + e.message);
        return null;
    }
};

const findLocalUserForSession = (users, sessionUser) => {
    if (!sessionUser || !Array.isArray(users)) return null;
    if (sessionUser.impersonatingUserId) {
        const target = users.find((user) => normalized(user.id) === normalized(sessionUser.impersonatingUserId));
        if (target) return target;
    }
    const sessionId = normalized(sessionUser.id);
    const sessionPlexId = normalized(sessionUser.plexId);
    const sessionJellyfinId = normalized(sessionUser.jellyfinId);
    const sessionEmail = normalized(sessionUser.email);
    const sessionUsername = normalized(sessionUser.username);
    return users.find((user) => {
        const userId = normalized(user.id);
        const userPlexId = normalized(user.plexId);
        const userJellyfinId = normalized(user.jellyfinId);
        const userEmail = normalized(user.email);
        const userUsername = normalized(user.username);
        return (
            (sessionPlexId && (sessionPlexId === userPlexId || sessionPlexId === userId)) ||
            (sessionJellyfinId && (sessionJellyfinId === userJellyfinId || sessionJellyfinId === userId)) ||
            (sessionId && (sessionId === userId || sessionId === userPlexId)) ||
            (sessionId && (sessionId === userJellyfinId || sessionId === `jellyfin:${userJellyfinId}`)) ||
            (sessionEmail && sessionEmail === userEmail) ||
            (sessionUsername && sessionUsername === userUsername)
        );
    }) || null;
};

const {
    fetchWithTimeout,
    normalizePlexToken,
    resolveConfiguredPlexServerUrl,
    resolvePlexServerUrlForVerification,
    fetchOwnedPlexServers,
    validatePlexServerAdminToken,
    verifyInitialSetupPlexOwner,
    fetchPlexServerAccounts,
    resolveLocalPlexAccountId,
    getPlexConnectionUri,
    invalidatePlexConnectionCaches,
} = createPlexConnectionService({
    usersPath: USERS_PATH,
    secretMask: SECRET_MASK,
    loadFile,
    resolveIntegrationUrlForFetch,
    findLocalUserForSession,
    getClientId: () => CLIENT_ID,
    log,
});

const tvdbService = createTvdbService({ fetchWithTimeout, log });
const metadataHealthProbe = createMetadataHealthProbe({
    loadConfig: () => loadFile(CONFIG_PATH, {}),
    fetchWithTimeout,
    tvdbService,
});

const resolveCurrentAdmin = async (sessionUser, config = null) => {
    const loadedConfig = config || await loadFile(CONFIG_PATH, {});
    if (String(loadedConfig?.mediaServerType || '').toLowerCase() === 'jellyfin') {
        if (sessionUser?.authProvider !== 'jellyfin' || !sessionUser?.jellyfinId) return false;
        if (loadedConfig?.jellyfinUrl && loadedConfig?.jellyfinApiKey) {
            try {
                const baseUrl = resolveIntegrationUrlForFetch(loadedConfig.jellyfinUrl);
                const userRes = await fetch(`${baseUrl}/Users/${encodeURIComponent(sessionUser.jellyfinId)}`, {
                    headers: jellyfinHeaders(loadedConfig.jellyfinApiKey),
                });
                if (userRes.ok) {
                    const jellyfinUser = await userRes.json();
                    return jellyfinUser?.Policy?.IsAdministrator === true;
                }
            } catch (e) {
                log(`Jellyfin admin policy check failed for ${sessionUser.username || sessionUser.jellyfinId}: ${e.message}`);
            }
        }
        return sessionUser?.jellyfinIsAdmin === true || sessionUser?.isAdmin === true;
    }
    if (!sessionUser?.plexId) return false;
    const adminId = await getAdminId(loadedConfig);
    return !!(adminId && String(sessionUser.plexId) === String(adminId));
};

const isPlexConfigured = (config = {}) => !!(config && config.plexToken && config.serverIdentifier);
const isJellyfinConfigured = (config = {}) => (
    String(config?.mediaServerType || '').toLowerCase() === 'jellyfin'
    && !!(config?.jellyfinUrl && config?.jellyfinApiKey)
);
const isPortalConfigured = (config = {}) => isPlexConfigured(config) || isJellyfinConfigured(config);

const requireAuth = (req, res, next) => {
    const token = req.cookies.session;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch (e) {
        return res.status(401).json({ error: 'Invalid session' });
    }
};

const requireMember = async (req, res, next) => {
    try {
        const config = await loadFile(CONFIG_PATH, {});
        const isAdmin = await resolveCurrentAdmin(req.user, config);
        req.user.isAdmin = isAdmin;
        if (isAdmin) return next();

        const users = await loadFile(USERS_PATH, []);
        const localUser = findLocalUserForSession(users, req.user);
        const deletedUsers = await loadFile(DELETED_USERS_PATH, []);
        if (!localUser || isDeletedUser(deletedUsers, req.user)) {
            await appendAuditLog('session_blocked_non_member', req.user, req.user);
            clearSessionCookie(req, res);
            return res.status(403).json({ error: 'Your account does not have active portal access.' });
        }
        req.localUser = localUser;
        next();
    } catch (e) {
        res.status(500).json({ error: 'Membership verification failed' });
    }
};

const requireAdmin = async (req, res, next) => {
    const token = req.cookies.session;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    try {
        req.user = jwt.verify(token, JWT_SECRET);
    } catch (e) {
        return res.status(401).json({ error: 'Invalid session' });
    }
    if (isImpersonatingSession(req.user)) {
        return res.status(403).json({ error: 'Admin actions are disabled while viewing as another user.' });
    }

    const config = await loadFile(CONFIG_PATH, {});
    if (!isPortalConfigured(config)) {
        return res.status(403).json({ error: 'Forbidden: App not configured' });
    }

    const isAdmin = await resolveCurrentAdmin(req.user, config);
    if (!isAdmin) {
        return res.status(403).json({ error: 'Forbidden: Admins only' });
    }
    req.user.isAdmin = true;
    next();
};

const getSessionUser = (req) => {
    const token = req.cookies.session;
    if (!token) return null;
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (e) {
        return null;
    }
};

const { syncUsers, syncJellyfinUsers, revokePlexAccess, inviteUserToPlex, checkAndRevoke } = createMediaUserService({
    plexApi: PLEX_API,
    usersPath: USERS_PATH,
    deletedUsersPath: DELETED_USERS_PATH,
    loadFile,
    saveFile,
    apiFetch,
    fetchWithTimeout: (...args) => fetchWithTimeout(...args),
    resolveIntegrationUrlForFetch,
    jellyfinHeaders,
    isJellyfinConfigured,
    withBasePath,
    isDeletedUser,
    addDays,
    getDaysUntilExpiry,
    sendExpiryEmail,
    appendAuditLog,
    log,
});

// --- API Routes ---

const { getAdminProfile, invalidateAdminProfileCache } = createAdminProfileService({
    fetch,
    resolveIntegrationUrlForFetch,
    jellyfinHeaders,
    getPlexConnectionUri,
    log,
});

registerAuthRoutes({
    app,
    authRateLimit,
    authCallbackRateLimit,
    jellyfinQuickConnectPollRateLimit,
    publicReadRateLimit,
    setupRateLimit,
    requireAuth,
    requireMember,
    requireAdmin,
    appVersion,
    configPath: CONFIG_PATH,
    usersPath: USERS_PATH,
    deletedUsersPath: DELETED_USERS_PATH,
    jwtSecret: JWT_SECRET,
    forceSecureCookies: FORCE_SECURE_COOKIES,
    loadFile,
    saveFile,
    apiFetch,
    jellyfinHeaders,
    isJellyfinConfigured,
    isPortalConfigured,
    resolveIntegrationUrlForFetch,
    getClientId: () => CLIENT_ID,
    withBasePath,
    clearSessionCookie,
    setSessionCookie,
    appendAuditLog,
    findLocalUserForSession,
    syncAdminPlexIdFromConfigToken,
    getAdminId,
    resolveCurrentAdmin,
    resolveConfiguredPlexServerUrl,
    fetchOwnedPlexServers,
    canRunInitialSetup,
    inviteUserToPlex,
    getPlexConnectionUri,
    resolveLocalPlexAccountId,
    fetchPlexServerAccounts,
    getAdminProfile,
    log,
});

registerConfigRoutes({
    app,
    requireAdmin,
    setupRateLimit,
    publicReadRateLimit,
    configPath: CONFIG_PATH,
    secretMask: SECRET_MASK,
    setupToken: SETUP_TOKEN,
    jwtSecret: JWT_SECRET,
    basePath: BASE_PATH,
    appVersion,
    defaultDashboardLayout: DEFAULT_DASHBOARD_LAYOUT,
    loadFile,
    saveFile,
    isPortalConfigured,
    isJellyfinConfigured,
    normalizePlexToken,
    resolveConfiguredPlexServerUrl,
    verifyInitialSetupPlexOwner,
    resolveCurrentAdmin,
    canRunInitialSetup,
    sanitizeIntegrationUrl,
    fetchOwnedPlexServers,
    validatePlexServerAdminToken,
    syncAdminPlexIdFromConfigToken,
    invalidatePlexConnectionCaches,
    invalidateAdminProfileCache,
    invalidateArrCatalogCache: () => invalidateArrCatalogCache(),
    reconcileStatusConfig: () => statusRuntime.reconcileStatusConfig(),
    computeNextBackupRun,
    systemJobs,
    startBackgroundService: () => startBackgroundService(),
    buildMaintenanceMediaIndex: (...args) => buildMaintenanceMediaIndex(...args),
    normalizeSectionLayout,
    sendEmail,
    resolveIntegrationUrlForFetch,
    fetchWithTimeout,
    getPlexConnectionUri,
    log,
});

const plexStatsService = createPlexStatsService({
    configPath: CONFIG_PATH,
    plexStatsCachePath: PLEX_STATS_CACHE_PATH,
    loadFile,
    getPlexConnectionUri,
    markTaskStart,
    markTaskEnd,
    systemJobs,
    runHeavyJob: heavyJobQueue.run,
    log,
});
const { loadPlexStatsFromDisk, buildPlexStatsCache, startPlexStatsBackgroundTask } = plexStatsService;

const plexDashboardService = createPlexDashboardService({
    configPath: CONFIG_PATH,
    cachePath: PLEX_DASHBOARD_CACHE_PATH,
    loadFile,
    saveFile,
    getPlexConnectionUri,
    fetch,
    log,
});

registerPlexRoutes({
    app,
    requireAuth,
    requireMember,
    requireAdmin,
    configPath: CONFIG_PATH,
    loadFile,
    getPlexConnectionUri,
    fetch,
    fetchWithTimeout,
    plexDashboardService,
    plexStatsService,
    loadPlexStatsFromDisk,
    buildPlexStatsCache,
    log,
});

const { checkAndSendNewsletter, sendTestNewsletter, sendManualNewsletter } = createNewsletterService({
    configPath: CONFIG_PATH,
    usersPath: USERS_PATH,
    loadFile,
    saveFile,
    getPlexConnectionUri,
    getPlexStats: async () => plexStatsService.getCachedPlexStats() || await loadPlexStatsFromDisk(),
    getHealthData: () => statusRuntime.getHealthData(),
    escapeHtmlAttr,
    log,
});

registerCommunicationRoutes({
    app,
    requireAdmin,
    configPath: CONFIG_PATH,
    usersPath: USERS_PATH,
    loadFile,
    saveFile,
    startBroadcast,
    sendTestBroadcast,
    sendTestNewsletter,
    sendManualNewsletter,
    sendEmail,
    escapeHtmlAttr,
    log,
});

registerInviteRoutes({
    app,
    requireAdmin,
    authRateLimit,
    publicReadRateLimit,
    setupRateLimit,
    configPath: CONFIG_PATH,
    usersPath: USERS_PATH,
    invitesPath: INVITES_PATH,
    jwtSecret: JWT_SECRET,
    secretMask: SECRET_MASK,
    loadFile,
    saveFile,
    normalizePlexToken,
    isPortalConfigured,
    resolveCurrentAdmin,
    fetchOwnedPlexServers,
    validatePlexServerAdminToken,
    canRunInitialSetup,
    resolveConfiguredPlexServerUrl,
    resolveIntegrationUrlForFetch,
    fetchWithTimeout,
    syncUsers,
    syncJellyfinUsers,
    appendAuditLog,
    sendEmail,
    getAdminProfile,
    getClientId: () => CLIENT_ID,
    inviteUserToPlex,
    getAdminId,
    setSessionCookie,
    log,
});

const {
    applyBackupPayload,
    createBackupObject,
    enforceBackupRetention,
    listBackupFiles,
    secureStoredBackups,
    writeBackupToFolder,
    backupDir: BACKUP_DIR,
} = createBackupService({
    loadFile,
    saveFile,
    sealBackup: configSecretProtector.sealBackup,
    openBackup: configSecretProtector.openBackup,
});

registerAdminRoutes({
    app,
    requireAdmin,
    requireAuth,
    requireMember,
    jwtSecret: JWT_SECRET,
    configDir: CONFIG_DIR,
    configPath: CONFIG_PATH,
    usersPath: USERS_PATH,
    deletedUsersPath: DELETED_USERS_PATH,
    auditLogPath: AUDIT_LOG_PATH,
    analyticsCachePath: ANALYTICS_CACHE_PATH,
    trendingCachePath: TRENDING_CACHE_PATH,
    plexStatsCachePath: PLEX_STATS_CACHE_PATH,
    maintenanceMediaIndexPath: MAINTENANCE_MEDIA_INDEX_PATH,
    maintenanceRulesPath: MAINTENANCE_RULES_PATH,
    maintenanceRunsPath: MAINTENANCE_RUNS_PATH,
    maintenanceRequestIndexPath: MAINTENANCE_REQUEST_INDEX_PATH,
    maintenancePrefsPath: MAINTENANCE_PREFS_PATH,
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
    checkAndCleanupInactive: (...args) => checkAndCleanupInactive(...args),
    isMaintenanceExperimentalEnabled: (...args) => isMaintenanceExperimentalEnabled(...args),
    executeMaintenanceRunBatch: (...args) => executeMaintenanceRunBatch(...args),
    calculateAnalyticsStats: (...args) => calculateAnalyticsStats(...args),
    calculateTrendingStats: (...args) => calculateTrendingStats(...args),
    buildPlexStatsCache,
    runAutoBackupCycle: (...args) => runAutoBackupCycle(...args),
    buildMaintenanceMediaIndex: (...args) => buildMaintenanceMediaIndex(...args),
    applyBackupPayload,
    createBackupObject,
    enforceBackupRetention,
    listBackupFiles,
    writeBackupToFolder,
    backupDir: BACKUP_DIR,
    appendAuditLog,
    sendAdjustmentEmail,
    inviteUserToPlex,
    revokePlexAccess,
    rememberDeletedUser,
    resolveCurrentAdmin,
    clearSessionCookie,
    setSessionCookie,
    log,
});

registerPublicStatusRoutes({
    app,
    publicReadRateLimit,
    requireAuth,
    requireAdmin,
    configPath: CONFIG_PATH,
    loadFile,
    statusRuntime,
    getSessionUser,
    getAdminProfile,
    isPortalConfigured,
    getCachedPlexStats: () => plexStatsService.getCachedPlexStats(),
    loadPlexStatsFromDisk,
});

const jellyfinItemUrl = (config, itemId) => {
    const baseUrl = String(config?.jellyfinUrl || '').replace(/\/+$/, '');
    return baseUrl && itemId ? `${baseUrl}/web/#/details?id=${encodeURIComponent(itemId)}` : baseUrl;
};

registerJellyfinRoutes({
    app,
    requireAuth,
    requireMember,
    publicReadRateLimit,
    configPath: CONFIG_PATH,
    loadFile,
    isJellyfinConfigured,
    resolveIntegrationUrlForFetch,
    fetchWithTimeout,
    withCache,
    jellyfinHeaders,
    withBasePath,
    jellyfinItemUrl,
    log,
});

const analyticsService = createAnalyticsService({
    app,
    requireAuth,
    requireMember,
    requireAdmin,
    configPath: CONFIG_PATH,
    usersPath: USERS_PATH,
    analyticsCachePath: ANALYTICS_CACHE_PATH,
    personalAnalyticsCachePath: PERSONAL_ANALYTICS_CACHE_PATH,
    trendingCachePath: TRENDING_CACHE_PATH,
    plexStatsCachePath: PLEX_STATS_CACHE_PATH,
    loadFile,
    saveFile,
    getPlexConnectionUri,
    resolveIntegrationUrlForFetch,
    fetchWithTimeout,
    fetchPlexServerAccounts,
    resolveLocalPlexAccountId,
    resolveCurrentAdmin,
    plexImageUrl,
    withBasePath,
    jellyfinItemUrl,
    isJellyfinConfigured,
    buildPlexStatsCache,
    getCachedPlexMetadata,
    setCachedPlexMetadata,
    enrichRecentItemsWithMediaTags,
    sendEmail,
    escapeHtmlAttr,
    markTaskStart,
    markTaskEnd,
    systemJobs,
    runHeavyJob: heavyJobQueue.run,
    log,
});
const {
    calculateAnalyticsStats,
    calculateTrendingStats,
    startTrendingStatsBackgroundTask,
    startAnalyticsStatsBackgroundTask,
    startPersonalAnalyticsCacheWarmer,
} = analyticsService;

registerSpeedtestRoutes({
    app,
    requireAuth,
    requireMember,
    speedtestRateLimit,
});

registerStaticShellRoutes({
    app,
    basePath: BASE_PATH,
    publicBaseUrl: PUBLIC_BASE_URL,
    port: PORT,
    configPath: CONFIG_PATH,
    loadFile,
    getAdminProfile,
    stripBasePathFromUrl,
    log,
});

// --- Background Services ---
const { checkAndCleanupInactive, runAutoBackupCycle, startBackgroundService } = createBackgroundService({
    configPath: CONFIG_PATH,
    usersPath: USERS_PATH,
    maintenanceRulesPath: MAINTENANCE_RULES_PATH,
    loadFile,
    saveFile,
    fetch,
    getPlexConnectionUri,
    syncUsers,
    checkAndSendNotifications,
    checkAndRevoke,
    checkAndSendNewsletter,
    isMaintenanceExperimentalEnabled: (...args) => isMaintenanceExperimentalEnabled(...args),
    executeMaintenanceRunBatch: (...args) => executeMaintenanceRunBatch(...args),
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
});

const mediaStackRoutes = registerMediaStackRoutes({
    app,
    requireAuth,
    requireMember,
    configPath: CONFIG_PATH,
    loadFile,
    withCache,
    fetch,
    normalizeExternalBaseUrl,
});

const requestAppService = createRequestAppService({
    fetchWithTimeout,
    resolveIntegrationUrlForFetch,
    tvdbService,
    getActiveAcquisitionKeys: mediaStackRoutes.getActiveAcquisitionKeys,
    withBasePath,
    requestAppInternalUrl: REQUEST_APP_INTERNAL_URL,
    log,
});

registerRequestAppRoutes({
    app,
    requireAuth,
    requireMember,
    requireAdmin,
    configPath: CONFIG_PATH,
    loadFile,
    requestAppService,
    appendAuditLog,
    log,
});

// --- Library Maintenance (Maintainerr-style) ---
const maintenanceService = createMaintenanceService({
    configPath: CONFIG_PATH,
    maintenancePrefsPath: MAINTENANCE_PREFS_PATH,
    maintenanceMediaIndexPath: MAINTENANCE_MEDIA_INDEX_PATH,
    maintenanceRequestIndexPath: MAINTENANCE_REQUEST_INDEX_PATH,
    maintenanceRulesPath: MAINTENANCE_RULES_PATH,
    maintenanceRunsPath: MAINTENANCE_RUNS_PATH,
    loadFile,
    saveFile,
    getPlexConnectionUri,
    resolveIntegrationUrlForFetch,
    appendAuditLog,
    markTaskStart,
    markTaskEnd,
    systemJobs,
    runHeavyJob: heavyJobQueue.run,
    log,
});
const {
    isMaintenanceExperimentalEnabled,
    invalidateArrCatalogCache,
    buildMaintenanceMediaIndex,
    executeMaintenanceRunBatch,
} = maintenanceService;

registerMaintenanceRoutes({
    app,
    requireAdmin,
    configPath: CONFIG_PATH,
    maintenanceRulesPath: MAINTENANCE_RULES_PATH,
    maintenanceMediaIndexPath: MAINTENANCE_MEDIA_INDEX_PATH,
    maintenanceRequestIndexPath: MAINTENANCE_REQUEST_INDEX_PATH,
    maintenancePrefsPath: MAINTENANCE_PREFS_PATH,
    maintenanceRunsPath: MAINTENANCE_RUNS_PATH,
    loadFile,
    saveFile,
    appendAuditLog,
    maintenanceService,
    tasksInfo,
    markTaskStart,
    markTaskEnd,
    withCache,
});

const { monitorConcurrentSessions } = createStreamMonitor({
    configPath: CONFIG_PATH,
    killRulesPath: KILL_RULES_PATH,
    plexStatsCachePath: PLEX_STATS_CACHE_PATH,
    loadFile,
    saveFile,
    getPlexConnectionUri,
    appendAuditLog,
    log,
});

registerKillRuleRoutes({
    app,
    requireAdmin,
    killRulesPath: KILL_RULES_PATH,
    loadFile,
    saveFile,
});

const startPortalService = async () => {
    log(`--- Server Manager Portal Service starting on http://${BIND_HOST}:${PORT} ---`);
    log(`Runtime: CONFIG_DIR=${CONFIG_DIR}, FORCE_SECURE_COOKIES=${FORCE_SECURE_COOKIES}, BASE_PATH=${BASE_PATH || '/'}, appVersion=${appVersion}`);
    if (FORCE_SECURE_COOKIES) {
        log('WARNING: FORCE_SECURE_COOKIES=true — plain HTTP logins (http://LAN-IP:2121) will fail until this is set to false.');
    }

    await migrateConfigFiles((message) => log(`[config] ${message}`));
    if (await secureConfigAtRest()) log('[config] Migrated stored credentials to encrypted values.');
    const migratedBackups = await secureStoredBackups();
    if (migratedBackups > 0) log(`[config] Encrypted ${migratedBackups} legacy backup file(s).`);

    // Ensure unique CLIENT_ID per installation to avoid Plex Auth blocking
    let config = await loadFile(CONFIG_PATH, {});
    await syncAdminPlexIdFromConfigToken(config, { persist: true });
    if (!config.clientId || config.clientId.startsWith('smp-')) {
        config.clientId = randomUUID();
        await saveFile(CONFIG_PATH, config);
    }
    if (!process.env.CLIENT_ID) {
        CLIENT_ID = config.clientId;
    }

    await statusRuntime.loadStatusState();
    statusRuntime.runMonitorCycle();
    setInterval(statusRuntime.runMonitorCycle, 15000);
    monitorConcurrentSessions();
    setInterval(monitorConcurrentSessions, 15000);
    startBackgroundService();
    startPlexStatsBackgroundTask(); // start 24-hour library size cache task
    await plexDashboardService.start();
    mediaStackRoutes.startCacheWarmer();
    requestAppService.startCacheWarmer(() => loadFile(CONFIG_PATH, {}));

    // Background cache builders: reuse on-disk cache and schedule next run by interval.
    startTrendingStatsBackgroundTask();
    startAnalyticsStatsBackgroundTask();
    void startPersonalAnalyticsCacheWarmer().catch((error) => log(`[PersonalAnalyticsCache] Startup failed: ${error.message}`));
    systemJobs.maintenanceIndex.nextRun = new Date(Date.now() + (20 * 1000)).toISOString();
    setTimeout(async () => {
        try {
            await buildMaintenanceMediaIndex({ actor: { username: 'System', email: 'system@local' }, force: false });
        } catch (e) {
            log(`Initial maintenance index build failed: ${e.message}`);
        }
    }, 20000);
    setInterval(async () => {
        systemJobs.maintenanceIndex.nextRun = new Date(Date.now() + (6 * 60 * 60 * 1000)).toISOString();
        try {
            await buildMaintenanceMediaIndex({ actor: { username: 'System', email: 'system@local' }, force: false });
        } catch (e) {
            log(`Scheduled maintenance index build failed: ${e.message}`);
        }
    }, 6 * 60 * 60 * 1000);

    const backupConfig = await loadFile(CONFIG_PATH, {});
    systemJobs.autoBackup.nextRun = backupConfig.autoBackupEnabled ? computeNextBackupRun(backupConfig) : null;
    // Check every hour whether an auto backup is due.
    setInterval(async () => {
        const cfg = await loadFile(CONFIG_PATH, {});
        if (!cfg.autoBackupEnabled) {
            systemJobs.autoBackup.nextRun = null;
            return;
        }
        const nextRunTs = Date.parse(computeNextBackupRun(cfg));
        systemJobs.autoBackup.nextRun = new Date(nextRunTs).toISOString();
        if (Date.now() >= nextRunTs) {
            await runAutoBackupCycle('scheduled');
        }
    }, 60 * 60 * 1000);
};

app.listen(PORT, BIND_HOST, async (error) => {
    if (error) {
        log(`Failed to bind server on ${BIND_HOST}:${PORT}: ${error.message}`);
        process.exit(1);
    }
    try {
        await startPortalService();
    } catch (e) {
        log(`Startup failed: ${e.message}`);
        process.exit(1);
    }
});
