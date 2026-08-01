/** Portal-native Discover / request engine seams. */

export { createTmdbClient, buildTmdbDiscoverQuery } from './tmdbClient.js';
export {
    createTmdbDiscoverRouter,
    DISCOVER_DEFAULT_VOTE_COUNT_GTE,
    DISCOVER_UPCOMING_WINDOW_DAYS,
    DISCOVER_UPCOMING_MIN_POPULARITY,
    DISCOVER_TRENDING_MIN_VOTE_COUNT,
    DISCOVER_TRENDING_MIN_POPULARITY,
    addDaysIsoDate,
    passesTrendingQuality,
    passesUpcomingQuality,
} from './tmdbDiscover.js';
export { createLibraryAvailability } from './libraryAvailability.js';
export {
    createDiscoverHomeCache,
    getDiscoverHomeCache,
    ensureDiscoverHomeCache,
    startDiscoverHomeCacheWarmer,
} from './discoverHomeCache.js';
export {
    emptyDiscoveryAvailabilityCache,
    normalizeDiscoveryAvailabilityCache,
    getDiscoveryAvailabilityCacheVersion,
    lookupDiscoveryAvailability,
    lookupDiscoveryAvailabilityForItem,
    mergeAvailabilityEntryOntoItem,
    applyDiscoveryAvailabilityCacheToItems,
    applyDiscoveryAvailabilityCacheToPayload,
    rebuildDiscoveryAvailabilityCache,
} from './discoveryAvailabilityCache.js';
export {
    resolveTvdbIdFromTmdb,
    resolveTmdbIdFromTvdb,
    matchSonarrSeriesFromIndexes,
    buildSonarrSeriesIndexes,
} from './sonarrSeriesMatch.js';
export { createJsonRequestStore, createRequestStore } from './requestStore.js';
export { createPortalRequestService, mapPortalRecordToDto } from './portalRequestService.js';
export {
    listPortalArrServers,
    resolvePortalArrInstance,
    getPortalArrServiceOptions,
    inferArrInstanceIs4k,
    inferServerIs4k,
    nameLooksLike4kServer,
    normalizeServerListIs4k,
} from './portalArrServices.js';
export { createJsonIssueStore, createIssueStore } from './issueStore.js';
export { createPortalIssueService, mapPortalIssueToDto } from './portalIssueService.js';
export {
    getPortalRequestQuotaSettings,
    evaluatePortalMemberQuota,
    shouldPortalAutoApprove,
    normalizeRequestQuotaLimit,
    normalizeRequestQuotaDays,
} from './portalQuota.js';
export {
    getPortalRequestDefaults,
    resolveMemberRequestPolicy,
    canPolicyRequestMedia,
    normalizeUserRequestOverrides,
    pickPortalRequestDefaultsForSave,
    portalRequestDefaultsForClient,
    normalizeMetadataProvider,
} from './portalRequestDefaults.js';
export { syncPortalRequestStatuses } from './requestStatusSync.js';
export {
    importArrTagOwnershipToPortal,
    lookupArrRequesterForTmdb,
    normalizeArrRequesterTagsOnArr,
    listArrOwnershipDtosForUser,
    listArrNotifyStateForTmdb,
    setArrNotifyTagForUser,
    findArrCatalogItemByTmdb,
    pruneAvailablePortalOwnershipRows,
    userOwnsArrRequesterLabel,
    isSeerrStyleRequesterTag,
} from './arrTagOwnershipImport.js';
export {
    sanitizeArrTagSegment,
    mediaUserIdForTag,
    buildPortalRequesterTagLabel,
    parseArrRequesterTagLabel,
    resolvePortalUserFromArrTag,
    resolvePortalOwnerFromArrTagLabels,
    resolveNotifyUsersFromArrTagLabels,
    buildPortalRequesterTagForUser,
    buildNotifyTagForUser,
    isPortalRequesterTagForUser,
    isNotifyTagForUser,
    collectPortalUsersFromArrTagLabels,
} from './arrRequesterTags.js';
export { createJsonBlocklistStore, createBlocklistStore } from './blocklistStore.js';
export { createPortalBlocklistService, mapPortalBlocklistToDto } from './portalBlocklistService.js';
export { createJsonWatchlistStore, createWatchlistStore } from './watchlistStore.js';
export { createPortalWatchlistService } from './portalWatchlistService.js';
export { createTvdbClient } from './tvdbClient.js';
export {
    enrichDiscoveryPayloadWithTvdbPosters,
    resolveTvdbPosterForTmdbShow,
} from './discoverTvdbPosters.js';
export { fetchPlexWatchlist } from './plexWatchlist.js';
