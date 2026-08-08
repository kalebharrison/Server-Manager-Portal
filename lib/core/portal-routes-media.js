import { registerPlexRoutes } from '../plex/plex-routes.js';
import { registerJellyfinRoutes } from '../jellyfin/jellyfin-routes.js';
import { registerMediaStackRoutes } from '../media-stack/media-stack-routes.js';
import { registerMediaIssueRoutes } from '../media-stack/media-issue-routes.js';
import { registerPortalRequestRoutes } from '../portal-request/portal-request-routes.js';
import { registerDiscoveryRoutes } from '../discovery/discovery-routes.js';

export const registerPortalMediaRoutes = ({
    app,
    withBasePath,
    services,
}) => {
    const {
        paths: {
            CONFIG_PATH,
            CONFIG_DIR,
            USERS_PATH,
            MEDIA_ISSUES_PATH,
        },
        requireAuth,
        requireAdmin,
        requireMember,
        publicReadRateLimit,
        memberApiRateLimit,
        loadFile,
        saveFile,
        appendAuditLog,
        getPlexConnectionUri,
        fetchWithTimeout,
        plexSessionsSnapshot,
        plexImageService,
        plexDashboardService,
        plexStatsService,
        loadPlexStatsFromDisk,
        buildPlexStatsCache,
        isJellyfinConfigured,
        resolveIntegrationUrlForFetch,
        withCache,
        jellyfinHeaders,
        jellyfinItemUrl,
        normalizeExternalBaseUrl,
        memberNotifications,
        log,
    } = services;

    registerPlexRoutes({
        app,
        requireAuth,
        requireMember,
        requireAdmin,
        memberApiRateLimit,
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

    registerJellyfinRoutes({
        app,
        requireAuth,
        requireMember,
        publicReadRateLimit,
        memberApiRateLimit,
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

    registerPortalRequestRoutes({
        app,
        requireAuth,
        requireMember,
        requireAdmin,
        memberApiRateLimit,
        configPath: CONFIG_PATH,
        configDir: CONFIG_DIR,
        usersPath: USERS_PATH,
        loadFile,
        resolveIntegrationUrlForFetch,
        onRequestStatusChange: memberNotifications.notifyRequestUpdate,
        log,
    });

    registerDiscoveryRoutes({
        app,
        requireAuth,
        requireMember,
        memberApiRateLimit,
        configPath: CONFIG_PATH,
        configDir: CONFIG_DIR,
        usersPath: USERS_PATH,
        loadFile,
        resolveIntegrationUrlForFetch,
        onRequestStatusChange: memberNotifications.notifyRequestUpdate,
        log,
    });

    registerMediaIssueRoutes({
        app,
        requireAuth,
        requireMember,
        requireAdmin,
        memberApiRateLimit,
        configPath: CONFIG_PATH,
        issuePath: MEDIA_ISSUES_PATH,
        loadFile,
        saveFile,
        fetch,
        resolveIntegrationUrlForFetch,
        getPlexConnectionUri,
        appendAuditLog,
        notifyIssueReply: memberNotifications.notifyIssueReply,
        log,
    });

    return mediaStackRoutes;
};
