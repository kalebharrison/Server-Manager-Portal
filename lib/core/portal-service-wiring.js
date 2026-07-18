import { createRequestAppService } from '../request-app/request-app-service.js';

export const wireRequestAppServices = ({
    mediaStack,
    comms,
    auth,
    media,
    resolveIntegrationUrlForFetch,
    withBasePath,
    requestAppInternalUrl,
    log,
}) => {
    const requestAppService = createRequestAppService({
        fetchWithTimeout: media.fetchWithTimeout,
        resolveIntegrationUrlForFetch,
        tvdbService: media.tvdbService,
        getActiveAcquisitionKeys: mediaStack.getActiveAcquisitionKeys,
        withBasePath,
        requestAppInternalUrl,
        log,
    });
    comms.backgroundExtras.requestAppService = requestAppService;
    auth.membershipSync.ensure = (user, config) => requestAppService.ensureRequestAppUser(config, user);
    auth.membershipSync.ensureActive = (users, config) => requestAppService.ensureRequestAppUsers(config, users);
    auth.membershipSync.remove = (user, config) => requestAppService.removeRequestAppUser(config, user);
    return { requestAppService, mediaStackRoutes: mediaStack };
};
