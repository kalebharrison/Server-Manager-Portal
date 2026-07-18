import { getReadyArrInstances } from './arr-instances.js';
import { scopedCacheKey } from '../cache/cache-key.js';
import { cacheRefreshMs, startAdaptiveCacheWarmer } from '../cache/cache-refresh.js';
import {
    annotate,
    createFetchArr,
    hydrateQueue,
    instanceIdentity,
    mergePayloads,
    normalizedTitleKey,
    recordsOf,
    toLocalYmd,
} from './media-stack-arr-helpers.js';
import { loadInstanceSummary } from './media-stack-instance-summary.js';
import { sanitizeCalendarForMembers, sanitizeQueueForMembers } from './media-stack-member-sanitize.js';

export const registerMediaStackRoutes = ({
    app,
    requireAuth,
    requireMember,
    configPath,
    loadFile,
    withCache,
    fetch,
    normalizeExternalBaseUrl,
}) => {
    const fetchArr = createFetchArr({ fetch, normalizeExternalBaseUrl });

    const loadWeekCalendar = async (weekOffset = 0, horizon = 'week') => {
        const safeOffset = Math.max(-4, Math.min(Number(weekOffset) || 0, 12));
        const config = await loadFile(configPath, {});
        const startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        startDate.setDate(startDate.getDate() + (safeOffset * 7));
        if (horizon === 'quarter') startDate.setDate(startDate.getDate() - startDate.getDay());
        const endDate = new Date(startDate);
        if (horizon === 'quarter') endDate.setMonth(endDate.getMonth() + 3);
        else endDate.setDate(endDate.getDate() + 7);
        const start = toLocalYmd(startDate);
        const end = toLocalYmd(endDate);
        const cacheKey = scopedCacheKey('media-stack-week-calendar', [...instanceIdentity(config, ['sonarr', 'radarr']), start, end]);
        return withCache(cacheKey, cacheRefreshMs(config), async () => {
            const sonarrInstances = getReadyArrInstances(config, 'sonarr');
            const radarrInstances = getReadyArrInstances(config, 'radarr');
            const [sonarr, radarr] = await Promise.all([
                Promise.all(sonarrInstances.map(async (instance) => annotate(recordsOf(await fetchArr(instance, `/api/v3/calendar?start=${start}&end=${end}&includeSeries=true&includeEpisode=true&unmonitored=true`)), instance))),
                Promise.all(radarrInstances.map(async (instance) => annotate(recordsOf(await fetchArr(instance, `/api/v3/calendar?start=${start}&end=${end}&unmonitored=true`)), instance))),
            ]);
            return {
                start,
                end,
                sonarr: { configured: sonarrInstances.length > 0, calendar: sonarr.flat() },
                radarr: { configured: radarrInstances.length > 0, calendar: radarr.flat() },
            };
        });
    };

    app.get('/api/media-stack/calendar', requireAuth, requireMember, async (req, res) => {
        try {
            res.json(await loadWeekCalendar(req.query.weekOffset, req.query.horizon === 'quarter' ? 'quarter' : 'week'));
        } catch {
            res.status(500).json({ error: 'Failed to fetch release calendar' });
        }
    });

    app.get('/api/media-stack/queue', requireAuth, requireMember, async (req, res) => {
        try {
            const isAdmin = req.user?.isAdmin === true;
            const config = await loadFile(configPath, {});
            const cacheKey = scopedCacheKey(
                isAdmin ? 'media-stack-queue-admin' : 'media-stack-queue-member',
                instanceIdentity(config, ['sonarr', 'radarr', 'lidarr']),
            );
            const data = await withCache(cacheKey, Math.min(cacheRefreshMs(config), 30_000), async () => {
                const summarizeQueue = async (type) => {
                    const instances = getReadyArrInstances(config, type);
                    if (!instances.length) return { configured: false, queue: { records: [] } };
                    const bundles = await Promise.all(instances.map(async (instance) => {
                        const version = type === 'lidarr' ? 'v1' : 'v3';
                        const query = type === 'sonarr'
                            ? 'includeSeries=true&includeEpisode=true'
                            : type === 'radarr'
                                ? 'includeMovie=true'
                                : 'includeArtist=true&includeAlbum=true';
                        const raw = await fetchArr(instance, `/api/${version}/queue?page=1&pageSize=100&${query}`);
                        return hydrateQueue(raw, type, instance, fetchArr);
                    }));
                    const merged = mergePayloads(bundles.map((queue, index) => ({
                        instance: instances[index],
                        queue,
                    })), 'queue');
                    return {
                        configured: true,
                        queue: isAdmin ? merged : sanitizeQueueForMembers(merged),
                    };
                };
                return {
                    sonarr: await summarizeQueue('sonarr'),
                    radarr: await summarizeQueue('radarr'),
                    lidarr: await summarizeQueue('lidarr'),
                };
            });
            res.json(data);
        } catch {
            res.status(500).json({ error: 'Failed to fetch download queue' });
        }
    });

    app.get('/api/media-stack/summary', requireAuth, requireMember, async (req, res) => {
        try {
            const isAdmin = req.user?.isAdmin === true;
            const monthOffset = Math.max(-24, Math.min(parseInt(req.query.monthOffset, 10) || 0, 24));
            const config = await loadFile(configPath, {});
            const cacheKey = scopedCacheKey(
                isAdmin ? 'media-stack-summary-admin' : 'media-stack-summary-member',
                [...instanceIdentity(config, ['sonarr', 'radarr', 'lidarr']), monthOffset],
            );
            const data = await withCache(cacheKey, cacheRefreshMs(config), async () => {
                const targetDate = new Date();
                targetDate.setMonth(targetDate.getMonth() + monthOffset);
                const firstDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
                const lastDay = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0);
                const start = toLocalYmd(firstDay);
                const end = toLocalYmd(lastDay);
                const inRange = (value) => {
                    const date = value ? new Date(value) : null;
                    return !!date && !Number.isNaN(date.getTime()) && date >= firstDay && date <= new Date(lastDay.getFullYear(), lastDay.getMonth(), lastDay.getDate(), 23, 59, 59, 999);
                };
                const instances = ['sonarr', 'radarr', 'lidarr'].flatMap((type) => getReadyArrInstances(config, type));
                const bundles = await Promise.all(instances.map((instance) => loadInstanceSummary(instance, start, end, inRange, fetchArr, { includeOps: isAdmin })));
                const summarize = (type) => {
                    const typed = bundles.filter((bundle) => bundle.instance.type === type);
                    const calendar = typed.flatMap((bundle) => annotate(recordsOf(bundle.calendar), bundle.instance));
                    if (!isAdmin) {
                        return {
                            configured: typed.length > 0,
                            queue: sanitizeQueueForMembers(mergePayloads(typed, 'queue')),
                            calendar: sanitizeCalendarForMembers(calendar),
                        };
                    }
                    return {
                        configured: typed.length > 0,
                        instances: typed.map((bundle) => ({ id: bundle.instance.id, name: bundle.instance.name, status: bundle.status })),
                        status: typed[0]?.status || null,
                        queue: mergePayloads(typed, 'queue'),
                        history: mergePayloads(typed, 'history'),
                        disk: typed.flatMap((bundle) => annotate(recordsOf(bundle.disk), bundle.instance)),
                        calendar,
                    };
                };
                return { sonarr: summarize('sonarr'), radarr: summarize('radarr'), lidarr: summarize('lidarr') };
            });
            res.json(data);
        } catch {
            res.status(500).json({ error: 'Failed to fetch media stack summary' });
        }
    });

    const getActiveAcquisitionKeys = async (providedConfig = null) => {
        const config = providedConfig || await loadFile(configPath, {});
        const instances = ['sonarr', 'radarr'].flatMap((type) => getReadyArrInstances(config, type));
        const cacheKey = scopedCacheKey('media-stack-active-acquisitions', instanceIdentity(config, ['sonarr', 'radarr']));
        const keys = await withCache(cacheKey, Math.min(cacheRefreshMs(config), 60_000), async () => {
            const bundles = await Promise.all(instances.map(async (instance) => {
                const type = instance.type;
                const query = type === 'sonarr' ? 'includeSeries=true&includeEpisode=true' : 'includeMovie=true';
                const raw = await fetchArr(instance, `/api/v3/queue?page=1&pageSize=100&${query}`);
                // Prefer embedded includes; skip expensive hasFile hydration for acquisition keys.
                const records = recordsOf(raw).filter((record) => String(record?.status || '').toLowerCase() === 'downloading');
                return records.map((record) => {
                    const media = type === 'sonarr' ? record.series : record.movie;
                    return {
                        tmdbId: Number(media?.tmdbId) || null,
                        tvdbId: Number(media?.tvdbId) || null,
                        title: normalizedTitleKey(media?.title || record?.title),
                    };
                });
            }));
            return bundles.flat().flatMap((item) => [
                item.tmdbId ? `tmdb:${item.tmdbId}` : null,
                item.tvdbId ? `tvdb:${item.tvdbId}` : null,
                item.title ? `title:${item.title}` : null,
            ]).filter(Boolean);
        });
        return new Set(keys);
    };

    const startCacheWarmer = () => {
        const loadConfig = () => loadFile(configPath, {});
        const warm = (config) => Promise.all([
            ...[0, 1].map((offset) => loadWeekCalendar(offset)),
            getActiveAcquisitionKeys(config),
        ]);
        return startAdaptiveCacheWarmer({ loadConfig, warm });
    };

    return { startCacheWarmer, getActiveAcquisitionKeys };
};
