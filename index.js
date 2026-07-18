

import express from 'express';
import { randomUUID } from 'crypto';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import compression from 'compression';
import { createBasePathHelpers, deriveBasePath } from './lib/http/base-path.js';
import { resolveAppVersion } from './lib/core/app-version.js';
import { findLocalUserForSession } from './lib/users/session-user.js';
import { createPlexApiFetch } from './lib/plex/plex-api-fetch.js';
import { createPlexSessionsSnapshot } from './lib/plex/plex-sessions-snapshot.js';
import { createJellyfinHttp } from './lib/jellyfin/jellyfin-http.js';
import { createSessionCookies } from './lib/auth/session-cookies.js';
import { createAdminIdentity, isJellyfinConfigured, isPortalConfigured } from './lib/auth/admin-identity.js';
import { createSessionMiddleware } from './lib/auth/session-middleware.js';
import { createConfigFileAccess } from './lib/config/config-store.js';
import { createBroadcastService } from './lib/comms/broadcast-service.js';
import { createLruCache, createTtlCache } from './lib/cache/cache.js';
import { addDays, getDaysUntilExpiry } from './lib/core/date-utils.js';
import { createDeletedUserRegistry, isDeletedUser } from './lib/users/deleted-users.js';
import { createEmailService } from './lib/comms/email-service.js';
import { createMemberNotifications } from './lib/users/member-notifications.js';
import { createMediaUserService } from './lib/users/media-user-service.js';
import { createNewsletterService } from './lib/comms/newsletter-service.js';
import { escapeHtmlAttr } from './lib/http/html-shell.js';
import { createSecurityHeadersMiddleware, secureTokenEquals } from './lib/http/http-security.js';
import { createSerialJobQueue } from './lib/admin/job-queue.js';
import { loadFile as loadJsonFile, saveFile as saveJsonFile } from './lib/core/json-file-store.js';
import { createConfigSecretProtector } from './lib/config/config-secrets.js';
import { normalizeArrConfig } from './lib/media-stack/arr-instances.js';
import { isLoopbackAddress, normalizeExternalBaseUrl, resolveIntegrationUrlForFetch } from './lib/http/network-policy.js';
import { enrichRecentItemsWithMediaTags } from './lib/plex/plex-media-tags.js';
import { createPlexStatsService } from './lib/plex/plex-stats-service.js';
import { createPlexDashboardService } from './lib/plex/plex-dashboard-service.js';
import { createPlexImageService } from './lib/plex/plex-image-service.js';
import { createPlexConnectionService } from './lib/plex/plex-connection-service.js';
import { createRequireMember, registerAuthRoutes } from './lib/auth/auth-routes.js';
import { createJellyfinAdminResolver } from './lib/auth/auth-jellyfin-routes.js';
import { registerInviteRoutes } from './lib/users/invite-routes.js';
import { registerAdminRoutes } from './lib/admin/admin-routes.js';
import { registerConfigRoutes } from './lib/config/config-routes.js';
import { createAdminProfileService } from './lib/auth/admin-profile-service.js';
import { registerPublicStatusRoutes } from './lib/status/public-status-routes.js';
import { registerPlexRoutes } from './lib/plex/plex-routes.js';
import { registerJellyfinRoutes } from './lib/jellyfin/jellyfin-routes.js';
import { registerMediaStackRoutes } from './lib/media-stack/media-stack-routes.js';
import { createRequestAppService } from './lib/request-app/request-app-service.js';
import { createTvdbService } from './lib/request-app/tvdb-service.js';
import { createMetadataHealthProbe } from './lib/request-app/metadata-health.js';
import { registerRequestAppRoutes } from './lib/request-app/request-app-routes.js';
import { registerMediaIssueRoutes } from './lib/media-stack/media-issue-routes.js';
import { registerStaticShellRoutes } from './lib/http/static-shell-routes.js';
import { createBackgroundService } from './lib/admin/background-service.js';
import { registerCommunicationRoutes } from './lib/comms/communication-routes.js';
import { registerKillRuleRoutes } from './lib/admin/kill-rule-routes.js';
import { createAnalyticsService } from './lib/analytics/analytics-service.js';
import { createRateLimiter } from './lib/http/rate-limit.js';
import { createAuditLogger } from './lib/admin/audit-log.js';
import { createStatusRuntime } from './lib/status/status-runtime.js';
import { createStreamMonitor } from './lib/status/stream-monitor.js';
import { computeNextBackupRun, findRunnableTask, getTasksSnapshot, markTaskEnd, markTaskStart, systemJobs, tasksInfo } from './lib/admin/task-state.js';

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

let CLIENT_ID = process.env.CLIENT_ID || 'plex-expiry-manager-client-id'; // Now dynamically generated if missing

app.use(createSecurityHeadersMiddleware({ forceHsts: FORCE_SECURE_COOKIES }));

const authRateLimit = createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 10 });
const authCallbackRateLimit = createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 40 });
const jellyfinQuickConnectPollRateLimit = createRateLimiter({ windowMs: 5 * 60 * 1000, maxRequests: 140 });
const publicReadRateLimit = createRateLimiter({ windowMs: 60 * 1000, maxRequests: 120 });
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

const { clearSessionCookie, setSessionCookie } = createSessionCookies({
    basePath: BASE_PATH,
    forceSecureCookies: FORCE_SECURE_COOKIES,
});

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
    ANALYTICS_HISTORY_CACHE_PATH,
    PERSONAL_ANALYTICS_CACHE_PATH,
    KILL_RULES_PATH,
    PLEX_STATS_CACHE_PATH,
    PLEX_DASHBOARD_CACHE_PATH,
    MEDIA_ISSUES_PATH,
    migrateConfigFiles,
} from './lib/config/data-paths.js';
import { createBackupService } from './lib/admin/backup.js';
import { DEFAULT_DASHBOARD_LAYOUT, normalizeSectionLayout } from './lib/config/dashboard-layout.js';

const { loadFile, saveFile, secureConfigAtRest } = createConfigFileAccess({
    configPath: CONFIG_PATH,
    loadJsonFile,
    saveJsonFile,
    configSecretProtector,
    normalizeArrConfig,
});

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

const { sendEmail, sendMemberNotice, checkAndSendNotifications, sendExpiryEmail, sendAdjustmentEmail } = createEmailService({
    usersPath: USERS_PATH,
    emailLogPath: EMAIL_LOG_PATH,
    loadFile,
    saveFile,
    appendAuditLog,
    getDaysUntilExpiry,
    escapeHtmlAttr,
    log,
});
const memberNotifications = createMemberNotifications({
    usersPath: USERS_PATH,
    loadFile,
    sendMemberNotice,
    escapeHtmlAttr,
    log,
});
const backgroundExtras = {
    checkWatchlistAvailability: memberNotifications.checkWatchlistAvailability,
    requestAppService: null,
};
const { startBroadcast, sendTestBroadcast } = createBroadcastService({
    configPath: CONFIG_PATH,
    usersPath: USERS_PATH,
    loadFile,
    sendEmail,
    log,
});


const apiFetch = createPlexApiFetch(() => CLIENT_ID);
const { jellyfinHeaders, jellyfinItemUrl } = createJellyfinHttp({
    getClientId: () => CLIENT_ID,
    appVersion,
});

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

const resolveJellyfinAdmin = createJellyfinAdminResolver({
    fetchImpl: fetchWithTimeout,
    resolveIntegrationUrlForFetch,
    jellyfinHeaders,
    log,
});

const {
    syncAdminPlexIdFromConfigToken,
    getAdminId,
    resolveCurrentAdmin,
} = createAdminIdentity({
    apiFetch,
    secretMask: SECRET_MASK,
    loadFile,
    saveFile,
    configPath: CONFIG_PATH,
    resolveJellyfinAdmin,
    log,
});

const { requireAuth, requireAdmin, getSessionUser } = createSessionMiddleware({
    jwt,
    jwtSecret: JWT_SECRET,
    loadFile,
    configPath: CONFIG_PATH,
    resolveCurrentAdmin,
});

const requireMember = createRequireMember({
    configPath: CONFIG_PATH,
    usersPath: USERS_PATH,
    deletedUsersPath: DELETED_USERS_PATH,
    loadFile,
    resolveCurrentAdmin,
    findLocalUserForSession,
    appendAuditLog,
    clearSessionCookie,
});

const plexSessionsSnapshot = createPlexSessionsSnapshot({
    fetchImpl: (...args) => fetchWithTimeout(...args),
});

// Filled after requestAppService is created — keeps membership sync out of the Plex/Jellyfin hot path.
const membershipSync = {
    ensure: async () => ({ ok: false, reason: 'not_ready' }),
    ensureActive: async () => ({ ok: false, reason: 'not_ready' }),
    remove: async () => ({ ok: false, reason: 'not_ready' }),
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
    membershipSync,
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
    membershipSync,
    fetchImpl: fetchWithTimeout,
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
    reconcileStatusConfig: () => statusRuntime.reconcileStatusConfig(),
    computeNextBackupRun,
    systemJobs,
    startBackgroundService: () => startBackgroundService(),
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

const plexImageService = createPlexImageService({ fetchWithTimeout });

const plexDashboardService = createPlexDashboardService({
    configPath: CONFIG_PATH,
    cachePath: PLEX_DASHBOARD_CACHE_PATH,
    loadFile,
    saveFile,
    getPlexConnectionUri,
    plexImageService,
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
    plexSessionsSnapshot,
    plexImageService,
    plexDashboardService,
    plexStatsService,
    loadPlexStatsFromDisk,
    buildPlexStatsCache,
    withBasePath,
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
    membershipSync,
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
    calculateAnalyticsStats: (...args) => calculateAnalyticsStats(...args),
    calculateTrendingStats: (...args) => calculateTrendingStats(...args),
    buildPlexStatsCache,
    runAutoBackupCycle: (...args) => runAutoBackupCycle(...args),
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
    membershipSync,
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
    analyticsHistoryCachePath: ANALYTICS_HISTORY_CACHE_PATH,
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
    loadFile,
    saveFile,
    fetch,
    getPlexConnectionUri,
    syncUsers,
    checkAndSendNotifications,
    checkAndRevoke,
    checkAndSendNewsletter,
    backgroundExtras,
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
backgroundExtras.requestAppService = requestAppService;
membershipSync.ensure = (user, config) => requestAppService.ensureRequestAppUser(config, user);
membershipSync.ensureActive = (users, config) => requestAppService.ensureRequestAppUsers(config, users);
membershipSync.remove = (user, config) => requestAppService.removeRequestAppUser(config, user);

registerRequestAppRoutes({
    app,
    requireAuth,
    requireMember,
    requireAdmin,
    configPath: CONFIG_PATH,
    loadFile,
    requestAppService,
    appendAuditLog,
    notifyRequestUpdate: memberNotifications.notifyRequestUpdate,
    log,
});

registerMediaIssueRoutes({
    app,
    requireAuth,
    requireMember,
    requireAdmin,
    configPath: CONFIG_PATH,
    issuePath: MEDIA_ISSUES_PATH,
    loadFile,
    saveFile,
    requestAppService,
    fetch,
    resolveIntegrationUrlForFetch,
    getPlexConnectionUri,
    appendAuditLog,
    notifyIssueReply: memberNotifications.notifyIssueReply,
    log,
});

const { monitorConcurrentSessions } = createStreamMonitor({
    configPath: CONFIG_PATH,
    killRulesPath: KILL_RULES_PATH,
    plexStatsCachePath: PLEX_STATS_CACHE_PATH,
    loadFile,
    saveFile,
    getPlexConnectionUri,
    fetchWithTimeout,
    plexSessionsSnapshot,
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

const preparePortalStorage = async () => {
    await migrateConfigFiles((message) => log(`[config] ${message}`));
    if (await secureConfigAtRest()) log('[config] Migrated stored credentials to encrypted values.');
    const migratedBackups = await secureStoredBackups();
    if (migratedBackups > 0) log(`[config] Encrypted ${migratedBackups} legacy backup file(s).`);
};

const startPortalService = async () => {
    log(`--- Server Manager Portal Service starting on http://${BIND_HOST}:${PORT} ---`);
    log(`Runtime: CONFIG_DIR=${CONFIG_DIR}, FORCE_SECURE_COOKIES=${FORCE_SECURE_COOKIES}, BASE_PATH=${BASE_PATH || '/'}, appVersion=${appVersion}`);
    if (FORCE_SECURE_COOKIES) {
        log('WARNING: FORCE_SECURE_COOKIES=true — plain HTTP logins (http://LAN-IP:2121) will fail until this is set to false.');
    }

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

const startServer = async () => {
    try {
        await preparePortalStorage();
        app.listen(PORT, BIND_HOST, async (error) => {
            if (error) {
                log(`Failed to bind server on ${BIND_HOST}:${PORT}: ${error.message}`);
                process.exit(1);
            }
            try {
                await startPortalService();
            } catch (startupError) {
                log(`Startup failed: ${startupError.message}`);
                process.exit(1);
            }
        });
    } catch (e) {
        log(`Storage preparation failed: ${e.message}`);
        process.exit(1);
    }
};

void startServer();
