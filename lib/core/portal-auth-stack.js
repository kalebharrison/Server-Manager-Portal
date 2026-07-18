import jwt from 'jsonwebtoken';
import { findLocalUserForSession } from '../users/session-user.js';
import { createAdminIdentity, isJellyfinConfigured, isPortalConfigured } from '../auth/admin-identity.js';
import { createSessionMiddleware } from '../auth/session-middleware.js';
import { createConfigFileAccess } from '../config/config-store.js';
import { createDeletedUserRegistry, isDeletedUser } from '../users/deleted-users.js';
import { createRequireMember } from '../auth/auth-routes.js';
import { createJellyfinAdminResolver } from '../auth/auth-jellyfin-routes.js';
import { createAdminProfileService } from '../auth/admin-profile-service.js';
import { createRateLimiter } from '../http/rate-limit.js';
import { createAuditLogger } from '../admin/audit-log.js';
import { createSetupAccess } from '../http/setup-access.js';
import { loadFile as loadJsonFile, saveFile as saveJsonFile } from '../core/json-file-store.js';
import { normalizeArrConfig } from '../media-stack/arr-instances.js';
import {
    CONFIG_PATH,
    USERS_PATH,
    DELETED_USERS_PATH,
    AUDIT_LOG_PATH,
} from '../config/data-paths.js';

export const createPortalAuthFoundation = ({
    env,
    configSecretProtector,
    log,
}) => {
    const { SETUP_TOKEN } = env;

    const authRateLimit = createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 10 });
    const authCallbackRateLimit = createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 40 });
    const jellyfinQuickConnectPollRateLimit = createRateLimiter({ windowMs: 5 * 60 * 1000, maxRequests: 140 });
    const publicReadRateLimit = createRateLimiter({ windowMs: 60 * 1000, maxRequests: 120 });
    const setupRateLimit = createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 30 });

    const {
        canRunInitialSetup,
        sanitizeIntegrationUrl,
        sanitizeIntegrationUrlAsync,
    } = createSetupAccess({
        setupToken: SETUP_TOKEN,
        allowPrivateIntegrationUrls: env.ALLOW_PRIVATE_INTEGRATION_URLS,
    });

    const { loadFile, saveFile, secureConfigAtRest } = createConfigFileAccess({
        configPath: CONFIG_PATH,
        loadJsonFile,
        saveJsonFile,
        configSecretProtector,
        normalizeArrConfig,
    });

    const appendAuditLog = createAuditLogger({ auditLogPath: AUDIT_LOG_PATH, loadFile, saveFile, log });
    const { rememberDeletedUser } = createDeletedUserRegistry({ deletedUsersPath: DELETED_USERS_PATH, loadFile, saveFile });

    return {
        authRateLimit,
        authCallbackRateLimit,
        jellyfinQuickConnectPollRateLimit,
        publicReadRateLimit,
        setupRateLimit,
        canRunInitialSetup,
        sanitizeIntegrationUrl,
        sanitizeIntegrationUrlAsync,
        loadFile,
        saveFile,
        secureConfigAtRest,
        appendAuditLog,
        rememberDeletedUser,
    };
};

export const createPortalAuthStack = ({
    env,
    clearSessionCookie,
    log,
    loadFile,
    saveFile,
    appendAuditLog,
    apiFetch,
    fetchWithTimeout,
    jellyfinHeaders,
    getPlexConnectionUri,
    resolveIntegrationUrlForFetch,
}) => {
    const { JWT_SECRET, SECRET_MASK } = env;

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

    const membershipSync = {
        ensure: async () => ({ ok: false, reason: 'not_ready' }),
        ensureActive: async () => ({ ok: false, reason: 'not_ready' }),
        remove: async () => ({ ok: false, reason: 'not_ready' }),
    };

    const { getAdminProfile, invalidateAdminProfileCache } = createAdminProfileService({
        fetch,
        resolveIntegrationUrlForFetch,
        jellyfinHeaders,
        getPlexConnectionUri,
        log,
    });

    return {
        syncAdminPlexIdFromConfigToken,
        getAdminId,
        resolveCurrentAdmin,
        requireAuth,
        requireAdmin,
        requireMember,
        getSessionUser,
        membershipSync,
        getAdminProfile,
        invalidateAdminProfileCache,
        isJellyfinConfigured,
        isPortalConfigured,
        isDeletedUser,
    };
};
