import { createPlexApiFetch } from '../plex/plex-api-fetch.js';
import { createPlexSessionsSnapshot } from '../plex/plex-sessions-snapshot.js';
import { createJellyfinHttp } from '../jellyfin/jellyfin-http.js';
import { createMediaUserService } from '../users/media-user-service.js';
import { createPlexStatsService } from '../plex/plex-stats-service.js';
import { createPlexDashboardService } from '../plex/plex-dashboard-service.js';
import { createPlexImageService } from '../plex/plex-image-service.js';
import { createPlexConnectionService } from '../plex/plex-connection-service.js';
import { createTvdbService } from '../request-app/tvdb-service.js';
import { createMetadataHealthProbe } from '../request-app/metadata-health.js';
import { isJellyfinConfigured } from '../auth/admin-identity.js';
import { findLocalUserForSession } from '../users/session-user.js';
import { addDays, getDaysUntilExpiry } from '../core/date-utils.js';
import { markTaskEnd, markTaskStart, systemJobs } from '../admin/task-state.js';
import {
    CONFIG_PATH,
    USERS_PATH,
    DELETED_USERS_PATH,
    PLEX_STATS_CACHE_PATH,
    PLEX_DASHBOARD_CACHE_PATH,
} from '../config/data-paths.js';

const PLEX_API = 'https://plex.tv/api';

export const createPortalMediaStack = ({
    appVersion,
    getClientId,
    usersPath = USERS_PATH,
    secretMask,
    loadFile,
    saveFile,
    resolveIntegrationUrlForFetch,
    log,
    runHeavyJob,
}) => {
    if (typeof resolveIntegrationUrlForFetch !== 'function') {
        throw new Error('createPortalMediaStack requires resolveIntegrationUrlForFetch.');
    }
    const apiFetch = createPlexApiFetch(getClientId);
    const { jellyfinHeaders, jellyfinItemUrl } = createJellyfinHttp({
        getClientId,
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
        usersPath,
        secretMask,
        loadFile,
        resolveIntegrationUrlForFetch,
        findLocalUserForSession,
        getClientId,
        log,
    });

    const tvdbService = createTvdbService({ fetchWithTimeout, log });
    const metadataHealthProbe = createMetadataHealthProbe({
        loadConfig: () => loadFile(CONFIG_PATH, {}),
        fetchWithTimeout,
        tvdbService,
    });

    const plexSessionsSnapshot = createPlexSessionsSnapshot({
        fetchImpl: (...args) => fetchWithTimeout(...args),
    });

    const plexStatsService = createPlexStatsService({
        configPath: CONFIG_PATH,
        plexStatsCachePath: PLEX_STATS_CACHE_PATH,
        loadFile,
        getPlexConnectionUri,
        markTaskStart,
        markTaskEnd,
        systemJobs,
        runHeavyJob,
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

    return {
        apiFetch,
        jellyfinHeaders,
        jellyfinItemUrl,
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
        tvdbService,
        metadataHealthProbe,
        plexSessionsSnapshot,
        plexStatsService,
        loadPlexStatsFromDisk,
        buildPlexStatsCache,
        startPlexStatsBackgroundTask,
        plexImageService,
        plexDashboardService,
    };
};

export const createPortalMediaUserStack = ({
    loadFile,
    saveFile,
    apiFetch,
    fetchWithTimeout,
    jellyfinHeaders,
    withBasePath,
    appendAuditLog,
    sendExpiryEmail,
    membershipSync,
    isDeletedUser,
    log,
}) => {
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

    return {
        syncUsers,
        syncJellyfinUsers,
        revokePlexAccess,
        inviteUserToPlex,
        checkAndRevoke,
    };
};
