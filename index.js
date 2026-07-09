

import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import fetch from 'node-fetch';
import { randomUUID, randomBytes } from 'crypto';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import compression from 'compression';
import { execSync } from 'child_process';
import fsSync from 'fs';
import { createBasePathHelpers, deriveBasePath } from './lib/base-path.js';
import { createBroadcastService } from './lib/broadcast-service.js';
import { createLruCache, createTtlCache } from './lib/cache.js';
import { addDays, addMonths, addYears, getDaysUntilExpiry } from './lib/date-utils.js';
import { createDeletedUserRegistry, getDeletedUserKey, isDeletedUser, normalized } from './lib/deleted-users.js';
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
import { createAnalyticsService } from './lib/analytics-service.js';
import { createRateLimiter } from './lib/rate-limit.js';
import { setStaticAssetCacheHeaders } from './lib/static-assets.js';
import { createAuditLogger } from './lib/audit-log.js';
import { createStatusRuntime } from './lib/status-runtime.js';
import { createStreamMonitor, validateKillRulesSchema } from './lib/stream-monitor.js';
import { computeNextBackupRun, findRunnableTask, getTasksSnapshot, markTaskEnd, markTaskStart, systemJobs, tasksInfo } from './lib/task-state.js';
import {
    SPEED_TEST_BUFFER,
    SPEED_TEST_CHUNK_SIZE,
    createPublicStatusPayload,
} from './lib/status-monitor.js';

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
import { BACKUP_SCHEMA_VERSION, createBackupService } from './lib/backup.js';
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

// Auth endpoints
app.post('/api/auth/plex/login', authRateLimit, async (req, res) => {
    try {
        const response = await fetch('https://plex.tv/api/v2/pins?strong=true', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'X-Plex-Product': 'Server Manager Portal',
                'X-Plex-Client-Identifier': CLIENT_ID
            }
        });
        if (!response.ok) throw new Error('Failed to generate Plex PIN');
        const data = await response.json();
        res.json({ ...data, clientIdentifier: CLIENT_ID });
    } catch (err) {
        log('Error in plex login: ' + err.message);
        res.status(500).json({ error: 'Failed to initiate login' });
    }
});

const jellyfinQuickConnectSessions = new Map();
const MAX_JELLYFIN_QUICK_CONNECT_SESSIONS = 100;

const pruneJellyfinQuickConnectSessions = () => {
    const now = Date.now();
    jellyfinQuickConnectSessions.forEach((session, id) => {
        if (!session?.expiresAt || session.expiresAt <= now) {
            jellyfinQuickConnectSessions.delete(id);
        }
    });
};

const storeJellyfinQuickConnectSession = (sessionId, session) => {
    pruneJellyfinQuickConnectSessions();
    while (jellyfinQuickConnectSessions.size >= MAX_JELLYFIN_QUICK_CONNECT_SESSIONS) {
        const oldestKey = jellyfinQuickConnectSessions.keys().next().value;
        if (!oldestKey) break;
        jellyfinQuickConnectSessions.delete(oldestKey);
    }
    jellyfinQuickConnectSessions.set(sessionId, session);
};

const completeJellyfinPortalLogin = async (req, res, config, authData, source = 'password') => {
    const jellyfinUser = authData?.User || authData?.user || {};
    const accessToken = authData?.AccessToken || authData?.accessToken || '';
    const userId = jellyfinUser.Id || jellyfinUser.Id || jellyfinUser.id || '';
    const username = jellyfinUser.Name || jellyfinUser.name || 'Jellyfin User';
    const isAdmin = jellyfinUser?.Policy?.IsAdministrator === true || jellyfinUser?.policy?.isAdministrator === true;
    const sessionUser = {
        id: userId ? `jellyfin:${userId}` : `jellyfin:${username}`,
        jellyfinId: userId,
        authProvider: 'jellyfin',
        username,
        email: '',
        thumb: userId ? withBasePath(`/api/jellyfin/user-image?userId=${encodeURIComponent(userId)}`) : null,
        jellyfinIsAdmin: isAdmin,
        isAdmin,
    };

    const deletedUsers = await loadFile(DELETED_USERS_PATH, []);
    if (!isAdmin && isDeletedUser(deletedUsers, sessionUser)) {
        await appendAuditLog('login_blocked_deleted_user', sessionUser, sessionUser);
        clearSessionCookie(req, res);
        return res.status(403).json({ error: 'Your portal session has expired. Please contact the admin for access.' });
    }

    const users = await loadFile(USERS_PATH, []);
    const knownUser = findLocalUserForSession(users, sessionUser);
    if (!isAdmin && !knownUser) {
        await appendAuditLog('login_blocked_non_member', sessionUser, sessionUser);
        clearSessionCookie(req, res);
        log(`Jellyfin ${source} login blocked for ${sessionUser.username}: not a portal member`);
        return res.status(403).json({ error: 'Your account is not registered for this portal.' });
    }

    if (!isAdmin && knownUser) {
        knownUser.lastLogin = new Date().toISOString();
        if (!knownUser.jellyfinId && sessionUser.jellyfinId) knownUser.jellyfinId = sessionUser.jellyfinId;
        await saveFile(USERS_PATH, users);
    }

    const token = jwt.sign(sessionUser, JWT_SECRET, { expiresIn: '7d' });
    setSessionCookie(req, res, token);
    await appendAuditLog('user_login', sessionUser, sessionUser);
    log(`Jellyfin ${source} login success for ${sessionUser.username} (admin=${isAdmin}, secureCookie=${FORCE_SECURE_COOKIES}, token=${accessToken ? 'received' : 'missing'})`);
    return res.json({ success: true, user: { username: sessionUser.username, jellyfinId: sessionUser.jellyfinId, isAdmin } });
};

app.post('/api/auth/jellyfin/login', authRateLimit, async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    try {
        const config = await loadFile(CONFIG_PATH, {});
        if (!isJellyfinConfigured(config)) {
            return res.status(400).json({ error: 'Jellyfin authentication is not configured' });
        }

        const baseUrl = resolveIntegrationUrlForFetch(config.jellyfinUrl);
        const response = await fetch(`${baseUrl}/Users/AuthenticateByName`, {
            method: 'POST',
            headers: jellyfinHeaders('', { 'Content-Type': 'application/json' }),
            body: JSON.stringify({ Username: username, Pw: password }),
        });

        if (!response.ok) {
            const detail = await response.text().catch(() => '');
            log(`Jellyfin login failed for ${username}: ${response.status} ${detail.slice(0, 120)}`);
            return res.status(401).json({ error: 'Invalid Jellyfin username or password' });
        }

        return completeJellyfinPortalLogin(req, res, config, await response.json(), 'password');
    } catch (err) {
        log('Error in jellyfin login: ' + err.message);
        res.status(500).json({ error: 'Failed to authenticate with Jellyfin' });
    }
});

app.post('/api/auth/jellyfin/quick-connect/initiate', authRateLimit, async (req, res) => {
    try {
        pruneJellyfinQuickConnectSessions();
        const config = await loadFile(CONFIG_PATH, {});
        if (!isJellyfinConfigured(config)) {
            return res.status(400).json({ error: 'Jellyfin authentication is not configured' });
        }

        const baseUrl = resolveIntegrationUrlForFetch(config.jellyfinUrl);
        const enabledRes = await fetch(`${baseUrl}/QuickConnect/Enabled`, {
            headers: jellyfinHeaders(''),
        });
        if (enabledRes.ok) {
            const enabledText = await enabledRes.text();
            if (String(enabledText).trim().toLowerCase() === 'false') {
                return res.status(400).json({ error: 'Quick Connect is disabled on your Jellyfin server.' });
            }
        }

        const initiateRes = await fetch(`${baseUrl}/QuickConnect/Initiate`, {
            method: 'POST',
            headers: jellyfinHeaders(''),
        });
        if (!initiateRes.ok) {
            const detail = await initiateRes.text().catch(() => '');
            log(`Jellyfin Quick Connect initiate failed: ${initiateRes.status} ${detail.slice(0, 160)}`);
            return res.status(502).json({ error: 'Failed to start Jellyfin Quick Connect.' });
        }

        const state = await initiateRes.json();
        const secret = state.Secret || state.secret;
        const code = state.Code || state.code;
        if (!secret || !code) {
            return res.status(502).json({ error: 'Jellyfin did not return a Quick Connect code.' });
        }

        const sessionId = randomUUID();
        storeJellyfinQuickConnectSession(sessionId, {
            secret,
            baseUrl,
            expiresAt: Date.now() + 5 * 60 * 1000,
        });
        res.json({ sessionId, code, jellyfinUrl: config.jellyfinUrl });
    } catch (err) {
        log('Error starting jellyfin quick connect: ' + err.message);
        res.status(500).json({ error: 'Failed to start Jellyfin Quick Connect' });
    }
});

app.post('/api/auth/jellyfin/quick-connect/poll', jellyfinQuickConnectPollRateLimit, async (req, res) => {
    const { sessionId } = req.body || {};
    if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });

    try {
        pruneJellyfinQuickConnectSessions();
        const quickSession = jellyfinQuickConnectSessions.get(sessionId);
        if (!quickSession) {
            return res.status(404).json({ error: 'Quick Connect session expired. Please try again.' });
        }

        const config = await loadFile(CONFIG_PATH, {});
        if (!isJellyfinConfigured(config)) {
            return res.status(400).json({ error: 'Jellyfin authentication is not configured' });
        }

        const stateRes = await fetch(`${quickSession.baseUrl}/QuickConnect/Connect?secret=${encodeURIComponent(quickSession.secret)}`, {
            headers: jellyfinHeaders(''),
        });
        if (!stateRes.ok) {
            const detail = await stateRes.text().catch(() => '');
            log(`Jellyfin Quick Connect poll failed: ${stateRes.status} ${detail.slice(0, 160)}`);
            return res.status(502).json({ error: 'Failed to check Jellyfin Quick Connect status.' });
        }
        const state = await stateRes.json();
        const authenticated = state.Authenticated === true || state.authenticated === true;
        if (!authenticated) {
            return res.json({ authenticated: false });
        }

        const authRes = await fetch(`${quickSession.baseUrl}/Users/AuthenticateWithQuickConnect`, {
            method: 'POST',
            headers: jellyfinHeaders('', { 'Content-Type': 'application/json' }),
            body: JSON.stringify({ Secret: quickSession.secret }),
        });
        if (!authRes.ok) {
            const detail = await authRes.text().catch(() => '');
            log(`Jellyfin Quick Connect token exchange failed: ${authRes.status} ${detail.slice(0, 160)}`);
            return res.status(502).json({ error: 'Jellyfin approved the code, but token exchange failed.' });
        }

        jellyfinQuickConnectSessions.delete(sessionId);
        return completeJellyfinPortalLogin(req, res, config, await authRes.json(), 'quick-connect');
    } catch (err) {
        log('Error polling jellyfin quick connect: ' + err.message);
        res.status(500).json({ error: 'Failed to finish Jellyfin Quick Connect' });
    }
});

const fetchPlexPinAuthToken = async (pinId, { attempts = 10, delayMs = 800 } = {}) => {
    let lastData = null;
    for (let attempt = 1; attempt <= attempts; attempt++) {
        const pinRes = await fetch(`https://plex.tv/api/v2/pins/${pinId}`, {
            headers: {
                Accept: 'application/json',
                'X-Plex-Client-Identifier': CLIENT_ID,
            },
        });
        lastData = await pinRes.json();
        if (lastData?.authToken) {
            if (attempt > 1) log(`Plex pin ${pinId} authenticated after ${attempt} attempts`);
            return lastData;
        }
        if (attempt < attempts) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
    }
    log(`Plex pin ${pinId} missing authToken after ${attempts} attempts`);
    return lastData || {};
};

const handlePlexPinLogin = async (req, res, pinId, ref, { redirectOnSuccess = false } = {}) => {
    const pinData = await fetchPlexPinAuthToken(pinId);

    if (!pinData.authToken) {
        const message = 'Plex sign-in did not complete in time — please try again';
        log(`Plex login failed for pin ${pinId}: authToken not ready`);
        if (redirectOnSuccess) {
            return res.redirect(withBasePath('/?loginError=' + encodeURIComponent(message)));
        }
        return res.status(400).json({ error: message });
    }

    const userRes = await apiFetch('https://plex.tv/api/v2/user', pinData.authToken);
    if (!userRes.ok) throw new Error('Failed to fetch user info');
    const userData = await userRes.json();

    const config = await loadFile(CONFIG_PATH, {});
    await syncAdminPlexIdFromConfigToken(config);
    const adminId = await getAdminId(config);
    const isAdmin = !!(adminId && String(userData.id) === String(adminId));

    const deletedUsers = await loadFile(DELETED_USERS_PATH, []);
    const sessionUser = {
        id: userData.uuid,
        plexId: userData.id,
        email: userData.email,
        username: userData.username,
        thumb: userData.thumb || null,
        isAdmin,
    };

    if (!isAdmin && isDeletedUser(deletedUsers, sessionUser)) {
        await appendAuditLog('login_blocked_deleted_user', sessionUser, sessionUser);
        clearSessionCookie(req, res);
        const message = 'Your portal session has expired. Please contact the admin for access.';
        if (redirectOnSuccess) {
            return res.redirect(withBasePath('/?loginError=' + encodeURIComponent(message)));
        }
        return res.status(403).json({ error: message });
    }

    if (!isAdmin) {
        const users = await loadFile(USERS_PATH, []);
        const knownUser = findLocalUserForSession(users, sessionUser);
        const canSelfRegister = !!config.allowTemporaryAccess || (!!config.referralEnabled && !!ref);
        if (!knownUser && !canSelfRegister) {
            await appendAuditLog('login_blocked_non_member', sessionUser, sessionUser);
            clearSessionCookie(req, res);
            log(`Plex login blocked for ${sessionUser.username}: not a portal member (admin=${isAdmin}, adminPlexId=${config.adminPlexId || 'unset'})`);
            const message = 'Your account is not registered for this portal.';
            if (redirectOnSuccess) {
                return res.redirect(withBasePath('/?loginError=' + encodeURIComponent(message)));
            }
            return res.status(403).json({ error: message });
        }
    }

    if (!isAdmin && config.referralEnabled && ref) {
        const users = await loadFile(USERS_PATH, []);
        const isNewUser = !users.find(u => u.id === sessionUser.id || u.plexId === sessionUser.plexId);

        if (isNewUser) {
            const referrer = users.find(u => u.id === ref || u.plexId === ref);
            if (referrer && referrer.plexAccessStatus === 'active') {
                const trialDays = config.referralTrialDays || 3;
                const rewardDays = config.referralRewardDays || 7;
                const newUserObj = {
                    id: sessionUser.id,
                    plexId: sessionUser.plexId,
                    username: sessionUser.username,
                    email: sessionUser.email,
                    joiningDate: new Date().toISOString(),
                    expiryDate: addDays(new Date(), trialDays).toISOString(),
                    plexAccessStatus: 'pending',
                    isTrial: true,
                };
                users.push(newUserObj);
                if (referrer.expiryDate) {
                    referrer.expiryDate = addDays(new Date(referrer.expiryDate), rewardDays).toISOString();
                }
                await saveFile(USERS_PATH, users);
                await appendAuditLog('referral_claimed', sessionUser, referrer, { trialDays, rewardDays });
                if (config.serverIdentifier && config.plexToken) {
                    inviteUserToPlex(newUserObj, config).catch(e => log('Failed to invite referral: ' + e.message));
                }
            }
        }
    }

    const token = jwt.sign(sessionUser, JWT_SECRET, { expiresIn: '7d' });
    setSessionCookie(req, res, token);

    if (!isAdmin) {
        const users = await loadFile(USERS_PATH, []);
        const existingUser = users.find(u => u.id === sessionUser.id || u.plexId === sessionUser.plexId);
        if (existingUser) {
            existingUser.lastLogin = new Date().toISOString();
            await saveFile(USERS_PATH, users);
        }
    }
    await appendAuditLog('user_login', sessionUser, sessionUser);

    log(`Plex login success for ${sessionUser.username} (admin=${isAdmin}, secureCookie=${FORCE_SECURE_COOKIES})`);

    if (redirectOnSuccess) {
        return res.redirect(withBasePath('/portal'));
    }
    return res.json({ message: 'Logged in successfully', user: sessionUser });
};

app.get('/api/auth/diagnostics', publicReadRateLimit, async (req, res) => {
    const config = await loadFile(CONFIG_PATH, {});
    res.json({
        appVersion,
        forceSecureCookies: FORCE_SECURE_COOKIES,
        configured: isPortalConfigured(config),
        hasAdminPlexId: !!config?.adminPlexId,
        plexServerUrlConfigured: !!resolveConfiguredPlexServerUrl(config),
        dockerRuntime: fsSync.existsSync('/.dockerenv'),
        clientId: CLIENT_ID ? `${String(CLIENT_ID).slice(0, 8)}…` : null,
    });
});

app.get('/api/auth/session', publicReadRateLimit, async (req, res) => {
    const token = req.cookies?.session;
    if (!token) return res.json({ authenticated: false });
    try {
        const user = jwt.verify(token, JWT_SECRET);
        const config = await loadFile(CONFIG_PATH, {});
        const isAdmin = await resolveCurrentAdmin(user, config);
        return res.json({
            authenticated: true,
            user: {
                username: user.username,
                plexId: user.plexId,
                jellyfinId: user.jellyfinId,
                authProvider: user.authProvider || 'plex',
                isAdmin,
            },
        });
    } catch {
        return res.json({ authenticated: false, reason: 'invalid_token' });
    }
});

app.post('/api/auth/plex/callback', authCallbackRateLimit, async (req, res) => {
    const { pinId, ref } = req.body;
    if (!pinId) return res.status(400).json({ error: 'pinId is required' });

    try {
        await handlePlexPinLogin(req, res, pinId, ref);
    } catch (err) {
        log('Error in plex callback: ' + err.message);
        res.status(500).json({ error: 'Failed to verify login' });
    }
});

app.get('/api/auth/plex/callback', authCallbackRateLimit, async (req, res) => {
    const { pinId, ref } = req.query;
    if (!pinId) return res.redirect(withBasePath('/?loginError=' + encodeURIComponent('Missing pin ID')));

    try {
        await handlePlexPinLogin(req, res, String(pinId), ref, { redirectOnSuccess: true });
    } catch (err) {
        log('Error in plex GET callback: ' + err.message);
        clearSessionCookie(req, res);
        res.redirect(withBasePath('/?loginError=' + encodeURIComponent('Login failed. Please try again.')));
    }
});

const assertInitialSetupAccess = async (req, res, options = {}) => {
    const existingConfig = await loadFile(CONFIG_PATH, {});
    const isConfigured = isPortalConfigured(existingConfig);
    if (isConfigured) {
        res.status(403).json({ error: 'Portal is already configured.' });
        return false;
    }
    if (options.allowUnconfigured === true) return true;
    if (canRunInitialSetup(req)) return true;
    const sessionToken = req.cookies && req.cookies.session;
    if (sessionToken) {
        try {
            jwt.verify(sessionToken, JWT_SECRET);
            return true;
        } catch (e) { /* fall through */ }
    }
    res.status(403).json({ error: 'Initial setup denied: localhost, valid setup token, or admin session required.' });
    return false;
};

app.post('/api/setup/plex/callback', setupRateLimit, authRateLimit, async (req, res) => {
    if (!(await assertInitialSetupAccess(req, res, { allowUnconfigured: true }))) return;
    const { pinId } = req.body;
    if (!pinId) return res.status(400).json({ error: 'pinId is required' });

    try {
        const pinData = await fetchPlexPinAuthToken(pinId);
        if (!pinData.authToken) {
            return res.status(400).json({ error: 'Plex sign-in not completed yet. Please try again.' });
        }

        const userRes = await apiFetch('https://plex.tv/api/v2/user', pinData.authToken);
        if (!userRes.ok) throw new Error('Failed to fetch Plex user info');
        const userData = await userRes.json();

        const servers = await fetchOwnedPlexServers(pinData.authToken);
        if (!servers.length) {
            return res.status(400).json({ error: 'No owned Plex servers found for this account. You must sign in as the server owner.' });
        }

        res.json({
            token: pinData.authToken,
            servers,
            username: userData.username || userData.title || userData.email || 'Plex User',
            email: userData.email || '',
        });
    } catch (err) {
        log(`Setup Plex callback error: ${err.message}`);
        res.status(500).json({ error: err.message || 'Failed to complete Plex sign-in' });
    }
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
    clearSessionCookie(req, res);
    res.json({ message: 'Logged out' });
});

app.post('/api/users/preferences', requireAuth, requireMember, async (req, res) => {
    try {
        const { optOutNewsletter } = req.body;
        const users = await loadFile(USERS_PATH, []);
        const localUser = findLocalUserForSession(users, req.user);
        const userIndex = localUser ? users.findIndex(u => normalized(u.id) === normalized(localUser.id)) : -1;

        if (userIndex === -1) {
            return res.status(404).json({ error: 'User not found' });
        }

        const oldPref = !!users[userIndex].optOutNewsletter;
        users[userIndex].optOutNewsletter = !!optOutNewsletter;
        await saveFile(USERS_PATH, users);

        if (oldPref !== !!optOutNewsletter) {
            await appendAuditLog(optOutNewsletter ? 'newsletter_opt_out' : 'newsletter_opt_in', req.user, req.user);
        }

        res.json({ success: true, user: users[userIndex] });
    } catch (e) {
        log(`Error updating preferences: ${e.message}`);
        res.status(500).json({ error: 'Failed to update preferences' });
    }
});

app.get('/api/users/me', requireAuth, async (req, res) => {
    const users = await loadFile(USERS_PATH, []);
    const localUser = findLocalUserForSession(users, req.user);
    const deletedUsers = await loadFile(DELETED_USERS_PATH, []);
    const config = await loadFile(CONFIG_PATH, {});
    const isAdmin = await resolveCurrentAdmin(req.user, config);
    req.user.isAdmin = isAdmin;

    if (!localUser && !isAdmin && isDeletedUser(deletedUsers, req.user)) {
        await appendAuditLog('session_blocked_deleted_user', req.user, req.user);
        clearSessionCookie(req, res);
        return res.status(403).json({ error: 'Your portal session has expired. Please contact the admin for access.' });
    }

    const isJellyfinPortal = String(config?.mediaServerType || '').toLowerCase() === 'jellyfin';
    let serverName = isJellyfinPortal ? 'Jellyfin Server' : 'Plex Server';
    let adminThumb = null;
    let sessionThumb = req.user.thumb || null;
    let requestUrl = config.requestUrl || 'https://yourdomain.com';
    if ((requestUrl === 'https://yourdomain.com' || !requestUrl) && config.requestAppUrl) {
        requestUrl = config.requestAppUrl;
    }
    let navOrder = config.navOrder || ['home', 'discover', 'users', 'status', 'analytics', 'mediastack', 'maintenance', 'request', 'settings', 'logout'];
    try {
        if (isJellyfinPortal && config?.jellyfinUrl && config?.jellyfinApiKey) {
            const profile = await getAdminProfile(config);
            serverName = profile.serverName || 'Jellyfin Server';
        } else if (config && config.plexToken && config.serverIdentifier) {
            const profile = await getAdminProfile(config);
            serverName = profile.serverName || 'Plex Server';
            adminThumb = profile.thumb;

            if (!sessionThumb) {
                const uri = await getPlexConnectionUri(config);
                if (uri) {
                    const accountId = await resolveLocalPlexAccountId(config, uri, req.user);
                    const { map } = await fetchPlexServerAccounts(uri, config);
                    if (accountId && map[accountId]?.thumb) {
                        sessionThumb = map[accountId].thumb;
                    }
                }
            }
        }
    } catch (e) { }

    res.json({
        session: { ...req.user, thumb: sessionThumb, isAdmin },
        account: localUser || null,
        serverName,
        adminThumb,
        mediaServerType: config.mediaServerType || 'plex',
        requestUrl,
        navOrder
    });
});

// Config endpoints
app.get('/api/config', requireAdmin, async (req, res) => {
    const config = await loadFile(CONFIG_PATH, {});
    const isConfigured = isPortalConfigured(config);
        const contactWhatsApp = config.contactWhatsApp || '';
        const contactEmail = config.contactEmail || '';

    if (isConfigured) {
        res.json({
            configured: true,
            settings: {
                token: config.plexToken ? SECRET_MASK : '',
                mediaServerType: config.mediaServerType || 'plex',
                serverIdentifier: config.serverIdentifier,
                plexServerUrl: config.plexServerUrl || '',
                jellyfinUrl: config.jellyfinUrl || '',
                jellyfinApiKey: config.jellyfinApiKey ? SECRET_MASK : '',
                checkIntervalMinutes: config.checkIntervalMinutes || 60,
                smtpHost: config.smtpHost || '',
                smtpPort: config.smtpPort || 587,
                smtpUser: config.smtpUser || '',
                smtpPass: config.smtpPass ? SECRET_MASK : '',
                smtpFrom: config.smtpFrom || '',
                smtpSecure: !!config.smtpSecure,
                emailDaysBefore: config.emailDaysBefore || 7,
                newsletterFrequency: config.newsletterFrequency || 'disabled',
                newsletterDay: config.newsletterDay || 0,
                inactiveCleanupEnabled: !!config.inactiveCleanupEnabled,
                inactiveCleanupDays: config.inactiveCleanupDays || 90,
                publicDomain: config.publicDomain || 'https://portal.yourdomain.com',
                requestUrl: config.requestUrl || 'https://yourdomain.com',
                contactUrl: config.contactUrl || '',
                contactWhatsApp,
                contactEmail,
                sonarrUrl: config.sonarrUrl || '',
                sonarrApiKey: config.sonarrApiKey ? SECRET_MASK : '',
                radarrUrl: config.radarrUrl || '',
                radarrApiKey: config.radarrApiKey ? SECRET_MASK : '',
                tautulliUrl: config.tautulliUrl || '',
                tautulliApiKey: config.tautulliApiKey ? SECRET_MASK : '',
                jellystatUrl: config.jellystatUrl || '',
                jellystatApiKey: config.jellystatApiKey ? SECRET_MASK : '',
                requestAppType: config.requestAppType === 'overseerr' ? 'seerr' : (config.requestAppType || 'none'),
                requestAppUrl: config.requestAppUrl || '',
                requestAppApiKey: config.requestAppApiKey ? SECRET_MASK : '',
                primaryColor: config.primaryColor || '#F7C600',
                customLogoUrl: config.customLogoUrl || '',
                brandingTheme: config.brandingTheme || 'plex',
                backgroundImageUrl: config.backgroundImageUrl || '',
                useScrollRevealAnimations: !!config.useScrollRevealAnimations,
                useCinematicLoading: !!config.useCinematicLoading,
                useBrandedSkeleton: config.useBrandedSkeleton !== false,
                useTrendingSlideshow: !!config.useTrendingSlideshow,
                trendingSlideshowInterval: config.trendingSlideshowInterval || 30,
                tmdbApiKey: config.tmdbApiKey ? SECRET_MASK : '',
                referralEnabled: !!config.referralEnabled,
                referralTrialDays: config.referralTrialDays || 3,
                referralRewardDays: config.referralRewardDays || 7,
                announcement: config.announcement || '',
                hideStreamUsers: config.hideStreamUsers === true ? 'anonymous' : (config.hideStreamUsers || 'false'),
                navOrder: config.navOrder || ['home', 'discover', 'users', 'status', 'analytics', 'mediastack', 'maintenance', 'request', 'settings', 'logout'],
                defaultLibraryIds: config.defaultLibraryIds || null,
                use24HourClock: !!config.use24HourClock,
                allowTemporaryAccess: !!config.allowTemporaryAccess,
                publicStatusEnabled: config.publicStatusEnabled !== false,
                showPosterQualityBadges: config.showPosterQualityBadges !== false,
                autoBackupEnabled: !!config.autoBackupEnabled,
                autoBackupIntervalDays: Number(config.autoBackupIntervalDays) > 0 ? Number(config.autoBackupIntervalDays) : 2,
                autoBackupRetentionCount: Number(config.autoBackupRetentionCount) > 0 ? Number(config.autoBackupRetentionCount) : 10,
                maintenanceExperimentalEnabled: !!config.maintenanceExperimentalEnabled,
                dashboardLayout: normalizeSectionLayout(config.dashboardLayout),
                showUsernamesInAnalytics: !!config.showUsernamesInAnalytics,
                useTrendingSlideshowOnLogin: config.useTrendingSlideshowOnLogin !== false
            },
        });
    } else {
        res.json({
            configured: false,
            settings: {
                token: '',
                mediaServerType: 'plex',
                serverIdentifier: '',
                plexServerUrl: '',
                jellyfinUrl: '',
                jellyfinApiKey: '',
                checkIntervalMinutes: 60,
                smtpHost: '',
                smtpPort: 587,
                smtpUser: '',
                smtpPass: '',
                smtpFrom: '',
                smtpSecure: false,
                emailDaysBefore: 7,
                newsletterFrequency: 'disabled',
                newsletterDay: 0,
                inactiveCleanupEnabled: false,
                inactiveCleanupDays: 90,
                publicDomain: 'https://portal.yourdomain.com',
                requestUrl: 'https://yourdomain.com',
                contactUrl: '',
                sonarrUrl: '',
                sonarrApiKey: '',
                radarrUrl: '',
                radarrApiKey: '',
                tautulliUrl: '',
                tautulliApiKey: '',
                jellystatUrl: '',
                jellystatApiKey: '',
                requestAppType: 'none',
                requestAppUrl: '',
                requestAppApiKey: '',
                primaryColor: '#F7C600',
                customLogoUrl: '',
                brandingTheme: 'plex',
                backgroundImageUrl: '',
                useScrollRevealAnimations: false,
                useCinematicLoading: false,
                useBrandedSkeleton: true,
                useTrendingSlideshow: false,
                trendingSlideshowInterval: 30,
                tmdbApiKey: '',
                referralEnabled: false,
                referralTrialDays: 3,
                referralRewardDays: 7,
                announcement: '',
                hideStreamUsers: 'false',
                navOrder: ['home', 'discover', 'users', 'status', 'analytics', 'mediastack', 'maintenance', 'request', 'settings', 'logout'],
                defaultLibraryIds: null,
                use24HourClock: false,
                allowTemporaryAccess: false,
                publicStatusEnabled: true,
                showPosterQualityBadges: true,
                autoBackupEnabled: false,
                autoBackupIntervalDays: 2,
                autoBackupRetentionCount: 10,
                maintenanceExperimentalEnabled: false,
                dashboardLayout: DEFAULT_DASHBOARD_LAYOUT
            },
        });
    }
});

app.post('/api/config', setupRateLimit, async (req, res) => {
    const {
        token, mediaServerType, serverIdentifier, checkIntervalMinutes,
        plexServerUrl: plexServerUrlFromBody, jellyfinUrl, jellyfinApiKey,
        smtpHost, smtpPort, smtpUser, smtpPass, smtpFrom, smtpSecure, emailDaysBefore,
        newsletterFrequency, newsletterDay, publicDomain, requestUrl, contactUrl, contactWhatsApp, contactEmail,
        sonarrUrl, sonarrApiKey, radarrUrl, radarrApiKey, tautulliUrl, tautulliApiKey, jellystatUrl, jellystatApiKey,
        requestAppType, requestAppUrl, requestAppApiKey,
        inactiveCleanupEnabled, inactiveCleanupDays,
        primaryColor, customLogoUrl, brandingTheme, backgroundImageUrl, useScrollRevealAnimations, useCinematicLoading, useBrandedSkeleton, useTrendingSlideshow, trendingSlideshowInterval, tmdbApiKey, referralEnabled, referralTrialDays, referralRewardDays, announcement, navOrder, hideStreamUsers, defaultLibraryIds, use24HourClock, allowTemporaryAccess, showPosterQualityBadges,
        publicStatusEnabled, autoBackupEnabled, autoBackupIntervalDays, autoBackupRetentionCount, maintenanceExperimentalEnabled, dashboardLayout,
        showUsernamesInAnalytics, useTrendingSlideshowOnLogin
    } = req.body;

    const existingConfig = await loadFile(CONFIG_PATH, {});
    const normalizedMediaServerType = ['plex', 'jellyfin'].includes(String(mediaServerType || '').toLowerCase())
        ? String(mediaServerType || '').toLowerCase()
        : (existingConfig.mediaServerType || 'plex');
    const normalizedToken = normalizePlexToken(token);
    const normalizedServerIdentifier = String(serverIdentifier).trim();
    const isConfigured = isPortalConfigured(existingConfig);
    const wasMaintenanceEnabled = !!existingConfig.maintenanceExperimentalEnabled;

    if (normalizedMediaServerType === 'plex' && (!normalizedToken || !normalizedServerIdentifier)) {
        return res.status(400).json({ error: 'Plex token and serverIdentifier are required.' });
    }
    if (normalizedMediaServerType === 'jellyfin' && (!jellyfinUrl || !jellyfinApiKey)) {
        return res.status(400).json({ error: 'Jellyfin URL and API key are required.' });
    }

    if (isConfigured) {
        const sessionToken = req.cookies && req.cookies.session;
        if (!sessionToken) {
            return res.status(403).json({ error: 'Forbidden: App is already configured. Please log in as admin to modify settings.' });
        }
        try {
            const decoded = jwt.verify(sessionToken, JWT_SECRET);
            const isAdmin = await resolveCurrentAdmin(decoded, existingConfig);
            if (!isAdmin) {
                return res.status(403).json({ error: 'Forbidden: Admins only.' });
            }
            req.user = decoded;
        } catch (e) {
            return res.status(403).json({ error: 'Forbidden: Invalid or expired session. Please log in again.' });
        }
    } else if (!canRunInitialSetup(req)) {
        if (normalizedMediaServerType === 'jellyfin') {
            return res.status(403).json({ error: 'Initial setup is restricted. Configure SETUP_TOKEN or run setup from localhost.' });
        }
        const candidatePlexServerUrl = (plexServerUrlFromBody !== undefined
            ? String(plexServerUrlFromBody || '').trim()
            : String(existingConfig.plexServerUrl || '').trim()) || resolveConfiguredPlexServerUrl(existingConfig);
        const verifiedPlexOwner = await verifyInitialSetupPlexOwner(normalizedToken, normalizedServerIdentifier, candidatePlexServerUrl);
        if (!verifiedPlexOwner) {
            if (!SETUP_TOKEN) {
                return res.status(403).json({ error: 'Initial setup is restricted. Sign in with the Plex server owner account, configure SETUP_TOKEN, or run setup from localhost.' });
            }
            return res.status(403).json({ error: 'Initial setup denied: invalid setup token or Plex server owner verification failed.' });
        }
    }
    const interval = parseInt(checkIntervalMinutes, 10);
    let safeSonarrUrl = '';
    let safeRadarrUrl = '';
    let safeTautulliUrl = '';
    let safeJellystatUrl = '';
    let safeRequestAppUrl = '';
    let safeJellyfinUrl = '';
    const resolveConfigIntegrationUrl = (incoming, existing) => {
        const existingValue = typeof existing === 'string' ? existing : '';
        // Keep existing URL as-is when caller did not change the value.
        // This prevents unrelated settings edits from failing on legacy private URLs.
        if (incoming === undefined || incoming === null) return existingValue;
        const incomingValue = String(incoming).trim();
        if (incomingValue === String(existingValue || '').trim()) return existingValue;
        return sanitizeIntegrationUrl(incomingValue);
    };
    try {
        safeSonarrUrl = resolveConfigIntegrationUrl(sonarrUrl, existingConfig.sonarrUrl || '');
        safeRadarrUrl = resolveConfigIntegrationUrl(radarrUrl, existingConfig.radarrUrl || '');
        safeTautulliUrl = resolveConfigIntegrationUrl(tautulliUrl, existingConfig.tautulliUrl || '');
        safeJellystatUrl = resolveConfigIntegrationUrl(jellystatUrl, existingConfig.jellystatUrl || '');
        safeRequestAppUrl = resolveConfigIntegrationUrl(requestAppUrl, existingConfig.requestAppUrl || '');
        safeJellyfinUrl = resolveConfigIntegrationUrl(jellyfinUrl, existingConfig.jellyfinUrl || '');
    } catch (e) {
        return res.status(400).json({ error: `Invalid integration URL: ${e.message}` });
    }

    // Secrets are returned to the UI as SECRET_MASK. If the UI sends the mask
    // back unchanged, keep the existing stored value rather than overwriting it.
    const resolveSecret = (incoming, existing) => {
        if (incoming === undefined || incoming === null) return existing || '';
        if (incoming === SECRET_MASK) return existing || '';
        return String(incoming);
    };

    const config = {
        ...existingConfig,
        mediaServerType: normalizedMediaServerType,
        plexToken: normalizedMediaServerType === 'jellyfin' ? resolveSecret(token, existingConfig.plexToken) : resolveSecret(normalizedToken, existingConfig.plexToken),
        serverIdentifier: normalizedMediaServerType === 'jellyfin' ? (normalizedServerIdentifier || existingConfig.serverIdentifier || '') : normalizedServerIdentifier,
        plexServerUrl: (plexServerUrlFromBody !== undefined ? String(plexServerUrlFromBody || '').trim() : existingConfig.plexServerUrl) || '',
        jellyfinUrl: safeJellyfinUrl,
        jellyfinApiKey: resolveSecret(jellyfinApiKey, existingConfig.jellyfinApiKey),
        checkIntervalMinutes: (interval > 0 ? interval : 60),
        smtpHost: smtpHost || '',
        smtpPort: parseInt(smtpPort, 10) || 587,
        smtpUser: smtpUser || '',
        smtpPass: resolveSecret(smtpPass, existingConfig.smtpPass),
        smtpFrom: smtpFrom || '',
        smtpSecure: !!smtpSecure,
        emailDaysBefore: parseInt(emailDaysBefore, 10) || 7,
        newsletterFrequency: newsletterFrequency || 'disabled',
        newsletterDay: parseInt(newsletterDay, 10) || 0,
        inactiveCleanupEnabled: !!inactiveCleanupEnabled,
        inactiveCleanupDays: parseInt(inactiveCleanupDays, 10) || 90,
        publicDomain: publicDomain || 'https://portal.yourdomain.com',
        requestUrl: requestUrl || 'https://yourdomain.com',
        contactUrl: contactUrl || '',
        contactWhatsApp: contactWhatsApp || '',
        contactEmail: contactEmail || '',
        sonarrUrl: safeSonarrUrl,
        sonarrApiKey: resolveSecret(sonarrApiKey, existingConfig.sonarrApiKey),
        radarrUrl: safeRadarrUrl,
        radarrApiKey: resolveSecret(radarrApiKey, existingConfig.radarrApiKey),
        tautulliUrl: safeTautulliUrl,
        tautulliApiKey: resolveSecret(tautulliApiKey, existingConfig.tautulliApiKey),
        jellystatUrl: safeJellystatUrl,
        jellystatApiKey: resolveSecret(jellystatApiKey, existingConfig.jellystatApiKey),
        requestAppType: ['none', 'seerr', 'overseerr', 'jellyseerr', 'ombi'].includes(String(requestAppType || '').toLowerCase()) ? (String(requestAppType).toLowerCase() === 'overseerr' ? 'seerr' : String(requestAppType).toLowerCase()) : (existingConfig.requestAppType || 'none'),
        requestAppUrl: safeRequestAppUrl,
        requestAppApiKey: resolveSecret(requestAppApiKey, existingConfig.requestAppApiKey),
        primaryColor: primaryColor || '#F7C600',
        customLogoUrl: customLogoUrl || '',
        brandingTheme: ['plex', 'slate', 'nordic'].includes(String(brandingTheme || '').toLowerCase()) ? String(brandingTheme).toLowerCase() : (existingConfig.brandingTheme || 'plex'),
        backgroundImageUrl: backgroundImageUrl || '',
        useScrollRevealAnimations: !!useScrollRevealAnimations,
        useCinematicLoading: !!useCinematicLoading,
        useBrandedSkeleton: useBrandedSkeleton !== false,
        useTrendingSlideshow: !!useTrendingSlideshow,
        trendingSlideshowInterval: parseInt(trendingSlideshowInterval, 10) || 30,
        tmdbApiKey: resolveSecret(tmdbApiKey, existingConfig.tmdbApiKey),
        referralEnabled: !!referralEnabled,
        referralTrialDays: parseInt(referralTrialDays, 10) || 3,
        referralRewardDays: parseInt(referralRewardDays, 10) || 7,
        announcement: announcement || '',
        hideStreamUsers: hideStreamUsers === true ? 'anonymous' : (hideStreamUsers === false ? 'false' : (hideStreamUsers || 'false')),
        navOrder: Array.isArray(navOrder) ? navOrder : existingConfig.navOrder || ['home', 'discover', 'users', 'status', 'analytics', 'mediastack', 'maintenance', 'request', 'settings', 'logout'],
        defaultLibraryIds: Array.isArray(defaultLibraryIds) ? defaultLibraryIds : null,
        use24HourClock: !!use24HourClock,
        allowTemporaryAccess: !!allowTemporaryAccess,
        publicStatusEnabled: publicStatusEnabled !== false,
        showPosterQualityBadges: showPosterQualityBadges !== false,
        autoBackupEnabled: !!autoBackupEnabled,
        autoBackupIntervalDays: Math.max(1, parseInt(autoBackupIntervalDays, 10) || 2),
        autoBackupRetentionCount: Math.max(1, parseInt(autoBackupRetentionCount, 10) || 10),
        maintenanceExperimentalEnabled: maintenanceExperimentalEnabled !== undefined ? !!maintenanceExperimentalEnabled : !!existingConfig.maintenanceExperimentalEnabled,
        showUsernamesInAnalytics: showUsernamesInAnalytics !== undefined ? !!showUsernamesInAnalytics : !!existingConfig.showUsernamesInAnalytics,
        useTrendingSlideshowOnLogin: useTrendingSlideshowOnLogin !== undefined ? !!useTrendingSlideshowOnLogin : (existingConfig.useTrendingSlideshowOnLogin !== false),
        dashboardLayout: ('dashboardLayout' in req.body)
            ? normalizeSectionLayout(req.body.dashboardLayout)
            : normalizeSectionLayout(existingConfig.dashboardLayout)
    };
    await saveFile(CONFIG_PATH, config);
    await syncAdminPlexIdFromConfigToken(config, { persist: true });
    // Invalidate caches tied to the Plex token/server so changes take effect immediately.
    cachedPlexConnectionUri = null;
    lastPlexConnectionUriFetch = 0;
    cachedPlexAccounts = null;
    cachedPlexAccountsAt = 0;
    cachedAdminProfile = null;
    lastAdminProfileFetch = 0;
    cachedArrCatalog = null;
    cachedArrCatalogAt = 0;
    systemJobs.autoBackup.nextRun = config.autoBackupEnabled ? computeNextBackupRun(config) : null;
    log('Configuration saved successfully.');
    startBackgroundService(); // (Re)start service with new config
    const becameConfigured = !isConfigured && isPortalConfigured(config);
    const maintenanceJustEnabled = !wasMaintenanceEnabled && !!config.maintenanceExperimentalEnabled;
    if ((becameConfigured || maintenanceJustEnabled) && !!config.maintenanceExperimentalEnabled) {
        // Kick an immediate index build after setup/enablement so rules are usable right away.
        setTimeout(async () => {
            try {
                await buildMaintenanceMediaIndex({ actor: req.user || { username: 'System', email: 'system@local' }, force: true });
                log('Maintenance index rebuilt after setup/config enablement.');
            } catch (e) {
                log(`Post-setup maintenance index rebuild failed: ${e.message}`);
            }
        }, 1000);
    }
    res.json({ message: 'Configuration saved.' });
});

let tmdbCache = { data: null, lastFetch: 0 };
async function fetchTmdbTrendingBackgrounds(apiKey) {
    if (!apiKey) return [];
    if (tmdbCache.data && Date.now() - tmdbCache.lastFetch < 12 * 60 * 60 * 1000) {
        return tmdbCache.data;
    }
    try {
        let allResults = [];
        for (let page = 1; page <= 10; page++) {
            const res = await fetch(`https://api.themoviedb.org/3/trending/all/week?api_key=${apiKey}&page=${page}`);
            if (!res.ok) continue;
            const json = await res.json();
            if (json && json.results) {
                allResults = allResults.concat(json.results);
            }
        }
        if (allResults.length > 0) {
            const bgs = allResults
                .filter(i => i.backdrop_path)
                .map(i => `https://image.tmdb.org/t/p/original${i.backdrop_path}`);
            tmdbCache.data = [...new Set(bgs)].slice(0, 100);
            tmdbCache.lastFetch = Date.now();
            return tmdbCache.data;
        }
    } catch (e) {
        log(`Failed to fetch TMDB trending: ${e.message}`);
    }
    return tmdbCache.data || [];
}

app.get('/api/config/public', async (req, res) => {
    try {
        const config = (await loadFile(CONFIG_PATH, {})) || {};
        res.json({
            mediaServerType: config.mediaServerType || 'plex',
            primaryColor: config.primaryColor || '#F7C600',
            customLogoUrl: config.customLogoUrl || '',
            brandingTheme: config.brandingTheme || 'plex',
            backgroundImageUrl: config.backgroundImageUrl || '',
            useScrollRevealAnimations: !!config.useScrollRevealAnimations,
            useCinematicLoading: !!config.useCinematicLoading,
            useBrandedSkeleton: config.useBrandedSkeleton !== false,
            useTrendingSlideshow: !!config.useTrendingSlideshow,
            useTrendingSlideshowOnLogin: config.useTrendingSlideshowOnLogin !== false,
            trendingSlideshowInterval: parseInt(config.trendingSlideshowInterval, 10) || 30,
            trendingBackgrounds: (!!config.useTrendingSlideshow || config.useTrendingSlideshowOnLogin !== false) ? await fetchTmdbTrendingBackgrounds(config.tmdbApiKey) : [],
            announcement: config.announcement || '',
            referralEnabled: !!config.referralEnabled,
            appVersion: appVersion,
            use24HourClock: !!config.use24HourClock,
            allowTemporaryAccess: !!config.allowTemporaryAccess,
            publicStatusEnabled: config.publicStatusEnabled !== false,
            showPosterQualityBadges: config.showPosterQualityBadges !== false,
            dashboardLayout: normalizeSectionLayout(config.dashboardLayout),
            basePath: BASE_PATH,
        });
    } catch (error) {
        res.json({
            mediaServerType: 'plex',
            primaryColor: '#F7C600',
            customLogoUrl: '',
            brandingTheme: 'plex',
            backgroundImageUrl: '',
            useScrollRevealAnimations: false,
            useCinematicLoading: false,
            useBrandedSkeleton: true,
            useTrendingSlideshow: false,
            trendingSlideshowInterval: 30,
            trendingBackgrounds: [],
            announcement: '',
            referralEnabled: false,
            appVersion: appVersion,
            use24HourClock: false,
            allowTemporaryAccess: false,
            publicStatusEnabled: true,
            showPosterQualityBadges: true,
            dashboardLayout: DEFAULT_DASHBOARD_LAYOUT,
            basePath: BASE_PATH,
        });
    }
});

app.post('/api/config/logo', requireAdmin, express.raw({ type: 'image/*', limit: '5mb' }), async (req, res) => {
    try {
        const buf = req.body;
        if (!Buffer.isBuffer(buf) || buf.length < 4) {
            return res.status(400).json({ error: 'Invalid image file.' });
        }
        // Verify PNG (89 50 4E 47) or JPEG (FF D8 FF) magic bytes — Content-Type header alone is spoofable
        const isPng  = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
        const isJpeg = buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF;
        if (!isPng && !isJpeg) {
            return res.status(400).json({ error: 'Invalid image format. Only PNG and JPEG files are accepted.' });
        }
        const logoDir = path.join(process.cwd(), 'static');
        await fs.mkdir(logoDir, { recursive: true });
        const logoPath = path.join(logoDir, 'logo.png');
        await fs.writeFile(logoPath, buf);
        res.json({ message: 'Logo uploaded successfully.' });
    } catch (e) {
        log('Failed to upload logo: ' + e.message);
        res.status(500).json({ error: 'Failed to upload logo.' });
    }
});

app.post('/api/config/test-email', requireAdmin, async (req, res) => {
    const { smtpHost, smtpPort, smtpUser, smtpPass, smtpFrom, smtpSecure, testRecipient } = req.body;

    if (!smtpHost || !smtpUser || !smtpPass || !testRecipient) {
        return res.status(400).json({ error: 'Host, user, password, and test recipient are required.' });
    }

    // The UI shows the stored password as SECRET_MASK; resolve it back to the
    // real stored value so the test uses actual credentials.
    let effectiveSmtpPass = smtpPass;
    if (smtpPass === SECRET_MASK) {
        const storedConfig = await loadFile(CONFIG_PATH, {});
        effectiveSmtpPass = storedConfig.smtpPass || '';
    }

    const config = {
        smtpHost,
        smtpPort: parseInt(smtpPort, 10) || 587,
        smtpUser,
        smtpPass: effectiveSmtpPass,
        smtpFrom,
        smtpSecure: !!smtpSecure,
    };

    // Check if logo exists to determine if we should reference it in HTML
    const logoPath = path.join(process.cwd(), 'static', 'logo.png');
    let hasLogo = false;
    try {
        await fs.access(logoPath);
        hasLogo = true;
    } catch (e) { }

    try {
        log(`Sending test email to ${testRecipient}...`);
        await sendEmail(
            config,
            testRecipient,
            '[Plex Server] Test Email Connection',
            `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f6f9; padding: 30px; color: #333333; line-height: 1.6;">
                <div style="max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border-top: 6px solid #e5a00d;">
                    <div style="background-color: #282A2D; padding: 25px; text-align: center;">
                        ${hasLogo ? '<img src="cid:logo" alt="Logo" style="max-height: 100px; display: block; margin: 0 auto 10px auto;" />' : ''}
                        <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase;">PLEX SERVER</h1>
                    </div>
                    <div style="padding: 30px 40px;">
                        <h2 style="color: #282A2D; font-size: 20px; margin-top: 0; font-weight: 600; text-align: center;">SMTP Test Successful</h2>
                        <p>This is a test notification confirming that the Plex SMTP server parameters are active and communicating successfully.</p>
                        <p>Automated expiry notifications will use this template design to contact shared members before access revocation.</p>
                    </div>
                    <div style="background-color: #f7fafc; padding: 20px 30px; border-top: 1px solid #edf2f7; text-align: center; font-size: 12px; color: #a0aec0;">
                        <p style="margin: 0;">Automated alert from the Plex Expiry Service.</p>
                    </div>
                </div>
            </div>
            `
        );
        res.json({ message: 'Test email sent successfully!' });
    } catch (error) {
        log(`Failed to send test email: ${error.message}`);
        res.status(500).json({ error: `SMTP test failed: ${error.message}` });
    }
});

const resolveTestCredential = (incoming, existing) => {
    if (incoming === undefined || incoming === null || incoming === '') return existing || '';
    if (incoming === SECRET_MASK) return existing || '';
    return String(incoming);
};

const resolveIntegrationUrlForTest = (incoming, existing) => {
    const url = resolveTestCredential(incoming, existing);
    if (!url) return '';
    const trimmedIncoming = typeof incoming === 'string' ? incoming.trim() : '';
    const trimmedExisting = typeof existing === 'string' ? existing.trim() : '';
    if (trimmedIncoming !== '' && trimmedIncoming !== trimmedExisting) {
        return sanitizeIntegrationUrl(trimmedIncoming);
    }
    return resolveIntegrationUrlForFetch(url);
};

const isSeerrFamilyRequestApp = (type) => {
    const lower = String(type || '').toLowerCase();
    return lower === 'seerr' || lower === 'overseerr' || lower === 'jellyseerr';
};

const testSeerrFamilyConnection = async (baseUrl, apiKey) => {
    const headers = { Accept: 'application/json', 'X-Api-Key': apiKey };
    const statusRes = await fetchWithTimeout(`${baseUrl}/api/v1/status`, { headers }, 12000);
    if (!statusRes.ok) throw new Error(`Seerr returned HTTP ${statusRes.status} at /api/v1/status`);
    const data = await statusRes.json().catch(() => ({}));
    const authRes = await fetchWithTimeout(`${baseUrl}/api/v1/request/count`, { headers }, 12000);
    if (!authRes.ok) throw new Error(`Seerr API key rejected (HTTP ${authRes.status})`);
    const version = data.version || data.commitTag || '?';
    return { version, message: `Seerr v${version} connected` };
};

const assertIntegrationTestAccess = async (req, res) => {
    const stored = await loadFile(CONFIG_PATH, {});
    const isConfigured = isPortalConfigured(stored);
    if (isConfigured) {
        const sessionToken = req.cookies && req.cookies.session;
        if (!sessionToken) {
            res.status(403).json({ error: 'Forbidden: admin login required.' });
            return false;
        }
        try {
            const decoded = jwt.verify(sessionToken, JWT_SECRET);
            const isAdmin = await resolveCurrentAdmin(decoded, stored);
            if (!isAdmin) {
                res.status(403).json({ error: 'Forbidden: admins only.' });
                return false;
            }
            req.user = decoded;
        } catch (e) {
            res.status(403).json({ error: 'Forbidden: invalid session.' });
            return false;
        }
    }
    return true;
};

app.post('/api/config/test-integration', setupRateLimit, async (req, res) => {
    if (!(await assertIntegrationTestAccess(req, res))) return;

    const {
        type,
        token, serverIdentifier, plexServerUrl,
        jellyfinUrl, jellyfinApiKey,
        sonarrUrl, sonarrApiKey,
        radarrUrl, radarrApiKey,
        tautulliUrl, tautulliApiKey,
        jellystatUrl, jellystatApiKey,
        requestAppType, requestAppUrl, requestAppApiKey,
    } = req.body || {};

    const stored = await loadFile(CONFIG_PATH, {});

    try {
        if (type === 'plex') {
            const plexToken = resolveTestCredential(token, stored.plexToken);
            const serverId = resolveTestCredential(serverIdentifier, stored.serverIdentifier);
            if (!plexToken || !serverId) return res.status(400).json({ error: 'Plex token and server identifier are required.' });
            cachedPlexConnectionUri = null;
            lastPlexConnectionUriFetch = 0;
            const directUrl = resolveTestCredential(plexServerUrl, stored.plexServerUrl);
            const testConfig = { ...stored, plexToken, serverIdentifier: serverId, ...(directUrl ? { plexServerUrl: directUrl } : {}) };
            const uri = await getPlexConnectionUri(testConfig);
            const identityRes = await fetchWithTimeout(`${uri}/identity?X-Plex-Token=${encodeURIComponent(plexToken)}`, {
                headers: { Accept: 'application/json' },
            }, 12000);
            if (!identityRes.ok) throw new Error(`Plex server returned HTTP ${identityRes.status}`);
            const identity = await identityRes.json().catch(() => ({}));
            const container = identity.MediaContainer || identity;
            const version = container.version || container.Version || '';
            const message = version
                ? `Connected to Plex Media Server (v${version})`
                : 'Connected to Plex Media Server';
            return res.json({ ok: true, message, details: { version: version || null, machineIdentifier: container.machineIdentifier || serverId, uri } });
        }

        if (type === 'jellyfin') {
            const url = resolveIntegrationUrlForFetch(resolveTestCredential(jellyfinUrl, stored.jellyfinUrl));
            const apiKey = resolveTestCredential(jellyfinApiKey, stored.jellyfinApiKey);
            if (!url || !apiKey) return res.status(400).json({ error: 'Jellyfin URL and API key are required.' });
            const infoRes = await fetchWithTimeout(`${url}/System/Info`, {
                headers: { Accept: 'application/json', 'X-Emby-Token': apiKey },
            }, 12000);
            if (!infoRes.ok) throw new Error(`Jellyfin returned HTTP ${infoRes.status}`);
            const data = await infoRes.json().catch(() => ({}));
            const version = data.Version || data.version || '?';
            return res.json({ ok: true, message: `Jellyfin v${version} connected`, details: { version, serverName: data.ServerName || data.LocalAddress || null } });
        }

        if (type === 'sonarr') {
            const url = resolveIntegrationUrlForTest(sonarrUrl, stored.sonarrUrl);
            const apiKey = resolveTestCredential(sonarrApiKey, stored.sonarrApiKey);
            if (!url || !apiKey) return res.status(400).json({ error: 'Sonarr URL and API key are required.' });
            const statusRes = await fetchWithTimeout(`${url}/api/v3/system/status`, {
                headers: { 'X-Api-Key': apiKey, Accept: 'application/json' },
            }, 12000);
            if (!statusRes.ok) throw new Error(`Sonarr returned HTTP ${statusRes.status}`);
            const data = await statusRes.json();
            return res.json({ ok: true, message: `Sonarr v${data.version || '?'} connected`, details: { version: data.version, appName: data.appName } });
        }

        if (type === 'radarr') {
            const url = resolveIntegrationUrlForTest(radarrUrl, stored.radarrUrl);
            const apiKey = resolveTestCredential(radarrApiKey, stored.radarrApiKey);
            if (!url || !apiKey) return res.status(400).json({ error: 'Radarr URL and API key are required.' });
            const statusRes = await fetchWithTimeout(`${url}/api/v3/system/status`, {
                headers: { 'X-Api-Key': apiKey, Accept: 'application/json' },
            }, 12000);
            if (!statusRes.ok) throw new Error(`Radarr returned HTTP ${statusRes.status}`);
            const data = await statusRes.json();
            return res.json({ ok: true, message: `Radarr v${data.version || '?'} connected`, details: { version: data.version, appName: data.appName } });
        }

        if (type === 'tautulli') {
            const url = resolveIntegrationUrlForTest(tautulliUrl, stored.tautulliUrl);
            const apiKey = resolveTestCredential(tautulliApiKey, stored.tautulliApiKey);
            if (!url || !apiKey) return res.status(400).json({ error: 'Tautulli URL and API key are required.' });
            const infoRes = await fetchWithTimeout(`${url}/api/v2?apikey=${encodeURIComponent(apiKey)}&cmd=get_server_info`, {
                headers: { Accept: 'application/json' },
            }, 12000);
            if (!infoRes.ok) throw new Error(`Tautulli returned HTTP ${infoRes.status}`);
            const payload = await infoRes.json();
            if (payload?.response?.result !== 'success') throw new Error(payload?.response?.message || 'Tautulli API error');
            const info = payload.response.data || {};
            return res.json({ ok: true, message: `Tautulli connected (${info.pms_name || 'Plex'})`, details: { pmsVersion: info.pms_version, pmsPlatform: info.pms_platform } });
        }

        if (type === 'jellystat') {
            const url = resolveIntegrationUrlForFetch(resolveTestCredential(jellystatUrl, stored.jellystatUrl));
            const apiKey = resolveTestCredential(jellystatApiKey, stored.jellystatApiKey);
            if (!url || !apiKey) return res.status(400).json({ error: 'Jellystat URL and API key are required.' });
            const statsRes = await fetchWithTimeout(`${url}/stats/getViewsByLibraryType?days=30`, {
                headers: { Accept: 'application/json', 'X-API-Token': apiKey },
            }, 12000);
            if (!statsRes.ok) throw new Error(`Jellystat returned HTTP ${statsRes.status}`);
            const data = await statsRes.json().catch(() => null);
            return res.json({ ok: true, message: 'Jellystat connected', details: { sample: data ? true : false } });
        }

        if (type === 'requestApp') {
            const appType = String(resolveTestCredential(requestAppType, stored.requestAppType) || 'none').toLowerCase();
            const baseUrl = resolveIntegrationUrlForTest(requestAppUrl, stored.requestAppUrl);
            const apiKey = resolveTestCredential(requestAppApiKey, stored.requestAppApiKey);
            if (appType === 'none') return res.status(400).json({ error: 'Request app type must be selected.' });
            if (!baseUrl || !apiKey) return res.status(400).json({ error: 'Request app URL and API key are required.' });
            if (isSeerrFamilyRequestApp(appType)) {
                const result = await testSeerrFamilyConnection(baseUrl, apiKey);
                return res.json({ ok: true, message: result.message, details: { version: result.version } });
            }
            if (appType === 'ombi') {
                const headers = { Accept: 'application/json', 'X-Api-Key': apiKey };
                const aboutRes = await fetchWithTimeout(`${baseUrl}/api/v1/Settings/about`, { headers }, 12000);
                if (!aboutRes.ok) throw new Error(`Ombi returned HTTP ${aboutRes.status}`);
                const data = await aboutRes.json().catch(() => ({}));
                return res.json({ ok: true, message: `Ombi v${data.version || data.applicationVersion || '?'} connected`, details: { version: data.version || data.applicationVersion } });
            }
            return res.status(400).json({ error: 'Unsupported request app type.' });
        }

        return res.status(400).json({ error: 'Unknown integration type.' });
    } catch (e) {
        log(`Integration test failed (${type}): ${e.message}`);
        res.status(500).json({ error: e.message || 'Connection test failed.' });
    }
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

app.post('/api/plex/servers', setupRateLimit, async (req, res) => {
    const { token, plexServerUrl } = req.body;
    const normalizedToken = normalizePlexToken(token);
    if (!normalizedToken) return res.status(400).json({ error: 'Plex token is required.' });

    try {
        const existingConfig = await loadFile(CONFIG_PATH, {});
        const isConfigured = isPortalConfigured(existingConfig);
        if (isConfigured) {
            const sessionToken = req.cookies && req.cookies.session;
            if (!sessionToken) {
                return res.status(403).json({ error: 'Forbidden: Admin session required.' });
            }
            let decoded;
            try {
                decoded = jwt.verify(sessionToken, JWT_SECRET);
            } catch (e) {
                return res.status(403).json({ error: 'Forbidden: Invalid admin session.' });
            }
            const isAdmin = await resolveCurrentAdmin(decoded, existingConfig);
            if (!isAdmin) {
                return res.status(403).json({ error: 'Forbidden: Admins only.' });
            }
        }
        // During first-run setup, allow server discovery from LAN/Docker without localhost/SETUP_TOKEN.

        log('Fetching Plex servers using /pms/servers XML API...');
        let servers = [];
        try {
            servers = await fetchOwnedPlexServers(normalizedToken);
        } catch (e) {
            log(`Owned Plex server discovery failed: ${e.message}`);
        }

        const directUrl = String(plexServerUrl || '').trim() || resolveConfiguredPlexServerUrl(existingConfig);
        if (servers.length === 0 && directUrl) {
            try {
                const baseUrl = resolveIntegrationUrlForFetch(directUrl);
                const identityRes = await fetchWithTimeout(`${baseUrl}/identity`, {
                    headers: { 'X-Plex-Token': normalizedToken, Accept: 'application/json' },
                }, 6000);
                if (identityRes.ok) {
                    const identityText = await identityRes.text();
                    let machineIdentifier = '';
                    let friendlyName = '';
                    try {
                        const parsed = JSON.parse(identityText);
                        const container = parsed?.MediaContainer || parsed || {};
                        machineIdentifier = String(container.machineIdentifier || '');
                        friendlyName = String(container.friendlyName || container.name || 'Plex Server');
                    } catch {
                        const machineMatch = identityText.match(/machineIdentifier="([^"]+)"/i)
                            || identityText.match(/<machineIdentifier>([^<]+)<\/machineIdentifier>/i);
                        machineIdentifier = machineMatch ? String(machineMatch[1]) : '';
                        const nameMatch = identityText.match(/friendlyName="([^"]+)"/i)
                            || identityText.match(/<friendlyName>([^<]+)<\/friendlyName>/i);
                        friendlyName = nameMatch ? String(nameMatch[1]) : 'Plex Server';
                    }
                    if (machineIdentifier) {
                        servers = [{ name: friendlyName || 'Plex Server', identifier: machineIdentifier }];
                    }
                }
            } catch (e) {
                log(`Direct Plex URL identity fallback failed: ${e.message}`);
            }
        }

        if (servers.length === 0) {
            log('No owned servers found via Plex.tv or direct URL.');
        } else {
            log(`Found ${servers.length} server(s).`);
        }

        res.json(servers);
    } catch (error) {
        log(`An exception occurred in /api/plex/servers: ${error.message}`);
        res.status(500).json({ error: error.message || 'An unexpected error occurred while fetching servers.' });
    }
});


app.post('/api/sync', requireAdmin, async (req, res) => {
    const config = await loadFile(CONFIG_PATH, null);
    if (!config) return res.status(400).json({ error: 'App not configured.' });
    const isJellyfinPortal = String(config.mediaServerType || '').toLowerCase() === 'jellyfin';
    try {
        const result = isJellyfinPortal ? await syncJellyfinUsers(config) : await syncUsers(config);
        await appendAuditLog(isJellyfinPortal ? 'jellyfin_sync_completed' : 'plex_sync_completed', req.user || null, null, { count: result.count });
        res.json(result);
    } catch (error) {
        await appendAuditLog(isJellyfinPortal ? 'jellyfin_sync_failed' : 'plex_sync_failed', req.user || null, null, { error: error.message });
        res.status(500).json({ error: error.message });
    }
});

// --- Invites Endpoints ---
app.get('/api/invites', requireAdmin, async (req, res) => {
    const invites = await loadFile(INVITES_PATH, []);
    res.json(invites);
});

app.post('/api/invites', requireAdmin, async (req, res) => {
    const { durationDays, maxUses, libraryIds } = req.body;
    const invites = await loadFile(INVITES_PATH, []);

    const code = randomBytes(6).toString('hex');
    const newInvite = {
        code,
        durationDays: parseInt(durationDays, 10) || 30,
        maxUses: maxUses === 'unlimited' ? 'unlimited' : (parseInt(maxUses, 10) || 1),
        currentUses: 0,
        libraryIds: Array.isArray(libraryIds) && libraryIds.length > 0 ? libraryIds : null,
        createdBy: req.user.username || 'admin',
        createdAt: new Date().toISOString()
    };

    invites.push(newInvite);
    await saveFile(INVITES_PATH, invites);
    res.json(newInvite);
});

app.post('/api/invites/email', requireAdmin, async (req, res) => {
    const { email, durationDays, libraryIds } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const config = await loadFile(CONFIG_PATH, {});
    if (!config.smtpHost || !config.smtpUser) {
        return res.status(400).json({ error: 'SMTP settings are not configured. Cannot send email.' });
    }

    const invites = await loadFile(INVITES_PATH, []);
    const code = randomBytes(6).toString('hex');
    const newInvite = {
        code,
        durationDays: parseInt(durationDays, 10) || 30,
        maxUses: 1,
        currentUses: 0,
        libraryIds: Array.isArray(libraryIds) && libraryIds.length > 0 ? libraryIds : null,
        createdBy: req.user.username || 'admin',
        createdAt: new Date().toISOString(),
        sentTo: email
    };

    try {
        const publicDomain = config.publicDomain || 'https://portal.yourdomain.com';
        const inviteUrl = `${publicDomain}/invite/${code}`;
        const adminProfile = await getAdminProfile(config);
        const serverName = adminProfile ? adminProfile.serverName : 'Our Plex Server';

        const logoPath = path.join(process.cwd(), 'static', 'logo.png');
        let hasLogo = false;
        try { await fs.access(logoPath); hasLogo = true; } catch (e) { }

        const subject = `You've been invited to ${serverName}!`;
        const html = `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f6f9; padding: 30px; color: #333333; line-height: 1.6;">
                <div style="max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border-top: 6px solid #e5a00d;">
                    <div style="background-color: #282A2D; padding: 25px; text-align: center;">
                        ${hasLogo ? '<img src="cid:logo" alt="Logo" style="max-height: 100px; display: block; margin: 0 auto 10px auto;" />' : ''}
                        <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase;">${serverName}</h1>
                    </div>
                    <div style="padding: 30px 40px;">
                        <h2 style="color: #e5a00d; font-size: 20px; margin-top: 0; font-weight: 600; text-align: center;">Welcome to the Server!</h2>
                        <p style="text-align: center; font-size: 16px;">You have been invited to join our private media server.</p>
                        
                        <div style="text-align: center; margin: 35px 0;">
                            <a href="${inviteUrl}" style="background-color: #e5a00d; color: #ffffff; text-decoration: none; padding: 14px 35px; font-weight: bold; border-radius: 6px; display: inline-block; font-size: 16px; box-shadow: 0 4px 6px rgba(229, 160, 13, 0.2);">Claim Your Access</a>
                        </div>
                        
                        <div style="background-color: #fcf8f2; border-left: 4px solid #e5a00d; padding: 20px; margin: 25px 0 0 0; border-radius: 6px;">
                            <p style="margin: 0; font-size: 14px; color: #718096; text-align: center;">This invite link is for single use only. It will grant you access for <strong>${newInvite.durationDays} days</strong>.</p>
                        </div>
                    </div>
                    <div style="background-color: #f7fafc; padding: 20px 30px; border-top: 1px solid #edf2f7; text-align: center; font-size: 12px; color: #a0aec0;">
                        <p style="margin: 0 0 5px 0;">Automated notification from the Server Manager Portal.</p>
                        <p style="margin: 0;">We hope you enjoy the server!</p>
                    </div>
                </div>
            </div>
        `;

        await sendEmail(config, email, subject, html);
        invites.push(newInvite);
        await saveFile(INVITES_PATH, invites);
        res.json({ message: 'Invite sent successfully', invite: newInvite });
    } catch (err) {
        log('Failed to send email invite: ' + err.message);
        res.status(500).json({ error: 'Failed to send email. Please check your SMTP settings.' });
    }
});

app.delete('/api/invites/:code', requireAdmin, async (req, res) => {
    let invites = await loadFile(INVITES_PATH, []);
    invites = invites.filter(i => i.code !== req.params.code);
    await saveFile(INVITES_PATH, invites);
    res.json({ success: true });
});

app.get('/api/invites/:code/info', publicReadRateLimit, async (req, res) => {
    const invites = await loadFile(INVITES_PATH, []);
    const invite = invites.find(i => i.code === req.params.code);
    if (!invite) return res.status(404).json({ error: 'Invite code not found or revoked.' });
    if (invite.maxUses !== 'unlimited' && invite.currentUses >= invite.maxUses) {
        return res.status(400).json({ error: 'Invite code has reached its maximum usage limit.' });
    }
    const config = await loadFile(CONFIG_PATH, {});
    const adminProfile = await getAdminProfile(config);
    res.json({
        durationDays: invite.durationDays,
        serverName: adminProfile.serverName || 'Our Server',
        customLogoUrl: config.customLogoUrl,
        thumb: adminProfile.thumb
    });
});

app.post('/api/invites/:code/claim', authRateLimit, async (req, res) => {
    const { pinId } = req.body;
    if (!pinId) return res.status(400).json({ error: 'PIN ID is required' });

    let invites = await loadFile(INVITES_PATH, []);
    const inviteIndex = invites.findIndex(i => i.code === req.params.code);
    if (inviteIndex === -1) return res.status(404).json({ error: 'Invite code not found or revoked.' });

    const invite = invites[inviteIndex];
    if (invite.maxUses !== 'unlimited' && invite.currentUses >= invite.maxUses) {
        return res.status(400).json({ error: 'Invite code has reached its maximum usage limit.' });
    }

    try {
        const pinRes = await fetch(`https://plex.tv/api/v2/pins/${pinId}`, {
            headers: {
                'Accept': 'application/json',
                'X-Plex-Client-Identifier': CLIENT_ID
            }
        });
        const pinData = await pinRes.json();

        if (!pinData.authToken) {
            return res.status(400).json({ error: 'Not authenticated with Plex yet. Please try again.' });
        }

        const config = await loadFile(CONFIG_PATH, {});
        // Validate user with Plex
        const plexRes = await fetch('https://plex.tv/api/v2/user', {
            headers: {
                'X-Plex-Token': pinData.authToken,
                'Accept': 'application/json'
            }
        });
        if (!plexRes.ok) return res.status(401).json({ error: 'Invalid Plex token' });

        const plexUser = await plexRes.json();
        const users = await loadFile(USERS_PATH, []);

        // Check if user already exists
        if (users.find(u => String(u.plexId) === String(plexUser.id) || u.email === plexUser.email)) {
            return res.status(400).json({ error: 'You are already a member of this server.' });
        }

        // Calculate expiry date
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        today.setDate(today.getDate() + invite.durationDays);
        const expiryDate = today.toISOString();

        const newUser = {
            id: randomUUID(),
            plexId: plexUser.id,
            username: plexUser.username,
            email: plexUser.email,
            thumb: plexUser.thumb,
            expiryDate: expiryDate,
            joiningDate: new Date().toISOString(),
            plexAccessStatus: 'pending',
            isTrial: false
        };

        users.push(newUser);
        await saveFile(USERS_PATH, users);

        // Send actual Plex invite
        await inviteUserToPlex(newUser, config, invite.libraryIds).catch(e => log('Failed to invite claimed user: ' + e.message));

        // Update invite usage
        // Re-read to prevent race condition during long Plex API calls
        let freshInvites = await loadFile(INVITES_PATH, []);
        const freshIndex = freshInvites.findIndex(i => i.code === req.params.code);
        if (freshIndex !== -1) {
            freshInvites[freshIndex].currentUses = (freshInvites[freshIndex].currentUses || 0) + 1;
            if (!freshInvites[freshIndex].usedBy) freshInvites[freshIndex].usedBy = [];
            freshInvites[freshIndex].usedBy.push({
                username: plexUser.username,
                email: plexUser.email,
                date: new Date().toISOString()
            });
            await saveFile(INVITES_PATH, freshInvites);
        }

        await appendAuditLog('invite_claimed', { username: plexUser.username, id: plexUser.id }, newUser, { code: invite.code });

        // Log user in
        const adminId = await getAdminId(config);
        const isAdmin = !!(adminId && String(plexUser.id) === String(adminId));
        const sessionUser = {
            id: plexUser.uuid || plexUser.id,
            plexId: plexUser.id,
            email: plexUser.email,
            username: plexUser.username,
            isAdmin
        };
        const token = jwt.sign(sessionUser, JWT_SECRET, { expiresIn: '7d' });
        setSessionCookie(req, res, token);

        res.json({ success: true, user: newUser });
    } catch (e) {
        log(`Error claiming invite: ${e.message}`);
        res.status(500).json({ error: 'Failed to claim invite. Please try again later.' });
    }
});

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

const {
    applyBackupPayload,
    createBackupObject,
    enforceBackupRetention,
    listBackupFiles,
    writeBackupToFolder,
    backupDir: BACKUP_DIR,
} = createBackupService({ loadFile, saveFile });

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

// --- Public & Status API Endpoints ---
let cachedAdminProfile = null;
let lastAdminProfileFetch = 0;

async function getAdminProfile(config) {
    if (String(config?.mediaServerType || '').toLowerCase() === 'jellyfin') {
        let serverName = 'Jellyfin Server';
        try {
            if (config?.jellyfinUrl && config?.jellyfinApiKey) {
                const baseUrl = resolveIntegrationUrlForFetch(config.jellyfinUrl);
                const infoRes = await fetch(`${baseUrl}/System/Info`, {
                    headers: jellyfinHeaders(config.jellyfinApiKey),
                });
                if (infoRes.ok) {
                    const info = await infoRes.json();
                    serverName = info.ServerName || info.LocalAddress || serverName;
                }
            }
        } catch (e) {
            log(`Failed to fetch Jellyfin server info: ${e.message}`);
        }
        return { thumb: null, serverName };
    }

    if (!config || !config.plexToken) return { thumb: null, serverName: 'Server Portal' };

    if (cachedAdminProfile && Date.now() - lastAdminProfileFetch < 3600000) {
        return cachedAdminProfile;
    }

    try {
        const userRes = await fetch('https://plex.tv/api/v2/user', { headers: { 'X-Plex-Token': config.plexToken, 'Accept': 'application/json' } }).then(r => r.json());

        let serverName = 'Server Portal';
        const uri = await getPlexConnectionUri(config);
        if (uri) {
            const serverRes = await fetch(`${uri}/?X-Plex-Token=${config.plexToken}`, { headers: { 'Accept': 'application/json' } }).then(r => r.json()).catch(() => null);
            if (serverRes && serverRes.MediaContainer && serverRes.MediaContainer.friendlyName) {
                serverName = serverRes.MediaContainer.friendlyName;
            }
        }

        cachedAdminProfile = { thumb: userRes.thumb || null, serverName };
        lastAdminProfileFetch = Date.now();
        return cachedAdminProfile;
    } catch (e) {
        return { thumb: null, serverName: 'Server Portal' };
    }
}

app.get('/api/public/info', publicReadRateLimit, async (req, res) => {
    try {
        const config = await loadFile(CONFIG_PATH, {});
        const profile = await getAdminProfile(config);
        const isConfigured = isPortalConfigured(config);
        const contactWhatsApp = config.contactWhatsApp || '';
        const contactEmail = config.contactEmail || '';
        let requestUrl = config.requestUrl || 'https://yourdomain.com';
        if ((requestUrl === 'https://yourdomain.com' || !requestUrl) && config.requestAppUrl) {
            requestUrl = config.requestAppUrl;
        }
        res.json({ ...profile, isConfigured, mediaServerType: config.mediaServerType || 'plex', requestUrl, contactWhatsApp, contactEmail });
    } catch (e) {
        let requestUrl = 'https://yourdomain.com';
        res.json({ thumb: null, serverName: 'Server Portal', isConfigured: false, mediaServerType: 'plex', requestUrl });
    }
});

app.get('/api/public/plex/stats', publicReadRateLimit, async (req, res) => {
    const cachedStats = plexStatsService.getCachedPlexStats();
    if (cachedStats) {
        return res.json(cachedStats);
    }
    const disk = await loadPlexStatsFromDisk();
    if (disk) return res.json(disk);
    return res.json({
        movies: 0, shows: 0, music: 0,
        moviesBytes: 0, showsBytes: 0, musicBytes: 0,
        fourKPercent: 0,
        isBuilding: true
    });
});

app.get('/api/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));
app.get('/api/status', publicReadRateLimit, async (req, res) => {
    const config = await loadFile(CONFIG_PATH, {});
    if (config.publicStatusEnabled === false && !getSessionUser(req)) {
        return res.status(403).json({ error: 'Status monitor requires sign in.' });
    }
    res.json(createPublicStatusPayload(statusRuntime.getStatusConfig(), statusRuntime.getHealthData()));
});
app.get('/api/status/config', requireAuth, requireAdmin, (req, res) => res.json(statusRuntime.getStatusConfig()));
app.post('/api/status/config', requireAuth, requireAdmin, async (req, res) => {
    try {
        // Security: validate body schema before writing to disk
        const { services, groups, announcement } = req.body;
        if (!Array.isArray(services) || !Array.isArray(groups)) {
            return res.status(400).json({ error: 'Invalid config structure: services and groups must be arrays.' });
        }
        const sanitizedServices = [];
        for (const service of services) {
            if (!service || typeof service !== 'object') continue;
            let normalizedUrl = '';
            if (service.url) {
                try {
                    normalizedUrl = normalizeExternalBaseUrl(service.url, { allowPrivate: true, allowHttp: true });
                } catch (e) {
                    return res.status(400).json({ error: `Invalid service URL for "${service.name || service.id || 'unknown'}": ${e.message}` });
                }
            }
            sanitizedServices.push({
                id: String(service.id || randomUUID()),
                name: String(service.name || 'Service'),
                url: normalizedUrl,
                port: Number.isFinite(Number(service.port)) ? Number(service.port) : undefined,
                type: String(service.type || 'web'),
                groupId: String(service.groupId || 'core'),
                description: String(service.description || '')
            });
        }
        await statusRuntime.saveStatusConfig({ services: sanitizedServices, groups, announcement: announcement || null });
        res.json({ success: true, message: 'Status configuration updated successfully.' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update status configuration' });
    }
});

app.post('/api/status/reset', requireAuth, requireAdmin, async (req, res) => {
    try {
        await statusRuntime.resetHealthData();
        res.json({ success: true, message: 'Status statistics reset successfully.' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to reset status statistics' });
    }
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
