import { normalizeRawDiscoveryItem } from './discoverItemUtils';
import { isAnimeBrowseItem } from './discoverForeignUtils';
import {
    buildSeasonStatusFromDetails,
    hasActiveSeerrDownloads,
    hasActiveShowDownloads,
    hasAnyEpisodeAired,
    isEndedShow,
    isMainSeasonNumber,
    isReturningSeries,
    isSeasonUpToDateLabel,
    isTvShowLibraryComplete,
    MEDIA_STATUS,
    REQUEST_STATUS,
    resolveInProgressDisplay,
    type SeasonStatusInfo,
} from './requestSeasonUtils';

export type MediaAvailabilityKind =
    | 'available'
    | 'upToDate'
    | 'partial'
    | 'processing'
    | 'requested'
    | 'pending'
    | 'failed'
    | 'declined'
    | 'blacklisted'
    | 'none';

export type MediaAvailabilityState = {
    kind: MediaAvailabilityKind;
    label: string;
    detail?: string;
    mediaStatus: number | null;
    hasUserRequest: boolean;
    userRequestId?: number | null;
    userRequestStatus?: number | null;
};

const resolveMediaType = (item: any): 'movie' | 'tv' | null => {
    const normalized = normalizeRawDiscoveryItem(item);
    const raw = normalized?.mediaType ?? item?.mediaType ?? item?.type;
    if (raw === 'movie' || raw === 1 || raw === '1') return 'movie';
    if (raw === 'tv' || raw === 2 || raw === '2') return 'tv';
    if (normalized?.firstAirDate && !normalized?.releaseDate) return 'tv';
    if (normalized?.releaseDate && !normalized?.firstAirDate) return 'movie';
    return null;
};

const sonarrSeriesStatus = (item: any) => String(item?.sonarrLibraryStatus?.seriesStatus || '').toLowerCase();

/** Airing / returning show (Sonarr continuing/upcoming, TMDB returning, or next episode scheduled). */
export const isContinuingLibraryShow = (item: any) => {
    const status = sonarrSeriesStatus(item);
    return isReturningSeries(item)
        || Boolean(item?.sonarrLibraryStatus?.nextAiring)
        || status === 'continuing'
        || status === 'upcoming';
};

/** Ended / canceled in Sonarr or TMDB. */
export const isEndedLibraryShow = (item: any) => {
    const status = sonarrSeriesStatus(item);
    return isEndedShow(item)
        || status === 'ended'
        || status === 'deleted'
        || status === 'canceled'
        || status === 'cancelled';
};

/**
 * Complete on-disk TV: "Available" only when the series has ended.
 * Browse cards often lack TMDB lastEpisodeToAir / inProduction, so requiring
 * those (plus an explicit continuing signal) wrongly labeled caught-up airing
 * shows as Available.
 */
const isCompleteTvUpToDate = (item: any) => !isEndedLibraryShow(item);

const getActiveUserRequest = (mediaInfo: any) => {
    const requests = Array.isArray(mediaInfo?.requests) ? mediaInfo.requests : [];
    if (!requests.length) return null;

    const priority = [REQUEST_STATUS.FAILED, REQUEST_STATUS.DECLINED, REQUEST_STATUS.PENDING, REQUEST_STATUS.APPROVED];
    for (const status of priority) {
        const match = requests.find((req: any) => Number(req?.status) === status);
        if (match) return match;
    }
    return requests[0];
};

const formatSeasonSummary = (seasonRows: SeasonStatusInfo[]) => {
    const available = seasonRows.filter((s) => s.statusLabel === 'Available').map((s) => s.seasonNumber);
    if (!available.length) return null;
    if (available.length <= 4) return `Seasons ${available.join(', ')} in library`;
    return `${available.length} seasons in library`;
};

const formatUpToDateSeasonSummary = (seasonRows: SeasonStatusInfo[]) => {
    const upToDate = seasonRows.filter((s) => isSeasonUpToDateLabel(s.statusLabel)).map((s) => s.seasonNumber);
    if (!upToDate.length) return null;
    if (upToDate.length <= 4) return `Season${upToDate.length === 1 ? '' : 's'} ${upToDate.join(', ')} up to date`;
    return `${upToDate.length} seasons up to date`;
};

const formatTvLibraryDetail = (seasonRows: SeasonStatusInfo[], airingDetail?: string) => {
    const parts = [formatSeasonSummary(seasonRows), formatUpToDateSeasonSummary(seasonRows)].filter(Boolean);
    if (parts.length) {
        if (airingDetail) return `${parts.join('. ')}. ${airingDetail}`;
        return parts.join('. ');
    }
    return airingDetail || 'All requested seasons are available.';
};

export const resolveMediaAvailabilityState = (item: any): MediaAvailabilityState => {
    const mediaInfo = item?.mediaInfo || item?.media?.mediaInfo || {};
    const mediaStatusRaw = item?.mediaInfo?.status ?? item?.media?.status ?? mediaInfo?.status;
    const mediaStatus = Number.isFinite(Number(mediaStatusRaw)) ? Number(mediaStatusRaw) : null;
    const mediaType = resolveMediaType(item);
    const userRequest = getActiveUserRequest(mediaInfo);
    const userRequestStatus = userRequest ? Number(userRequest.status) : null;
    const hasUserRequest = !!userRequest;
    const userRequestId = userRequest?.id ?? null;

    const base = {
        mediaStatus,
        hasUserRequest,
        userRequestId,
        userRequestStatus,
    };

    if (mediaStatus === MEDIA_STATUS.BLACKLISTED) {
        return {
            ...base,
            kind: 'blacklisted',
            label: 'Blacklisted',
            detail: 'This title cannot be requested.',
        };
    }

    if (userRequestStatus === REQUEST_STATUS.FAILED) {
        return {
            ...base,
            kind: 'failed',
            label: 'Request failed',
            detail: 'Something went wrong fulfilling this request. You can retry from My Requests.',
        };
    }

    if (userRequestStatus === REQUEST_STATUS.DECLINED) {
        return {
            ...base,
            kind: 'declined',
            label: 'Request declined',
            detail: userRequest?.declineReason || 'Your request was declined by an admin.',
        };
    }

    // On-disk beats request/processing stamps (list vs detail mismatches, stale PROCESSING).
    if (
        mediaType === 'movie'
        && (item?.radarrLibraryStatus?.hasFile === true || mediaStatus === MEDIA_STATUS.AVAILABLE)
    ) {
        return {
            ...base,
            kind: 'available',
            label: 'Available in library',
            detail: 'This movie is already in your media library.',
        };
    }

    const seasonRows = mediaType === 'tv' ? buildSeasonStatusFromDetails(item) : [];
    const requestAttribution = mediaInfo?.requestAttribution || item?.requestAttribution || null;
    const attributedName = String(requestAttribution?.requestedByName || '').trim() || null;
    const inProgressDisplay = resolveInProgressDisplay(mediaInfo, mediaStatus, item, {
        isOwnRequest: hasUserRequest,
        requestedByName: attributedName,
    });
    if (inProgressDisplay?.kind === 'processing' || hasActiveShowDownloads(item, mediaInfo)) {
        return {
            ...base,
            kind: 'processing',
            label: 'Processing',
            detail: inProgressDisplay?.detail
                || (hasUserRequest
                    ? 'Your request is being downloaded or importing.'
                    : 'This title was requested and is downloading or importing.'),
        };
    }

    // List stamps: PARTIAL means missing aired files. A continuing show that is
    // caught up (showComplete / AVAILABLE) should fall through to "Up to date".
    if (mediaType === 'tv') {
        const sonarr = item?.sonarrLibraryStatus;
        const stamped = Number(mediaInfo?.status);
        if (
            stamped === MEDIA_STATUS.PARTIAL
            && !(sonarr?.showComplete && !sonarr?.hasActiveDownloads)
        ) {
            const ended = isEndedLibraryShow(item);
            return {
                ...base,
                kind: 'partial',
                label: 'Partial',
                detail: ended
                    ? 'This series has ended and some episodes are still missing.'
                    : (formatSeasonSummary(seasonRows) || 'Missing aired episodes are not on disk yet.'),
            };
        }
    }

    const tvLibraryComplete = mediaType === 'tv'
        ? isTvShowLibraryComplete(item, seasonRows, mediaInfo)
        : false;

    if (tvLibraryComplete) {
        const showUpToDate = isCompleteTvUpToDate(item);
        return {
            ...base,
            kind: showUpToDate ? 'upToDate' : 'available',
            label: showUpToDate ? 'Up to date' : 'Available in library',
            detail: showUpToDate
                ? 'Airing series — all aired episodes are on disk. New ones will download as they air.'
                : (item?.sonarrLibraryStatus?.showComplete
                    ? 'Series complete — all aired episodes are on disk.'
                    : formatTvLibraryDetail(seasonRows) || 'All aired episodes are in your library.'),
        };
    }

    const availableSeasons = seasonRows.filter((s) => s.statusLabel === 'Available');
    const upToDateSeasons = seasonRows.filter((s) => isSeasonUpToDateLabel(s.statusLabel));
    const incompleteSeasons = seasonRows.filter((s) => s.statusLabel === 'Partial');
    const pendingSeasons = seasonRows.filter((s) => s.statusLabel === 'Pending');
    const approvedSeasons = seasonRows.filter((s) => s.statusLabel === 'Approved');
    const processingSeasons = seasonRows.filter((s) => s.statusLabel === 'Processing');
    const requestedSeasons = seasonRows.filter((s) => s.statusLabel === 'Requested');
    const endedShow = isEndedShow(item);
    // Seerr flips seasons/show to Available on approve; don't treat that as on-disk
    // unless Sonarr (or tvLibraryComplete) already confirmed files.
    const approvalStillOpen = userRequestStatus === REQUEST_STATUS.APPROVED
        && !(item?.sonarrLibraryStatus?.matched && item.sonarrLibraryStatus.showComplete);

    if (mediaType === 'tv' && seasonRows.length > 0) {
        const requestable = seasonRows.filter((s) => s.requestable);
        const mainRequestable = requestable.filter((s) => isMainSeasonNumber(s.seasonNumber));
        const mainAvailable = availableSeasons.filter((s) => isMainSeasonNumber(s.seasonNumber));
        const mainUpToDate = upToDateSeasons.filter((s) => isMainSeasonNumber(s.seasonNumber));
        const mainIncomplete = incompleteSeasons.filter((s) => isMainSeasonNumber(s.seasonNumber));
        const handledSeasons = seasonRows.filter(
            (s) => !s.requestable && s.statusLabel !== 'Not requested' && s.statusLabel !== 'Declined',
        );
        const mainHandled = handledSeasons.filter((s) => isMainSeasonNumber(s.seasonNumber));

        if (!approvalStillOpen && endedShow && mainRequestable.length === 0 && mainHandled.length > 0
            && (mainAvailable.length > 0 || mainUpToDate.length > 0)) {
            return {
                ...base,
                kind: 'available',
                label: 'Available in library',
                detail: formatTvLibraryDetail(seasonRows),
            };
        }

        if (!approvalStillOpen && requestable.length === 0 && handledSeasons.length > 0) {
            if (!isEndedLibraryShow(item)) {
                return {
                    ...base,
                    kind: 'upToDate',
                    label: 'Up to date',
                    detail: formatTvLibraryDetail(
                        seasonRows,
                        'Airing series — new episodes will download as they air.',
                    ),
                };
            }
            if (availableSeasons.length > 0 || upToDateSeasons.length > 0) {
                return {
                    ...base,
                    kind: 'available',
                    label: 'Available in library',
                    detail: formatTvLibraryDetail(seasonRows),
                };
            }
        }
        if ((mainAvailable.length > 0 || mainUpToDate.length > 0) && mainRequestable.length > 0) {
            const handledSummary = formatTvLibraryDetail(seasonRows);
            const ended = endedShow || isEndedLibraryShow(item);
            return {
                ...base,
                kind: 'partial',
                label: 'Partial',
                detail: ended
                    ? (handledSummary
                        ? `Series ended. ${handledSummary}. ${mainRequestable.length} season${mainRequestable.length === 1 ? '' : 's'} still missing.`
                        : `Series ended — ${mainRequestable.length} season${mainRequestable.length === 1 ? '' : 's'} still missing.`)
                    : (handledSummary
                        ? `${handledSummary}. ${mainRequestable.length} season${mainRequestable.length === 1 ? '' : 's'} still requestable.`
                        : `${mainRequestable.length} season${mainRequestable.length === 1 ? '' : 's'} still requestable.`),
            };
        }
        if (mainIncomplete.length > 0 && mainRequestable.length === 0) {
            const ended = endedShow || isEndedLibraryShow(item);
            return {
                ...base,
                kind: 'partial',
                label: 'Partial',
                detail: ended
                    ? `Series ended — ${mainIncomplete.length} season${mainIncomplete.length === 1 ? '' : 's'} missing episodes.`
                    : `${mainIncomplete.length} season${mainIncomplete.length === 1 ? '' : 's'} missing episodes in your library.`,
            };
        }
        if (processingSeasons.length > 0 || (approvalStillOpen && hasActiveShowDownloads(item, mediaInfo))) {
            return {
                ...base,
                kind: 'processing',
                label: 'Processing',
                detail: 'Your request is being downloaded or imported.',
            };
        }
        if (inProgressDisplay) {
            return { ...base, ...inProgressDisplay };
        }
        if (requestedSeasons.length > 0 || approvalStillOpen) {
            return {
                ...base,
                kind: 'requested',
                label: 'Requested',
                detail: approvalStillOpen
                    ? (hasAnyEpisodeAired(item)
                        ? 'Approved — waiting for downloads to finish.'
                        : 'Your request is approved. New episodes will download as they air.')
                    : 'Your request was sent to the media server and is waiting to download.',
            };
        }
        if (approvedSeasons.length > 0 || userRequestStatus === REQUEST_STATUS.APPROVED) {
            if (hasActiveSeerrDownloads(mediaInfo) || hasActiveShowDownloads(item, mediaInfo)) {
                return {
                    ...base,
                    kind: 'processing',
                    label: 'Processing',
                    detail: 'Your request is being downloaded or imported.',
                };
            }
            return {
                ...base,
                kind: 'requested',
                label: 'Requested',
                detail: hasAnyEpisodeAired(item)
                    ? 'Approved and sent to your media server.'
                    : 'Your request is approved. New episodes will download as they air.',
            };
        }
        if (pendingSeasons.length > 0 || userRequestStatus === REQUEST_STATUS.PENDING || mediaStatus === MEDIA_STATUS.PENDING) {
            return {
                ...base,
                kind: 'pending',
                label: 'Pending approval',
                detail: 'Waiting for an admin to approve your request.',
            };
        }
    }

    if (mediaType === 'movie') {
        if (mediaStatus === MEDIA_STATUS.AVAILABLE) {
            return {
                ...base,
                kind: 'available',
                label: 'Available in library',
                detail: 'This movie is already in your media library.',
            };
        }
        if (inProgressDisplay) {
            return { ...base, ...inProgressDisplay };
        }
        if (mediaStatus === MEDIA_STATUS.PENDING || userRequestStatus === REQUEST_STATUS.PENDING) {
            return {
                ...base,
                kind: 'pending',
                label: 'Pending approval',
                detail: 'Waiting for an admin to approve your request.',
            };
        }
        if (mediaStatus === MEDIA_STATUS.PARTIAL) {
            return {
                ...base,
                kind: 'partial',
                label: 'Partially available',
                detail: 'Part of this title may already be in your library.',
            };
        }
    }

    // TV list stamps from the disk cache (no full season rows). Trust mediaInfo.status.
    if (mediaType === 'tv' && mediaStatus === MEDIA_STATUS.PARTIAL) {
        const ended = isEndedLibraryShow(item);
        return {
            ...base,
            kind: 'partial',
            label: 'Partial',
            detail: ended
                ? 'This series has ended and some episodes are still missing.'
                : (item?.sonarrLibraryStatus?.nextAiring
                    ? 'Some episodes are on disk; more are scheduled to air.'
                    : (formatSeasonSummary(seasonRows) || 'Missing aired episodes are not on disk yet.')),
        };
    }
    if (mediaType === 'tv' && mediaStatus === MEDIA_STATUS.AVAILABLE) {
        const sonarr = item?.sonarrLibraryStatus;
        const showUpToDate = isCompleteTvUpToDate(item);
        return {
            ...base,
            kind: showUpToDate ? 'upToDate' : 'available',
            label: showUpToDate ? 'Up to date' : 'Available in library',
            detail: showUpToDate
                ? 'Airing series — all aired episodes are on disk. New ones will download as they air.'
                : (sonarr?.showComplete
                    ? 'Series complete — all aired episodes are on disk.'
                    : 'This series is in your media library.'),
        };
    }

    // Seerr show-level AVAILABLE is unreliable for TV during/after approve —
    // only trust it for movies, or when Sonarr already confirmed completeness above.
    if (mediaStatus === MEDIA_STATUS.AVAILABLE && mediaType === 'movie') {
        return {
            ...base,
            kind: 'available',
            label: 'Available in library',
        };
    }

    if (mediaStatus === MEDIA_STATUS.PARTIAL) {
        if (mediaType === 'tv' && item?.sonarrLibraryStatus?.showComplete) {
            const showUpToDate = isCompleteTvUpToDate(item);
            return {
                ...base,
                kind: showUpToDate ? 'upToDate' : 'available',
                label: showUpToDate ? 'Up to date' : 'Available in library',
                detail: showUpToDate
                    ? 'Airing series — all aired episodes are on disk. New ones will download as they air.'
                    : 'Series complete — all aired episodes are on disk.',
            };
        }
        return {
            ...base,
            kind: 'partial',
            label: 'Partial',
            detail: formatSeasonSummary(seasonRows) || undefined,
        };
    }

    if (inProgressDisplay) {
        return { ...base, ...inProgressDisplay };
    }

    if (mediaStatus === MEDIA_STATUS.PENDING) {
        return {
            ...base,
            kind: 'pending',
            label: 'Pending',
            detail: 'Request is awaiting processing.',
        };
    }

    if (userRequestStatus === REQUEST_STATUS.PENDING) {
        return {
            ...base,
            kind: 'pending',
            label: 'Pending approval',
            detail: 'Waiting for an admin to approve your request.',
        };
    }

    // Approval ≠ available. Keep requested/processing until files are on disk.
    if (userRequestStatus === REQUEST_STATUS.APPROVED) {
        if (hasActiveShowDownloads(item, mediaInfo) || hasActiveSeerrDownloads(mediaInfo)) {
            return {
                ...base,
                kind: 'processing',
                label: 'Processing',
                detail: 'Your request is being downloaded or imported.',
            };
        }
        return {
            ...base,
            kind: 'requested',
            label: 'Requested',
            detail: mediaType === 'tv' && !hasAnyEpisodeAired(item)
                ? 'Your request is approved. New episodes will download as they air.'
                : 'Approved and sent to your media server.',
        };
    }

    return {
        ...base,
        kind: 'none',
        label: '',
    };
};

/** Library-owned enough to hide from “requestable” browse (full, up to date, or partial). */
export const isLibraryOwnedAvailabilityKind = (kind: MediaAvailabilityKind) => (
    kind === 'available' || kind === 'upToDate' || kind === 'partial'
);

/** Whether an item should be hidden when "hide available" is enabled. */
export const shouldHideAvailableItem = (item: any): boolean => {
    const { kind } = resolveMediaAvailabilityState(item);
    return isLibraryOwnedAvailabilityKind(kind);
};

export const isMediaAvailableInLibrary = (item: any = {}) => {
    const mediaStatus = Number(item?.mediaInfo?.status ?? item?.media?.status);
    if (mediaStatus === MEDIA_STATUS.AVAILABLE || mediaStatus === MEDIA_STATUS.PARTIAL) return true;

    const mediaInfo = item?.mediaInfo;
    if (mediaInfo && Number(mediaInfo.id) > 0 && !Number.isFinite(mediaStatus)) {
        const downloadStatus = Array.isArray(mediaInfo.downloadStatus) ? mediaInfo.downloadStatus : [];
        if (downloadStatus.some((entry: any) => Number(entry?.status) === 5)) return true;
    }
    return false;
};

export const filterHiddenAvailableItems = <T extends { mediaInfo?: { status?: number }; media?: { status?: number } }>(
    items: T[],
    hideAvailable: boolean,
): T[] => {
    if (!hideAvailable || !Array.isArray(items)) return items;
    return items.filter((item) => !shouldHideAvailableItem(item));
};

/** Whether an item should be hidden when "hide requested" is enabled on browse pages. */
export const shouldHideRequestedItem = (item: any): boolean => {
    const { kind } = resolveMediaAvailabilityState(item);
    return kind === 'requested' || kind === 'pending' || kind === 'processing';
};

export const filterHiddenRequestedItems = <T extends { mediaInfo?: { status?: number }; media?: { status?: number } }>(
    items: T[],
    hideRequested: boolean,
): T[] => {
    if (!hideRequested || !Array.isArray(items)) return items;
    return items.filter((item) => !shouldHideRequestedItem(item));
};

export const filterDiscoverBrowseItems = (
    items: any[],
    options: {
        hideAvailable?: boolean;
        hideRequested?: boolean;
        animeOnly?: boolean;
    },
) => {
    let filtered = filterHiddenAvailableItems(items, !!options.hideAvailable);
    filtered = filterHiddenRequestedItems(filtered, !!options.hideRequested);
    if (options.animeOnly) {
        filtered = filtered.filter((item) => isAnimeBrowseItem(item));
    }
    return filtered;
};
