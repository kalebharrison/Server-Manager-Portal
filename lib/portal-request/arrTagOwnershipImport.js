/**
 * Admin Arr catalog helpers:
 * - Normalize Seerr/bare requester tags → portal {id}-{username} tags on Arr media
 * - Optional: upsert portal request rows (legacy; prefer Arr tags as ownership SoT)
 */

import {
    fetchArrInstance,
    fetchArrInstanceCatalogItems,
    fetchArrTags,
    getArrInstances,
    isArrInstanceReady,
    pickArrPosterUrl,
    updateArrEntityTags,
} from '../arr-service.js';
import { createJsonRequestStore } from './requestStore.js';
import {
    buildPortalRequesterTagForUser,
    collectPortalUsersFromArrTagLabels,
    isPortalRequesterTagForUser,
    resolvePortalOwnerFromArrTagLabels,
    resolvePortalUserFromArrTag,
} from './arrRequesterTags.js';
import { inferArrInstanceIs4k } from './portalArrServices.js';

const REQUEST_STATUS_APPROVED = 2;
const MEDIA_STATUS_AVAILABLE = 5;
const MEDIA_STATUS_PROCESSING = 3;

const requestDedupeKey = (userId, mediaType, tmdbId, is4k) => (
    `${userId}|${mediaType}|${tmdbId}|${is4k ? '4k' : 'hd'}`
);

const extractYear = (item, mediaType) => {
    const raw = mediaType === 'tv'
        ? (item?.firstAired || item?.year || '')
        : (item?.inCinemas || item?.digitalRelease || item?.physicalRelease || item?.year || '');
    const year = String(raw).slice(0, 4);
    return /^\d{4}$/.test(year) ? year : null;
};

const extractPosterPath = (item) => {
    const remote = pickArrPosterUrl?.(item) || item?.remotePoster || null;
    if (!remote) return null;
    const path = String(remote);
    if (path.startsWith('http://') || path.startsWith('https://')) {
        const match = path.match(/\/t\/p\/[^/]+(\/.+)$/);
        return match ? match[1] : null;
    }
    return path.startsWith('/') ? path : `/${path}`;
};

const mediaStatusForItem = (item, mediaType) => {
    if (mediaType === 'movie') {
        return item?.hasFile ? MEDIA_STATUS_AVAILABLE : MEDIA_STATUS_PROCESSING;
    }
    const files = Number(item?.statistics?.episodeFileCount ?? item?.episodeFileCount ?? 0);
    return files > 0 ? MEDIA_STATUS_AVAILABLE : MEDIA_STATUS_PROCESSING;
};

const tagLabelsForItem = (item, tagById) => {
    const ids = Array.isArray(item?.tags) ? item.tags : [];
    return ids
        .map((id) => tagById.get(Number(id)))
        .filter(Boolean);
};

const ensureArrTagId = async (instance, label, tagById, tagIdByLabel, fetchOpts) => {
    const key = String(label || '').trim().toLowerCase();
    if (!key) return null;
    if (tagIdByLabel.has(key)) return tagIdByLabel.get(key);

    const created = await fetchArrInstance(instance, '/api/v3/tag', {
        ...fetchOpts,
        method: 'POST',
        body: { label },
    });
    if (created?.ok && created.data?.id != null) {
        const id = Number(created.data.id);
        const resolvedLabel = String(created.data.label || label).trim();
        tagById.set(id, resolvedLabel);
        tagIdByLabel.set(resolvedLabel.toLowerCase(), id);
        tagIdByLabel.set(key, id);
        return id;
    }

    // Race / already exists — refresh list once.
    const listed = await fetchArrTags(instance, fetchOpts).catch(() => []);
    for (const tag of (Array.isArray(listed) ? listed : [])) {
        const id = Number(tag.id);
        const resolvedLabel = String(tag.label || '').trim();
        if (!Number.isFinite(id) || !resolvedLabel) continue;
        tagById.set(id, resolvedLabel);
        tagIdByLabel.set(resolvedLabel.toLowerCase(), id);
    }
    return tagIdByLabel.get(key) ?? null;
};

/**
 * Look up Arr requester ownership for one TMDB title (detail attribution fallback).
 */
export const lookupArrRequesterForTmdb = async ({
    config,
    mediaType,
    tmdbId,
    portalUsers = [],
    resolveUrl = (url) => url,
    fetchImpl = fetch,
} = {}) => {
    const type = mediaType === 'tv' ? 'tv' : 'movie';
    const id = Number(tmdbId);
    if (!Number.isFinite(id) || id <= 0) return null;

    const arrType = type === 'tv' ? 'sonarr' : 'radarr';
    const instances = getArrInstances(config, { type: arrType, enabledOnly: true })
        .filter(isArrInstanceReady);
    const fetchOpts = { resolveUrl, fetchImpl };

    for (const instance of instances) {
        const [tags, catalog] = await Promise.all([
            fetchArrTags(instance, fetchOpts).catch(() => []),
            fetchArrInstanceCatalogItems(instance, fetchOpts).catch(() => []),
        ]);
        const tagById = new Map(
            (Array.isArray(tags) ? tags : []).map((tag) => [Number(tag.id), String(tag.label || '').trim()]),
        );
        const item = (Array.isArray(catalog) ? catalog : []).find((entry) => Number(entry?.tmdbId) === id);
        if (!item) continue;

        const labels = tagLabelsForItem(item, tagById);
        const owner = resolvePortalOwnerFromArrTagLabels(labels, portalUsers);
        if (owner) {
            return {
                ...owner,
                mediaType: type,
                tmdbId: id,
                is4k: inferArrInstanceIs4k(instance),
                arrInstanceId: instance.id,
            };
        }
    }
    return null;
};

/**
 * Scan Radarr/Sonarr: for each Seerr/bare requester tag that maps to a portal user,
 * ensure the portal-format `{portalUserId}-{username}` tag exists on that item.
 * Does not write portal JSON request rows.
 */
export const normalizeArrRequesterTagsOnArr = async ({
    config,
    portalUsers = [],
    resolveUrl = (url) => url,
    fetchImpl = fetch,
    includeMovies = true,
    includeTv = true,
} = {}) => {
    const summary = {
        scannedItems: 0,
        itemsWithRequesterTags: 0,
        itemsUpdated: 0,
        tagsCreated: 0,
        tagsAlreadyPresent: 0,
        skippedUnmapped: 0,
        failedUpdates: 0,
        byMediaType: { movie: 0, tv: 0 },
    };

    const fetchOpts = { resolveUrl, fetchImpl };
    const scans = [];
    if (includeMovies) scans.push({ mediaType: 'movie', arrType: 'radarr' });
    if (includeTv) scans.push({ mediaType: 'tv', arrType: 'sonarr' });

    for (const { mediaType, arrType } of scans) {
        const instances = getArrInstances(config, { type: arrType, enabledOnly: true })
            .filter(isArrInstanceReady);

        for (const instance of instances) {
            const [tags, catalog] = await Promise.all([
                fetchArrTags(instance, fetchOpts),
                fetchArrInstanceCatalogItems(instance, fetchOpts),
            ]);
            const tagById = new Map();
            const tagIdByLabel = new Map();
            for (const tag of (Array.isArray(tags) ? tags : [])) {
                const id = Number(tag.id);
                const label = String(tag.label || '').trim();
                if (!Number.isFinite(id) || !label) continue;
                tagById.set(id, label);
                tagIdByLabel.set(label.toLowerCase(), id);
            }

            for (const item of (Array.isArray(catalog) ? catalog : [])) {
                summary.scannedItems += 1;
                const labels = tagLabelsForItem(item, tagById);
                if (!labels.length) continue;

                const owners = collectPortalUsersFromArrTagLabels(labels, portalUsers);
                if (!owners.size) {
                    summary.skippedUnmapped += 1;
                    continue;
                }

                summary.itemsWithRequesterTags += 1;
                const currentTagIds = Array.isArray(item.tags)
                    ? item.tags.map((id) => Number(id)).filter((n) => Number.isFinite(n))
                    : [];
                let nextTagIds = [...currentTagIds];
                let changed = false;

                for (const { user } of owners.values()) {
                    const portalLabel = buildPortalRequesterTagForUser(user);
                    if (!portalLabel) continue;

                    if (labels.some((label) => isPortalRequesterTagForUser(label, user))) {
                        summary.tagsAlreadyPresent += 1;
                        continue;
                    }

                    const tagId = await ensureArrTagId(
                        instance,
                        portalLabel,
                        tagById,
                        tagIdByLabel,
                        fetchOpts,
                    );
                    if (!Number.isFinite(tagId)) {
                        summary.failedUpdates += 1;
                        continue;
                    }
                    summary.tagsCreated += 1;
                    if (!nextTagIds.includes(tagId)) {
                        nextTagIds = [...nextTagIds, tagId];
                        changed = true;
                    }
                }

                if (!changed) continue;

                const updated = await updateArrEntityTags(instance, item, nextTagIds, fetchOpts);
                if (!updated.ok) {
                    summary.failedUpdates += 1;
                    continue;
                }
                summary.itemsUpdated += 1;
                summary.byMediaType[mediaType] += 1;
            }
        }
    }

    return summary;
};

/**
 * Scan Radarr + Sonarr catalogs and upsert portal request rows for requester tags.
 * Prefer normalizeArrRequesterTagsOnArr for ownership; this remains for optional My Requests seed.
 */
export const importArrTagOwnershipToPortal = async ({
    config,
    requestsDir,
    portalUsers = [],
    resolveUrl = (url) => url,
    fetchImpl = fetch,
    includeMovies = true,
    includeTv = true,
} = {}) => {
    if (!requestsDir) throw new Error('requestsDir is required');

    const requestStore = createJsonRequestStore({ dataDir: requestsDir });
    const existingRequests = await requestStore.list();
    const existingKeys = new Set(
        existingRequests.map((row) => requestDedupeKey(
            row.userId,
            row.mediaType === 'tv' ? 'tv' : 'movie',
            Number(row.tmdbId),
            !!row.is4k,
        )),
    );

    const summary = {
        scannedItems: 0,
        taggedItems: 0,
        imported: 0,
        skippedExisting: 0,
        skippedUnmapped: 0,
        skippedInvalid: 0,
        byMediaType: { movie: 0, tv: 0 },
    };

    const fetchOpts = { resolveUrl, fetchImpl };
    const scans = [];
    if (includeMovies) {
        scans.push({ mediaType: 'movie', arrType: 'radarr' });
    }
    if (includeTv) {
        scans.push({ mediaType: 'tv', arrType: 'sonarr' });
    }

    for (const { mediaType, arrType } of scans) {
        const instances = getArrInstances(config, { type: arrType, enabledOnly: true })
            .filter(isArrInstanceReady);

        for (const instance of instances) {
            const is4k = inferArrInstanceIs4k(instance);
            const [tags, catalog] = await Promise.all([
                fetchArrTags(instance, fetchOpts),
                fetchArrInstanceCatalogItems(instance, fetchOpts),
            ]);
            const tagById = new Map(
                (Array.isArray(tags) ? tags : []).map((tag) => [Number(tag.id), String(tag.label || '').trim()]),
            );
            const items = Array.isArray(catalog) ? catalog : [];

            for (const item of items) {
                summary.scannedItems += 1;
                const tmdbId = Number(item?.tmdbId);
                if (!Number.isFinite(tmdbId) || tmdbId <= 0) {
                    summary.skippedInvalid += 1;
                    continue;
                }

                const labels = tagLabelsForItem(item, tagById);
                if (!labels.length) continue;

                let matched = false;
                for (const label of labels) {
                    const user = resolvePortalUserFromArrTag(label, portalUsers);
                    if (!user?.id) continue;
                    matched = true;

                    const userId = String(user.id);
                    const dedupeKey = requestDedupeKey(userId, mediaType, tmdbId, is4k);
                    if (existingKeys.has(dedupeKey)) {
                        summary.skippedExisting += 1;
                        continue;
                    }

                    const title = String(item?.title || item?.sortTitle || 'Unknown title');
                    const now = new Date().toISOString();
                    await requestStore.create({
                        userId,
                        mediaType,
                        tmdbId,
                        title,
                        year: extractYear(item, mediaType),
                        overview: String(item?.overview || ''),
                        posterPath: extractPosterPath(item),
                        backdropPath: null,
                        is4k,
                        seasons: mediaType === 'tv' ? 'all' : [],
                        status: REQUEST_STATUS_APPROVED,
                        createdAt: item?.added ? new Date(item.added).toISOString() : now,
                        updatedAt: now,
                        arrInstanceId: instance.id != null ? String(instance.id) : null,
                        tags: Array.isArray(item?.tags)
                            ? item.tags.map((t) => Number(t)).filter((n) => Number.isFinite(n))
                            : [],
                        meta: {
                            importedFromArrTag: true,
                            arrTag: label,
                            importedAt: now,
                            requestedByName: user.username || user.displayName || user.email || null,
                            requestedByEmail: user.email || null,
                            mediaStatus: mediaStatusForItem(item, mediaType),
                            isDownloading: false,
                            arrEntityId: item?.id != null ? Number(item.id) : null,
                        },
                    });

                    existingKeys.add(dedupeKey);
                    summary.imported += 1;
                    summary.byMediaType[mediaType] += 1;
                }

                if (matched) {
                    summary.taggedItems += 1;
                } else if (labels.length) {
                    summary.skippedUnmapped += 1;
                }
            }
        }
    }

    return summary;
};

export default normalizeArrRequesterTagsOnArr;
