/**
 * Shared shaping helpers for portal request DTOs: TMDB artwork URLs, status
 * labels, member request tab filters, and season option rows.
 */

import { hasActiveDownloads } from './downloadStatus.js';
import {
    applyMissingLibrarySeasonInference,
    resolveMonitoredSeasonLabel,
    resolvePartialSeasonLabel,
} from './seasonStatus.js';

const TMDB_POSTER_SIZE = 'w342';
const TMDB_BACKDROP_SIZE = 'w1280';

export const buildTmdbPosterUrl = (posterPath, size = TMDB_POSTER_SIZE) => {
    if (!posterPath) return '';
    const raw = String(posterPath);
    if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
    const path = raw.startsWith('/') ? raw : `/${raw}`;
    return `https://image.tmdb.org/t/p/${size}${path}`;
};

export const buildTmdbBackdropUrl = (backdropPath, size = TMDB_BACKDROP_SIZE) => {
    if (!backdropPath) return '';
    const raw = String(backdropPath);
    if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
    const path = raw.startsWith('/') ? raw : `/${raw}`;
    return `https://image.tmdb.org/t/p/${size}${path}`;
};

export const requestStatusLabel = (status) => {
    const value = Number(status);
    if (value === 1) return 'pending';
    if (value === 2) return 'approved';
    if (value === 3) return 'declined';
    if (value === 4) return 'failed';
    return 'unknown';
};

export const isPendingRequest = (reqItem) => Number(reqItem?.status) === 1;

export const isDeclinedRequest = (reqItem) => {
    const status = reqItem?.status;
    if (status === 3 || status === '3') return true;
    return String(status || '').toLowerCase() === 'declined';
};

export const isApprovedRequest = (reqItem) => {
    const status = reqItem?.status;
    if (status === 2 || status === '2') return true;
    return String(status || '').toLowerCase() === 'approved';
};

export const isFailedRequest = (reqItem) => {
    const status = reqItem?.status;
    if (status === 4 || status === '4') return true;
    return String(status || '').toLowerCase() === 'failed';
};

export const resolveRequestMediaType = (reqItem = {}, media = {}) => {
    const raw = reqItem?.type ?? media?.mediaType ?? media?.type;
    if (raw === 2 || raw === '2' || String(raw).toLowerCase() === 'tv') return 'tv';
    return 'movie';
};

export const normalizeWatchlistTarget = (item = {}) => {
    const media = item?.media && typeof item.media === 'object' ? item.media : item;
    let mediaType = media?.mediaType ?? item?.mediaType ?? item?.type;
    if (mediaType === 2 || mediaType === '2') mediaType = 'tv';
    if (mediaType === 1 || mediaType === '1') mediaType = 'movie';
    if (!mediaType && media?.firstAirDate) mediaType = 'tv';
    if (!mediaType && (media?.title || media?.name) && media?.releaseDate) mediaType = 'movie';
    const type = mediaType === 'tv' ? 'tv' : mediaType === 'movie' ? 'movie' : null;
    const mediaId = Number(media?.tmdbId ?? media?.id ?? item?.id);
    if (!type || !Number.isFinite(mediaId) || mediaId <= 0) return null;
    const title = media?.title || media?.name || item?.title || item?.name || 'Unknown title';
    return { mediaType: type, mediaId, title };
};

export const buildMemberSeasonOptions = (details = {}, mediaInfo = {}) => {
    const tmdbSeasons = Array.isArray(details?.seasons) ? details.seasons : [];
    const librarySeasons = Array.isArray(mediaInfo?.seasons) ? mediaInfo.seasons : [];
    const libraryByNum = new Map(
        librarySeasons.map((s) => [Number(s?.seasonNumber ?? s?.season_number), Number(s?.status) || null]),
    );

    const requestedSeasonStatus = new Map();
    const requests = Array.isArray(mediaInfo?.requests) ? mediaInfo.requests : [];
    for (const req of requests) {
        if (!Array.isArray(req?.seasons)) continue;
        const reqStatus = Number(req?.status);
        for (const season of req.seasons) {
            const num = Number(season?.seasonNumber ?? season?.season_number);
            if (!Number.isFinite(num)) continue;
            const existing = requestedSeasonStatus.get(num);
            if (existing == null || reqStatus === 1) requestedSeasonStatus.set(num, reqStatus);
        }
    }

    return applyMissingLibrarySeasonInference(details, mediaInfo, tmdbSeasons
        .filter((s) => Number(s?.seasonNumber ?? s?.season_number) >= 0)
        .sort((a, b) => Number(a?.seasonNumber ?? a?.season_number) - Number(b?.seasonNumber ?? b?.season_number))
        .map((s) => {
            const seasonNumber = Number(s?.seasonNumber ?? s?.season_number);
            const libraryStatus = libraryByNum.get(seasonNumber) ?? null;
            const requestStatus = requestedSeasonStatus.get(seasonNumber) ?? null;

            let requestable = true;
            let statusLabel = 'Not requested';

            if (libraryStatus === 5) {
                requestable = false;
                statusLabel = 'Available';
            } else if (libraryStatus === 3) {
                requestable = false;
                const fallback = hasActiveDownloads(mediaInfo, { seasonNumber })
                    ? 'Processing'
                    : 'Requested';
                statusLabel = resolveMonitoredSeasonLabel(details, seasonNumber, fallback);
            } else if (libraryStatus === 2) {
                requestable = false;
                statusLabel = 'Pending';
            } else if (libraryStatus === 4) {
                requestable = false;
                statusLabel = resolvePartialSeasonLabel(details, seasonNumber);
            } else if (requestStatus === 1) {
                requestable = false;
                statusLabel = 'Pending';
            } else if (requestStatus === 2) {
                requestable = false;
                statusLabel = resolveMonitoredSeasonLabel(details, seasonNumber, 'Approved');
            } else if (requestStatus === 3) {
                requestable = false;
                statusLabel = 'Declined';
            }

            return {
                seasonNumber,
                name: s?.name || (seasonNumber === 0 ? 'Specials' : `Season ${seasonNumber}`),
                episodeCount: Number(s?.episodeCount ?? s?.episode_count) || 0,
                posterPath: s?.posterPath ?? s?.poster_path ?? null,
                libraryStatus,
                requestStatus,
                statusLabel,
                requestable,
            };
        }));
};

export const isMemberRequestMediaAvailable = (reqItem = {}) => {
    if (reqItem?.isDownloading) return false;
    const mediaStatus = Number(reqItem?.media?.status ?? reqItem?.mediaStatus);
    if (mediaStatus === 4 || mediaStatus === 5) return true;
    if (mediaStatus === 3) {
        const media = reqItem?.media || {};
        const type = resolveRequestMediaType(reqItem, media);
        if (type === 'tv' && !hasActiveDownloads(media, { is4k: !!reqItem?.is4k })) return true;
    }
    return false;
};

/** Portal tab filters for a member's own requests. */
export const filterMemberRequestTab = (reqItem, filter) => {
    const status = Number(reqItem?.status);
    if (filter === 'all') return true;
    if (filter === 'pending') return status === 1;
    if (filter === 'declined') return status === 3 || isDeclinedRequest(reqItem);
    if (filter === 'failed') return status === 4 || isFailedRequest(reqItem);
    if (filter === 'available') return status === 2 && isMemberRequestMediaAvailable(reqItem);
    if (filter === 'approved') return status === 2 && !isMemberRequestMediaAvailable(reqItem);
    return true;
};

export const countMemberRequests = (items = []) => {
    const counts = { pending: 0, approved: 0, available: 0, declined: 0, failed: 0, total: 0 };
    for (const item of items) {
        counts.total += 1;
        if (filterMemberRequestTab(item, 'pending')) counts.pending += 1;
        if (filterMemberRequestTab(item, 'approved')) counts.approved += 1;
        if (filterMemberRequestTab(item, 'available')) counts.available += 1;
        if (filterMemberRequestTab(item, 'declined')) counts.declined += 1;
        if (filterMemberRequestTab(item, 'failed')) counts.failed += 1;
    }
    return counts;
};

/** Dedupe key for a member's request list — one card per title (qualities merged). */
export const memberRequestDedupeKey = (row = {}) => {
    const type = (row.mediaType === 'tv' || row.type === 'tv') ? 'tv' : 'movie';
    const tmdbId = Number(row.tmdbId);
    if (!Number.isFinite(tmdbId) || tmdbId <= 0) {
        return `row:${row.id ?? ''}`;
    }
    return `${type}|${tmdbId}`;
};

const memberRequestStatusRank = (row = {}) => {
    const status = Number(row.status);
    const mediaStatus = Number(row.meta?.mediaStatus ?? row.mediaStatus);
    if (status === 1) return 100; // pending
    if (status === 2 && (mediaStatus === 4 || mediaStatus === 5)) return 40; // available
    if (status === 2) return 80; // approved / processing
    if (status === 4) return 20; // failed
    if (status === 3) return 10; // declined
    return 0;
};

/** Prefer live portal rows over Arr-import seeds; then more active status; then newest. */
export const pickPreferredMemberRequest = (a, b) => {
    const aImport = !!(a?.meta?.importedFromArrTag || a?.importedFromArrTag);
    const bImport = !!(b?.meta?.importedFromArrTag || b?.importedFromArrTag);
    if (aImport !== bImport) return aImport ? b : a;

    const rankA = memberRequestStatusRank(a);
    const rankB = memberRequestStatusRank(b);
    if (rankA !== rankB) return rankA > rankB ? a : b;

    const timeA = Date.parse(String(a?.updatedAt || a?.createdAt || '')) || 0;
    const timeB = Date.parse(String(b?.updatedAt || b?.createdAt || '')) || 0;
    if (timeA !== timeB) return timeA > timeB ? a : b;

    return Number(a?.id) >= Number(b?.id) ? a : b;
};

const qualityFlagsForRows = (rows = []) => {
    let hd = false;
    let uhd = false;
    for (const row of rows) {
        if (row?.is4k) uhd = true;
        else hd = true;
    }
    // Single unknown row → treat as HD for display.
    if (!hd && !uhd) hd = true;
    return { hd, '4k': uhd };
};

/**
 * Collapse duplicate member request rows for the same title.
 * HD + 4K merge onto one card with meta.requestQualities.
 */
export const dedupeMemberRequestRows = (rows = []) => {
    if (!Array.isArray(rows) || !rows.length) return [];
    if (rows.length === 1) {
        const only = rows[0];
        const qualities = qualityFlagsForRows([only]);
        return [{
            ...only,
            meta: {
                ...(only?.meta && typeof only.meta === 'object' ? only.meta : {}),
                requestQualities: qualities,
            },
        }];
    }

    const groups = new Map();
    for (const row of rows) {
        if (!row) continue;
        const key = memberRequestDedupeKey(row);
        const list = groups.get(key) || [];
        list.push(row);
        groups.set(key, list);
    }

    const seen = new Set();
    const out = [];
    for (const row of rows) {
        if (!row) continue;
        const key = memberRequestDedupeKey(row);
        if (seen.has(key)) continue;
        seen.add(key);
        const group = groups.get(key) || [row];
        const winner = group.reduce((best, cur) => pickPreferredMemberRequest(best, cur));
        const qualities = qualityFlagsForRows(group);
        out.push({
            ...winner,
            meta: {
                ...(winner?.meta && typeof winner.meta === 'object' ? winner.meta : {}),
                requestQualities: qualities,
            },
        });
    }
    return out;
};

export const getMemberRequestStatusLabel = (item = {}) => {
    const status = Number(item?.status);
    const mediaStatus = Number(item?.mediaStatus ?? item?.media?.status);
    const media = item?.media || {};
    const is4k = !!item?.is4k;
    if (status === 3) return 'Declined';
    if (status === 4) return 'Failed';
    if (status === 1) return 'Pending Approval';
    if (status === 2 && item?.isDownloading) return 'Processing';
    if (status === 2 && (mediaStatus === 4 || mediaStatus === 5)) return 'Available';
    if (status === 2 && mediaStatus === 3) {
        const type = resolveRequestMediaType(item, media);
        if (hasActiveDownloads(media, { is4k })) return 'Processing';
        if (type === 'tv') return 'Available';
        return 'Requested';
    }
    if (status === 2) return 'Approved';
    return requestStatusLabel(status) || 'Unknown';
};
