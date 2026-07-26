import { getRequestAppGate, isRequestAppConfigured, isRequestAppMembershipSyncEnabled, isSeerrFamilyRequestApp } from './request-app-gate.js';
import { createRequestAppClient } from './request-app-client.js';
import { createRequestAppUsers } from './request-app-users.js';
import { createRequestAppCatalog } from './request-app-catalog.js';

export {
    getRequestAppGate,
    isRequestAppConfigured,
    isRequestAppMembershipSyncEnabled,
    isSeerrFamilyRequestApp,
};

export const createRequestAppService = ({
    fetchWithTimeout,
    resolveIntegrationUrlForFetch,
    tvdbService = null,
    getActiveAcquisitionKeys = async () => new Set(),
    withBasePath = (value) => value,
    requestAppInternalUrl = '',
    log = () => {},
}) => {
    const client = createRequestAppClient({
        fetchWithTimeout,
        resolveIntegrationUrlForFetch,
        withBasePath,
        requestAppInternalUrl,
    });
    const users = createRequestAppUsers({
        fetchSeerrJson: client.fetchSeerrJson,
        cachedSeerrJson: client.cachedSeerrJson,
        invalidateUserLists: client.invalidateUserLists,
        log,
    });
    const catalog = createRequestAppCatalog({
        client,
        users,
        tvdbService,
        getActiveAcquisitionKeys,
        log,
    });

    return {
        getRequestAppGate,
        search: catalog.search,
        discover: catalog.discover,
        searchPeople: catalog.searchPeople,
        getPerson: catalog.getPerson,
        getPersonFilmography: catalog.getPersonFilmography,
        discoverByTheme: catalog.discoverByTheme,
        getMediaDetails: catalog.getMediaDetails,
        requestMedia: catalog.requestMedia,
        reportIssue: catalog.reportIssue,
        listRequests: catalog.listRequests,
        getRequest: catalog.getRequest,
        getRequestCounts: catalog.getRequestCounts,
        listIssues: catalog.listIssues,
        updateIssueStatus: catalog.updateIssueStatus,
        getIssue: catalog.getIssue,
        commentOnIssue: catalog.commentOnIssue,
        ensureRequestAppUser: users.ensureRequestAppUser,
        ensureRequestAppUsers: users.ensureRequestAppUsers,
        removeRequestAppUser: users.removeRequestAppUser,
        approveRequest: (config, requestId) => catalog.mutateRequest(config, requestId, 'approve'),
        declineRequest: (config, requestId, reason = '') => catalog.mutateRequest(config, requestId, 'decline', reason ? { reason } : {}),
        deleteRequest: (config, requestId) => catalog.mutateRequest(config, requestId, ''),
        retryRequest: (config, requestId) => catalog.mutateRequest(config, requestId, 'retry'),
        getCachedPosterImage: (remoteUrl) => client.imageCache.peek(remoteUrl),
        warmPosterImage: (remoteUrl) => client.imageCache.load(remoteUrl).catch(() => null),
        startCacheWarmer: catalog.startCacheWarmer,
    };
};
