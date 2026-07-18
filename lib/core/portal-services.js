import { createLruCache } from '../cache/cache.js';
import { createSerialJobQueue } from '../admin/job-queue.js';
import { createConfigSecretProtector } from '../config/config-secrets.js';
import { createRequestAppService } from '../request-app/request-app-service.js';
import { resolveIntegrationUrlForFetch } from '../http/network-policy.js';
import { findLocalUserForSession } from '../users/session-user.js';
import { DEFAULT_DASHBOARD_LAYOUT, normalizeSectionLayout } from '../config/dashboard-layout.js';
import {
    CONFIG_DIR,
    CONFIG_PATH,
    INVITES_PATH,
    USERS_PATH,
    DELETED_USERS_PATH,
    AUDIT_LOG_PATH,
    ANALYTICS_CACHE_PATH,
    TRENDING_CACHE_PATH,
    PLEX_STATS_CACHE_PATH,
    KILL_RULES_PATH,
    MEDIA_ISSUES_PATH,
} from '../config/data-paths.js';
import { createPortalAuthFoundation, createPortalAuthStack } from './portal-auth-stack.js';
import { createPortalMediaStack, createPortalMediaUserStack } from './portal-media-stack.js';
import { createPortalCommsStack } from './portal-comms-stack.js';
import { createPortalOpsStack, createPortalStatusRuntime } from './portal-ops-stack.js';

export const createPortalServices = ({
    app,
    appVersion,
    env,
    basePath,
    withBasePath,
    clearSessionCookie,
}) => {
    const {
        PORT,
        BIND_HOST,
        SETUP_TOKEN,
        FORCE_SECURE_COOKIES,
        PUBLIC_BASE_URL,
        REQUEST_APP_INTERNAL_URL,
        JWT_SECRET,
        CONFIG_ENCRYPTION_KEY,
        SECRET_MASK,
    } = env;

    let CLIENT_ID = env.CLIENT_ID;

    const configSecretProtector = createConfigSecretProtector(CONFIG_ENCRYPTION_KEY);
    const log = (message) => console.log(`[${new Date().toISOString()}] ${message}`);
    const heavyJobQueue = createSerialJobQueue({ log });

    const plexImageUrl = (mediaPath) => withBasePath(`/api/plex/image?path=${encodeURIComponent(mediaPath)}`);
    const plexMetadataCache = createLruCache({ maxEntries: 500 });
    const getCachedPlexMetadata = (key) => plexMetadataCache.get(key);
    const setCachedPlexMetadata = (key, value) => plexMetadataCache.set(key, value);

    const getClientId = () => CLIENT_ID;
    const setClientId = (value) => {
        CLIENT_ID = value;
    };

    const authFoundation = createPortalAuthFoundation({ env, configSecretProtector, log });

    const media = createPortalMediaStack({
        appVersion,
        getClientId,
        secretMask: SECRET_MASK,
        loadFile: authFoundation.loadFile,
        saveFile: authFoundation.saveFile,
        log,
        runHeavyJob: heavyJobQueue.run,
    });

    const auth = createPortalAuthStack({
        env,
        clearSessionCookie,
        log,
        loadFile: authFoundation.loadFile,
        saveFile: authFoundation.saveFile,
        appendAuditLog: authFoundation.appendAuditLog,
        resolveIntegrationUrlForFetch,
        ...media,
    });

    const statusRuntime = createPortalStatusRuntime({
        basePath,
        port: PORT,
        loadFile: authFoundation.loadFile,
        saveFile: authFoundation.saveFile,
        getPlexConnectionUri: media.getPlexConnectionUri,
        metadataHealthProbe: media.metadataHealthProbe,
    });

    const comms = createPortalCommsStack({
        loadFile: authFoundation.loadFile,
        saveFile: authFoundation.saveFile,
        appendAuditLog: authFoundation.appendAuditLog,
        getPlexConnectionUri: media.getPlexConnectionUri,
        loadPlexStatsFromDisk: media.loadPlexStatsFromDisk,
        getCachedPlexStats: () => media.plexStatsService.getCachedPlexStats(),
        getHealthData: () => statusRuntime.getHealthData(),
        log,
    });

    const mediaUsers = createPortalMediaUserStack({
        loadFile: authFoundation.loadFile,
        saveFile: authFoundation.saveFile,
        withBasePath,
        appendAuditLog: authFoundation.appendAuditLog,
        membershipSync: auth.membershipSync,
        isDeletedUser: auth.isDeletedUser,
        sendExpiryEmail: comms.sendExpiryEmail,
        log,
        ...media,
    });

    const ops = createPortalOpsStack({
        app,
        requireAuth: auth.requireAuth,
        requireMember: auth.requireMember,
        requireAdmin: auth.requireAdmin,
        loadFile: authFoundation.loadFile,
        saveFile: authFoundation.saveFile,
        configSecretProtector,
        log,
        runHeavyJob: heavyJobQueue.run,
        plexImageUrl,
        withBasePath,
        getCachedPlexMetadata,
        setCachedPlexMetadata,
        syncUsers: mediaUsers.syncUsers,
        statusRuntime,
        ...media,
        ...auth,
        ...comms,
    });

    let requestAppService = null;
    let mediaStackRoutes = null;

    const wireRequestAppServices = (mediaStack) => {
        mediaStackRoutes = mediaStack;
        requestAppService = createRequestAppService({
            fetchWithTimeout: media.fetchWithTimeout,
            resolveIntegrationUrlForFetch,
            tvdbService: media.tvdbService,
            getActiveAcquisitionKeys: mediaStackRoutes.getActiveAcquisitionKeys,
            withBasePath,
            requestAppInternalUrl: REQUEST_APP_INTERNAL_URL,
            log,
        });
        comms.backgroundExtras.requestAppService = requestAppService;
        auth.membershipSync.ensure = (user, config) => requestAppService.ensureRequestAppUser(config, user);
        auth.membershipSync.ensureActive = (users, config) => requestAppService.ensureRequestAppUsers(config, users);
        auth.membershipSync.remove = (user, config) => requestAppService.removeRequestAppUser(config, user);
    };

    return {
        env: {
            PORT,
            BIND_HOST,
            SETUP_TOKEN,
            FORCE_SECURE_COOKIES,
            PUBLIC_BASE_URL,
            JWT_SECRET,
            SECRET_MASK,
        },
        paths: {
            CONFIG_DIR,
            CONFIG_PATH,
            INVITES_PATH,
            USERS_PATH,
            DELETED_USERS_PATH,
            AUDIT_LOG_PATH,
            ANALYTICS_CACHE_PATH,
            TRENDING_CACHE_PATH,
            PLEX_STATS_CACHE_PATH,
            KILL_RULES_PATH,
            MEDIA_ISSUES_PATH,
        },
        authRateLimit: authFoundation.authRateLimit,
        authCallbackRateLimit: authFoundation.authCallbackRateLimit,
        jellyfinQuickConnectPollRateLimit: authFoundation.jellyfinQuickConnectPollRateLimit,
        publicReadRateLimit: authFoundation.publicReadRateLimit,
        setupRateLimit: authFoundation.setupRateLimit,
        canRunInitialSetup: authFoundation.canRunInitialSetup,
        sanitizeIntegrationUrl: authFoundation.sanitizeIntegrationUrl,
        loadFile: authFoundation.loadFile,
        saveFile: authFoundation.saveFile,
        secureConfigAtRest: authFoundation.secureConfigAtRest,
        secureStoredBackups: ops.secureStoredBackups,
        log,
        appendAuditLog: authFoundation.appendAuditLog,
        rememberDeletedUser: authFoundation.rememberDeletedUser,
        statusRuntime: ops.statusRuntime,
        sendEmail: comms.sendEmail,
        sendAdjustmentEmail: comms.sendAdjustmentEmail,
        checkAndSendNotifications: comms.checkAndSendNotifications,
        memberNotifications: comms.memberNotifications,
        startBroadcast: comms.startBroadcast,
        sendTestBroadcast: comms.sendTestBroadcast,
        sendTestNewsletter: comms.sendTestNewsletter,
        sendManualNewsletter: comms.sendManualNewsletter,
        checkAndSendNewsletter: comms.checkAndSendNewsletter,
        apiFetch: media.apiFetch,
        jellyfinHeaders: media.jellyfinHeaders,
        jellyfinItemUrl: media.jellyfinItemUrl,
        fetchWithTimeout: media.fetchWithTimeout,
        normalizePlexToken: media.normalizePlexToken,
        resolveConfiguredPlexServerUrl: media.resolveConfiguredPlexServerUrl,
        fetchOwnedPlexServers: media.fetchOwnedPlexServers,
        validatePlexServerAdminToken: media.validatePlexServerAdminToken,
        verifyInitialSetupPlexOwner: media.verifyInitialSetupPlexOwner,
        fetchPlexServerAccounts: media.fetchPlexServerAccounts,
        resolveLocalPlexAccountId: media.resolveLocalPlexAccountId,
        getPlexConnectionUri: media.getPlexConnectionUri,
        invalidatePlexConnectionCaches: media.invalidatePlexConnectionCaches,
        syncAdminPlexIdFromConfigToken: auth.syncAdminPlexIdFromConfigToken,
        getAdminId: auth.getAdminId,
        resolveCurrentAdmin: auth.resolveCurrentAdmin,
        requireAuth: auth.requireAuth,
        requireAdmin: auth.requireAdmin,
        requireMember: auth.requireMember,
        getSessionUser: auth.getSessionUser,
        plexSessionsSnapshot: media.plexSessionsSnapshot,
        membershipSync: auth.membershipSync,
        syncUsers: mediaUsers.syncUsers,
        syncJellyfinUsers: mediaUsers.syncJellyfinUsers,
        revokePlexAccess: mediaUsers.revokePlexAccess,
        inviteUserToPlex: mediaUsers.inviteUserToPlex,
        checkAndRevoke: mediaUsers.checkAndRevoke,
        getAdminProfile: auth.getAdminProfile,
        invalidateAdminProfileCache: auth.invalidateAdminProfileCache,
        plexStatsService: media.plexStatsService,
        loadPlexStatsFromDisk: media.loadPlexStatsFromDisk,
        buildPlexStatsCache: media.buildPlexStatsCache,
        startPlexStatsBackgroundTask: media.startPlexStatsBackgroundTask,
        plexImageService: media.plexImageService,
        plexDashboardService: media.plexDashboardService,
        applyBackupPayload: ops.applyBackupPayload,
        createBackupObject: ops.createBackupObject,
        enforceBackupRetention: ops.enforceBackupRetention,
        listBackupFiles: ops.listBackupFiles,
        writeBackupToFolder: ops.writeBackupToFolder,
        BACKUP_DIR: ops.BACKUP_DIR,
        analyticsService: ops.analyticsService,
        calculateAnalyticsStats: ops.calculateAnalyticsStats,
        calculateTrendingStats: ops.calculateTrendingStats,
        startTrendingStatsBackgroundTask: ops.startTrendingStatsBackgroundTask,
        startAnalyticsStatsBackgroundTask: ops.startAnalyticsStatsBackgroundTask,
        startPersonalAnalyticsCacheWarmer: ops.startPersonalAnalyticsCacheWarmer,
        checkAndCleanupInactive: ops.checkAndCleanupInactive,
        runAutoBackupCycle: ops.runAutoBackupCycle,
        startBackgroundService: ops.startBackgroundService,
        monitorConcurrentSessions: ops.monitorConcurrentSessions,
        withCache: ops.withCache,
        normalizeExternalBaseUrl: ops.normalizeExternalBaseUrl,
        computeNextBackupRun: ops.computeNextBackupRun,
        getTasksSnapshot: ops.getTasksSnapshot,
        findRunnableTask: ops.findRunnableTask,
        markTaskStart: ops.markTaskStart,
        markTaskEnd: ops.markTaskEnd,
        systemJobs: ops.systemJobs,
        wireRequestAppServices,
        get requestAppService() { return requestAppService; },
        get mediaStackRoutes() { return mediaStackRoutes; },
        setClientId,
        getClientId,
        resolveIntegrationUrlForFetch,
        findLocalUserForSession,
        escapeHtmlAttr: comms.escapeHtmlAttr,
        DEFAULT_DASHBOARD_LAYOUT,
        normalizeSectionLayout,
        isJellyfinConfigured: auth.isJellyfinConfigured,
        isPortalConfigured: auth.isPortalConfigured,
    };
};
