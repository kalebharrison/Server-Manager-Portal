/**
 * Arr ownership / notify helpers:
 * - Normalize: ensure portal {user.id} / n-{user.id} tags exist alongside legacy labels
 *   (Seerr / id-username / bare tags are never removed or rewritten)
 * - List ownership + notify state from Arr tags (portal JSON is not ownership SoT)
 * - Prune available Arr-imported portal seed rows once ownership lives on Arr
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
    buildNotifyTagForUser,
    buildPortalRequesterTagForUser,
    collectPortalUsersFromArrTagLabels,
    parseArrRequesterTagLabel,
    resolveNotifyUsersFromArrTagLabels,
    resolvePortalOwnerFromArrTagLabels,
    resolvePortalUserFromArrTag,
    sanitizeArrTagSegment,
} from './arrRequesterTags.js';
import { inferArrInstanceIs4k } from './portalArrServices.js';
import { buildTmdbPosterUrl } from './requestDtoHelpers.js';

const REQUEST_STATUS_APPROVED = 2;
const MEDIA_STATUS_AVAILABLE = 5;
const MEDIA_STATUS_PROCESSING = 3;

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
    const path = String(remote).trim();
    if (!path) return null;
    if (path.startsWith('http://') || path.startsWith('https://')) {
        // Prefer a TMDB relative path when present; otherwise keep absolute artwork
        // URLs (TVDB/Fanart). Drop internal Arr MediaCover hosts — browsers can't reach them.
        const tmdbMatch = path.match(/\/t\/p\/[^/]+(\/.+)$/);
        if (tmdbMatch) return tmdbMatch[1];
        try {
            const host = new URL(path).hostname.toLowerCase();
            if (
                host === 'localhost'
                || host.endsWith('.local')
                || host === 'sonarr'
                || host === 'radarr'
                || host === 'lidarr'
                || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)
            ) {
                return null;
            }
        } catch {
            return null;
        }
        return path;
    }
    // Relative Arr cover paths are not usable outside the Arr host.
    if (/^\/?mediacover\//i.test(path)) return null;
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

/** True when label is a requester (not notify) tag for this portal user. */
export const userOwnsArrRequesterLabel = (label, user, portalUsers = []) => {
    const parsed = parseArrRequesterTagLabel(label);
    if (!parsed || parsed.kind === 'notify') return false;

    const idKeys = new Set(
        [user?.id, user?.plexId, user?.jellyfinId, user?.seerrUserId]
            .map((value) => sanitizeArrTagSegment(value))
            .filter(Boolean),
    );

    // Prefixed tags must match an id for this user — do not fall back to username
    // (avoids `16-kaleb` matching a user who is merely named kaleb).
    if (parsed.idPrefix) {
        return idKeys.has(sanitizeArrTagSegment(parsed.idPrefix));
    }

    // Id-only tags (`100`) — body is the id, not a username.
    if (parsed.bare && idKeys.has(sanitizeArrTagSegment(parsed.username))) {
        return true;
    }

    // Bare username tags: allow username match against this user only.
    const users = portalUsers.length ? portalUsers : [user];
    const resolved = resolvePortalUserFromArrTag(label, users);
    if (!resolved?.id || !user?.id) return false;
    return String(resolved.id) === String(user.id)
        || String(resolved.plexId || '') === String(user.plexId || '')
        || String(resolved.jellyfinId || '') === String(user.jellyfinId || '');
};

const isExactCanonicalRequesterLabel = (label, user) => (
    sanitizeArrTagSegment(label) === buildPortalRequesterTagForUser(user)
);

const isExactCanonicalNotifyLabel = (label, user) => (
    sanitizeArrTagSegment(label) === buildNotifyTagForUser(user)
);

/**
 * Scan Radarr/Sonarr: for mapped ownership/notify tags, ensure stable portal id tags exist.
 * Additive only — never removes or rewrites Seerr / legacy / unrelated Arr tags.
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

                const mappedUsers = collectPortalUsersFromArrTagLabels(labels, portalUsers);
                if (!mappedUsers.size) {
                    summary.skippedUnmapped += 1;
                    continue;
                }

                summary.itemsWithRequesterTags += 1;
                const currentTagIds = Array.isArray(item.tags)
                    ? item.tags.map((id) => Number(id)).filter((n) => Number.isFinite(n))
                    : [];
                let nextTagIds = [...currentTagIds];
                let changed = false;
                let createdOnItem = 0;

                for (const { user, sourceLabels } of mappedUsers.values()) {
                    const wantsRequester = sourceLabels.some(
                        (label) => parseArrRequesterTagLabel(label)?.kind !== 'notify',
                    );
                    const wantsNotify = sourceLabels.some(
                        (label) => parseArrRequesterTagLabel(label)?.kind === 'notify',
                    );

                    if (wantsRequester) {
                        const portalLabel = buildPortalRequesterTagForUser(user);
                        if (portalLabel) {
                            const hasExact = nextTagIds.some((tagId) => (
                                isExactCanonicalRequesterLabel(tagById.get(tagId) || '', user)
                            ));
                            if (hasExact) {
                                summary.tagsAlreadyPresent += 1;
                            } else {
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
                                if (!nextTagIds.includes(tagId)) {
                                    nextTagIds = [...nextTagIds, tagId];
                                    createdOnItem += 1;
                                    changed = true;
                                }
                            }
                        }
                    }

                    if (wantsNotify) {
                        const notifyLabel = buildNotifyTagForUser(user);
                        if (notifyLabel) {
                            const hasExact = nextTagIds.some((tagId) => (
                                isExactCanonicalNotifyLabel(tagById.get(tagId) || '', user)
                            ));
                            if (hasExact) {
                                summary.tagsAlreadyPresent += 1;
                            } else {
                                const tagId = await ensureArrTagId(
                                    instance,
                                    notifyLabel,
                                    tagById,
                                    tagIdByLabel,
                                    fetchOpts,
                                );
                                if (!Number.isFinite(tagId)) {
                                    summary.failedUpdates += 1;
                                    continue;
                                }
                                if (!nextTagIds.includes(tagId)) {
                                    nextTagIds = [...nextTagIds, tagId];
                                    createdOnItem += 1;
                                    changed = true;
                                }
                            }
                        }
                    }
                }

                if (!changed) continue;

                const updated = await updateArrEntityTags(instance, item, nextTagIds, fetchOpts);
                if (!updated.ok) {
                    summary.failedUpdates += 1;
                    continue;
                }
                summary.tagsCreated += createdOnItem;
                summary.itemsUpdated += 1;
                summary.byMediaType[mediaType] += 1;
            }
        }
    }

    return summary;
};

/**
 * Find a catalog item + tag maps for a TMDB id across ready Arr instances.
 */
export const findArrCatalogItemByTmdb = async ({
    config,
    mediaType,
    tmdbId,
    resolveUrl = (url) => url,
    fetchImpl = fetch,
} = {}) => {
    const type = mediaType === 'tv' ? 'tv' : 'movie';
    const id = Number(tmdbId);
    if (!Number.isFinite(id) || id <= 0) return null;
    const arrType = type === 'tv' ? 'sonarr' : 'radarr';
    const fetchOpts = { resolveUrl, fetchImpl };
    const instances = getArrInstances(config, { type: arrType, enabledOnly: true })
        .filter(isArrInstanceReady);

    for (const instance of instances) {
        const [tags, catalog] = await Promise.all([
            fetchArrTags(instance, fetchOpts).catch(() => []),
            fetchArrInstanceCatalogItems(instance, fetchOpts).catch(() => []),
        ]);
        const tagById = new Map();
        const tagIdByLabel = new Map();
        for (const tag of (Array.isArray(tags) ? tags : [])) {
            const tagId = Number(tag.id);
            const label = String(tag.label || '').trim();
            if (!Number.isFinite(tagId) || !label) continue;
            tagById.set(tagId, label);
            tagIdByLabel.set(label.toLowerCase(), tagId);
        }
        const item = (Array.isArray(catalog) ? catalog : []).find((entry) => Number(entry?.tmdbId) === id);
        if (!item) continue;
        return {
            instance,
            item,
            mediaType: type,
            is4k: inferArrInstanceIs4k(instance),
            tagById,
            tagIdByLabel,
            labels: tagLabelsForItem(item, tagById),
            fetchOpts,
        };
    }
    return null;
};

/** Add or remove a notify tag on the Arr entity for a TMDB title. */
export const setArrNotifyTagForUser = async ({
    config,
    user,
    mediaType,
    tmdbId,
    subscribe = true,
    portalUsers = [],
    resolveUrl = (url) => url,
    fetchImpl = fetch,
} = {}) => {
    const label = buildNotifyTagForUser(user);
    if (!label) return { ok: false, reason: 'Unable to build notify tag' };

    const hit = await findArrCatalogItemByTmdb({
        config,
        mediaType,
        tmdbId,
        resolveUrl,
        fetchImpl,
    });
    if (!hit) return { ok: false, reason: 'Title not found in Arr', arrMissing: true };

    const { instance, item, tagById, tagIdByLabel, fetchOpts, labels } = hit;
    const currentTagIds = Array.isArray(item.tags)
        ? item.tags.map((id) => Number(id)).filter((n) => Number.isFinite(n))
        : [];

    if (subscribe) {
        const tagId = await ensureArrTagId(instance, label, tagById, tagIdByLabel, fetchOpts);
        if (!Number.isFinite(tagId)) return { ok: false, reason: 'Could not create notify tag' };
        if (currentTagIds.includes(tagId)) return { ok: true, already: true, label };
        const updated = await updateArrEntityTags(instance, item, [...currentTagIds, tagId], fetchOpts);
        return updated.ok
            ? { ok: true, label, labels: [...labels, label] }
            : { ok: false, reason: updated.reason || 'Tag update failed' };
    }

    const removeIds = new Set();
    for (const [id, existingLabel] of tagById.entries()) {
        if (sanitizeArrTagSegment(existingLabel) === sanitizeArrTagSegment(label)) {
            removeIds.add(Number(id));
            continue;
        }
        // Also drop legacy / media-server notify tags that resolve to this user.
        const parsed = parseArrRequesterTagLabel(existingLabel);
        if (parsed?.kind === 'notify') {
            const resolved = resolvePortalUserFromArrTag(existingLabel, portalUsers.length ? portalUsers : [user]);
            if (resolved && String(resolved.id) === String(user.id)) removeIds.add(Number(id));
        }
    }
    if (!removeIds.size) return { ok: true, already: true, label };
    const next = currentTagIds.filter((id) => !removeIds.has(id));
    const updated = await updateArrEntityTags(instance, item, next, fetchOpts);
    return updated.ok
        ? { ok: true, label, removed: true }
        : { ok: false, reason: updated.reason || 'Tag update failed' };
};

/**
 * Member My Requests feed from Arr requester tags (available / in-library ownership).
 * Does not create portal JSON rows.
 */
export const listArrOwnershipDtosForUser = async ({
    config,
    user,
    portalUsers = [],
    resolveUrl = (url) => url,
    fetchImpl = fetch,
    includeMovies = true,
    includeTv = true,
} = {}) => {
    if (!user?.id && !user?.plexId && !user?.jellyfinId) return [];
    const users = portalUsers.length ? portalUsers : [user];
    const fetchOpts = { resolveUrl, fetchImpl };
    const results = [];
    const seen = new Set();
    const scans = [];
    if (includeMovies) scans.push({ mediaType: 'movie', arrType: 'radarr' });
    if (includeTv) scans.push({ mediaType: 'tv', arrType: 'sonarr' });

    for (const { mediaType, arrType } of scans) {
        const instances = getArrInstances(config, { type: arrType, enabledOnly: true })
            .filter(isArrInstanceReady);
        for (const instance of instances) {
            const [tags, catalog] = await Promise.all([
                fetchArrTags(instance, fetchOpts).catch(() => []),
                fetchArrInstanceCatalogItems(instance, fetchOpts).catch(() => []),
            ]);
            const tagById = new Map(
                (Array.isArray(tags) ? tags : []).map((tag) => [Number(tag.id), String(tag.label || '').trim()]),
            );
            const is4k = inferArrInstanceIs4k(instance);
            for (const item of (Array.isArray(catalog) ? catalog : [])) {
                const tmdbId = Number(item?.tmdbId);
                if (!Number.isFinite(tmdbId) || tmdbId <= 0) continue;
                const labels = tagLabelsForItem(item, tagById);
                const ownerLabel = labels.find((label) => userOwnsArrRequesterLabel(label, user, users));
                if (!ownerLabel) continue;
                const key = `${mediaType}:${tmdbId}:${is4k ? '4k' : 'hd'}`;
                if (seen.has(key)) continue;
                seen.add(key);
                const posterPath = extractPosterPath(item);
                const mediaStatus = mediaStatusForItem(item, mediaType);
                results.push({
                    id: `arr-${mediaType}-${tmdbId}-${is4k ? '4k' : 'hd'}`,
                    status: REQUEST_STATUS_APPROVED,
                    statusLabel: 'approved',
                    type: mediaType,
                    is4k,
                    qualities: [is4k ? '4K' : 'HD'],
                    hasMultipleQualities: false,
                    title: String(item?.title || item?.sortTitle || 'Unknown title'),
                    year: extractYear(item, mediaType),
                    overview: String(item?.overview || ''),
                    genres: [],
                    originalLanguage: null,
                    posterUrl: buildTmdbPosterUrl(posterPath),
                    backdropUrl: '',
                    requestedBy: {
                        id: user.id ?? null,
                        displayName: user.username || user.displayName || user.email || 'Member',
                        email: user.email || null,
                        avatar: user.thumb || user.avatar || '',
                        plexId: user.plexId ?? null,
                        username: user.username || null,
                    },
                    modifiedBy: null,
                    declineReason: null,
                    createdAt: item?.added ? new Date(item.added).toISOString() : null,
                    updatedAt: null,
                    mediaStatus,
                    isDownloading: false,
                    tmdbId,
                    mediaId: item?.id != null ? Number(item.id) : null,
                    serverId: null,
                    profileId: null,
                    profileName: null,
                    rootFolder: null,
                    languageProfileId: null,
                    tags: Array.isArray(item?.tags) ? item.tags : [],
                    seasons: mediaType === 'tv' ? [] : [],
                    routingSummary: null,
                    canRemove: false,
                    canRetry: false,
                    isAnime: false,
                    posterPath: posterPath || null,
                    canCancel: false,
                    engine: 'arr-tag',
                    arrInstanceId: instance.id != null ? String(instance.id) : null,
                    arrError: null,
                    arrTag: ownerLabel,
                });
            }
        }
    }
    return results;
};

/** Read notify subscribers for a title from Arr `n-…` tags. */
export const listArrNotifyStateForTmdb = async ({
    config,
    mediaType,
    tmdbId,
    user = null,
    portalUsers = [],
    resolveUrl = (url) => url,
    fetchImpl = fetch,
} = {}) => {
    const hit = await findArrCatalogItemByTmdb({
        config,
        mediaType,
        tmdbId,
        resolveUrl,
        fetchImpl,
    });
    if (!hit) {
        return {
            arrPresent: false,
            owner: null,
            notifyUsers: [],
            notifying: false,
            canNotify: false,
        };
    }
    const users = portalUsers.length ? portalUsers : (user ? [user] : []);
    const owner = resolvePortalOwnerFromArrTagLabels(hit.labels, users);
    const notifyUsers = resolveNotifyUsersFromArrTagLabels(hit.labels, users);
    const selfIds = new Set([
        user?.id,
        user?.plexId,
        user?.jellyfinId,
    ].map((value) => String(value || '').trim()).filter(Boolean));
    const notifying = notifyUsers.some((entry) => (
        selfIds.has(String(entry.user?.id || ''))
        || selfIds.has(String(entry.user?.plexId || ''))
        || selfIds.has(String(entry.user?.jellyfinId || ''))
    ));
    const isOwner = !!(owner?.user && (
        selfIds.has(String(owner.user.id || ''))
        || selfIds.has(String(owner.user.plexId || ''))
        || selfIds.has(String(owner.user.jellyfinId || ''))
    ));
    return {
        arrPresent: true,
        owner,
        notifyUsers,
        notifying,
        canNotify: !isOwner && !notifying,
        isOwner,
        labels: hit.labels,
    };
};

/**
 * @deprecated Arr-first ownership: no longer upserts available rows into portal JSON.
 * Runs normalize (Arr tags only) and optionally prunes stale imported portal rows.
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
    const normalized = await normalizeArrRequesterTagsOnArr({
        config,
        portalUsers,
        resolveUrl,
        fetchImpl,
        includeMovies,
        includeTv,
    });

    let pruned = 0;
    if (requestsDir) {
        const requestStore = createJsonRequestStore({ dataDir: requestsDir });
        const existingRequests = await requestStore.list();
        for (const row of existingRequests) {
            if (!row?.meta?.importedFromArrTag) continue;
            const status = Number(row.status);
            const mediaStatus = Number(row?.meta?.mediaStatus);
            const available = mediaStatus === MEDIA_STATUS_AVAILABLE
                || (status === REQUEST_STATUS_APPROVED && mediaStatus !== MEDIA_STATUS_PROCESSING);
            if (!available) continue;
            await requestStore.remove(row.id).catch(() => null);
            pruned += 1;
        }
    }

    return {
        scannedItems: normalized.scannedItems,
        taggedItems: normalized.itemsWithRequesterTags,
        imported: 0,
        skippedExisting: 0,
        skippedUnmapped: normalized.skippedUnmapped,
        skippedInvalid: 0,
        pruned,
        normalized,
        byMediaType: normalized.byMediaType,
    };
};

/**
 * Remove portal JSON ownership rows that are fully available and Arr-backed
 * (imported seeds or approved+available with an Arr entity id).
 */
export const pruneAvailablePortalOwnershipRows = async ({
    requestsDir,
    onlyImported = false,
} = {}) => {
    if (!requestsDir) return { pruned: 0 };
    const requestStore = createJsonRequestStore({ dataDir: requestsDir });
    const rows = await requestStore.list();
    let pruned = 0;
    for (const row of rows) {
        if (onlyImported && !row?.meta?.importedFromArrTag) continue;
        const status = Number(row.status);
        if (status !== REQUEST_STATUS_APPROVED) continue;
        const mediaStatus = Number(row?.meta?.mediaStatus);
        if (mediaStatus !== MEDIA_STATUS_AVAILABLE) continue;
        if (row?.meta?.isDownloading) continue;
        // Keep rows that still have in-flight notify subscribers in JSON (Arr-down bridge).
        const notifyIds = Array.isArray(row?.meta?.notifyUserIds) ? row.meta.notifyUserIds : [];
        if (notifyIds.length) continue;
        if (!row?.meta?.importedFromArrTag && row?.meta?.arrEntityId == null && !row?.arrInstanceId) {
            continue;
        }
        await requestStore.remove(row.id).catch(() => null);
        pruned += 1;
    }
    return { pruned };
};

export default normalizeArrRequesterTagsOnArr;
