

import express from 'express';
import fs from 'fs/promises';
import path from 'path';
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
import { escapeHtmlAttr, injectBasePathHtml } from './lib/html-shell.js';
import { loadFile, saveFile } from './lib/json-file-store.js';
import { isBlockedHostName, isLoopbackAddress, normalizeExternalBaseUrl, resolveIntegrationUrlForFetch } from './lib/network-policy.js';
import { enrichRecentItemsWithMediaTags, extractMediaDisplayTags } from './lib/plex-media-tags.js';
import { createPlexStatsService } from './lib/plex-stats-service.js';
import { createPlexConnectionService } from './lib/plex-connection-service.js';
import { registerAuthRoutes } from './lib/auth-routes.js';
import { registerInviteRoutes } from './lib/invite-routes.js';
import { registerAdminRoutes } from './lib/admin-routes.js';
import { registerConfigRoutes } from './lib/config-routes.js';
import { createAdminProfileService } from './lib/admin-profile-service.js';
import { registerPublicStatusRoutes } from './lib/public-status-routes.js';
import { createAnalyticsService } from './lib/analytics-service.js';
import { createRateLimiter } from './lib/rate-limit.js';
import { setStaticAssetCacheHeaders } from './lib/static-assets.js';
import { createAuditLogger } from './lib/audit-log.js';
import { createStatusRuntime } from './lib/status-runtime.js';
import { createStreamMonitor, validateKillRulesSchema } from './lib/stream-monitor.js';
import { computeNextBackupRun, findRunnableTask, getTasksSnapshot, markTaskEnd, markTaskStart, systemJobs, tasksInfo } from './lib/task-state.js';
import { SPEED_TEST_BUFFER, SPEED_TEST_CHUNK_SIZE } from './lib/status-monitor.js';

let appVersion = 'v1.0.0';
try {
    appVersion = fsSync.readFileSync('version.txt', 'utf8').trim();
} catch (e) {
    try {
        const gitHash = execSync('git rev-parse --short HEAD', { stdio: 'pipe' }).toString().trim();
        appVersion = `v1.0.0-${gitHash}`;
    } catch (err) { }
}

const app = express();
app.use(compression());
const PORT = parseInt(process.env.PORT || '2121', 10);
const BIND_HOST = process.env.BIND_HOST || '0.0.0.0';
const SETUP_TOKEN = process.env.SETUP_TOKEN || '';
const ALLOW_PRIVATE_INTEGRATION_URLS = String(process.env.ALLOW_PRIVATE_INTEGRATION_URLS || '').toLowerCase() === 'true';
const FORCE_SECURE_COOKIES = String(process.env.FORCE_SECURE_COOKIES || '').toLowerCase() === 'true';
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || '';

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

let CLIENT_ID = process.env.CLIENT_ID || 'plex-expiry-manager-client-id'; // Now dynamically generated if missing

// --- Security: HTTP Security Headers ---
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'");
    if (req.secure || FORCE_SECURE_COOKIES) {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    if (req.path.startsWith('/api/')) {
        res.setHeader('Cache-Control', 'no-store, private');
        res.setHeader('Pragma', 'no-cache');
    }
    next();
});

const authRateLimit = createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 10 });
const authCallbackRateLimit = createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 40 });
const jellyfinQuickConnectPollRateLimit = createRateLimiter({ windowMs: 5 * 60 * 1000, maxRequests: 140 });
const publicReadRateLimit = createRateLimiter({ windowMs: 60 * 1000, maxRequests: 120 });
const speedtestRateLimit = createRateLimiter({ windowMs: 60 * 1000, maxRequests: 12 });
const setupRateLimit = createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 30 });

const hasValidSetupToken = (req) => {
    if (!SETUP_TOKEN) return false;
    const provided = req.headers['x-setup-token'] || req.body?.setupToken || req.query?.setupToken;
    return typeof provided === 'string' && provided === SETUP_TOKEN;
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

const setSessionCookie = (req, res, token) => {
    res.cookie('session', token, {
        ...sessionCookieBase(),
        maxAge: 7 * 24 * 60 * 60 * 1000,
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
    KILL_RULES_PATH,
    MAINTENANCE_RULES_PATH,
    MAINTENANCE_MEDIA_INDEX_PATH,
    MAINTENANCE_RUNS_PATH,
    MAINTENANCE_REQUEST_INDEX_PATH,
    MAINTENANCE_PREFS_PATH,
    PLEX_STATS_CACHE_PATH,
    migrateConfigFiles,
} from './lib/data-paths.js';
import { createBackupService } from './lib/backup.js';
import { DEFAULT_DASHBOARD_LAYOUT, normalizeSectionLayout } from './lib/dashboard-layout.js';
const PLEX_API = 'https://plex.tv/api';

// --- Helper Functions ---
const log = (message) => console.log(`[${new Date().toISOString()}] ${message}`);

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

app.post('/api/users/broadcast', requireAdmin, async (req, res) => {
    const { subject, body, recipientFilter, selectedUserIds } = req.body;
    if (!subject || !body) return res.status(400).json({ error: 'Subject and body are required.' });

    try {
        const result = await startBroadcast({ subject, body, recipientFilter, selectedUserIds });
        res.json({ message: `Broadcast started for ${result.count} users.`, count: result.count });
    } catch (error) {
        log(`Error sending broadcast: ${error.message}`);
        res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Failed to initiate broadcast' });
    }
});

app.post('/api/users/broadcast/test', requireAdmin, async (req, res) => {
    const { subject, body } = req.body;
    if (!subject || !body) return res.status(400).json({ error: 'Subject and body are required.' });

    try {
        await sendTestBroadcast({ subject, body, adminEmail: req.user.email });
        res.json({ message: `Test email sent successfully to ${req.user.email}` });
    } catch (error) {
        log(`Error sending test broadcast: ${error.message}`);
        res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : `Failed to send test broadcast: ${error.message}` });
    }
});

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
    syncAdminPlexIdFromConfigToken,
    invalidatePlexConnectionCaches,
    invalidateAdminProfileCache,
    invalidateArrCatalogCache: () => invalidateArrCatalogCache(),
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

app.get('/api/plex/image', requireAuth, requireMember, async (req, res) => {
    const { path: thumbPath, width, height } = req.query;
    if (!thumbPath) return res.status(400).send('path required');
    // Security: only allow relative Plex paths — block protocol-relative and absolute URLs
    if (!thumbPath.startsWith('/') || thumbPath.includes('://')) {
        return res.status(400).send('Invalid path');
    }
    try {
        const config = await loadFile(CONFIG_PATH, {});
        const uri = await getPlexConnectionUri(config);

        let url;
        if (width && height) {
            url = `${uri}/photo/:/transcode?url=${encodeURIComponent(thumbPath)}&width=${encodeURIComponent(width)}&height=${encodeURIComponent(height)}&minSize=1&X-Plex-Token=${config.plexToken}`;
        } else {
            url = `${uri}${thumbPath}?X-Plex-Token=${config.plexToken}`;
        }

        const response = await fetchWithTimeout(url, {}, 15000);
        if (!response.ok) throw new Error('fetch failed');
        const buffer = Buffer.from(await response.arrayBuffer());
        res.setHeader('Content-Type', response.headers.get('content-type') || 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.send(buffer);
    } catch (e) {
        res.status(500).send('');
    }
});

const plexStatsService = createPlexStatsService({
    configPath: CONFIG_PATH,
    plexStatsCachePath: PLEX_STATS_CACHE_PATH,
    loadFile,
    getPlexConnectionUri,
    markTaskStart,
    markTaskEnd,
    systemJobs,
    log,
});
const { loadPlexStatsFromDisk, buildPlexStatsCache, startPlexStatsBackgroundTask } = plexStatsService;

// ── API endpoint — read-only, never triggers a Plex fetch ──
app.get('/api/plex/stats', requireAuth, requireMember, async (req, res) => {
    const cachedStats = plexStatsService.getCachedPlexStats();
    if (cachedStats) {
        return res.json(cachedStats);
    }
    // Cache not ready yet — try disk one more time
    const disk = await loadPlexStatsFromDisk();
    if (disk) return res.json(disk);
    // Still nothing — build is running in background
    return res.json({
        movies: 0, shows: 0, music: 0,
        moviesBytes: 0, showsBytes: 0, musicBytes: 0,
        isBuilding: true
    });
});

// Admin-only: manually trigger a library size rebuild
app.post('/api/plex/stats/rebuild', requireAdmin, async (req, res) => {
    if (plexStatsService.isPlexStatsBuilding()) {
        return res.json({ status: 'already_running', message: 'A rebuild is already in progress.' });
    }
    // Fire async — don't block the response
    buildPlexStatsCache();
    return res.json({ status: 'started', message: 'Library size rebuild started in the background.' });
});

// Admin-only: get the current build status and last generated timestamp
app.get('/api/plex/stats/status', requireAdmin, async (req, res) => {
    const stats = plexStatsService.getCachedPlexStats() || await loadPlexStatsFromDisk();
    return res.json({
        isBuilding: plexStatsService.isPlexStatsBuilding(),
        lastGeneratedAt: stats?.generatedAt || null,
        hasCache: !!stats
    });
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

app.post('/api/newsletter/test', requireAdmin, async (req, res) => {
    try {
        const config = await loadFile(CONFIG_PATH, {});
        await sendTestNewsletter(config);
        res.json({ success: true });
    } catch (e) {
        log(`Newsletter test error: ${e.message}`);
        res.status(e.statusCode || 500).json({ error: e.message });
    }
});

app.post('/api/newsletter/send-now', requireAdmin, async (req, res) => {
    try {
        const config = await loadFile(CONFIG_PATH, {});
        const users = await loadFile(USERS_PATH, []);
        const validUsers = users.filter(u => u.email);
        if (validUsers.length === 0) return res.status(400).json({ error: 'No users with email addresses found.' });
        res.json({ success: true, message: `Sending to ${validUsers.length} users...` });
        await sendManualNewsletter(config);
    } catch (e) {
        log(`Newsletter send-now error: ${e.message}`);
        if (!res.headersSent) res.status(e.statusCode || 500).json({ error: e.message });
    }
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
    loadFile,
    saveFile,
    normalizePlexToken,
    isPortalConfigured,
    resolveCurrentAdmin,
    fetchOwnedPlexServers,
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
    writeBackupToFolder,
    backupDir: BACKUP_DIR,
} = createBackupService({ loadFile, saveFile });

registerAdminRoutes({
    app,
    requireAdmin,
    requireAuth,
    requireMember,
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
    isMaintenanceExperimentalEnabled,
    executeMaintenanceRunBatch,
    calculateAnalyticsStats,
    calculateTrendingStats,
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

// --- Plex Dashboard & Image Proxy ---

app.get('/api/plex/libraries', requireAdmin, async (req, res) => {
    try {
        const config = await loadFile(CONFIG_PATH, null);
        if (!config || !config.plexToken || !config.serverIdentifier) {
            return res.status(503).json({ error: 'Plex not configured' });
        }
        const uri = await getPlexConnectionUri(config);
        if (!uri) return res.status(503).json({ error: 'Cannot connect to Plex' });

        const sectionsRes = await fetchWithTimeout(`${uri}/library/sections?X-Plex-Token=${config.plexToken}`, { headers: { 'Accept': 'application/json' } }, 15000).then(r => r.json()).catch(() => null);

        let libraries = [];
        if (sectionsRes && sectionsRes.MediaContainer && sectionsRes.MediaContainer.Directory) {
            libraries = sectionsRes.MediaContainer.Directory.map(s => ({
                id: s.key,
                title: s.title,
                type: s.type
            }));
        }
        res.json(libraries);
    } catch (e) {
        log(`Error fetching Plex libraries: ${e.message}`);
        res.status(500).json({ error: 'Failed to fetch libraries' });
    }
});

// Note: Duplicate route /api/plex/image handler removed. The primary handler is defined above.

app.get('/api/plex/dashboard', requireAuth, requireMember, async (req, res) => {
    try {
        const config = await loadFile(CONFIG_PATH, null);
        if (!config || !config.plexToken || !config.serverIdentifier) {
            return res.status(503).json({ error: 'Plex not configured' });
        }

        const uri = await getPlexConnectionUri(config);
        if (!uri) return res.status(503).json({ error: 'Cannot connect to Plex' });

        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 250);

        const cacheKey = `plex_dashboard_data_${limit}`;
        const cachedData = await withCache(cacheKey, 800, async () => {
            const sessionsPromise = fetch(`${uri}/status/sessions?X-Plex-Token=${config.plexToken}`, { headers: { 'Accept': 'application/json' } }).then(r => r.json()).catch(() => null);
            const sectionsPromise = fetch(`${uri}/library/sections?X-Plex-Token=${config.plexToken}`, { headers: { 'Accept': 'application/json' } }).then(r => r.json()).catch(() => null);
            const [sessionsData, sectionsData] = await Promise.all([sessionsPromise, sectionsPromise]);
            return { sessionsData, sectionsData };
        });
        const { sessionsData, sectionsData } = cachedData;

        let activeSessions = [];
        if (sessionsData && sessionsData.MediaContainer && sessionsData.MediaContainer.Metadata) {
            activeSessions = sessionsData.MediaContainer.Metadata.map(m => {
                const isTranscoding = m.TranscodeSession || (m.Media && m.Media[0] && m.Media[0].Part && m.Media[0].Part[0] && m.Media[0].Part[0].Stream && m.Media[0].Part[0].Stream.some(s => s.decision === 'transcode'));
                const player = m.Player || {};
                const session = m.Session || {};
                const duration = m.duration || 0;
                const viewOffset = m.viewOffset || 0;
                const progress = duration > 0 ? (viewOffset / duration) * 100 : 0;
                const plexUrl = `https://app.plex.tv/desktop/#!/server/${config.serverIdentifier}/details?key=${encodeURIComponent(m.key)}`;

                const hideConfig = config.hideStreamUsers === true ? 'anonymous' : (config.hideStreamUsers || 'false');
                const isHidden = !req.user.isAdmin && (hideConfig === 'anonymous' || hideConfig === 'hidden');

                return {
                    sessionId: session.id || m.sessionKey,
                    title: m.title,
                    type: m.type,
                    grandparentTitle: m.grandparentTitle,
                    year: m.year,
                    thumb: m.grandparentThumb || m.parentThumb || m.thumb,
                    user: (isHidden && hideConfig === 'hidden') ? null : (isHidden ? 'Anonymous' : (m.User ? m.User.title : 'Unknown User')),
                    userThumb: isHidden ? null : (m.User ? m.User.thumb : null),
                    playerProduct: player.product || 'Unknown Device',
                    playerTitle: player.title || 'Unknown Player',
                    playerAddress: player.address || 'Unknown IP',
                    sessionLocation: session.location || 'Unknown',
                    state: player.state || 'playing',
                    isTranscoding: !!isTranscoding,
                    videoCodec: m.Media && m.Media[0] ? m.Media[0].videoCodec : null,
                    audioCodec: m.Media && m.Media[0] ? m.Media[0].audioCodec : null,
                    audioChannels: m.Media && m.Media[0] ? m.Media[0].audioChannels : null,
                    container: m.Media && m.Media[0] ? m.Media[0].container : null,
                    videoProfile: m.Media && m.Media[0] ? m.Media[0].videoProfile : null,
                    transcodeVideoDecision: m.TranscodeSession ? m.TranscodeSession.videoDecision : null,
                    transcodeAudioDecision: m.TranscodeSession ? m.TranscodeSession.audioDecision : null,
                    resolution: (m.Media && m.Media[0] && m.Media[0].videoResolution) ? m.Media[0].videoResolution : null,
                    season: m.parentIndex,
                    episode: m.index,
                    progress: progress,
                    timeRemaining: Math.max(0, duration - viewOffset),
                    bandwidth: (session && session.bandwidth) || (m.Media && m.Media[0] && m.Media[0].bitrate) || 0,
                    plexUrl: plexUrl
                };
            });
        }

        let recentMovies = [];
        let recentShows = [];
        let recentMusic = [];

        if (sectionsData && sectionsData.MediaContainer && sectionsData.MediaContainer.Directory) {
            const sections = sectionsData.MediaContainer.Directory;
            const sectionPromises = sections.map(section =>
                fetch(`${uri}/library/sections/${section.key}/recentlyAdded?X-Plex-Token=${config.plexToken}&X-Plex-Container-Start=0&X-Plex-Container-Size=${limit}`, { headers: { 'Accept': 'application/json' } })
                    .then(r => r.json())
                    .then(data => ({ sectionType: section.type, data }))
                    .catch(() => ({ sectionType: section.type, data: null }))
            );

            const results = await Promise.all(sectionPromises);

            results.forEach(({ sectionType, data }) => {
                if (data && data.MediaContainer && data.MediaContainer.Metadata) {
                    data.MediaContainer.Metadata.forEach(m => {
                        const ratingKey = String(m.grandparentRatingKey || m.parentRatingKey || m.ratingKey || '');
                        const isMusic = sectionType === 'artist';
                        const item = {
                            ratingKey,
                            sourceRatingKey: String(m.ratingKey || ''),
                            title: isMusic ? (m.title || m.parentTitle || m.grandparentTitle) : (m.grandparentTitle || m.parentTitle || m.title),
                            parentTitle: isMusic ? (m.parentTitle || m.grandparentTitle || null) : undefined,
                            type: m.type,
                            year: m.year,
                            thumb: m.grandparentThumb || m.parentThumb || m.thumb,
                            addedAt: m.addedAt,
                            tags: extractMediaDisplayTags(m),
                            plexUrl: `https://app.plex.tv/desktop/#!/server/${config.serverIdentifier}/details?key=${encodeURIComponent(m.key)}`
                        };

                        if (sectionType === 'movie') recentMovies.push(item);
                        else if (sectionType === 'show') recentShows.push(item);
                        else if (sectionType === 'artist') recentMusic.push(item);
                    });
                }
            });

            const processList = (list) => {
                const unique = [];
                const seen = new Set();
                list.sort((a, b) => b.addedAt - a.addedAt);
                for (const item of list) {
                    const dedupeKey = item.ratingKey || item.title;
                    if (!seen.has(dedupeKey)) {
                        seen.add(dedupeKey);
                        unique.push(item);
                        if (unique.length >= limit) break;
                    }
                }
                return unique;
            };

            recentMovies = processList(recentMovies);
            recentShows = processList(recentShows);
            recentMusic = processList(recentMusic);

            [recentMovies, recentShows] = await Promise.all([
                enrichRecentItemsWithMediaTags(uri, config, recentMovies),
                enrichRecentItemsWithMediaTags(uri, config, recentShows)
            ]);
        }

        res.json({ activeSessions, recentMovies, recentShows, recentMusic });
    } catch (e) {
        log(`Error fetching Plex dashboard: ${e.message}`);
        res.status(500).json({ error: 'Failed to fetch dashboard data' });
    }
});

const jellyfinItemUrl = (config, itemId) => {
    const baseUrl = String(config?.jellyfinUrl || '').replace(/\/+$/, '');
    return baseUrl && itemId ? `${baseUrl}/web/#/details?id=${encodeURIComponent(itemId)}` : baseUrl;
};

const mapJellyfinItemForDiscover = (config, item = {}, type = '') => {
    const id = item.Id || '';
    const posterId = type === 'episode' && item.SeriesId ? item.SeriesId : id;
    const title = type === 'episode'
        ? (item.SeriesName ? `${item.SeriesName} - ${item.Name}` : item.Name)
        : (item.Name || 'Untitled');
    const tags = [];
    const width = Number(item.Width || item.MediaStreams?.find?.((s) => s.Type === 'Video')?.Width || 0);
    const height = Number(item.Height || item.MediaStreams?.find?.((s) => s.Type === 'Video')?.Height || 0);
    if (width >= 3800 || height >= 2000) tags.push('4K');
    else if (height >= 1000) tags.push('1080p');
    else if (height >= 700) tags.push('720p');
    const videoCodec = item.MediaStreams?.find?.((s) => s.Type === 'Video')?.Codec || item.MediaSources?.[0]?.VideoCodec;
    if (videoCodec) tags.push(String(videoCodec).toUpperCase());

    return {
        ratingKey: id,
        sourceRatingKey: id,
        title,
        parentTitle: item.Album || item.SeriesName || null,
        type: item.Type,
        year: item.ProductionYear,
        thumb: posterId,
        thumbUrl: posterId ? withBasePath(`/api/jellyfin/image?itemId=${encodeURIComponent(posterId)}&width=300&height=${type === 'music' ? 300 : 450}`) : '',
        addedAt: item.DateCreated ? Date.parse(item.DateCreated) / 1000 : 0,
        tags: [...new Set(tags)].slice(0, 4),
        plexUrl: jellyfinItemUrl(config, id),
    };
};

const fetchJellyfinItems = async (config, includeItemTypes, limit) => {
    const baseUrl = resolveIntegrationUrlForFetch(config.jellyfinUrl);
    const params = new URLSearchParams({
        Recursive: 'true',
        IncludeItemTypes: includeItemTypes,
        SortBy: 'DateCreated',
        SortOrder: 'Descending',
        Limit: String(limit),
        Fields: 'DateCreated,PrimaryImageAspectRatio,ProductionYear,SeriesName,Album,MediaSources,MediaStreams',
        ImageTypeLimit: '1',
        EnableImageTypes: 'Primary,Thumb,Backdrop',
    });
    const response = await fetchWithTimeout(`${baseUrl}/Items?${params.toString()}`, {
        headers: jellyfinHeaders(config.jellyfinApiKey),
    }, 15000);
    if (!response.ok) throw new Error(`Jellyfin Items returned HTTP ${response.status}`);
    const data = await response.json();
    return Array.isArray(data.Items) ? data.Items : [];
};

app.get('/api/jellyfin/image', requireAuth, requireMember, async (req, res) => {
    const itemId = String(req.query.itemId || '').trim();
    const width = Math.min(Math.max(parseInt(req.query.width, 10) || 300, 64), 1200);
    const height = Math.min(Math.max(parseInt(req.query.height, 10) || 450, 64), 1600);
    if (!itemId || !/^[A-Za-z0-9_-]+$/.test(itemId)) return res.status(400).send('Invalid itemId');
    try {
        const config = await loadFile(CONFIG_PATH, {});
        if (!isJellyfinConfigured(config)) return res.status(503).send('');
        const baseUrl = resolveIntegrationUrlForFetch(config.jellyfinUrl);
        const imageUrl = `${baseUrl}/Items/${encodeURIComponent(itemId)}/Images/Primary?fillWidth=${width}&fillHeight=${height}&quality=90`;
        const response = await fetchWithTimeout(imageUrl, {
            headers: jellyfinHeaders(config.jellyfinApiKey),
        }, 15000);
        if (!response.ok) throw new Error(`image HTTP ${response.status}`);
        const buffer = Buffer.from(await response.arrayBuffer());
        res.setHeader('Content-Type', response.headers.get('content-type') || 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.send(buffer);
    } catch (e) {
        res.status(500).send('');
    }
});

app.get('/api/jellyfin/user-image', requireAuth, requireMember, async (req, res) => {
    const userId = String(req.query.userId || '').trim();
    if (!userId || !/^[A-Za-z0-9_-]+$/.test(userId)) return res.status(400).send('Invalid userId');
    try {
        const config = await loadFile(CONFIG_PATH, {});
        if (!isJellyfinConfigured(config)) return res.status(503).send('');
        const baseUrl = resolveIntegrationUrlForFetch(config.jellyfinUrl);
        const imageUrl = `${baseUrl}/Users/${encodeURIComponent(userId)}/Images/Primary?fillWidth=128&fillHeight=128&quality=90`;
        const response = await fetchWithTimeout(imageUrl, {
            headers: jellyfinHeaders(config.jellyfinApiKey),
        }, 15000);
        if (!response.ok) return res.status(404).send('');
        const buffer = Buffer.from(await response.arrayBuffer());
        res.setHeader('Content-Type', response.headers.get('content-type') || 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.send(buffer);
    } catch (e) {
        res.status(500).send('');
    }
});

const proxyJellyfinBrandingAsset = async (res, paths, fallbackContentType = 'image/png') => {
    const config = await loadFile(CONFIG_PATH, {});
    if (!isJellyfinConfigured(config)) return res.status(503).send('');
    const baseUrl = resolveIntegrationUrlForFetch(config.jellyfinUrl);
    for (const path of paths) {
        const response = await fetchWithTimeout(`${baseUrl}${path}`, {
            headers: jellyfinHeaders(config.jellyfinApiKey, { Accept: 'image/*,*/*;q=0.8' }),
        }, 15000).catch(() => null);
        if (!response || !response.ok) continue;
        const buffer = Buffer.from(await response.arrayBuffer());
        if (!buffer.length) continue;
        res.setHeader('Content-Type', response.headers.get('content-type') || fallbackContentType);
        res.setHeader('Cache-Control', 'public, max-age=3600');
        return res.send(buffer);
    }
    return res.status(404).send('');
};

app.get('/api/jellyfin/branding/splash', publicReadRateLimit, async (req, res) => {
    try {
        await proxyJellyfinBrandingAsset(res, ['/Branding/Splashscreen'], 'image/jpeg');
    } catch (e) {
        res.status(500).send('');
    }
});

app.get('/api/jellyfin/branding/icon', publicReadRateLimit, async (req, res) => {
    try {
        await proxyJellyfinBrandingAsset(res, ['/web/icon-transparent.png', '/web/assets/img/icon-transparent.png', '/web/favicon.ico'], 'image/png');
    } catch (e) {
        res.status(500).send('');
    }
});

app.get('/api/jellyfin/branding/favicon', publicReadRateLimit, async (req, res) => {
    try {
        await proxyJellyfinBrandingAsset(res, ['/web/favicon.ico', '/web/icon-transparent.png', '/web/assets/img/icon-transparent.png'], 'image/x-icon');
    } catch (e) {
        res.status(500).send('');
    }
});

app.get('/api/jellyfin/dashboard', requireAuth, requireMember, async (req, res) => {
    try {
        const config = await loadFile(CONFIG_PATH, {});
        if (!isJellyfinConfigured(config)) {
            return res.status(503).json({ error: 'Jellyfin not configured' });
        }

        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 250);
        const baseUrl = resolveIntegrationUrlForFetch(config.jellyfinUrl);
        const [sessions, movies, episodes, music] = await Promise.all([
            fetchWithTimeout(`${baseUrl}/Sessions`, { headers: jellyfinHeaders(config.jellyfinApiKey) }, 15000).then((r) => r.ok ? r.json() : []).catch(() => []),
            fetchJellyfinItems(config, 'Movie', limit).catch((e) => { log(`Jellyfin movies fetch failed: ${e.message}`); return []; }),
            fetchJellyfinItems(config, 'Episode', limit).catch((e) => { log(`Jellyfin episodes fetch failed: ${e.message}`); return []; }),
            fetchJellyfinItems(config, 'MusicAlbum,Audio', limit).catch((e) => { log(`Jellyfin music fetch failed: ${e.message}`); return []; }),
        ]);

        const hideConfig = config.hideStreamUsers === true ? 'anonymous' : (config.hideStreamUsers || 'false');
        const activeSessions = (Array.isArray(sessions) ? sessions : [])
            .filter((session) => session.NowPlayingItem)
            .map((session) => {
                const item = session.NowPlayingItem || {};
                const playState = session.PlayState || {};
                const runtime = Number(item.RunTimeTicks || 0) / 10000;
                const position = Number(playState.PositionTicks || 0) / 10000;
                const streamBitrate = (Array.isArray(item.MediaStreams) ? item.MediaStreams : [])
                    .filter((stream) => stream.Type === 'Video' || stream.Type === 'Audio')
                    .reduce((total, stream) => total + Number(stream.BitRate || stream.Bitrate || 0), 0);
                const mediaSourceBitrate = (Array.isArray(item.MediaSources) ? item.MediaSources : [])
                    .reduce((max, source) => Math.max(max, Number(source.Bitrate || source.VideoBitrate || 0) + Number(source.AudioBitrate || 0)), 0);
                const reportedBitrate = Number(session.TranscodingInfo?.Bitrate || item.Bitrate || streamBitrate || mediaSourceBitrate || 0);
                const isHidden = !req.user.isAdmin && (hideConfig === 'anonymous' || hideConfig === 'hidden');
                return {
                    sessionId: session.Id,
                    title: item.Name,
                    type: item.Type,
                    grandparentTitle: item.SeriesName || item.Album || null,
                    year: item.ProductionYear,
                    thumb: item.Id,
                    thumbUrl: item.Id ? withBasePath(`/api/jellyfin/image?itemId=${encodeURIComponent(item.Id)}&width=300&height=450`) : '',
                    user: (isHidden && hideConfig === 'hidden') ? null : (isHidden ? 'Anonymous' : (session.UserName || 'Unknown User')),
                    userThumb: (!isHidden && session.UserId) ? withBasePath(`/api/jellyfin/user-image?userId=${encodeURIComponent(session.UserId)}`) : null,
                    playerProduct: session.Client || 'Jellyfin',
                    playerTitle: session.DeviceName || session.Client || 'Jellyfin Player',
                    playerAddress: session.RemoteEndPoint || 'Unknown IP',
                    sessionLocation: 'remote',
                    state: playState.IsPaused ? 'paused' : 'playing',
                    isTranscoding: !!session.TranscodingInfo,
                    videoCodec: session.TranscodingInfo?.VideoCodec || null,
                    audioCodec: session.TranscodingInfo?.AudioCodec || null,
                    resolution: item.Height ? `${item.Height}p` : null,
                    progress: runtime > 0 ? Math.min(100, Math.max(0, (position / runtime) * 100)) : 0,
                    timeRemaining: Math.max(0, runtime - position),
                    bandwidth: Math.round(reportedBitrate / 1000),
                    plexUrl: jellyfinItemUrl(config, item.Id),
                };
            });

        res.json({
            activeSessions,
            recentMovies: movies.map((item) => mapJellyfinItemForDiscover(config, item, 'movie')),
            recentShows: episodes.map((item) => mapJellyfinItemForDiscover(config, item, 'episode')),
            recentMusic: music.map((item) => mapJellyfinItemForDiscover(config, item, 'music')),
        });
    } catch (e) {
        log(`Error fetching Jellyfin dashboard: ${e.message}`);
        res.status(500).json({ error: 'Failed to fetch Jellyfin dashboard data' });
    }
});

app.post('/api/streams/kill', requireAdmin, async (req, res) => {
    const { sessionId, reason } = req.body;
    try {
        const config = await loadFile(CONFIG_PATH, {});
        const uri = await getPlexConnectionUri(config);
        if (!uri) return res.status(503).json({ error: 'Cannot connect to Plex' });

        const response = await fetch(`${uri}/status/sessions/terminate?sessionId=${encodeURIComponent(sessionId)}&reason=${encodeURIComponent(reason || 'Admin terminated session')}&X-Plex-Token=${config.plexToken}`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });

        if (response.ok) {
            res.json({ success: true });
        } else {
            res.status(500).json({ error: 'Failed to terminate session' });
        }
    } catch (e) {
        console.error('Error terminating stream:', e);
        res.status(500).json({ error: 'Failed to communicate with Plex' });
    }
});

app.post('/api/announcements/push', requireAdmin, async (req, res) => {
    const { text, sendEmail: shouldSendEmail } = req.body;

    try {
        const config = await loadFile(CONFIG_PATH, {});
        config.announcement = text || '';
        await saveFile(CONFIG_PATH, config);

        if (shouldSendEmail && text) {
            const users = await loadFile(USERS_PATH, []);
            const activeUsers = users.filter(u => u.plexAccessStatus === 'active' && u.email);
            if (activeUsers.length > 0) {
                // Email sending staggered over half an hour
                const totalDuration = 30 * 60 * 1000; // 30 minutes in ms
                const delayPerUser = Math.floor(totalDuration / activeUsers.length);

                // Background task
                (async () => {
                    log(`Starting staggered announcement email push to ${activeUsers.length} users over 30 minutes.`);
                    let sentCount = 0;
                    for (let i = 0; i < activeUsers.length; i++) {
                        const user = activeUsers[i];
                        const escapedAnnouncement = escapeHtmlAttr(String(text || ''));
                        const escapedServerId = escapeHtmlAttr(String(config.serverIdentifier || 'our Plex Server'));
                        const html = `
                            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #1a1b26; color: #a9b1d6; padding: 20px; border-radius: 10px;">
                                <h2 style="color: #E5A00D; text-align: center; text-transform: uppercase; letter-spacing: 2px;">Server Announcement</h2>
                                <div style="background-color: #24283b; padding: 20px; border-radius: 8px; margin-top: 20px; border-left: 4px solid #E5A00D;">
                                    <p style="white-space: pre-wrap; font-size: 16px; line-height: 1.6; color: #c0caf5; margin: 0;">${escapedAnnouncement}</p>
                                </div>
                                <p style="text-align: center; margin-top: 30px; font-size: 12px; color: #565f89;">
                                    You are receiving this message because you are an active user on ${escapedServerId}.
                                </p>
                            </div>
                        `;
                        try {
                            await sendEmail(config, user.email, `Server Announcement - ${config.serverIdentifier || 'Plex'}`, html);
                            sentCount++;
                        } catch (emailErr) {
                            log(`Failed to send announcement email to ${user.email}`);
                        }

                        if (i < activeUsers.length - 1) {
                            await new Promise(resolve => setTimeout(resolve, delayPerUser));
                        }
                    }
                    log(`Completed staggered announcement email push. Sent ${sentCount} emails.`);
                })();
            }
        }
        res.json({ success: true, message: 'Announcement updated' });
    } catch (e) {
        log(`Error pushing announcement: ${e.message}`);
        res.status(500).json({ error: 'Failed to update announcement' });
    }
});

const analyticsService = createAnalyticsService({
    app,
    requireAuth,
    requireMember,
    requireAdmin,
    configPath: CONFIG_PATH,
    usersPath: USERS_PATH,
    analyticsCachePath: ANALYTICS_CACHE_PATH,
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
    log,
});
const {
    calculateAnalyticsStats,
    calculateTrendingStats,
    startTrendingStatsBackgroundTask,
    startAnalyticsStatsBackgroundTask,
} = analyticsService;

app.get('/api/speedtest/ping', requireAuth, requireMember, speedtestRateLimit, (req, res) => { res.set('Cache-Control', 'no-store'); res.send('pong'); });
app.get('/api/speedtest/download', requireAuth, requireMember, speedtestRateLimit, (req, res) => {
    const parsedBytes = parseInt(req.query.bytes, 10) || SPEED_TEST_CHUNK_SIZE;
    const bytes = Math.max(1, Math.min(parsedBytes, 10 * 1024 * 1024));
    res.set('Content-Type', 'application/octet-stream');
    res.set('Content-Length', bytes);
    res.set('Cache-Control', 'no-store');
    let sent = 0;
    const streamData = () => {
        if (sent >= bytes) return res.end();
        const remaining = bytes - sent;
        const chunk = remaining >= SPEED_TEST_CHUNK_SIZE ? SPEED_TEST_BUFFER : SPEED_TEST_BUFFER.subarray(0, remaining);
        const canContinue = res.write(chunk);
        sent += chunk.length;
        if (canContinue) setImmediate(streamData);
        else res.once('drain', streamData);
    };
    streamData();
});
app.post('/api/speedtest/upload', requireAuth, requireMember, speedtestRateLimit, express.raw({ type: '*/*', limit: '10mb' }), (req, res) => res.sendStatus(200));

// --- Static File Serving ---
const staticDir = path.join(process.cwd(), 'static');
app.use('/static', express.static(staticDir, {
    etag: true,
    lastModified: true,
    setHeaders: setStaticAssetCacheHeaders,
}));
if (BASE_PATH) {
    app.use(`${BASE_PATH}/static`, express.static(staticDir, {
        etag: true,
        lastModified: true,
        setHeaders: setStaticAssetCacheHeaders,
    }));
}

// Serve optional legacy stylesheet from the root directory
app.get('/style.css', (req, res) => {
    const cssPath = path.join(process.cwd(), 'style.css');
    res.setHeader('Cache-Control', 'public, max-age=300, must-revalidate');
    res.sendFile(cssPath, (err) => {
        if (err) res.type('text/css').send('/* style.css not found */');
    });
});

const getRequestBaseUrl = (req) => {
    if (PUBLIC_BASE_URL) {
        try {
            return new URL(PUBLIC_BASE_URL).toString().replace(/\/+$/, '');
        } catch (e) {
            log(`Invalid PUBLIC_BASE_URL configured: ${e.message}`);
        }
    }
    const host = req.get('host') || `localhost:${PORT}`;
    const normalizedHost = host.split(',')[0].trim();
    if (isBlockedHostName(normalizedHost.split(':')[0])) {
        return `${req.secure ? 'https' : 'http'}://localhost:${PORT}`;
    }
    const proto = req.secure ? 'https' : 'http';
    return `${proto}://${normalizedHost}${BASE_PATH}`;
};

const buildSocialMetaTags = async (req) => {
    const config = await loadFile(CONFIG_PATH, {});
    const profile = await getAdminProfile(config);
    const baseUrl = getRequestBaseUrl(req);
    const pageUrl = `${baseUrl}${stripBasePathFromUrl(req.originalUrl || '/')}`;
    const serverName = profile.serverName || 'Server Portal';
    const serverId = config.serverIdentifier || 'unconfigured';
    const description = `Live Plex portal for ${serverName} (${serverId}).`;
    const title = `${serverName} Portal`;

    let imageUrl = '';
    const configuredImage = config.customLogoUrl || profile.thumb || '';
    if (configuredImage) {
        imageUrl = configuredImage.startsWith('http')
            ? configuredImage
            : `${baseUrl}/api/plex/image?path=${encodeURIComponent(configuredImage)}&width=1200&height=630`;
    }

    const tags = [
        `<meta property="og:type" content="website" />`,
        `<meta property="og:site_name" content="${escapeHtmlAttr(serverName)}" />`,
        `<meta property="og:title" content="${escapeHtmlAttr(title)}" />`,
        `<meta property="og:description" content="${escapeHtmlAttr(description)}" />`,
        `<meta property="og:url" content="${escapeHtmlAttr(pageUrl)}" />`,
        ...(imageUrl ? [`<meta property="og:image" content="${escapeHtmlAttr(imageUrl)}" />`] : []),
        `<meta name="twitter:card" content="${imageUrl ? 'summary_large_image' : 'summary'}" />`,
        `<meta name="twitter:title" content="${escapeHtmlAttr(title)}" />`,
        `<meta name="twitter:description" content="${escapeHtmlAttr(description)}" />`,
        ...(imageUrl ? [`<meta name="twitter:image" content="${escapeHtmlAttr(imageUrl)}" />`] : []),
        `<meta name="description" content="${escapeHtmlAttr(description)}" />`
    ].join('\n    ');

    return { title, tags };
};

// Serve the main index.html for SPA routes (after base-path strip, paths are root-relative)
app.get(/^\/(?!api\/|static\/).*$/, async (req, res) => {
    try {
        const indexPath = path.join(process.cwd(), 'index.html');
        const html = await fs.readFile(indexPath, 'utf8');
        const socialMeta = await buildSocialMetaTags(req);
        const updatedHtml = injectBasePathHtml(html
            .replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtmlAttr(socialMeta.title)}</title>`)
            .replace('</head>', `    ${socialMeta.tags}\n</head>`), BASE_PATH);
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(updatedHtml);
    } catch (e) {
        try {
            const indexPath = path.join(process.cwd(), 'index.html');
            const html = await fs.readFile(indexPath, 'utf8');
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.send(injectBasePathHtml(html, BASE_PATH));
        } catch {
            res.status(500).send('Failed to load application shell.');
        }
    }
});


// --- API Routes ---Service ---
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

    // Initial run
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

app.get('/api/media-stack/summary', requireAuth, requireMember, async (req, res) => {
    try {
        const rawMonthOffset = parseInt(req.query.monthOffset, 10) || 0;
        const monthOffset = Math.max(-24, Math.min(rawMonthOffset, 24));
        const cacheKey = `media-stack-summary-offset-${monthOffset}`;
        const data = await withCache(cacheKey, 60000, async () => {
            const config = await loadFile(CONFIG_PATH, {});
            const fetchArr = async (url, key, endpoint) => {
                if (!url || !key) return null;
                try {
                    // Media Stack integrations are admin-configured server-to-server URLs.
                    // Allow private network hosts here so local Sonarr/Radarr instances work.
                    const safeBaseUrl = normalizeExternalBaseUrl(url, { allowPrivate: true, allowHttp: true });
                    const u = new URL(endpoint, safeBaseUrl);
                    const response = await fetch(u.toString(), {
                        headers: { 'X-Api-Key': key }
                    });
                    if (!response.ok) return null;
                    return await response.json();
                } catch (e) {
                    return null;
                }
            };

            const targetDate = new Date();
            targetDate.setMonth(targetDate.getMonth() + monthOffset);

            const firstDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
            const lastDay = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0);
            const toLocalYmd = (date) => {
                const y = date.getFullYear();
                const m = String(date.getMonth() + 1).padStart(2, '0');
                const d = String(date.getDate()).padStart(2, '0');
                return `${y}-${m}-${d}`;
            };
            const start = toLocalYmd(firstDay);
            const end = toLocalYmd(lastDay);

            const inTargetMonthRange = (dateValue) => {
                if (!dateValue) return false;
                const parsed = new Date(dateValue);
                if (Number.isNaN(parsed.getTime())) return false;
                const monthStart = new Date(firstDay);
                monthStart.setHours(0, 0, 0, 0);
                const monthEnd = new Date(lastDay);
                monthEnd.setHours(23, 59, 59, 999);
                return parsed >= monthStart && parsed <= monthEnd;
            };

            const [sonarrStatus, sonarrQueue, sonarrHistory, sonarrDisk, sonarrCalendarRaw, radarrStatus, radarrQueue, radarrHistory, radarrDisk, radarrCalendarRaw] = await Promise.all([
                fetchArr(config.sonarrUrl, config.sonarrApiKey, '/api/v3/system/status'),
                fetchArr(config.sonarrUrl, config.sonarrApiKey, '/api/v3/queue'),
                fetchArr(config.sonarrUrl, config.sonarrApiKey, '/api/v3/history?page=1&pageSize=10&includeSeries=true&includeEpisode=true'),
                fetchArr(config.sonarrUrl, config.sonarrApiKey, '/api/v3/diskspace'),
                fetchArr(config.sonarrUrl, config.sonarrApiKey, `/api/v3/calendar?start=${start}&end=${end}&includeSeries=true&includeEpisode=true&unmonitored=true`),
                fetchArr(config.radarrUrl, config.radarrApiKey, '/api/v3/system/status'),
                fetchArr(config.radarrUrl, config.radarrApiKey, '/api/v3/queue'),
                fetchArr(config.radarrUrl, config.radarrApiKey, '/api/v3/history?page=1&pageSize=10&includeMovie=true'),
                fetchArr(config.radarrUrl, config.radarrApiKey, '/api/v3/diskspace'),
                fetchArr(config.radarrUrl, config.radarrApiKey, `/api/v3/calendar?start=${start}&end=${end}&unmonitored=true`)
            ]);

            let sonarrCalendar = Array.isArray(sonarrCalendarRaw)
                ? sonarrCalendarRaw
                : (Array.isArray(sonarrCalendarRaw?.records) ? sonarrCalendarRaw.records : []);
            let radarrCalendar = Array.isArray(radarrCalendarRaw)
                ? radarrCalendarRaw
                : (Array.isArray(radarrCalendarRaw?.records) ? radarrCalendarRaw.records : []);

            if (sonarrCalendar.length === 0 && config.sonarrUrl && config.sonarrApiKey) {
                const sonarrSeries = await fetchArr(config.sonarrUrl, config.sonarrApiKey, '/api/v3/series');
                if (Array.isArray(sonarrSeries)) {
                    sonarrCalendar = sonarrSeries
                        .filter((series) => inTargetMonthRange(series?.nextAiring))
                        .map((series) => ({
                            id: `fallback-sonarr-${series.id}`,
                            title: 'Upcoming Episode',
                            airDateUtc: series.nextAiring,
                            airDate: series.nextAiring,
                            monitored: series.monitored !== false,
                            hasFile: false,
                            seasonNumber: 0,
                            episodeNumber: 0,
                            series: {
                                title: series.title || 'Unknown Series',
                                network: series.network || '',
                                images: Array.isArray(series.images) ? series.images : []
                            }
                        }));
                }
            }

            if (radarrCalendar.length === 0 && config.radarrUrl && config.radarrApiKey) {
                const radarrMovies = await fetchArr(config.radarrUrl, config.radarrApiKey, '/api/v3/movie');
                if (Array.isArray(radarrMovies)) {
                    radarrCalendar = radarrMovies
                        .map((movie) => {
                            const releaseDate = movie.digitalRelease || movie.physicalRelease || movie.inCinemas || movie.added || null;
                            return {
                                ...movie,
                                _releaseDate: releaseDate
                            };
                        })
                        .filter((movie) => inTargetMonthRange(movie._releaseDate));
                }
            }

            return {
                sonarr: {
                    configured: !!(config.sonarrUrl && config.sonarrApiKey),
                    status: sonarrStatus,
                    queue: sonarrQueue,
                    history: sonarrHistory,
                    disk: sonarrDisk,
                    calendar: sonarrCalendar
                },
                radarr: {
                    configured: !!(config.radarrUrl && config.radarrApiKey),
                    status: radarrStatus,
                    queue: radarrQueue,
                    history: radarrHistory,
                    disk: radarrDisk,
                    calendar: radarrCalendar
                }
            };
        });
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch media stack summary' });
    }
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
    log,
});
const {
    MAINTENANCE_PREFS_DEFAULTS,
    MAINTENANCE_FILTER_CATALOG,
    maintenanceRunState,
    isMaintenanceExperimentalEnabled,
    loadMaintenancePreferences,
    applyMaintenanceExclusions,
    sanitizeMaintenanceRuleForPersist,
    getMaintenanceSettings,
    buildMaintenancePreviewForRule,
    evaluateMaintenanceRule,
    getArrCatalog,
    invalidateArrCatalogCache,
    validateMaintenanceDestructivePreflight,
    buildMaintenanceMediaIndex,
    executeMaintenanceRunBatch,
} = maintenanceService;

const requireMaintenanceExperimental = async (req, res, next) => {
    try {
        const config = await loadFile(CONFIG_PATH, {});
        if (!isMaintenanceExperimentalEnabled(config)) {
            return res.status(403).json({ error: 'Maintenance Experimental Mode is disabled. Enable it in Settings first.' });
        }
        return next();
    } catch (e) {
        return res.status(500).json({ error: 'Failed to check Maintenance feature flag.' });
    }
};

app.use('/api/maintenance', requireAdmin, requireMaintenanceExperimental);

app.get('/api/maintenance/filter-options', requireAdmin, async (req, res) => {
    res.json({
        fields: MAINTENANCE_FILTER_CATALOG,
        operators: ['equals', 'not_equals', 'contains', 'not_contains', 'greater_than', 'less_than', 'between', 'in', 'not_in', 'is_empty', 'not_empty', 'regex'],
        groupLogic: ['AND', 'OR', 'NOT']
    });
});

app.get('/api/maintenance/rules', requireAdmin, async (req, res) => {
    try {
        const rules = await loadFile(MAINTENANCE_RULES_PATH, []);
        const source = Array.isArray(rules) ? rules : [];
        let changed = false;
        const normalized = source.map((rule) => {
            const graceDays = Math.max(0, Number(rule?.graceDays || 0));
            const createdAt = rule?.createdAt || new Date().toISOString();
            if (graceDays !== Number(rule?.graceDays || 0) || !rule?.createdAt) changed = true;
            return {
                ...sanitizeMaintenanceRuleForPersist(rule),
                graceDays,
                createdAt
            };
        });
        if (changed) await saveFile(MAINTENANCE_RULES_PATH, normalized);
        res.json(normalized);
    } catch (e) {
        res.status(500).json({ error: `Failed to load maintenance rules: ${e.message}` });
    }
});

app.post('/api/maintenance/rules', requireAdmin, async (req, res) => {
    try {
        const rules = req.body;
        if (!Array.isArray(rules)) return res.status(400).json({ error: 'Rules must be an array.' });
        const existingRules = await loadFile(MAINTENANCE_RULES_PATH, []);
        const existingById = new Map((Array.isArray(existingRules) ? existingRules : []).map((rule) => [String(rule?.id || ''), rule]));
        const normalized = rules.map((rule) => {
            const cleaned = sanitizeMaintenanceRuleForPersist(rule);
            const currentId = String(cleaned?.id || '');
            const prev = existingById.get(currentId);
            const resetGrace = !!rule?._resetGrace;
            return {
                ...cleaned,
                id: cleaned.id || randomUUID(),
                name: cleaned.name || 'Unnamed Rule',
                enabled: cleaned.enabled !== false,
                graceDays: Math.max(0, Number(cleaned?.graceDays || 0)),
                createdAt: resetGrace
                    ? new Date().toISOString()
                    : (prev?.createdAt || cleaned?.createdAt || new Date().toISOString()),
                updatedAt: new Date().toISOString(),
                settings: getMaintenanceSettings(cleaned)
            };
        });
        await saveFile(MAINTENANCE_RULES_PATH, normalized);
        await appendAuditLog('maintenance_rules_updated', req.user, null, { count: normalized.length });
        res.json({ success: true, rules: normalized });
    } catch (e) {
        res.status(500).json({ error: `Failed to save maintenance rules: ${e.message}` });
    }
});

app.post('/api/maintenance/rules/reset-grace', requireAdmin, async (req, res) => {
    try {
        const ruleId = String(req.body?.ruleId || '').trim();
        if (!ruleId) return res.status(400).json({ error: 'ruleId is required.' });
        const rules = await loadFile(MAINTENANCE_RULES_PATH, []);
        const source = Array.isArray(rules) ? rules : [];
        let found = false;
        const resetAt = new Date().toISOString();
        const updated = source.map((rule) => {
            if (String(rule?.id || '') !== ruleId) return sanitizeMaintenanceRuleForPersist(rule);
            found = true;
            return {
                ...sanitizeMaintenanceRuleForPersist(rule),
                createdAt: resetAt,
                updatedAt: resetAt
            };
        });
        if (!found) return res.status(404).json({ error: 'Maintenance rule not found.' });
        await saveFile(MAINTENANCE_RULES_PATH, updated);
        await appendAuditLog('maintenance_grace_reset', req.user, null, { ruleId, resetAt });
        res.json({ success: true, ruleId, createdAt: resetAt });
    } catch (e) {
        res.status(500).json({ error: `Failed to reset maintenance grace timer: ${e.message}` });
    }
});

app.post('/api/maintenance/index/rebuild', requireAdmin, async (req, res) => {
    try {
        const payload = await buildMaintenanceMediaIndex({ actor: req.user, force: true });
        res.json({ success: true, generatedAt: payload.generatedAt, itemCount: payload.itemCount, requestItemCount: payload.requestItemCount });
    } catch (e) {
        res.status(500).json({ error: `Failed to rebuild maintenance index: ${e.message}` });
    }
});

app.get('/api/maintenance/index', requireAdmin, async (req, res) => {
    try {
        const payload = await loadFile(MAINTENANCE_MEDIA_INDEX_PATH, { generatedAt: null, itemCount: 0, items: [] });
        const requestIndex = await loadFile(MAINTENANCE_REQUEST_INDEX_PATH, { generatedAt: null, items: [] });
        res.json({
            generatedAt: payload.generatedAt || null,
            itemCount: payload.itemCount || 0,
            requestGeneratedAt: requestIndex.generatedAt || null,
            requestItemCount: Array.isArray(requestIndex.items) ? requestIndex.items.length : 0
        });
    } catch (e) {
        res.status(500).json({ error: `Failed to load maintenance index: ${e.message}` });
    }
});

app.get('/api/maintenance/library-items', requireAdmin, async (req, res) => {
    try {
        const payload = await loadFile(MAINTENANCE_MEDIA_INDEX_PATH, { generatedAt: null, items: [] });
        const preferences = await loadMaintenancePreferences();
        const allItems = Array.isArray(payload.items) ? payload.items : [];
        const libraryId = String(req.query.libraryId || 'all');
        const search = normalized(String(req.query.search || ''));
        const page = Math.max(1, Number(req.query.page || 1));
        const limit = Math.min(120, Math.max(12, Number(req.query.limit || 48)));
        const includeExcluded = String(req.query.includeExcluded || 'true') !== 'false';

        const excludedKeys = new Set((preferences?.exclusions?.ratingKeys || []).map(v => String(v)));
        const excludedTitles = new Set((preferences?.exclusions?.titles || []).map(v => normalized(v)));
        const excludedLibraries = new Set((preferences?.exclusions?.libraries || []).map(v => normalized(v)));

        const librariesMap = allItems.reduce((acc, item) => {
            const key = String(item?.libraryId || '');
            if (!key) return acc;
            if (!acc[key]) {
                acc[key] = { id: key, title: item?.libraryTitle || `Library ${key}`, count: 0 };
            }
            acc[key].count += 1;
            return acc;
        }, {});

        const filtered = allItems
            .filter((item) => {
                if (!item) return false;
                if (libraryId !== 'all' && String(item.libraryId || '') !== libraryId) return false;
                if (search && !normalized(item.title).includes(search)) return false;
                return true;
            })
            .map((item) => {
                const excluded = excludedKeys.has(String(item.ratingKey || ''))
                    || excludedTitles.has(normalized(item.title))
                    || excludedLibraries.has(normalized(item.libraryTitle));
                return {
                    ratingKey: String(item.ratingKey || ''),
                    title: item.title || 'Unknown',
                    thumb: item.thumb || '',
                    year: item.year || null,
                    libraryId: String(item.libraryId || ''),
                    libraryTitle: item.libraryTitle || 'Library',
                    watchCount: Number(item.watchCount || 0),
                    sizeGB: Number(item.sizeGB || 0),
                    lastViewedAt: item.lastViewedAt || null,
                    excluded
                };
            })
            .filter(item => includeExcluded ? true : !item.excluded)
            .sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base' }));

        const start = (page - 1) * limit;
        const pageItems = filtered.slice(start, start + limit);
        res.json({
            generatedAt: payload.generatedAt || null,
            total: filtered.length,
            page,
            limit,
            libraries: Object.values(librariesMap).sort((a, b) => String(a.title).localeCompare(String(b.title), undefined, { sensitivity: 'base' })),
            items: pageItems
        });
    } catch (e) {
        res.status(500).json({ error: `Failed to load maintenance library items: ${e.message}` });
    }
});

app.get('/api/maintenance/storage-summary', requireAdmin, async (req, res) => {
    try {
        const payload = await loadFile(MAINTENANCE_MEDIA_INDEX_PATH, { generatedAt: null, items: [] });
        const preferences = await loadMaintenancePreferences();
        const rules = await loadFile(MAINTENANCE_RULES_PATH, []);
        const requestedRuleId = String(req.query.ruleId || '').trim();
        const allItems = Array.isArray(payload.items) ? payload.items : [];
        const usableItems = applyMaintenanceExclusions(allItems, preferences);

        const selectedRules = requestedRuleId
            ? rules.filter((r) => String(r.id || '') === requestedRuleId)
            : rules.filter((r) => r?.enabled !== false);

        const matched = selectedRules.length
            ? usableItems.filter((item) => selectedRules.some((rule) => evaluateMaintenanceRule(item, rule)))
            : [];
        const matchedKeys = new Set(matched.map((item) => String(item?.ratingKey || '')));

        const libraries = {};
        allItems.forEach((item) => {
            const libId = String(item?.libraryId || '');
            const libName = item?.libraryTitle || `Library ${libId || 'Unknown'}`;
            if (!libraries[libName]) {
                libraries[libName] = {
                    libraryId: libId,
                    libraryTitle: libName,
                    totalItems: 0,
                    totalSizeGB: 0,
                    matchedItems: 0,
                    reclaimGB: 0,
                    afterSizeGB: 0,
                    reclaimPercent: 0
                };
            }
            const size = Number(item?.sizeGB || 0);
            libraries[libName].totalItems += 1;
            libraries[libName].totalSizeGB += size;
            if (matchedKeys.has(String(item?.ratingKey || ''))) {
                libraries[libName].matchedItems += 1;
                libraries[libName].reclaimGB += size;
            }
        });

        const libraryRows = Object.values(libraries).map((lib) => {
            const after = Math.max(0, Number(lib.totalSizeGB || 0) - Number(lib.reclaimGB || 0));
            const percent = Number(lib.totalSizeGB || 0) > 0 ? ((Number(lib.reclaimGB || 0) / Number(lib.totalSizeGB || 0)) * 100) : 0;
            return {
                ...lib,
                totalSizeGB: Math.round(Number(lib.totalSizeGB || 0) * 100) / 100,
                reclaimGB: Math.round(Number(lib.reclaimGB || 0) * 100) / 100,
                afterSizeGB: Math.round(after * 100) / 100,
                reclaimPercent: Math.round(percent * 100) / 100
            };
        }).sort((a, b) => b.reclaimGB - a.reclaimGB);

        const totalBeforeGB = libraryRows.reduce((sum, row) => sum + Number(row.totalSizeGB || 0), 0);
        const totalReclaimGB = libraryRows.reduce((sum, row) => sum + Number(row.reclaimGB || 0), 0);
        const totalAfterGB = Math.max(0, totalBeforeGB - totalReclaimGB);

        res.json({
            generatedAt: new Date().toISOString(),
            indexGeneratedAt: payload.generatedAt || null,
            selectedRuleId: requestedRuleId || null,
            rulesConsidered: selectedRules.map((r) => ({ id: r.id, name: r.name || 'Unnamed Rule' })),
            totals: {
                libraries: libraryRows.length,
                items: allItems.length,
                matchedItems: matched.length,
                beforeGB: Math.round(totalBeforeGB * 100) / 100,
                reclaimGB: Math.round(totalReclaimGB * 100) / 100,
                afterGB: Math.round(totalAfterGB * 100) / 100,
                reclaimPercent: totalBeforeGB > 0 ? Math.round((totalReclaimGB / totalBeforeGB) * 10000) / 100 : 0
            },
            libraries: libraryRows
        });
    } catch (e) {
        res.status(500).json({ error: `Failed to load maintenance storage summary: ${e.message}` });
    }
});

app.post('/api/maintenance/preview', requireAdmin, async (req, res) => {
    try {
        const { ruleId, rule, limit = 300, includeAll = false, includeArrDiagnostics = false } = req.body || {};
        const config = await loadFile(CONFIG_PATH, {});
        const rules = await loadFile(MAINTENANCE_RULES_PATH, []);
        const payload = await loadFile(MAINTENANCE_MEDIA_INDEX_PATH, { items: [] });
        const preferences = await loadMaintenancePreferences();
        const allItems = Array.isArray(payload.items) ? payload.items : [];
        const selectedRules = rule
            ? [rule]
            : (ruleId ? rules.filter(r => r.id === ruleId) : rules.filter(r => r.enabled !== false));
        const catalog = includeArrDiagnostics ? await getArrCatalog(config) : null;
        const previews = selectedRules.map((selectedRule) => buildMaintenancePreviewForRule(
            selectedRule,
            allItems,
            preferences,
            catalog,
            { limit, includeAll }
        ));
        res.json({
            generatedAt: new Date().toISOString(),
            indexGeneratedAt: payload.generatedAt || null,
            preferences,
            arrDiagnostics: includeArrDiagnostics ? {
                radarrCount: catalog?.radarr?.length || 0,
                sonarrCount: catalog?.sonarr?.length || 0,
                radarrConfigured: !!(config.radarrUrl && config.radarrApiKey),
                sonarrConfigured: !!(config.sonarrUrl && config.sonarrApiKey)
            } : null,
            previews
        });
    } catch (e) {
        res.status(500).json({ error: `Failed to generate maintenance preview: ${e.message}` });
    }
});

app.post('/api/maintenance/preflight', requireAdmin, async (req, res) => {
    try {
        const ruleId = String(req.body?.ruleId || '').trim();
        if (!ruleId) return res.status(400).json({ error: 'ruleId is required.' });
        const config = await loadFile(CONFIG_PATH, {});
        const rules = await loadFile(MAINTENANCE_RULES_PATH, []);
        const rule = (Array.isArray(rules) ? rules : []).find((r) => String(r?.id || '') === ruleId);
        if (!rule) return res.status(404).json({ error: 'Maintenance rule not found.' });
        const catalog = await getArrCatalog(config);
        const preflight = await validateMaintenanceDestructivePreflight(config, rule, catalog);
        const preferences = await loadMaintenancePreferences();
        const indexPayload = await loadFile(MAINTENANCE_MEDIA_INDEX_PATH, { items: [] });
        const preview = buildMaintenancePreviewForRule(
            rule,
            Array.isArray(indexPayload.items) ? indexPayload.items : [],
            preferences,
            catalog,
            { limit: 5, includeAll: false }
        );
        res.json({
            ...preflight,
            preview: {
                totalMatches: preview.totalMatches,
                eligibleCount: preview.eligibleCount,
                inGraceCount: preview.inGraceCount,
                graceRemainingDays: preview.graceRemainingDays,
                actionableCount: preview.actionableCount,
                unactionableCount: preview.unactionableCount,
                wouldProcessCount: preview.wouldProcessCount,
                maxActionsPerRun: preview.maxActionsPerRun
            },
            arrCatalog: {
                radarrCount: catalog.radarr.length,
                sonarrCount: catalog.sonarr.length
            }
        });
    } catch (e) {
        res.status(500).json({ error: `Failed maintenance preflight: ${e.message}` });
    }
});

app.get('/api/maintenance/preferences', requireAdmin, async (req, res) => {
    try {
        const prefs = await loadMaintenancePreferences();
        res.json(prefs);
    } catch (e) {
        res.status(500).json({ error: `Failed to load maintenance preferences: ${e.message}` });
    }
});

app.get('/api/maintenance/exclusions/summary', requireAdmin, async (req, res) => {
    try {
        const prefs = await loadMaintenancePreferences();
        const payload = await loadFile(MAINTENANCE_MEDIA_INDEX_PATH, { generatedAt: null, items: [] });
        const allItems = Array.isArray(payload.items) ? payload.items : [];

        const byRatingKey = new Map(allItems.map((item) => [String(item?.ratingKey || ''), item]));
        const byNormalizedTitle = new Map();
        allItems.forEach((item) => {
            const key = normalized(item?.title || '');
            if (!key) return;
            if (!byNormalizedTitle.has(key)) byNormalizedTitle.set(key, []);
            byNormalizedTitle.get(key).push(item);
        });

        const ratingKeyEntries = (prefs?.exclusions?.ratingKeys || []).map((ratingKey) => {
            const key = String(ratingKey || '');
            const item = byRatingKey.get(key);
            return {
                ratingKey: key,
                found: !!item,
                title: item?.title || '(Missing from current index)',
                libraryTitle: item?.libraryTitle || '',
                thumb: item?.thumb || ''
            };
        });

        const titleEntries = (prefs?.exclusions?.titles || []).map((title) => {
            const key = normalized(title || '');
            const matches = byNormalizedTitle.get(key) || [];
            const sample = matches[0] || null;
            return {
                title: String(title || ''),
                matchCount: matches.length,
                sampleTitle: sample?.title || null,
                sampleLibraryTitle: sample?.libraryTitle || null,
                sampleThumb: sample?.thumb || null
            };
        });

        const libraryEntries = (prefs?.exclusions?.libraries || []).map((library) => {
            const normalizedLibrary = normalized(library || '');
            const count = allItems.filter((item) => normalized(item?.libraryTitle || '') === normalizedLibrary).length;
            return {
                libraryTitle: String(library || ''),
                matchCount: count
            };
        });

        res.json({
            generatedAt: payload.generatedAt || null,
            ratingKeys: ratingKeyEntries,
            titles: titleEntries,
            libraries: libraryEntries
        });
    } catch (e) {
        res.status(500).json({ error: `Failed to load exclusions summary: ${e.message}` });
    }
});

app.post('/api/maintenance/preferences', requireAdmin, async (req, res) => {
    try {
        const body = req.body || {};
        const next = {
            global: {
                dryRunByDefault: body?.global?.dryRunByDefault !== undefined ? !!body.global.dryRunByDefault : MAINTENANCE_PREFS_DEFAULTS.global.dryRunByDefault,
                maxActionsPerRun: Math.max(1, Number(body?.global?.maxActionsPerRun || MAINTENANCE_PREFS_DEFAULTS.global.maxActionsPerRun)),
                requireConfirmForDestructive: body?.global?.requireConfirmForDestructive !== undefined ? !!body.global.requireConfirmForDestructive : MAINTENANCE_PREFS_DEFAULTS.global.requireConfirmForDestructive
            },
            exclusions: {
                ratingKeys: Array.isArray(body?.exclusions?.ratingKeys) ? body.exclusions.ratingKeys.map(v => String(v)) : [],
                titles: Array.isArray(body?.exclusions?.titles) ? body.exclusions.titles.map(v => String(v)) : [],
                libraries: Array.isArray(body?.exclusions?.libraries) ? body.exclusions.libraries.map(v => String(v)) : []
            }
        };
        await saveFile(MAINTENANCE_PREFS_PATH, next);
        await appendAuditLog('maintenance_preferences_updated', req.user, null, {
            titleExclusions: next.exclusions.titles.length,
            libraryExclusions: next.exclusions.libraries.length,
            keyExclusions: next.exclusions.ratingKeys.length
        });
        res.json({ success: true, preferences: next });
    } catch (e) {
        res.status(500).json({ error: `Failed to save maintenance preferences: ${e.message}` });
    }
});

app.get('/api/maintenance/runs', requireAdmin, async (req, res) => {
    try {
        const runs = await loadFile(MAINTENANCE_RUNS_PATH, []);
        res.json(Array.isArray(runs) ? runs : []);
    } catch (e) {
        res.status(500).json({ error: `Failed to load maintenance runs: ${e.message}` });
    }
});

app.post('/api/maintenance/run', requireAdmin, async (req, res) => {
    if (maintenanceRunState.running) {
        return res.status(409).json({ error: 'A maintenance run is already in progress.' });
    }
    const task = tasksInfo.find(t => t.id === 'maintenanceRuleRun');
    try {
        const { ruleId, dryRun, confirmToken, runOptions } = req.body || {};
        maintenanceRunState.running = true;
        maintenanceRunState.lastRunAt = new Date().toISOString();
        maintenanceRunState.lastError = null;
        if (task) markTaskStart(task);
        const newRuns = await executeMaintenanceRunBatch({ actor: req.user, ruleId, dryRun, confirmToken, runOptions });
        if (task) {
            task.nextRun = null;
            markTaskEnd(task, null);
        }
        maintenanceRunState.running = false;
        await appendAuditLog('maintenance_run_completed', req.user, null, {
            runCount: newRuns.length,
            dryRun: dryRun !== false
        });
        res.json({ success: true, runs: newRuns });
    } catch (e) {
        maintenanceRunState.running = false;
        maintenanceRunState.lastError = e.message;
        if (task) markTaskEnd(task, e);
        res.status(500).json({ error: `Maintenance run failed: ${e.message}` });
    }
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

// Rules API
app.get('/api/kill-rules', requireAdmin, async (req, res) => {
    try {
        const rules = await loadFile(KILL_RULES_PATH, []);
        res.json(rules);
    } catch (e) {
        res.status(500).json({ error: 'Failed to load rules' });
    }
});

app.post('/api/kill-rules', requireAdmin, async (req, res) => {
    try {
        const rules = req.body;
        validateKillRulesSchema(rules);
        await saveFile(KILL_RULES_PATH, rules);
        res.json({ success: true });
    } catch (e) {
        res.status(e.message.startsWith('Rule') || e.message.startsWith('Each') || e.message.startsWith('Invalid') ? 400 : 500).json({ error: e.message || 'Failed to save rules' });
    }
});

const startPortalService = async () => {
    log(`--- Server Manager Portal Service starting on http://${BIND_HOST}:${PORT} ---`);
    log(`Runtime: CONFIG_DIR=${CONFIG_DIR}, FORCE_SECURE_COOKIES=${FORCE_SECURE_COOKIES}, BASE_PATH=${BASE_PATH || '/'}, appVersion=${appVersion}`);
    if (FORCE_SECURE_COOKIES) {
        log('WARNING: FORCE_SECURE_COOKIES=true — plain HTTP logins (http://LAN-IP:2121) will fail until this is set to false.');
    }

    await migrateConfigFiles((message) => log(`[config] ${message}`));

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

    // Background cache builders: reuse on-disk cache and schedule next run by interval.
    startTrendingStatsBackgroundTask();
    startAnalyticsStatsBackgroundTask();
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
