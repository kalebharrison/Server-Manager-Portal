import { createLruCache } from '../cache/cache.js';
import { createSerialJobQueue } from '../admin/job-queue.js';
import { createConfigSecretProtector } from '../config/config-secrets.js';
import { resolveIntegrationUrlForFetch } from '../http/network-policy.js';
import { createPortalAuthFoundation, createPortalAuthStack } from './portal-auth-stack.js';
import { createPortalMediaStack, createPortalMediaUserStack } from './portal-media-stack.js';
import { createPortalCommsStack } from './portal-comms-stack.js';
import { createPortalOpsStack, createPortalStatusRuntime } from './portal-ops-stack.js';
import { wireRequestAppServices as wireRequestAppServicesImpl } from './portal-service-wiring.js';
import { createClientIdState } from './portal-client-id.js';
import { buildPortalServicesFacade } from './portal-services-facade.js';

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

    const { getClientId, setClientId } = createClientIdState(env.CLIENT_ID);

    const configSecretProtector = createConfigSecretProtector(CONFIG_ENCRYPTION_KEY);
    const log = (message) => console.log(`[${new Date().toISOString()}] ${message}`);
    const heavyJobQueue = createSerialJobQueue({ log });

    const plexImageUrl = (mediaPath) => withBasePath(`/api/plex/image?path=${encodeURIComponent(mediaPath)}`);
    const plexMetadataCache = createLruCache({ maxEntries: 500 });
    const getCachedPlexMetadata = (key) => plexMetadataCache.get(key);
    const setCachedPlexMetadata = (key, value) => plexMetadataCache.set(key, value);

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
        const wired = wireRequestAppServicesImpl({
            mediaStack,
            comms,
            auth,
            media,
            resolveIntegrationUrlForFetch,
            withBasePath,
            requestAppInternalUrl: REQUEST_APP_INTERNAL_URL,
            log,
        });
        mediaStackRoutes = wired.mediaStackRoutes;
        requestAppService = wired.requestAppService;
    };

    return buildPortalServicesFacade({
        env: {
            PORT,
            BIND_HOST,
            SETUP_TOKEN,
            FORCE_SECURE_COOKIES,
            PUBLIC_BASE_URL,
            JWT_SECRET,
            SECRET_MASK,
        },
        authFoundation,
        media,
        auth,
        comms,
        mediaUsers,
        ops,
        getClientId,
        setClientId,
        wireRequestAppServices,
        getRequestAppService: () => requestAppService,
        getMediaStackRoutes: () => mediaStackRoutes,
        resolveIntegrationUrlForFetch,
        log,
    });
};
