import fetch from 'node-fetch';

import {
    daysSince,
    isMaintenanceExperimentalEnabled,
    mToLower,
} from './maintenance-rule-engine.js';

export const createMaintenanceIndexService = ({
    configPath,
    maintenanceMediaIndexPath,
    maintenanceRequestIndexPath,
    loadFile,
    saveFile,
    getPlexConnectionUri,
    resolveIntegrationUrlForFetch,
    appendAuditLog,
    markTaskStart,
    markTaskEnd,
    systemJobs,
    runHeavyJob = (_name, task) => task(),
    log,
}) => {
    let maintenanceIndexBuildPromise = null;
    const parsePlexGuidIds = (guids = []) => {
        const parsed = { imdb: null, tmdb: null, tvdb: null };
        for (const g of guids) {
            const id = String(g?.id || '');
            if (!id) continue;
            const match = id.match(/^([a-z0-9]+):\/\/(.+)$/i);
            if (!match) continue;
            const kind = mToLower(match[1]);
            const raw = match[2];
            if (kind === 'imdb' && !parsed.imdb) parsed.imdb = raw;
            if (kind === 'tmdb' && !parsed.tmdb) parsed.tmdb = raw;
            if (kind === 'tvdb' && !parsed.tvdb) parsed.tvdb = raw;
        }
        return parsed;
    };

    const normalizeRequestItem = (input = {}) => ({
        id: input.id || input.requestId || input.mediaRequestId || null,
        status: input.status || input.requestStatus || input.state || '',
        type: input.type || input.mediaType || '',
        requestedBy: input.requestedBy || input.requestedByUsername || input.username || input.requestedByEmail || '',
        requestedAt: input.requestedAt || input.createdAt || input.requestDate || null,
        fulfilledAt: input.fulfilledAt || input.updatedAt || null,
        imdbId: input.imdbId || null,
        tmdbId: input.tmdbId ? String(input.tmdbId) : null,
        tvdbId: input.tvdbId ? String(input.tvdbId) : null
    });

    const normalizePlexRatingKey = (input) => {
        const raw = String(input || '').trim();
        if (!raw) return '';
        const parts = raw.split('/');
        return String(parts[parts.length - 1] || '').trim();
    };

    const fetchMaintenanceWatchStats = async (config, uri) => {
        const pageSize = 5000;
        const maxHistoryItems = 250000;
        let start = 0;
        const map = new Map();

        while (start < maxHistoryItems) {
            const pageRes = await fetch(
                `${uri}/status/sessions/history/all?X-Plex-Token=${config.plexToken}&sort=viewedAt:desc&X-Plex-Container-Start=${start}&X-Plex-Container-Size=${pageSize}`,
                { headers: { Accept: 'application/json' } }
            ).then(r => r.json()).catch(() => null);

            const pageContainer = pageRes?.MediaContainer || {};
            const pageItems = Array.isArray(pageContainer.Metadata) ? pageContainer.Metadata : [];
            if (!pageItems.length) break;

            for (const item of pageItems) {
                const rawKey = item.type === 'episode'
                    ? (item.grandparentRatingKey || item.grandparentKey || item.parentRatingKey || item.parentKey || item.ratingKey)
                    : (item.ratingKey);
                const key = normalizePlexRatingKey(rawKey);
                if (!key) continue;
                const viewedAt = Number(item.viewedAt || 0);
                const existing = map.get(key) || { watchCount: 0, lastViewedAt: null };
                existing.watchCount += 1;
                if (viewedAt > Number(existing.lastViewedAt || 0)) existing.lastViewedAt = viewedAt;
                map.set(key, existing);
            }

            start += pageItems.length;
            const totalSize = Number(pageContainer.totalSize || 0);
            if ((totalSize > 0 && start >= totalSize) || pageItems.length < pageSize) break;
        }

        if (start >= maxHistoryItems) {
            log(`Maintenance watch history fetch reached cap (${maxHistoryItems}). Watch counts may be truncated.`);
        }

        return map;
    };

    const extractMaintenanceRatings = (media = {}) => {
        const ratings = {
            tmdbRating: null,
            rtCriticRating: null,
            rtAudienceRating: null,
            traktRating: null
        };
        const asNum = (v) => {
            const n = Number(v);
            return Number.isFinite(n) ? n : null;
        };

        const rawRatings = Array.isArray(media?.Rating) ? media.Rating : [];
        rawRatings.forEach((entry) => {
            const source = `${entry?.type || ''} ${entry?.image || ''} ${entry?.id || ''} ${entry?.source || ''}`.toLowerCase();
            const value = asNum(entry?.value ?? entry?.rating ?? entry?.score);
            if (value === null) return;
            if (source.includes('themoviedb') || source.includes('tmdb')) {
                ratings.tmdbRating = ratings.tmdbRating ?? value;
            } else if (source.includes('rottentomatoes') || source.includes('rotten')) {
                if (source.includes('audience')) ratings.rtAudienceRating = ratings.rtAudienceRating ?? value;
                else ratings.rtCriticRating = ratings.rtCriticRating ?? value;
            } else if (source.includes('trakt')) {
                ratings.traktRating = ratings.traktRating ?? value;
            }
        });

        if (ratings.tmdbRating === null && asNum(media?.rating) !== null) ratings.tmdbRating = asNum(media.rating);
        if (ratings.rtCriticRating === null && asNum(media?.audienceRating) !== null) ratings.rtCriticRating = asNum(media.audienceRating);
        if (ratings.rtAudienceRating === null && asNum(media?.audienceRating) !== null) ratings.rtAudienceRating = asNum(media.audienceRating);
        if (ratings.traktRating === null && asNum(media?.rating) !== null) ratings.traktRating = asNum(media.rating);

        return ratings;
    };

    const fetchPlexLibraryItemsForMaintenance = async (config, uri) => {
        const watchStats = await fetchMaintenanceWatchStats(config, uri);
        const sectionsRes = await fetch(`${uri}/library/sections?X-Plex-Token=${config.plexToken}`, { headers: { Accept: 'application/json' } })
            .then(r => r.json())
            .catch(() => null);
        const sections = sectionsRes?.MediaContainer?.Directory || [];
        const includeTypes = new Set(['movie', 'show']);
        const items = [];

        for (const section of sections) {
            if (!includeTypes.has(String(section.type || ''))) continue;
            const sectionKey = section.key;
            let start = 0;
            const pageSize = 200;
            let total = Infinity;
            while (start < total) {
                const listRes = await fetch(`${uri}/library/sections/${sectionKey}/all?X-Plex-Token=${config.plexToken}&X-Plex-Container-Start=${start}&X-Plex-Container-Size=${pageSize}`, {
                    headers: { Accept: 'application/json' }
                }).then(r => r.json()).catch(() => null);
                const container = listRes?.MediaContainer || {};
                const page = container.Metadata || [];
                total = Number(container.totalSize || page.length || 0);
                if (!Array.isArray(page) || page.length === 0) break;
                for (const media of page) {
                    const guids = media.Guid || [];
                    const ids = parsePlexGuidIds(guids);
                    const part = media?.Media?.[0]?.Part?.[0] || {};
                    const mediaInfo = media?.Media?.[0] || {};
                    const ratings = extractMaintenanceRatings(media);
                    const mediaType = media.type || section.type || 'movie';
                    const resolvedWatchCount = mediaType === 'show'
                        ? Number(media.viewedLeafCount || 0)
                        : Number(media.viewCount || 0);
                    const normalizedRatingKey = normalizePlexRatingKey(media.ratingKey);
                    const aggregatedWatch = watchStats.get(normalizedRatingKey) || null;
                    const finalWatchCount = Number(aggregatedWatch?.watchCount ?? resolvedWatchCount ?? 0);
                    const finalLastViewedAtUnix = Number(aggregatedWatch?.lastViewedAt || media.lastViewedAt || 0);
                    const item = {
                        ratingKey: String(media.ratingKey || ''),
                        title: media.title || media.grandparentTitle || media.originalTitle || 'Unknown',
                        thumb: media.thumb || media.grandparentThumb || '',
                        mediaType,
                        libraryId: String(sectionKey),
                        libraryTitle: section.title || 'Library',
                        year: media.year || null,
                        watchCount: finalWatchCount,
                        watchedEver: finalWatchCount > 0,
                        addedAt: media.addedAt ? new Date(media.addedAt * 1000).toISOString() : null,
                        lastViewedAt: finalLastViewedAtUnix ? new Date(finalLastViewedAtUnix * 1000).toISOString() : null,
                        daysSinceAdded: media.addedAt ? Math.floor((Date.now() - (media.addedAt * 1000)) / (24 * 60 * 60 * 1000)) : null,
                        daysSinceLastWatch: finalLastViewedAtUnix ? Math.floor((Date.now() - (finalLastViewedAtUnix * 1000)) / (24 * 60 * 60 * 1000)) : null,
                        durationMinutes: media.duration ? Math.round(media.duration / 60000) : null,
                        bitrateKbps: Number(mediaInfo.bitrate || 0),
                        videoResolution: String(mediaInfo.videoResolution || '').toLowerCase(),
                        videoCodec: String(mediaInfo.videoCodec || '').toLowerCase(),
                        audioCodec: String(mediaInfo.audioCodec || '').toLowerCase(),
                        sizeBytes: Number(part.size || 0),
                        sizeGB: part.size ? Math.round((Number(part.size) / (1024 * 1024 * 1024)) * 100) / 100 : 0,
                        filePath: part.file || '',
                        genres: (media.Genre || []).map(g => g.tag).filter(Boolean),
                        collections: (media.Collection || []).map(c => c.tag).filter(Boolean),
                        labels: (media.Label || []).map(l => l.tag).filter(Boolean),
                        studio: media.studio || '',
                        contentRating: media.contentRating || '',
                        tmdbRating: ratings.tmdbRating,
                        rtCriticRating: ratings.rtCriticRating,
                        rtAudienceRating: ratings.rtAudienceRating,
                        traktRating: ratings.traktRating,
                        imdbId: ids.imdb,
                        tmdbId: ids.tmdb,
                        tvdbId: ids.tvdb,
                        arrType: section.type === 'movie' ? 'radarr' : 'sonarr',
                        arrMapped: !!(ids.tmdb || ids.tvdb || ids.imdb),
                        request: null,
                        is4k: String(mediaInfo.videoResolution || '').toLowerCase().includes('4k') || String(mediaInfo.videoResolution || '').toLowerCase().includes('2160')
                    };
                    items.push(item);
                }
                start += page.length;
                if (page.length < pageSize) break;
            }
        }
        return items;
    };

    const fetchRequestIndex = async (config) => {
        const requestAppType = String(config.requestAppType || 'none').toLowerCase();
        const baseUrlRaw = config.requestAppUrl || '';
        const apiKey = config.requestAppApiKey || '';
        if (!baseUrlRaw || !apiKey || requestAppType === 'none') {
            return { generatedAt: new Date().toISOString(), type: requestAppType, items: [] };
        }
        const baseUrl = resolveIntegrationUrlForFetch(baseUrlRaw);
        const headers = { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Api-Key': apiKey };
        const items = [];

        if (requestAppType === 'seerr' || requestAppType === 'overseerr' || requestAppType === 'jellyseerr') {
            let page = 1;
            let totalPages = 1;
            while (page <= totalPages && page <= 20) {
                const take = 50;
                const skip = (page - 1) * take;
                const payload = await fetch(`${baseUrl}/api/v1/request?take=${take}&skip=${skip}`, { headers }).then(r => r.json()).catch(() => null);
                const results = payload?.results || [];
                const pageInfo = payload?.pageInfo || {};
                totalPages = Math.max(1, Math.ceil(Number(pageInfo.results || results.length || 0) / take));
                results.forEach((reqItem) => {
                    const media = reqItem?.media || {};
                    const requestedBy = reqItem?.requestedBy?.displayName || reqItem?.requestedBy?.username || reqItem?.requestedBy?.email || '';
                    items.push(normalizeRequestItem({
                        id: reqItem?.id,
                        status: reqItem?.status || '',
                        type: reqItem?.type || media?.mediaType || '',
                        requestedBy,
                        requestedAt: reqItem?.createdAt || reqItem?.createdAtUtc || null,
                        fulfilledAt: reqItem?.updatedAt || null,
                        imdbId: media?.imdbId || null,
                        tmdbId: media?.tmdbId || null,
                        tvdbId: media?.tvdbId || null
                    }));
                });
                page += 1;
                if (!results.length) break;
            }
        } else if (requestAppType === 'ombi') {
            const [movieReqs, tvReqs] = await Promise.all([
                fetch(`${baseUrl}/api/v1/Request/movie`, { headers }).then(r => r.json()).catch(() => []),
                fetch(`${baseUrl}/api/v1/Request/tv`, { headers }).then(r => r.json()).catch(() => [])
            ]);
            for (const reqItem of [...(Array.isArray(movieReqs) ? movieReqs : []), ...(Array.isArray(tvReqs) ? tvReqs : [])]) {
                const requester = reqItem?.requestedUserName || reqItem?.requestedByAlias || reqItem?.requestedBy || '';
                items.push(normalizeRequestItem({
                    id: reqItem?.id || reqItem?.requestId,
                    status: reqItem?.status || reqItem?.requestStatus || '',
                    type: reqItem?.requestType || (reqItem?.theMovieDbId ? 'movie' : 'tv'),
                    requestedBy: requester,
                    requestedAt: reqItem?.requestedDate || reqItem?.createdAt || null,
                    fulfilledAt: reqItem?.availableDate || null,
                    imdbId: reqItem?.imdbId || null,
                    tmdbId: reqItem?.theMovieDbId || null,
                    tvdbId: reqItem?.tvDbId || null
                }));
            }
        }
        return { generatedAt: new Date().toISOString(), type: requestAppType, items };
    };

    const attachRequestsToMediaIndex = (mediaItems, requestIndex) => {
        const map = new Map();
        for (const reqItem of requestIndex.items || []) {
            const keys = [reqItem.tmdbId ? `tmdb:${reqItem.tmdbId}` : null, reqItem.tvdbId ? `tvdb:${reqItem.tvdbId}` : null, reqItem.imdbId ? `imdb:${reqItem.imdbId}` : null].filter(Boolean);
            keys.forEach((key) => map.set(key, reqItem));
        }
        return mediaItems.map((item) => {
            const req =
                (item.tmdbId && map.get(`tmdb:${item.tmdbId}`)) ||
                (item.tvdbId && map.get(`tvdb:${item.tvdbId}`)) ||
                (item.imdbId && map.get(`imdb:${item.imdbId}`)) ||
                null;
            return {
                ...item,
                request: req ? {
                    ...req,
                    daysSinceRequested: daysSince(req.requestedAt),
                    daysSinceFulfilled: daysSince(req.fulfilledAt)
                } : null
            };
        });
    };

    const buildMaintenanceMediaIndexNow = async ({ actor = null, force = false } = {}) => {
        markTaskStart(systemJobs.maintenanceIndex);
        try {
            const config = await loadFile(configPath, {});
            if (!isMaintenanceExperimentalEnabled(config)) {
                const payload = {
                    generatedAt: null,
                    itemCount: 0,
                    requestItemCount: 0,
                    force: !!force,
                    items: []
                };
                markTaskEnd(systemJobs.maintenanceIndex, null);
                return payload;
            }
            if (!config?.plexToken || !config?.serverIdentifier) {
                throw new Error('Plex integration is not configured.');
            }
            const uri = await getPlexConnectionUri(config);
            if (!uri) throw new Error('Unable to resolve Plex server URI.');
            const rawMedia = await fetchPlexLibraryItemsForMaintenance(config, uri);
            const requestIndex = await fetchRequestIndex(config);
            const merged = attachRequestsToMediaIndex(rawMedia, requestIndex);
            const payload = {
                generatedAt: new Date().toISOString(),
                itemCount: merged.length,
                requestItemCount: (requestIndex.items || []).length,
                force: !!force,
                items: merged
            };
            await saveFile(maintenanceMediaIndexPath, payload);
            await saveFile(maintenanceRequestIndexPath, requestIndex);
            markTaskEnd(systemJobs.maintenanceIndex, null);
            await appendAuditLog('maintenance_index_rebuilt', actor, null, { itemCount: merged.length, requestItemCount: requestIndex.items?.length || 0 });
            return payload;
        } catch (error) {
            markTaskEnd(systemJobs.maintenanceIndex, error);
            throw error;
        }
    };

    const buildMaintenanceMediaIndex = async (options = {}) => {
        if (maintenanceIndexBuildPromise) {
            log('[MaintenanceIndex] Build already queued or in progress, reusing it.');
            return maintenanceIndexBuildPromise;
        }
        maintenanceIndexBuildPromise = runHeavyJob('maintenanceIndex', () => buildMaintenanceMediaIndexNow(options))
            .finally(() => { maintenanceIndexBuildPromise = null; });
        return maintenanceIndexBuildPromise;
    };

    return { buildMaintenanceMediaIndex };
};
