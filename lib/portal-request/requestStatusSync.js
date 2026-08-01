/**
 * Phase 7: sync portal request mediaStatus / isDownloading from *arr (+ disk).
 * Uses libraryAvailability.
 */

import { createLibraryAvailability } from './libraryAvailability.js';

const REQUEST_STATUS_APPROVED = 2;
const MEDIA_STATUS_PROCESSING = 3;
const MEDIA_STATUS_PARTIAL = 4;
const MEDIA_STATUS_AVAILABLE = 5;

const needsStatusSync = (record) => {
    if (Number(record?.status) !== REQUEST_STATUS_APPROVED) return false;
    const mediaStatus = Number(record?.meta?.mediaStatus);
    const downloading = !!record?.meta?.isDownloading;
    // Keep polling until available and idle; also refresh partial/TV.
    if (mediaStatus === MEDIA_STATUS_AVAILABLE && !downloading) return false;
    return true;
};

const mapAvailabilityToMeta = (availability = {}) => {
    const downloading = !!availability.downloading;
    let mediaStatus = Number(availability.status);
    if (!Number.isFinite(mediaStatus) || mediaStatus <= 0) {
        mediaStatus = downloading ? MEDIA_STATUS_PROCESSING : MEDIA_STATUS_PROCESSING;
    }
    // Movie fully on disk → available; TV may be partial (4) or available (5).
    if (!downloading && (mediaStatus === MEDIA_STATUS_PARTIAL || mediaStatus === MEDIA_STATUS_AVAILABLE)) {
        // keep
    } else if (!downloading && availability.inLibrary) {
        mediaStatus = availability.partial ? MEDIA_STATUS_PARTIAL : MEDIA_STATUS_AVAILABLE;
    } else if (downloading) {
        mediaStatus = MEDIA_STATUS_PROCESSING;
    }

    return {
        mediaStatus,
        isDownloading: downloading,
        arrEntityId: availability?.radarrLibraryStatus?.movieId
            ?? availability?.sonarrLibraryStatus?.seriesId
            ?? null,
        statusLabel: availability.statusLabel || null,
        syncedAt: new Date().toISOString(),
    };
};

/**
 * @param {object} options
 * @param {object} options.config
 * @param {{ list: Function, update: Function }} options.store
 * @param {(url: string) => string} [options.resolveUrl]
 * @param {typeof fetch} [options.fetchImpl]
 * @param {number} [options.limit] Max records per tick
 */
export const syncPortalRequestStatuses = async ({
    config,
    store,
    resolveUrl = (url) => url,
    fetchImpl = fetch,
    limit = 80,
} = {}) => {
    if (!store?.list || !store?.update) {
        throw new Error('request store is required');
    }

    const library = createLibraryAvailability(config, {
        resolveUrl,
        fetchImpl,
        upgraderItems: [],
        catalogTimeoutMs: 8000,
    });

    const records = await store.list({ status: REQUEST_STATUS_APPROVED });
    const targets = records.filter(needsStatusSync).slice(0, Math.max(1, limit));

    const summary = {
        scanned: records.length,
        checked: targets.length,
        updated: 0,
        available: 0,
        downloading: 0,
        unchanged: 0,
        errors: 0,
    };

    for (const record of targets) {
        const mediaType = record.mediaType === 'tv' ? 'tv' : 'movie';
        const tmdbId = Number(record.tmdbId);
        if (!Number.isFinite(tmdbId) || tmdbId <= 0) {
            summary.unchanged += 1;
            continue;
        }

        try {
            const availability = await library.getMediaStatus(mediaType, tmdbId);
            const nextMetaPatch = mapAvailabilityToMeta(availability || {});
            const prevStatus = Number(record?.meta?.mediaStatus);
            const prevDownloading = !!record?.meta?.isDownloading;
            const prevEntityId = record?.meta?.arrEntityId ?? null;

            const changed = prevStatus !== nextMetaPatch.mediaStatus
                || prevDownloading !== nextMetaPatch.isDownloading
                || (nextMetaPatch.arrEntityId != null && Number(prevEntityId) !== Number(nextMetaPatch.arrEntityId));

            if (!changed) {
                summary.unchanged += 1;
                continue;
            }

            await store.update(record.id, {
                meta: {
                    ...(record.meta || {}),
                    mediaStatus: nextMetaPatch.mediaStatus,
                    isDownloading: nextMetaPatch.isDownloading,
                    ...(nextMetaPatch.arrEntityId != null ? { arrEntityId: nextMetaPatch.arrEntityId } : {}),
                    statusSyncedAt: nextMetaPatch.syncedAt,
                    statusSyncLabel: nextMetaPatch.statusLabel,
                },
            });

            summary.updated += 1;
            if (nextMetaPatch.isDownloading) summary.downloading += 1;
            if (
                !nextMetaPatch.isDownloading
                && (nextMetaPatch.mediaStatus === MEDIA_STATUS_AVAILABLE || nextMetaPatch.mediaStatus === MEDIA_STATUS_PARTIAL)
            ) {
                summary.available += 1;
            }
        } catch {
            summary.errors += 1;
        }
    }

    return summary;
};

export default syncPortalRequestStatuses;
