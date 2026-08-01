/**
 * Portal-native request helpers (Phases 5–7).
 * Phase 5: create / list / cancel pending JSON requests.
 * Phase 6: admin approve → *arr push, decline / retry / delete.
 * Phase 7: sync mediaStatus / isDownloading from *arr.
 */

import {
    addRadarrMovie,
    addSonarrSeries,
    fetchArrInstance,
    pickArrPosterUrl,
} from '../arr-service.js';
import {
    buildTmdbBackdropUrl,
    buildTmdbPosterUrl,
    buildMemberSeasonOptions,
    countMemberRequests,
    dedupeMemberRequestRows,
    filterMemberRequestTab,
    requestStatusLabel,
} from './requestDtoHelpers.js';
import { createTmdbClient } from './tmdbClient.js';
import { createJsonRequestStore } from './requestStore.js';
import { createLibraryAvailability } from './libraryAvailability.js';
import {
    clearPortalArrServiceOptionsCache,
    getPortalArrServiceOptions,
    listPortalArrServers,
    resolvePortalArrInstance,
} from './portalArrServices.js';
import { evaluatePortalMemberQuota } from './portalQuota.js';
import {
    canPolicyRequestMedia,
    resolveMemberRequestPolicy,
    shouldPortalAutoApprove,
} from './portalRequestDefaults.js';
import { syncPortalRequestStatuses } from './requestStatusSync.js';
import { resolveTvdbPosterForTmdbShow } from './discoverTvdbPosters.js';
import { isAnimeItem } from '../media/mediaFilters.js';
import { isImpersonatingSession } from '../auth/impersonation.js';
import {
    buildPortalRequesterTagsForUser,
    sanitizeArrTagSegment,
} from './arrRequesterTags.js';
import {
    listArrNotifyStateForTmdb,
    listArrOwnershipDtosForUser,
    lookupArrRequesterForTmdb,
    pruneAvailablePortalOwnershipRows,
    setArrNotifyTagForUser,
} from './arrTagOwnershipImport.js';

const REQUEST_STATUS_PENDING = 1;
const REQUEST_STATUS_APPROVED = 2;
const REQUEST_STATUS_DECLINED = 3;
const REQUEST_STATUS_FAILED = 4;

const ADMIN_FILTERS = new Set(['pending', 'approved', 'declined', 'processing', 'available', 'failed', 'all']);

const isPortalRequestAvailable = (dto) => {
    if (Number(dto?.status) !== REQUEST_STATUS_APPROVED) return false;
    if (dto?.isDownloading) return false;
    const mediaStatus = Number(dto?.mediaStatus);
    return mediaStatus === 4 || mediaStatus === 5;
};

const isPortalRequestProcessing = (dto) => {
    if (Number(dto?.status) !== REQUEST_STATUS_APPROVED) return false;
    if (isPortalRequestAvailable(dto)) return false;
    if (dto?.isDownloading) return true;
    const mediaStatus = Number(dto?.mediaStatus);
    return !Number.isFinite(mediaStatus) || mediaStatus === 3 || mediaStatus <= 0;
};

const filterAdminRequestTab = (dto, filter) => {
    const status = Number(dto?.status);
    if (!filter || filter === 'all') return true;
    if (filter === 'pending') return status === REQUEST_STATUS_PENDING;
    if (filter === 'declined') return status === REQUEST_STATUS_DECLINED;
    if (filter === 'failed') return status === REQUEST_STATUS_FAILED;
    if (filter === 'available') return isPortalRequestAvailable(dto);
    if (filter === 'processing') return isPortalRequestProcessing(dto);
    if (filter === 'approved') return status === REQUEST_STATUS_APPROVED && !isPortalRequestAvailable(dto);
    return true;
};

const countAdminRequests = (dtos = []) => {
    const counts = {
        pending: 0,
        approved: 0,
        declined: 0,
        processing: 0,
        available: 0,
        failed: 0,
        completed: 0,
        total: 0,
    };
    for (const item of dtos) {
        counts.total += 1;
        const status = Number(item?.status);
        if (status === REQUEST_STATUS_PENDING) counts.pending += 1;
        else if (status === REQUEST_STATUS_DECLINED) counts.declined += 1;
        else if (status === REQUEST_STATUS_FAILED) counts.failed += 1;
        else if (status === REQUEST_STATUS_APPROVED) {
            if (isPortalRequestAvailable(item)) {
                counts.available += 1;
                counts.completed += 1;
            } else {
                counts.approved += 1;
                if (isPortalRequestProcessing(item)) counts.processing += 1;
            }
        }
    }
    return counts;
};

const hasRequestOverrides = (overrides) => {
    if (!overrides || typeof overrides !== 'object') return false;
    return [
        'serverId',
        'profileId',
        'rootFolder',
        'languageProfileId',
        'userId',
        'tags',
        'seasons',
        'arrInstanceId',
    ].some((key) => {
        const value = overrides[key];
        if (Array.isArray(value)) return value.length > 0;
        return value != null && value !== '';
    });
};

const normalizeTagIds = (tags) => (
    Array.isArray(tags)
        ? tags.map((t) => Number(t)).filter((n) => Number.isFinite(n))
        : []
);

/**
 * Ensure advanced routing values exist on the live *arr instance before store/approve/push.
 */
const assertValidArrRouting = async (config, mediaType, routing, fetchOpts) => {
    const profileId = routing.profileId != null && routing.profileId !== ''
        ? Number(routing.profileId)
        : null;
    const rootFolder = routing.rootFolder != null && routing.rootFolder !== ''
        ? String(routing.rootFolder).trim()
        : '';
    const languageProfileId = routing.languageProfileId != null && routing.languageProfileId !== ''
        ? Number(routing.languageProfileId)
        : null;
    const tags = normalizeTagIds(routing.tags);
    const needsCheck = Number.isFinite(profileId)
        || !!rootFolder
        || tags.length > 0;
    if (!needsCheck) return;

    let options;
    try {
        options = await getPortalArrServiceOptions(config, mediaType, routing.serverId, {
            ...fetchOpts,
            arrInstanceId: routing.arrInstanceId || null,
        });
    } catch (error) {
        const err = new Error(error?.message || 'Could not verify *arr routing options.');
        err.status = 502;
        throw err;
    }

    if (Number.isFinite(profileId)) {
        const allowed = new Set((options.profiles || []).map((p) => Number(p.id)));
        if (!allowed.has(profileId)) {
            const err = new Error('Invalid quality profile for the selected *arr server.');
            err.status = 400;
            throw err;
        }
    }

    if (rootFolder) {
        const allowed = new Set(
            (options.rootFolders || [])
                .map((folder) => String(folder?.path || folder || '').trim())
                .filter(Boolean),
        );
        if (!allowed.has(rootFolder)) {
            const err = new Error('Invalid root folder for the selected *arr server.');
            err.status = 400;
            throw err;
        }
    }

    // languageProfileId intentionally not hard-validated — Sonarr v4 deprecated these.

    if (tags.length) {
        const allowed = new Set((options.tags || []).map((t) => Number(t.id)));
        const unknown = tags.filter((id) => !allowed.has(id));
        if (unknown.length) {
            const err = new Error('One or more request tags are not valid on the selected *arr server.');
            err.status = 400;
            throw err;
        }
    }
};

const normalizeGenreNames = (genres) => {
    if (!Array.isArray(genres)) return [];
    const names = [];
    const seen = new Set();
    for (const entry of genres) {
        const name = typeof entry === 'string'
            ? entry.trim()
            : String(entry?.name || '').trim();
        if (!name) continue;
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        names.push(name);
    }
    return names;
};

const normalizeOriginalLanguage = (value) => {
    const code = String(value || '').trim().toLowerCase().split(/[-_]/)[0];
    return /^[a-z]{2,3}$/.test(code) ? code : null;
};

export const mapPortalRecordToDto = (record, user = {}) => {
    const status = Number(record?.status) || null;
    const posterPath = record?.posterPath || '';
    const backdropPath = record?.backdropPath || '';
    const seasons = record?.seasons === 'all'
        ? []
        : (Array.isArray(record?.seasons)
            ? record.seasons.map((seasonNumber) => ({ seasonNumber: Number(seasonNumber) }))
            : []);

    const routingParts = [];
    if (record?.profileId) routingParts.push(`Profile #${record.profileId}`);
    if (record?.rootFolder) routingParts.push(record.rootFolder);

    const displayName = user?.username || user?.email || user?.displayName || record?.meta?.requestedByName || 'Member';
    const canRetry = status === REQUEST_STATUS_FAILED
        || (status === REQUEST_STATUS_APPROVED && !!record?.meta?.arrError);

    const qualityMeta = record?.meta?.requestQualities;
    let qualities = [];
    if (qualityMeta && typeof qualityMeta === 'object') {
        if (qualityMeta.hd) qualities.push('HD');
        if (qualityMeta['4k'] || qualityMeta.uhd) qualities.push('4K');
    }
    if (!qualities.length) qualities = [record?.is4k ? '4K' : 'HD'];

    return {
        id: Number(record?.id),
        status,
        statusLabel: requestStatusLabel(status),
        type: record?.mediaType === 'tv' ? 'tv' : 'movie',
        is4k: !!record?.is4k,
        qualities,
        hasMultipleQualities: qualities.length > 1,
        title: record?.title || 'Unknown title',
        year: record?.year || null,
        overview: record?.overview || '',
        genres: normalizeGenreNames(record?.genres),
        originalLanguage: normalizeOriginalLanguage(record?.originalLanguage),
        posterUrl: buildTmdbPosterUrl(posterPath),
        backdropUrl: buildTmdbBackdropUrl(backdropPath),
        requestedBy: {
            // Prefer resolved portal user id so admin "Request As" matches /api/requests/users.
            // record.userId may be a plexId / legacy key that is not the dropdown value.
            id: user?.id ?? record?.userId ?? null,
            displayName,
            email: user?.email || record?.meta?.requestedByEmail || null,
            avatar: user?.thumb || user?.avatar || '',
            plexId: user?.plexId ?? null,
            username: user?.username || null,
        },
        modifiedBy: record?.meta?.modifiedBy || null,
        declineReason: record?.meta?.declineReason || null,
        createdAt: record?.createdAt || null,
        updatedAt: record?.updatedAt || null,
        mediaStatus: record?.meta?.mediaStatus ?? null,
        isDownloading: !!record?.meta?.isDownloading,
        tmdbId: Number(record?.tmdbId) || null,
        mediaId: record?.meta?.arrEntityId != null ? Number(record.meta.arrEntityId) : null,
        serverId: record?.serverId ?? null,
        profileId: record?.profileId ?? null,
        profileName: record?.meta?.profileName || null,
        rootFolder: record?.rootFolder || null,
        languageProfileId: record?.languageProfileId ?? null,
        tags: Array.isArray(record?.tags) ? record.tags : [],
        seasons,
        routingSummary: routingParts.length ? routingParts.join(' · ') : null,
        canRemove: true,
        canRetry,
        isAnime: !!record?.meta?.isAnime,
        posterPath: posterPath || null,
        canCancel: status === REQUEST_STATUS_PENDING,
        engine: 'portal',
        arrInstanceId: record?.arrInstanceId || record?.meta?.arrInstanceId || null,
        arrError: record?.meta?.arrError || null,
    };
};

const fetchTitleMeta = async (config, mediaType, tmdbId, { fetchImpl = fetch } = {}) => {
    const apiKey = String(config?.tmdbApiKey || '').trim();
    if (!apiKey) {
        return {
            title: mediaType === 'tv' ? `TV ${tmdbId}` : `Movie ${tmdbId}`,
            year: null,
            overview: '',
            genres: [],
            originalLanguage: null,
            posterPath: null,
            backdropPath: null,
        };
    }
    try {
        const client = createTmdbClient({ tmdbApiKey: apiKey, language: 'en', fetchImpl });
        const details = mediaType === 'tv'
            ? await client.tv(tmdbId, { language: 'en' })
            : await client.movie(tmdbId, { language: 'en' });
        const title = mediaType === 'tv' ? (details?.name || `TV ${tmdbId}`) : (details?.title || `Movie ${tmdbId}`);
        const yearSource = mediaType === 'tv' ? details?.firstAirDate : details?.releaseDate;
        let posterPath = details?.posterPath || null;
        // TMDB often has no art for older UK docs — fall back to TheTVDB when configured.
        if (mediaType === 'tv' && !posterPath) {
            const tvdbPoster = await Promise.race([
                resolveTvdbPosterForTmdbShow(config, tmdbId, { fetchImpl }),
                new Promise((resolve) => {
                    setTimeout(() => resolve(null), 2500);
                }),
            ]);
            if (tvdbPoster?.posterPath) posterPath = tvdbPoster.posterPath;
        }
        const originalLanguage = normalizeOriginalLanguage(details?.originalLanguage);
        const genreObjects = Array.isArray(details?.genres) ? details.genres : [];
        return {
            title,
            year: yearSource ? String(yearSource).slice(0, 4) : null,
            overview: details?.overview || '',
            genres: normalizeGenreNames(genreObjects),
            originalLanguage,
            posterPath,
            backdropPath: details?.backdropPath || null,
            isAnime: isAnimeItem({ originalLanguage, genres: genreObjects }),
        };
    } catch {
        return {
            title: mediaType === 'tv' ? `TV ${tmdbId}` : `Movie ${tmdbId}`,
            year: null,
            overview: '',
            genres: [],
            originalLanguage: null,
            posterPath: null,
            backdropPath: null,
        };
    }
};

const applyOverridesToRecord = (record, overrides = {}) => {
    if (!hasRequestOverrides(overrides)) return record;
    const next = { ...record };
    if (overrides.serverId != null && overrides.serverId !== '') {
        next.serverId = Number(overrides.serverId);
    }
    if (overrides.arrInstanceId) next.arrInstanceId = String(overrides.arrInstanceId);
    if (overrides.profileId != null && overrides.profileId !== '') {
        next.profileId = Number(overrides.profileId);
        next.qualityProfile = Number(overrides.profileId);
    }
    if (overrides.rootFolder != null && overrides.rootFolder !== '') {
        next.rootFolder = String(overrides.rootFolder);
    }
    if (overrides.languageProfileId != null && overrides.languageProfileId !== '') {
        next.languageProfileId = Number(overrides.languageProfileId);
    }
    if (Array.isArray(overrides.tags)) {
        next.tags = overrides.tags.map((t) => Number(t)).filter((n) => Number.isFinite(n));
    }
    if (Array.isArray(overrides.seasons)) {
        next.seasons = overrides.seasons.map((n) => Number(n)).filter((n) => Number.isFinite(n));
    }
    if (overrides.userId != null && overrides.userId !== '') {
        next.userId = String(overrides.userId);
    }
    return next;
};

/**
 * @param {object} options
 * @param {string} options.dataDir
 * @param {object} options.config
 * @param {(url: string) => string} [options.resolveUrl]
 * @param {typeof fetch} [options.fetchImpl]
 * @param {(id: string) => Promise<object|null>} [options.resolveUser]
 * @param {() => Promise<object[]>} [options.listUsers]
 * @param {(mediaType: string, tmdbId: number) => Promise<boolean>} [options.isBlocked]
 */
export const createPortalRequestService = ({
    dataDir,
    config,
    resolveUrl = (url) => url,
    fetchImpl = fetch,
    resolveUser = async () => null,
    listUsers = async () => [],
    isBlocked = async () => false,
} = {}) => {
    const store = createJsonRequestStore({ dataDir });
    const fetchOpts = { resolveUrl, fetchImpl };

    const persistPosterIfMissing = async (record, posterPath, source = 'tvdb') => {
        if (!record?.id || !posterPath || record.posterPath) return record;
        return store.update(record.id, {
            posterPath,
            meta: {
                ...(record.meta || {}),
                posterSource: source,
            },
        }) || { ...record, posterPath };
    };

    const resolveMissingTvPoster = async (record, { timeoutMs = 2000 } = {}) => {
        if (!record || record.mediaType !== 'tv' || record.posterPath || !(Number(record.tmdbId) > 0)) {
            return record;
        }

        const timed = (promise) => Promise.race([
            promise,
            new Promise((resolve) => {
                setTimeout(() => resolve(null), timeoutMs);
            }),
        ]);

        try {
            const tvdbPoster = await timed(resolveTvdbPosterForTmdbShow(config, record.tmdbId, {
                fetchImpl,
                tvdbIdHint: record?.meta?.tvdbId || record?.tvdbId || null,
            }));
            if (tvdbPoster?.posterPath) {
                return persistPosterIfMissing(record, tvdbPoster.posterPath, 'tvdb');
            }
        } catch {
            // fall through to Sonarr lookup art
        }

        try {
            const instance = resolvePortalArrInstance(
                config,
                'tv',
                record.serverId,
                record.arrInstanceId,
            );
            if (!instance) return record;
            const lookup = await timed(fetchArrInstance(
                instance,
                `/api/v3/series/lookup?term=tmdb:${Number(record.tmdbId)}`,
                { ...fetchOpts, timeoutMs },
            ));
            const rows = Array.isArray(lookup?.data) ? lookup.data : [];
            const hit = rows.find((row) => Number(row?.tmdbId) === Number(record.tmdbId)) || rows[0] || null;
            const poster = pickArrPosterUrl(hit);
            if (poster) return persistPosterIfMissing(record, poster, 'sonarr');
        } catch {
            // keep placeholder
        }
        return record;
    };

    /** TMDB (+ TVDB/Sonarr for TV) backfill for sparse Arr-imported / legacy rows. */
    const resolveMissingPoster = async (record, { timeoutMs = 2000 } = {}) => {
        if (!record || record.posterPath || !(Number(record.tmdbId) > 0)) return record;

        let working = record;
        if (working.mediaType === 'tv') {
            working = await resolveMissingTvPoster(working, { timeoutMs });
            if (working?.posterPath) return working;
        }

        if (!String(config?.tmdbApiKey || '').trim()) return working;
        try {
            const meta = await Promise.race([
                fetchTitleMeta(
                    config,
                    working.mediaType === 'tv' ? 'tv' : 'movie',
                    working.tmdbId,
                    fetchOpts,
                ),
                new Promise((resolve) => {
                    setTimeout(() => resolve(null), timeoutMs);
                }),
            ]);
            if (meta?.posterPath) {
                return persistPosterIfMissing(working, meta.posterPath, 'tmdb');
            }
        } catch {
            // leave blank
        }
        return working;
    };

    const backfillPagePosters = async (page, recordById, mapUserForDto) => {
        await Promise.all(page.map(async (dto, index) => {
            if (dto?.engine === 'arr-tag') return;
            if (dto?.posterUrl || dto?.posterPath) return;
            const record = recordById.get(String(dto.id));
            if (!record || record.posterPath || !(Number(record.tmdbId) > 0)) return;
            const updated = await resolveMissingPoster(record, { timeoutMs: 2000 });
            if (!updated?.posterPath || updated === record) return;
            page[index] = mapPortalRecordToDto(updated, mapUserForDto(dto));
        }));
    };

    const enrichDto = async (record, { detail = false } = {}) => {
        let working = record;
        // Detail + list-page callers can opt into a short poster backfill.
        if (detail) {
            working = await resolveMissingTvPoster(working, { timeoutMs: 2500 });
        }

        const user = await resolveUser(working?.userId).catch(() => null);
        const dto = mapPortalRecordToDto(working, user || {});

        // Only fetch TMDB seasons for detail/approve views — avoid N+1 on request lists.
        if (detail && dto.type === 'tv' && dto.tmdbId) {
            try {
                const apiKey = String(config?.tmdbApiKey || '').trim();
                if (apiKey) {
                    const client = createTmdbClient({ tmdbApiKey: apiKey, language: 'en' });
                    const details = await client.tv(dto.tmdbId, { language: 'en' });
                    dto.isAnime = !!details?.isAnime;
                    const tvSeasons = Array.isArray(details?.seasons)
                        ? details.seasons
                            .map((season) => {
                                const seasonNumber = Number(season?.seasonNumber);
                                if (!Number.isFinite(seasonNumber) || seasonNumber < 0) return null;
                                return {
                                    seasonNumber,
                                    name: season?.name
                                        || (seasonNumber === 0 ? 'Specials' : `Season ${seasonNumber}`),
                                    episodeCount: Number(season?.episodeCount) || 0,
                                };
                            })
                            .filter(Boolean)
                        : [];
                    dto.tvSeasons = tvSeasons;

                    // record.seasons === 'all' maps to [] in the DTO — expand so approve UI can select.
                    const wantsAll = working?.seasons === 'all'
                        || working?.seasons == null
                        || (Array.isArray(working?.seasons) && working.seasons.length === 0);
                    if (wantsAll && (!Array.isArray(dto.seasons) || dto.seasons.length === 0)) {
                        dto.seasons = tvSeasons
                            .filter((season) => season.seasonNumber > 0)
                            .map((season) => ({ seasonNumber: season.seasonNumber, status: null }));
                    }
                }
            } catch {
                // Keep list DTO fields if TMDB is unavailable.
            }
        }

        return dto;
    };

    const createMemberRequest = async (user, body = {}) => {
        const mediaType = body.mediaType === 'tv' ? 'tv' : 'movie';
        const tmdbId = Number(body.mediaId ?? body.tmdbId);
        if (!Number.isFinite(tmdbId) || tmdbId <= 0) {
            const err = new Error('Invalid mediaId');
            err.status = 400;
            throw err;
        }

        const want4k = !!body.is4k;
        const sessionKey = String(user?.id || user?.plexId || '').trim();
        let resolved = sessionKey ? await resolveUser(sessionKey).catch(() => null) : null;
        let ownerUserId = String(resolved?.id || user?.id || user?.plexId || '').trim();

        // Admin "Request As" — file the request under another member so they get emails.
        const requestAsUserId = String(body.requestAsUserId || body.userId || '').trim();
        if (requestAsUserId) {
            if (!user?.isAdmin || isImpersonatingSession(user)) {
                const err = new Error(
                    isImpersonatingSession(user)
                        ? 'Exit impersonation to use Request As, or submit while viewing as that user.'
                        : 'Only admins can request as another user.',
                );
                err.status = 403;
                throw err;
            }
            const asUser = await resolveUser(requestAsUserId).catch(() => null);
            if (!asUser?.id) {
                const err = new Error('That user was not found.');
                err.status = 404;
                throw err;
            }
            resolved = asUser;
            ownerUserId = String(asUser.id);
        }

        const policy = resolveMemberRequestPolicy(config, resolved || user);
        const perm = canPolicyRequestMedia(policy, mediaType, { is4k: want4k });
        // Admins requesting as themselves (or as another user) are not blocked by member policy.
        if (!perm.ok && !(user?.isAdmin && !isImpersonatingSession(user))) {
            const err = new Error(perm.reason || 'You do not have permission to request this media.');
            err.status = 403;
            throw err;
        }
        // Members never choose Arr routing — strip client overrides and fill from instance defaults.
        if (!policy.allowAdvancedRequests) {
            body = {
                ...body,
                serverId: undefined,
                profileId: undefined,
                rootFolder: undefined,
                languageProfileId: undefined,
                tags: undefined,
                arrInstanceId: undefined,
            };
        }

        const existing = await store.list({
            userId: ownerUserId,
            mediaType,
            tmdbId,
        });
        // Also catch duplicates filed under a legacy plexId key for the same person.
        const legacyExisting = (!resolved || String(resolved.id) === sessionKey)
            ? []
            : await store.list({ userId: sessionKey, mediaType, tmdbId });
        const candidates = [...existing, ...legacyExisting];
        const duplicate = candidates.find((row) => {
            const status = Number(row?.status);
            if (status === REQUEST_STATUS_DECLINED || status === REQUEST_STATUS_FAILED) return false;
            if (!!row?.is4k !== want4k) return false;
            if (mediaType === 'tv') {
                // Block repeat of the same season set (or another "all" while one is open).
                const incoming = body.seasons ?? 'all';
                const prev = row?.seasons;
                if (incoming === 'all' || prev === 'all') return true;
                if (!Array.isArray(incoming) || !Array.isArray(prev)) return true;
                const want = new Set(incoming.map((n) => Number(n)).filter((n) => Number.isFinite(n)));
                return prev.some((n) => want.has(Number(n)));
            }
            return true;
        });
        if (duplicate) {
            const err = new Error(
                mediaType === 'tv'
                    ? 'You already have an open request for this series (or overlapping seasons).'
                    : 'You already requested this movie.',
            );
            err.status = 409;
            throw err;
        }

        const meta = await fetchTitleMeta(config, mediaType, tmdbId, { fetchImpl });
        if (await isBlocked(mediaType, tmdbId).catch(() => false)) {
            const err = new Error('This title is blacklisted.');
            err.status = 403;
            throw err;
        }
        let arrInstanceId = body.arrInstanceId ? String(body.arrInstanceId) : null;
        let serverId = body.serverId != null ? Number(body.serverId) : null;
        if (!arrInstanceId && Number.isFinite(serverId)) {
            const instance = resolvePortalArrInstance(config, mediaType, serverId, null);
            if (instance) arrInstanceId = instance.id;
        }
        // Without advanced server picks, route HD / UHD to the matching *arr instance.
        if (!arrInstanceId) {
            const servers = listPortalArrServers(config, mediaType);
            const preferred = servers.find((server) => !!server.is4k === want4k)
                || servers.find((server) => server.isDefault)
                || servers[0]
                || null;
            if (preferred?.instanceId) arrInstanceId = preferred.instanceId;
            if (serverId == null && preferred?.id != null) serverId = Number(preferred.id);
        }

        if (policy.allowAdvancedRequests) {
            await assertValidArrRouting(config, mediaType, {
                serverId: Number.isFinite(serverId) ? serverId : null,
                arrInstanceId,
                profileId: body.profileId,
                rootFolder: body.rootFolder,
                languageProfileId: body.languageProfileId,
                tags: body.tags,
            }, fetchOpts);
        }

        const record = await store.create({
            userId: ownerUserId,
            mediaType,
            tmdbId,
            title: meta.title,
            year: meta.year,
            overview: meta.overview,
            genres: meta.genres,
            originalLanguage: meta.originalLanguage,
            posterPath: meta.posterPath,
            backdropPath: meta.backdropPath,
            is4k: want4k,
            seasons: mediaType === 'tv' ? (body.seasons ?? 'all') : [],
            rootFolder: body.rootFolder,
            qualityProfile: body.profileId,
            profileId: body.profileId,
            serverId: Number.isFinite(serverId) ? serverId : null,
            arrInstanceId,
            languageProfileId: body.languageProfileId,
            tags: normalizeTagIds(body.tags),
            status: REQUEST_STATUS_PENDING,
            meta: {
                requestedByName: resolved?.username || user?.username || user?.email || null,
                requestedByEmail: resolved?.email || user?.email || null,
                isAnime: !!meta.isAnime,
            },
        });

        const created = mapPortalRecordToDto(record, resolved || user);
        // Per-user (then global) auto-approve — push to *arr immediately when allowed.
        if (shouldPortalAutoApprove(config, mediaType, { is4k: want4k, user: resolved || user })) {
            try {
                return await approveAdminRequest(record.id, null, resolved || user);
            } catch (approveError) {
                return {
                    ...created,
                    autoApproveError: approveError?.message || 'Auto-approve failed',
                };
            }
        }
        return created;
    };

    const memberUserIds = (user) => {
        const ids = [user?.id, user?.plexId, user?.jellyfinId]
            .map((value) => String(value || '').trim())
            .filter(Boolean);
        return [...new Set(ids)];
    };

    const listMemberRecords = async (user) => {
        const userIds = memberUserIds(user);
        if (!userIds.length) return [];
        return store.list({ userIds });
    };

    const mergeMemberRequestDtos = (portalDtos, arrDtos) => {
        const byKey = new Map();
        for (const dto of (Array.isArray(arrDtos) ? arrDtos : [])) {
            const key = `${dto.type || 'movie'}:${Number(dto.tmdbId) || 0}`;
            if (!byKey.has(key)) byKey.set(key, dto);
        }
        // Portal in-flight / pending rows win over Arr-tag cards for the same title.
        for (const dto of (Array.isArray(portalDtos) ? portalDtos : [])) {
            const key = `${dto.type || 'movie'}:${Number(dto.tmdbId) || 0}`;
            const existing = byKey.get(key);
            const portalStatus = Number(dto.status);
            const inFlight = portalStatus === REQUEST_STATUS_PENDING
                || portalStatus === REQUEST_STATUS_FAILED
                || portalStatus === REQUEST_STATUS_DECLINED
                || (portalStatus === REQUEST_STATUS_APPROVED && !isPortalRequestAvailable(dto));
            if (!existing || inFlight || dto.engine !== 'arr-tag') {
                byKey.set(key, dto);
            }
        }
        return [...byKey.values()].sort((a, b) => {
            const aTime = Date.parse(a.updatedAt || a.createdAt || 0) || 0;
            const bTime = Date.parse(b.updatedAt || b.createdAt || 0) || 0;
            return bTime - aTime;
        });
    };

    const listMemberRequests = async (user, { filter = 'all', take = 20, skip = 0 } = {}) => {
        // Best-effort: drop available Arr-imported seeds so portal JSON stays thin.
        await pruneAvailablePortalOwnershipRows({
            requestsDir: dataDir,
            onlyImported: true,
        }).catch(() => null);

        const records = dedupeMemberRequestRows(await listMemberRecords(user));
        const portalDtos = records.map((record) => mapPortalRecordToDto(record, user));
        let arrDtos = [];
        try {
            arrDtos = await listArrOwnershipDtosForUser({
                config,
                user,
                portalUsers: await listUsers().catch(() => []),
                resolveUrl,
                fetchImpl,
            });
        } catch {
            arrDtos = [];
        }
        const dtos = mergeMemberRequestDtos(portalDtos, arrDtos);
        const counts = countMemberRequests(dtos);
        const filtered = dtos.filter((item) => filterMemberRequestTab(item, filter));
        const page = filtered.slice(skip, skip + take);
        const recordById = new Map(records.map((row) => [String(row.id), row]));
        // Member / impersonation views never hit the admin enrich path — fill sparse posters
        // for portal rows on the visible page and persist so the next load is instant.
        await backfillPagePosters(page, recordById, () => user);
        return {
            userMapped: true,
            results: page,
            counts,
            pageInfo: {
                total: filtered.length,
                take,
                skip,
            },
        };
    };

    const getMemberRequestCounts = async (user) => {
        const listed = await listMemberRequests(user, { filter: 'all', take: 10000, skip: 0 });
        return {
            userMapped: true,
            ...listed.counts,
        };
    };

    const cancelMemberRequest = async (user, requestId) => {
        const record = await store.get(requestId);
        if (!record) {
            const err = new Error('Request not found');
            err.status = 404;
            throw err;
        }
        const ownerIds = new Set(memberUserIds(user));
        if (!ownerIds.has(String(record.userId || ''))) {
            const err = new Error('You can only manage your own requests.');
            err.status = 403;
            throw err;
        }
        if (Number(record.status) !== REQUEST_STATUS_PENDING) {
            const err = new Error('Only pending requests can be cancelled.');
            err.status = 400;
            throw err;
        }
        await store.remove(requestId);
        return true;
    };

    const listAdminRequests = async ({ filter = 'pending', take = 20, skip = 0 } = {}) => {
        const safeFilter = ADMIN_FILTERS.has(String(filter)) ? String(filter) : 'pending';
        const records = await store.list();
        const dtos = [];
        for (const record of records) {
            dtos.push(await enrichDto(record));
        }
        const filtered = dtos.filter((item) => filterAdminRequestTab(item, safeFilter));
        const page = filtered.slice(skip, skip + take);

        // Backfill missing posters + genres/language for the visible page only (persist for next load).
        const recordById = new Map(records.map((row) => [String(row.id), row]));
        const mapAdminUser = (dto) => ({
            id: dto.requestedBy?.id,
            username: dto.requestedBy?.displayName,
            email: dto.requestedBy?.email,
            thumb: dto.requestedBy?.avatar,
        });
        await backfillPagePosters(page, recordById, mapAdminUser);
        await Promise.all(page.map(async (dto, index) => {
            const baseline = recordById.get(String(dto.id));
            if (!baseline) return;
            let updated = await store.get(baseline.id).catch(() => null) || baseline;

            const needsMeta = !(Array.isArray(updated.genres) && updated.genres.length)
                || !normalizeOriginalLanguage(updated.originalLanguage);
            if (needsMeta && Number(updated.tmdbId) > 0 && String(config?.tmdbApiKey || '').trim()) {
                try {
                    const meta = await Promise.race([
                        fetchTitleMeta(config, updated.mediaType === 'tv' ? 'tv' : 'movie', updated.tmdbId, fetchOpts),
                        new Promise((resolve) => {
                            setTimeout(() => resolve(null), 2500);
                        }),
                    ]);
                    if (meta) {
                        const patch = {};
                        if (!(Array.isArray(updated.genres) && updated.genres.length) && meta.genres?.length) {
                            patch.genres = meta.genres;
                        }
                        if (!normalizeOriginalLanguage(updated.originalLanguage) && meta.originalLanguage) {
                            patch.originalLanguage = meta.originalLanguage;
                        }
                        if (!updated.overview && meta.overview) patch.overview = meta.overview;
                        if (!updated.year && meta.year) patch.year = meta.year;
                        if (!updated.posterPath && meta.posterPath) patch.posterPath = meta.posterPath;
                        if (Object.keys(patch).length) {
                            updated = await store.update(updated.id, patch) || { ...updated, ...patch };
                        }
                    }
                } catch {
                    /* best-effort backfill */
                }
            }

            if (updated.posterPath !== baseline.posterPath
                || updated.genres !== baseline.genres
                || updated.originalLanguage !== baseline.originalLanguage
                || updated.overview !== baseline.overview
                || updated.year !== baseline.year) {
                page[index] = mapPortalRecordToDto(updated, mapAdminUser(dto));
            }
        }));

        const total = filtered.length;
        const pages = Math.max(1, Math.ceil(total / Math.max(1, take)));
        return {
            results: page,
            pageInfo: {
                pages,
                page: Math.floor(skip / Math.max(1, take)) + 1,
                results: total,
            },
        };
    };

    const getAdminRequestCounts = async () => {
        const records = await store.list();
        const dtos = records.map((record) => mapPortalRecordToDto(record));
        return countAdminRequests(dtos);
    };

    const getAdminRequest = async (requestId) => {
        let record = await store.get(requestId);
        if (!record) {
            const err = new Error('Request not found');
            err.status = 404;
            throw err;
        }
        const needsMeta = !(Array.isArray(record.genres) && record.genres.length)
            || !normalizeOriginalLanguage(record.originalLanguage);
        if (needsMeta && Number(record.tmdbId) > 0 && String(config?.tmdbApiKey || '').trim()) {
            try {
                const meta = await fetchTitleMeta(
                    config,
                    record.mediaType === 'tv' ? 'tv' : 'movie',
                    record.tmdbId,
                    fetchOpts,
                );
                const patch = {};
                if (!(Array.isArray(record.genres) && record.genres.length) && meta.genres?.length) {
                    patch.genres = meta.genres;
                }
                if (!normalizeOriginalLanguage(record.originalLanguage) && meta.originalLanguage) {
                    patch.originalLanguage = meta.originalLanguage;
                }
                if (Object.keys(patch).length) {
                    record = await store.update(record.id, patch) || { ...record, ...patch };
                }
            } catch {
                /* best-effort */
            }
        }
        return enrichDto(record, { detail: true });
    };

    const listPortalRequestUsers = async () => {
        const users = await listUsers().catch(() => []);
        return (Array.isArray(users) ? users : []).map((user) => ({
            id: user?.id,
            displayName: user?.username || user?.email || `User ${user?.id}`,
            email: user?.email || null,
            username: user?.username || null,
            plexId: user?.plexId ?? user?.id ?? null,
            avatar: user?.thumb || user?.avatar || null,
        }));
    };

    const pushRecordToArr = async (record) => {
        const mediaType = record.mediaType === 'tv' ? 'tv' : 'movie';
        let profileId = record.profileId != null ? Number(record.profileId) : null;
        let rootFolder = record.rootFolder ? String(record.rootFolder) : '';
        let languageProfileId = record.languageProfileId != null ? Number(record.languageProfileId) : null;
        let tags = normalizeTagIds(record.tags);

        const instance = resolvePortalArrInstance(
            config,
            mediaType,
            record.serverId,
            record.arrInstanceId,
        );
        if (!instance) {
            return {
                ok: false,
                reason: `No ${mediaType === 'tv' ? 'Sonarr' : 'Radarr'} instance is configured in the portal.`,
            };
        }

        // Anime movies + series both use anime root/profile when configured on the *arr instance.
        const isAnime = !!(record?.meta?.isAnime || record?.isAnime);
        let serviceOptions = null;

        // Fill missing routing from live *arr defaults (instance prefs first).
        if (!Number.isFinite(profileId) || !rootFolder || !Number.isFinite(languageProfileId)) {
            try {
                serviceOptions = await Promise.race([
                    getPortalArrServiceOptions(config, mediaType, record.serverId, {
                        ...fetchOpts,
                        arrInstanceId: instance.id,
                        timeoutMs: 8000,
                    }),
                    new Promise((_, reject) => {
                        setTimeout(() => reject(new Error('Timed out loading *arr defaults')), 9000);
                    }),
                ]);
                if (!Number.isFinite(profileId)) {
                    const preferredProfileId = isAnime
                        ? (serviceOptions.server?.activeAnimeProfileId ?? serviceOptions.server?.activeProfileId)
                        : serviceOptions.server?.activeProfileId;
                    profileId = Number(preferredProfileId ?? serviceOptions.profiles[0]?.id);
                }
                if (!rootFolder) {
                    const preferredRoot = isAnime
                        ? (serviceOptions.server?.activeAnimeDirectory || serviceOptions.server?.activeDirectory || '')
                        : (serviceOptions.server?.activeDirectory || '');
                    rootFolder = String(preferredRoot || serviceOptions.rootFolders[0]?.path || '');
                }
                if (!Number.isFinite(languageProfileId) && serviceOptions.languageProfiles?.length) {
                    languageProfileId = Number(serviceOptions.server?.activeLanguageProfileId ?? serviceOptions.languageProfiles[0]?.id);
                }
            } catch (error) {
                return {
                    ok: false,
                    reason: error?.message || 'Could not load *arr defaults for this request.',
                };
            }
        }

        // Skip re-validating stored routing on approve/retry — member create already gated
        // advanced options, and a second *arr options round-trip was hanging into blank 502s.

        const servers = listPortalArrServers(config, mediaType);
        const serverMeta = servers.find((entry) => entry.instanceId === instance.id);

        // Seed configured server tags (anime vs standard), then append requester tag.
        const configuredTags = isAnime
            ? (Array.isArray(instance.animeTags) ? instance.animeTags : [])
            : (Array.isArray(instance.tags) ? instance.tags : []);
        for (const tagId of configuredTags) {
            const n = Number(tagId);
            if (Number.isFinite(n) && !tags.includes(n)) tags = [...tags, n];
        }

        // Requester tagging: one tag per linked media id (plex and/or jellyfin).
        // Tag creation is idempotent: *arr returns the existing label after a duplicate POST.
        if (config?.tagRequests !== false) {
            const requester = await resolveUser(record.userId).catch(() => null);
            const tagUser = requester || {
                id: record.userId,
                username: record?.meta?.requestedByName || '',
                email: record?.meta?.requestedByEmail || '',
            };
            const tagLabels = buildPortalRequesterTagsForUser(tagUser);
            for (const tagLabel of tagLabels) {
                try {
                    const requesterTag = await createPortalTag({
                        mediaType,
                        label: tagLabel,
                        serverId: serverMeta?.id ?? record.serverId,
                    });
                    if (Number.isFinite(requesterTag?.id) && !tags.includes(requesterTag.id)) {
                        tags = [...tags, requesterTag.id];
                    }
                } catch (error) {
                    return { ok: false, reason: error?.message || 'Could not create requester tag in *arr.' };
                }
            }
        }

        const pushResult = mediaType === 'tv'
            ? await addSonarrSeries(instance, {
                tmdbId: record.tmdbId,
                // Sonarr is TVDB-first; pass config so we can bridge TMDB → TVDB when
                // Sonarr's `tmdb:` lookup misses (common for new shows like Junk or Jackpot?).
                config,
                qualityProfileId: profileId,
                rootFolderPath: rootFolder,
                languageProfileId,
                tags,
                seasons: record.seasons === 'all' ? 'all' : (record.seasons || 'all'),
                search: true,
                ...fetchOpts,
            })
            : await addRadarrMovie(instance, {
                tmdbId: record.tmdbId,
                qualityProfileId: profileId,
                rootFolderPath: rootFolder,
                tags,
                search: true,
                ...fetchOpts,
            });

        if (!pushResult.ok) return pushResult;

        return {
            ok: true,
            created: !!pushResult.created,
            entity: pushResult.entity,
            instance,
            serverId: serverMeta?.id ?? record.serverId ?? null,
            profileId,
            rootFolder,
            languageProfileId,
        };
    };

    const updateAdminRequest = async (requestId, overrides = {}, adminUser = null) => {
        const existing = await store.get(requestId);
        if (!existing) {
            const err = new Error('Request not found');
            err.status = 404;
            throw err;
        }
        const patched = applyOverridesToRecord(existing, overrides);
        if (overrides?.arrInstanceId || overrides?.serverId != null) {
            const instance = resolvePortalArrInstance(
                config,
                patched.mediaType,
                patched.serverId,
                patched.arrInstanceId,
            );
            if (instance) patched.arrInstanceId = instance.id;
        }
        const updated = await store.update(requestId, {
            ...patched,
            meta: {
                ...(existing.meta || {}),
                ...(patched.meta || {}),
                modifiedBy: adminUser ? {
                    id: adminUser.id,
                    displayName: adminUser.username || adminUser.email || 'Admin',
                } : (existing.meta?.modifiedBy || null),
            },
        });
        return enrichDto(updated, { detail: true });
    };

    const approveAdminRequest = async (requestId, overrides = null, adminUser = null) => {
        let record = await store.get(requestId);
        if (!record) {
            const err = new Error('Request not found');
            err.status = 404;
            throw err;
        }

        if (hasRequestOverrides(overrides)) {
            await updateAdminRequest(requestId, overrides, adminUser);
            record = await store.get(requestId);
        }

        const pushResult = await pushRecordToArr(record);
        if (!pushResult.ok) {
            const failed = await store.update(requestId, {
                status: REQUEST_STATUS_FAILED,
                meta: {
                    ...(record.meta || {}),
                    arrError: pushResult.reason || 'Failed to push to *arr',
                    modifiedBy: adminUser ? {
                        id: adminUser.id,
                        displayName: adminUser.username || adminUser.email || 'Admin',
                    } : (record.meta?.modifiedBy || null),
                },
            });
            const err = new Error(pushResult.reason || 'Failed to push to *arr');
            err.status = 502;
            err.request = await enrichDto(failed, { detail: true });
            throw err;
        }

        const approved = await store.update(requestId, {
            status: REQUEST_STATUS_APPROVED,
            serverId: pushResult.serverId ?? record.serverId,
            arrInstanceId: pushResult.instance?.id || record.arrInstanceId,
            profileId: pushResult.profileId ?? record.profileId,
            qualityProfile: pushResult.profileId ?? record.qualityProfile,
            rootFolder: pushResult.rootFolder || record.rootFolder,
            languageProfileId: pushResult.languageProfileId ?? record.languageProfileId,
            ...(!record.posterPath && pickArrPosterUrl(pushResult.entity)
                ? { posterPath: pickArrPosterUrl(pushResult.entity) }
                : {}),
            meta: {
                ...(record.meta || {}),
                arrError: null,
                arrEntityId: pushResult.entity?.id ?? null,
                arrInstanceId: pushResult.instance?.id || null,
                arrInstanceName: pushResult.instance?.name || null,
                arrCreated: !!pushResult.created,
                mediaStatus: 3,
                isDownloading: true,
                ...(!record.posterPath && pickArrPosterUrl(pushResult.entity)
                    ? { posterSource: 'arr' }
                    : {}),
                modifiedBy: adminUser ? {
                    id: adminUser.id,
                    displayName: adminUser.username || adminUser.email || 'Admin',
                } : (record.meta?.modifiedBy || null),
            },
        });

        return enrichDto(approved, { detail: true });
    };

    const declineAdminRequest = async (requestId, reason = '', adminUser = null) => {
        const record = await store.get(requestId);
        if (!record) {
            const err = new Error('Request not found');
            err.status = 404;
            throw err;
        }
        const declined = await store.update(requestId, {
            status: REQUEST_STATUS_DECLINED,
            meta: {
                ...(record.meta || {}),
                declineReason: String(reason || '').trim() || null,
                modifiedBy: adminUser ? {
                    id: adminUser.id,
                    displayName: adminUser.username || adminUser.email || 'Admin',
                } : (record.meta?.modifiedBy || null),
            },
        });
        return enrichDto(declined, { detail: true });
    };

    const deleteAdminRequest = async (requestId) => {
        const removed = await store.remove(requestId);
        if (!removed) {
            const err = new Error('Request not found');
            err.status = 404;
            throw err;
        }
        return true;
    };

    const retryAdminRequest = async (requestId, adminUser = null) => {
        const record = await store.get(requestId);
        if (!record) {
            const err = new Error('Request not found');
            err.status = 404;
            throw err;
        }
        const status = Number(record.status);
        if (status !== REQUEST_STATUS_FAILED && status !== REQUEST_STATUS_APPROVED) {
            const err = new Error('Only failed or approved requests can be retried.');
            err.status = 400;
            throw err;
        }
        return approveAdminRequest(requestId, null, adminUser);
    };

    const retryMemberRequest = async (user, requestId) => {
        const record = await store.get(requestId);
        if (!record) {
            const err = new Error('Request not found');
            err.status = 404;
            throw err;
        }
        if (String(record.userId) !== String(user?.id || '')) {
            const err = new Error('You can only manage your own requests.');
            err.status = 403;
            throw err;
        }
        return retryAdminRequest(requestId, user);
    };

    const createPortalTag = async ({ mediaType, label, serverName = '', serverId = null }) => {
        // Newer *arr builds only allow a-z0-9- in tag labels.
        const cleanLabel = sanitizeArrTagSegment(label);
        if (!cleanLabel) {
            const err = new Error('Tag label is required');
            err.status = 400;
            throw err;
        }
        const instance = resolvePortalArrInstance(config, mediaType, serverId, null)
            || (() => {
                const servers = listPortalArrServers(config, mediaType);
                const nameKey = String(serverName || '').trim().toLowerCase();
                const match = nameKey
                    ? servers.find((s) => String(s.name || '').toLowerCase() === nameKey)
                    : servers.find((s) => s.isDefault) || servers[0];
                return match ? resolvePortalArrInstance(config, mediaType, match.id, match.instanceId) : null;
            })();
        if (!instance) {
            const err = new Error('No matching *arr instance is configured.');
            err.status = 400;
            throw err;
        }

        const created = await fetchArrInstance(instance, '/api/v3/tag', {
            ...fetchOpts,
            method: 'POST',
            body: { label: cleanLabel },
        });
        if (created?.ok && created.data?.id != null) {
            clearPortalArrServiceOptionsCache(mediaType, instance.id);
            return { id: Number(created.data.id), label: String(created.data.label || cleanLabel) };
        }

        const listed = await fetchArrInstance(instance, '/api/v3/tag', fetchOpts);
        const tags = Array.isArray(listed?.data) ? listed.data : [];
        const existing = tags.find((tag) => (
            String(tag?.label || '').trim().toLowerCase() === cleanLabel.toLowerCase()
        ));
        if (existing?.id != null) {
            clearPortalArrServiceOptionsCache(mediaType, instance.id);
            return { id: Number(existing.id), label: String(existing.label || cleanLabel) };
        }
        const err = new Error(created?.data?.message || 'Failed to create tag in *arr');
        err.status = created?.status || 502;
        throw err;
    };

    /**
     * Member request modal payload, built entirely from portal data.
     * TMDB supplies title/overview/poster/seasons; *arr supplies library season status.
     */
    const getMemberRequestOptions = async (user, { mediaType, mediaId } = {}) => {
        const type = mediaType === 'tv' ? 'tv' : 'movie';
        const tmdbId = Number(mediaId);
        if (!Number.isFinite(tmdbId) || tmdbId <= 0) {
            const err = new Error('Invalid mediaId');
            err.status = 400;
            throw err;
        }

        const apiKey = String(config?.tmdbApiKey || '').trim();
        if (!apiKey) {
            const err = new Error('TMDB API key is required for portal request options.');
            err.status = 400;
            throw err;
        }

        const client = createTmdbClient({ tmdbApiKey: apiKey, language: 'en' });
        const details = type === 'tv'
            ? await client.tv(tmdbId, { language: 'en' })
            : await client.movie(tmdbId, { language: 'en' });

        const library = createLibraryAvailability(config, {
            resolveUrl,
            fetchImpl,
            upgraderItems: [],
        });
        // Modal open path: use disk-cache stamps only — live Sonarr/TVDB fan-out can take
        // many seconds on long-running shows and blocks the request-options spinner.
        const yearRaw = String(details?.firstAirDate || details?.releaseDate || '').slice(0, 4);
        const year = Number(yearRaw);
        const sessionKey = String(user?.id || user?.plexId || '').trim();
        const [statusPayload, related, resolvedUser] = await Promise.all([
            type === 'tv'
                ? library.getTvListStatus(tmdbId, {
                    title: details?.name || details?.title || '',
                    year: Number.isFinite(year) && year > 1900 ? year : null,
                    networkLookups: false,
                }).catch(() => null)
                : library.getMediaStatus(type, tmdbId).catch(() => null),
            store.list({ mediaType: type, tmdbId }),
            sessionKey ? resolveUser(sessionKey).catch(() => null) : Promise.resolve(null),
        ]);
        const mediaInfo = statusPayload?.mediaInfo && typeof statusPayload.mediaInfo === 'object'
            ? { ...statusPayload.mediaInfo }
            : {};

        const portalRequestRows = related
            .filter((row) => Number(row?.status) !== REQUEST_STATUS_DECLINED)
            .map((row) => {
                let seasons = [];
                if (type === 'tv') {
                    if (row.seasons === 'all') {
                        seasons = (details?.seasons || [])
                            .map((s) => Number(s?.seasonNumber))
                            .filter((n) => Number.isFinite(n) && n >= 0)
                            .map((seasonNumber) => ({ seasonNumber }));
                    } else if (Array.isArray(row.seasons)) {
                        seasons = row.seasons
                            .map((n) => Number(n))
                            .filter((n) => Number.isFinite(n))
                            .map((seasonNumber) => ({ seasonNumber }));
                    }
                }
                return {
                    id: row.id,
                    status: Number(row.status) || REQUEST_STATUS_PENDING,
                    is4k: !!row.is4k,
                    seasons,
                    userId: row.userId != null ? String(row.userId) : null,
                    requestedByName: row?.meta?.requestedByName || null,
                };
            });
        const ownerIds = new Set(memberUserIds(resolvedUser || user));
        const ownPortalRequests = portalRequestRows.filter((row) => (
            row.userId && ownerIds.has(String(row.userId))
        ));
        const openPortalRequest = portalRequestRows.find((row) => {
            const status = Number(row.status);
            return status === REQUEST_STATUS_PENDING || status === REQUEST_STATUS_APPROVED;
        }) || null;
        const openRequestIsOwn = !!(openPortalRequest?.userId && ownerIds.has(String(openPortalRequest.userId)));
        let openRequestedByName = openPortalRequest?.requestedByName || null;
        if (openPortalRequest?.userId && !openRequestedByName) {
            const requester = await resolveUser(openPortalRequest.userId).catch(() => null);
            openRequestedByName = requester?.username || requester?.displayName || requester?.email || null;
        }

        // Only the viewer's own requests count as "your request" in the UI.
        // Still expose attribution so other members / impersonation see who asked.
        mediaInfo.requests = [
            ...(Array.isArray(mediaInfo.requests) ? mediaInfo.requests : []),
            ...ownPortalRequests.map(({ userId, requestedByName, ...rest }) => rest),
        ];
        if (openPortalRequest) {
            mediaInfo.requestAttribution = {
                isOwn: openRequestIsOwn,
                requestedByName: openRequestedByName,
                requestId: openPortalRequest.id,
                status: openPortalRequest.status,
            };
        } else {
            // Durable ownership from Arr requester tags when no portal row exists
            // (legacy library titles, media added outside the portal).
            const libraryMatched = Number(mediaInfo?.status) === 4
                || Number(mediaInfo?.status) === 5
                || Number(statusPayload?.status) === 4
                || Number(statusPayload?.status) === 5;
            if (libraryMatched) {
                const portalUsers = await listUsers().catch(() => []);
                const arrOwner = await lookupArrRequesterForTmdb({
                    config,
                    mediaType: type,
                    tmdbId,
                    portalUsers: Array.isArray(portalUsers) ? portalUsers : [],
                    resolveUrl,
                    fetchImpl,
                }).catch(() => null);
                if (arrOwner?.user?.id != null) {
                    const name = arrOwner.user.username
                        || arrOwner.user.displayName
                        || arrOwner.user.email
                        || arrOwner.tagLabel
                        || null;
                    mediaInfo.requestAttribution = {
                        isOwn: ownerIds.has(String(arrOwner.user.id)),
                        requestedByName: name,
                        requestId: null,
                        status: REQUEST_STATUS_APPROVED,
                        source: 'arrTag',
                        arrTag: arrOwner.tagLabel || null,
                    };
                }
            }
        }

        const servers = listPortalArrServers(config, type);
        const has4kServer = servers.some((server) => !!server.is4k);
        const hasHdServer = servers.some((server) => !server.is4k) || (servers.length > 0 && !has4kServer);

        const policy = resolveMemberRequestPolicy(config, resolvedUser || user);
        const memberRecords = await store.list({ userId: String(resolvedUser?.id || user?.id || '') });
        const quotaEval = evaluatePortalMemberQuota(config, memberRecords, {
            policy,
            mediaType: type,
        });

        const seasons = type === 'tv' ? buildMemberSeasonOptions(details, mediaInfo) : [];
        let mediaStatus = Number(mediaInfo?.status ?? statusPayload?.status) || null;
        if (!Number.isFinite(mediaStatus) || mediaStatus === 1) {
            if (portalRequestRows.some((row) => Number(row.status) === REQUEST_STATUS_PENDING)) {
                mediaStatus = 2;
            } else if (portalRequestRows.some((row) => Number(row.status) === REQUEST_STATUS_APPROVED)) {
                mediaStatus = 3;
            }
        }
        const blocked = await isBlocked(type, tmdbId).catch(() => false);
        if (blocked) mediaStatus = 6;
        const isBlacklisted = mediaStatus === 6 || blocked;
        if (Number.isFinite(mediaStatus)) mediaInfo.status = mediaStatus;

        const permHd = canPolicyRequestMedia(policy, type, { is4k: false });
        const perm4k = canPolicyRequestMedia(policy, type, { is4k: true });
        const canRequest4k = has4kServer && perm4k.ok;
        const canRequestAdvanced = !!policy.allowAdvancedRequests && servers.length > 0;

        let blockReason = null;
        let canRequest = !isBlacklisted && servers.length > 0 && permHd.ok;
        if (isBlacklisted) blockReason = 'This title is blacklisted.';
        else if (!servers.length) {
            blockReason = type === 'tv'
                ? 'No Sonarr instance is configured.'
                : 'No Radarr instance is configured.';
        } else if (!permHd.ok) {
            blockReason = permHd.reason;
        }

        if (canRequest && type === 'movie') {
            if (mediaStatus === 5) {
                canRequest = false;
                blockReason = blockReason || 'This movie is already available.';
            } else if (mediaStatus === 2 || mediaStatus === 3) {
                canRequest = false;
                blockReason = blockReason || 'This title is already requested or downloading.';
            }
        } else if (canRequest && type === 'tv') {
            const requestableCount = seasons.filter((s) => s.requestable).length;
            if (requestableCount === 0) {
                canRequest = false;
                blockReason = blockReason || 'All seasons are already requested or available.';
            }
        }

        if (
            canRequest
            && quotaEval.standardQuotaBlocked
            && (!canRequest4k || quotaEval.fourKQuotaBlocked)
        ) {
            canRequest = false;
            blockReason = `You have used all ${quotaEval.quota.standard.limit} requests for this period.`;
        }

        const title = type === 'tv'
            ? (details?.name || details?.title || '')
            : (details?.title || details?.name || '');

        const payload = {
            mediaType: type,
            tmdbId,
            title,
            overview: details?.overview || '',
            mediaStatus: Number.isFinite(mediaStatus) ? mediaStatus : null,
            mediaInfo,
            isBlacklisted,
            isAnime: !!details?.isAnime,
            canRequest,
            canRequest4k,
            canRequestAdvanced,
            canCreateIssues: true,
            has4kServer,
            hasHdServer,
            standardQuotaBlocked: quotaEval.standardQuotaBlocked,
            fourKQuotaBlocked: quotaEval.fourKQuotaBlocked,
            servers,
            permissions: {
                request: permHd.ok,
                requestMovie: policy.allowRequestMovies,
                requestTv: policy.allowRequestTv,
                request4k: canRequest4k,
                request4kMovie: policy.allowRequest4kMovies,
                request4kTv: policy.allowRequest4kTv,
                requestAdvanced: canRequestAdvanced,
                createIssues: true,
            },
            quota: quotaEval.quota,
            seasons,
            userMapped: true,
            blockReason,
            posterPath: details?.posterPath || null,
            engine: 'portal',
        };

        if (type === 'tv' && !payload.posterPath) {
            const tvdbPoster = await resolveTvdbPosterForTmdbShow(config, tmdbId, { fetchImpl });
            if (tvdbPoster?.posterPath) {
                payload.posterPath = tvdbPoster.posterPath;
                payload.tvdbId = tvdbPoster.tvdbId;
            }
        }

        const notifyState = await getNotifyState(user, type, tmdbId);
        payload.canNotify = !!notifyState.canNotify;
        payload.notifying = !!notifyState.notifying;
        payload.notifyRequestId = notifyState.requestId;

        // Someone else already requested this — always offer Notify (unless already subscribed).
        // Do not rely only on meta.mediaStatus sync, which can lag or mark available early.
        if (openPortalRequest && !openRequestIsOwn) {
            payload.notifyRequestId = payload.notifyRequestId || Number(openPortalRequest.id) || null;
            if (!payload.notifying) payload.canNotify = true;
        }

        return payload;
    };

    const normalizeNotifyUserIds = (meta = {}) => {
        const raw = Array.isArray(meta?.notifyUserIds) ? meta.notifyUserIds : [];
        return [...new Set(raw.map((id) => String(id || '').trim()).filter(Boolean))];
    };

    const isOpenNotifyRequest = (record = {}) => {
        const status = Number(record?.status);
        if (status !== REQUEST_STATUS_PENDING && status !== REQUEST_STATUS_APPROVED) return false;
        const mediaStatus = Number(record?.meta?.mediaStatus);
        if (mediaStatus === 6) return false;
        // Fully available and idle — notify window is over.
        if (mediaStatus === 5 && !record?.meta?.isDownloading) return false;
        return true;
    };

    const findOpenRequestsForMedia = async (mediaType, tmdbId) => {
        const type = mediaType === 'tv' ? 'tv' : 'movie';
        const id = Number(tmdbId);
        if (!Number.isFinite(id) || id <= 0) return [];
        const rows = await store.list({ mediaType: type, tmdbId: id });
        return rows.filter(isOpenNotifyRequest);
    };

    const resolveMemberPrimaryUserId = async (user) => {
        const sessionKey = String(user?.id || user?.plexId || '').trim();
        const resolved = sessionKey ? await resolveUser(sessionKey).catch(() => null) : null;
        return String(resolved?.id || user?.id || user?.plexId || '').trim();
    };

    const getNotifyState = async (user, mediaType, tmdbId) => {
        const ownerIds = new Set(memberUserIds(user));
        const type = mediaType === 'tv' ? 'tv' : 'movie';
        const id = Number(tmdbId);
        const portalUsers = await listUsers().catch(() => []);

        // Prefer Arr notify/requester tags when the title is on disk.
        const arrState = await listArrNotifyStateForTmdb({
            config,
            mediaType: type,
            tmdbId: id,
            user,
            portalUsers,
            resolveUrl,
            fetchImpl,
        }).catch(() => null);

        let open = await findOpenRequestsForMedia(mediaType, tmdbId);
        if (!open.length && Number.isFinite(id) && id > 0) {
            const rows = await store.list({ mediaType: type, tmdbId: id });
            open = rows.filter((row) => {
                const status = Number(row?.status);
                return status === REQUEST_STATUS_PENDING || status === REQUEST_STATUS_APPROVED;
            });
        }
        const owned = open.find((row) => ownerIds.has(String(row.userId || '')));
        if (owned || arrState?.isOwner) {
            return {
                canNotify: false,
                notifying: false,
                requestId: Number(owned?.id) || null,
                isOwner: true,
            };
        }

        const primary = open[0];
        const notifyIds = normalizeNotifyUserIds(primary?.meta);
        const portalNotifying = memberUserIds(user).some((memberId) => notifyIds.includes(memberId));
        const notifying = !!(arrState?.notifying || portalNotifying);
        const canNotify = arrState?.arrPresent
            ? !!arrState.canNotify
            : (!!primary && !notifying);

        return {
            canNotify,
            notifying,
            requestId: Number(primary?.id) || null,
            isOwner: false,
        };
    };

    const subscribeNotify = async (user, body = {}) => {
        const mediaType = body.mediaType === 'tv' ? 'tv' : 'movie';
        const tmdbId = Number(body.mediaId ?? body.tmdbId);
        if (!Number.isFinite(tmdbId) || tmdbId <= 0) {
            const err = new Error('Invalid mediaId');
            err.status = 400;
            throw err;
        }
        if (await isBlocked(mediaType, tmdbId).catch(() => false)) {
            const err = new Error('This title is blacklisted.');
            err.status = 403;
            throw err;
        }

        const portalUsers = await listUsers().catch(() => []);
        const state = await getNotifyState(user, mediaType, tmdbId);
        if (state.isOwner) {
            const err = new Error('You already requested this title.');
            err.status = 409;
            throw err;
        }

        // Arr-first: write n-{mediaUserId}-{username} when the title exists in Arr.
        const arrWrite = await setArrNotifyTagForUser({
            config,
            user,
            mediaType,
            tmdbId,
            subscribe: true,
            portalUsers,
            resolveUrl,
            fetchImpl,
        }).catch((error) => ({ ok: false, reason: error?.message || 'Arr notify tag failed' }));

        let open = await findOpenRequestsForMedia(mediaType, tmdbId);
        if (!open.length) {
            const rows = await store.list({ mediaType, tmdbId });
            open = rows.filter((row) => {
                const status = Number(row?.status);
                return status === REQUEST_STATUS_PENDING || status === REQUEST_STATUS_APPROVED;
            });
        }

        // Mirror onto portal row when present (browse stamp cache). Arr n- tag is SoT when written.
        let requestId = Number(open[0]?.id) || null;
        if (open[0]) {
            const primaryUserId = await resolveMemberPrimaryUserId(user);
            if (!primaryUserId) {
                const err = new Error('Unable to resolve your account.');
                err.status = 400;
                throw err;
            }
            const primary = open[0];
            const notifyUserIds = normalizeNotifyUserIds(primary.meta);
            if (!notifyUserIds.includes(primaryUserId)) notifyUserIds.push(primaryUserId);
            const updated = await store.update(primary.id, {
                meta: {
                    ...(primary.meta || {}),
                    notifyUserIds,
                    notifyArrPending: !arrWrite?.ok || !!arrWrite?.arrMissing,
                },
            });
            requestId = Number(updated?.id || primary.id) || null;
        } else if (!arrWrite?.ok) {
            const err = new Error(arrWrite?.reason || 'No open request exists for this title yet.');
            err.status = arrWrite?.arrMissing ? 404 : 502;
            throw err;
        }

        notifyStampCache = null;
        return {
            success: true,
            notifying: true,
            canNotify: false,
            requestId,
            arrTagged: !!arrWrite?.ok && !arrWrite?.arrMissing,
        };
    };

    const unsubscribeNotify = async (user, body = {}) => {
        const mediaType = body.mediaType === 'tv' ? 'tv' : 'movie';
        const tmdbId = Number(body.mediaId ?? body.tmdbId);
        if (!Number.isFinite(tmdbId) || tmdbId <= 0) {
            const err = new Error('Invalid mediaId');
            err.status = 400;
            throw err;
        }
        const portalUsers = await listUsers().catch(() => []);
        await setArrNotifyTagForUser({
            config,
            user,
            mediaType,
            tmdbId,
            subscribe: false,
            portalUsers,
            resolveUrl,
            fetchImpl,
        }).catch(() => null);

        const open = await findOpenRequestsForMedia(mediaType, tmdbId);
        const removeIds = new Set(memberUserIds(user));
        let touched = null;
        for (const row of open) {
            const notifyUserIds = normalizeNotifyUserIds(row.meta).filter((id) => !removeIds.has(id));
            if (notifyUserIds.length === normalizeNotifyUserIds(row.meta).length) continue;
            touched = await store.update(row.id, {
                meta: {
                    ...(row.meta || {}),
                    notifyUserIds,
                },
            });
        }
        notifyStampCache = null;
        const state = await getNotifyState(user, mediaType, tmdbId);
        return {
            success: true,
            notifying: false,
            canNotify: !!state.canNotify,
            requestId: Number(touched?.id || state.requestId) || null,
        };
    };

    /** One-shot: push portal notifyUserIds onto Arr n- tags when the title exists. */
    const migratePortalNotifyIdsToArrTags = async () => {
        const portalUsers = await listUsers().catch(() => []);
        const byId = new Map(portalUsers.map((user) => [String(user.id), user]));
        for (const user of portalUsers) {
            if (user?.plexId) byId.set(String(user.plexId), user);
            if (user?.jellyfinId) byId.set(String(user.jellyfinId), user);
        }
        const rows = await store.list();
        let migrated = 0;
        for (const row of rows) {
            const notifyIds = normalizeNotifyUserIds(row.meta);
            if (!notifyIds.length) continue;
            const mediaType = row.mediaType === 'tv' ? 'tv' : 'movie';
            const tmdbId = Number(row.tmdbId);
            if (!Number.isFinite(tmdbId) || tmdbId <= 0) continue;
            for (const notifyId of notifyIds) {
                const user = byId.get(String(notifyId));
                if (!user) continue;
                const result = await setArrNotifyTagForUser({
                    config,
                    user,
                    mediaType,
                    tmdbId,
                    subscribe: true,
                    portalUsers,
                    resolveUrl,
                    fetchImpl,
                }).catch(() => null);
                if (result?.ok && !result.arrMissing) migrated += 1;
            }
            if (!row.meta?.notifyArrMigratedAt) {
                await store.update(row.id, {
                    meta: {
                        ...(row.meta || {}),
                        notifyArrMigratedAt: new Date().toISOString(),
                    },
                }).catch(() => null);
            }
        }
        return { migrated };
    };

    /** Stamp canNotify / notifying onto browse list items (portal engine). */
    const NOTIFY_STAMP_TTL_MS = 15 * 1000;
    let notifyStampCache = null; // { at, byKey }
    let notifyStampInflight = null;
    const loadOpenNotifyStampIndex = async () => {
        if (notifyStampCache && Date.now() - notifyStampCache.at < NOTIFY_STAMP_TTL_MS) {
            return notifyStampCache.byKey;
        }
        if (notifyStampInflight) return notifyStampInflight;
        notifyStampInflight = (async () => {
            const all = await store.list();
            const byKey = new Map();
            for (const row of all) {
                const status = Number(row?.status);
                if (status !== REQUEST_STATUS_PENDING && status !== REQUEST_STATUS_APPROVED) continue;
                if (Number(row?.meta?.mediaStatus) === 6) continue;
                const mediaType = row.mediaType === 'tv' ? 'tv' : 'movie';
                const tmdbId = Number(row.tmdbId);
                if (!Number.isFinite(tmdbId) || tmdbId <= 0) continue;
                const key = `${mediaType}:${tmdbId}`;
                if (!byKey.has(key)) {
                    byKey.set(key, {
                        requestId: Number(row.id) || null,
                        ownerUserId: String(row.userId || ''),
                        notifyUserIds: normalizeNotifyUserIds(row.meta),
                    });
                }
            }
            notifyStampCache = { at: Date.now(), byKey };
            return byKey;
        })().finally(() => {
            notifyStampInflight = null;
        });
        return notifyStampInflight;
    };

    const stampNotifyOntoItems = async (user, items = []) => {
        if (!Array.isArray(items) || !items.length) return items;
        const byKey = await loadOpenNotifyStampIndex();
        if (!byKey.size) {
            return items.map((item) => ({ ...item, canNotify: false, notifying: false }));
        }

        const ownerIds = new Set(memberUserIds(user));
        const selfIds = memberUserIds(user);
        return items.map((item) => {
            const raw = item?.mediaType ?? item?.type ?? item?.media_type;
            let mediaType = null;
            if (raw === 'movie' || raw === 1 || raw === '1') mediaType = 'movie';
            else if (raw === 'tv' || raw === 2 || raw === '2') mediaType = 'tv';
            else if (item?.firstAirDate || item?.first_air_date) mediaType = 'tv';
            else if (item?.releaseDate || item?.release_date) mediaType = 'movie';
            const tmdbId = Number(item?.tmdbId ?? item?.id);
            if (!mediaType || !Number.isFinite(tmdbId) || tmdbId <= 0) {
                return { ...item, canNotify: false, notifying: false };
            }
            const libraryStatus = Number(item?.mediaInfo?.status);
            if (libraryStatus === 5 || libraryStatus === 6) {
                return { ...item, canNotify: false, notifying: false };
            }
            const entry = byKey.get(`${mediaType}:${tmdbId}`);
            if (!entry) return { ...item, canNotify: false, notifying: false };
            if (ownerIds.has(entry.ownerUserId)) {
                return {
                    ...item,
                    canNotify: false,
                    notifying: false,
                    notifyRequestId: entry.requestId,
                };
            }
            const ownRequest = Array.isArray(item?.mediaInfo?.requests)
                && item.mediaInfo.requests.some((req) => {
                    const status = Number(req?.status);
                    return status === REQUEST_STATUS_PENDING || status === REQUEST_STATUS_APPROVED;
                });
            if (ownRequest) {
                return {
                    ...item,
                    canNotify: false,
                    notifying: false,
                    notifyRequestId: entry.requestId,
                };
            }
            const notifying = selfIds.some((id) => entry.notifyUserIds.includes(id));
            return {
                ...item,
                canNotify: !notifying,
                notifying,
                notifyRequestId: entry.requestId,
            };
        });
    };

    /** Available portal requests that should email the requester + Notify subscribers. */
    const listAvailableNotifyCandidates = async () => {
        const rows = await store.list({ status: REQUEST_STATUS_APPROVED });
        return rows
            .filter((row) => Number(row?.meta?.mediaStatus) === 5 && !row?.meta?.isDownloading)
            .map((row) => ({
                id: Number(row.id),
                title: row.title || 'A requested title',
                mediaType: row.mediaType === 'tv' ? 'tv' : 'movie',
                tmdbId: Number(row.tmdbId) || null,
                userId: String(row.userId || ''),
                notifyUserIds: normalizeNotifyUserIds(row.meta),
                updatedAt: row.updatedAt || row.meta?.statusSyncedAt || null,
            }));
    };

    return {
        store,
        createMemberRequest,
        listMemberRequests,
        getMemberRequestCounts,
        cancelMemberRequest,
        listAdminRequests,
        getAdminRequestCounts,
        getAdminRequest,
        listPortalRequestUsers,
        updateAdminRequest,
        approveAdminRequest,
        declineAdminRequest,
        deleteAdminRequest,
        retryAdminRequest,
        retryMemberRequest,
        createPortalTag,
        getMemberRequestOptions,
        getNotifyState,
        subscribeNotify,
        unsubscribeNotify,
        migratePortalNotifyIdsToArrTags,
        stampNotifyOntoItems,
        listAvailableNotifyCandidates,
        listPortalArrServers: (type) => listPortalArrServers(config, type),
        getPortalArrServiceOptions: (type, serverId) => getPortalArrServiceOptions(config, type, serverId, fetchOpts),
        syncRequestStatuses: () => syncPortalRequestStatuses({
            config,
            store,
            resolveUrl,
            fetchImpl,
        }),
    };
};

export default createPortalRequestService;
