import fs from 'fs/promises';

import { crawlPlexLibraryStats } from './plex-stats-build.js';
import { matchesPlexStatsCacheIdentity, PLEX_STATS_CACHE_VERSION } from './plex-stats-cache.js';

export { PLEX_STATS_CACHE_VERSION } from './plex-stats-cache.js';

export const createPlexStatsService = ({
    configPath,
    plexStatsCachePath,
    loadFile,
    getPlexConnectionUri,
    markTaskStart,
    markTaskEnd,
    systemJobs,
    runHeavyJob = (_name, task) => task(),
    log,
}) => {
    // ─── Plex Library Size Background Task ───────────────────────────────────────
    // The library sizes are computed once every 24 hours in the background.
    // The /api/plex/stats endpoint ONLY reads from the cache file — it never
    // triggers a Plex fetch itself.

    let cachedPlexStats = null;          // in-memory mirror of the cache file
    let isBuildingPlexStats = false;
    let plexStatsBuildPromise = null;
    let plexStatsRebuildTimer = null;

    /**
     * Reads the cached stats from disk into memory.
     * Returns the stats object, or null if no valid cache exists yet.
     */
    const loadPlexStatsFromDisk = async () => {
        try {
            const config = await loadFile(configPath, null);
            if (!config?.serverIdentifier) {
                cachedPlexStats = null;
                return null;
            }
            const raw = await fs.readFile(plexStatsCachePath, 'utf8');
            const parsed = JSON.parse(raw);
            if (parsed && parsed.moviesBytes !== undefined && matchesPlexStatsCacheIdentity(parsed, config)) {
                cachedPlexStats = parsed;
                return parsed;
            }
        } catch (e) {
            // file doesn't exist yet — fine
        }
        cachedPlexStats = null;
        return null;
    };

    /**
     * Crawls Plex for library sizes (paginated, 1 000 items per request).
     * Writes results to plex-stats.json and updates the in-memory cache.
     * Never throws — errors are logged and the function returns null.
     */
    const buildPlexStatsCacheNow = async () => {
        if (isBuildingPlexStats) {
            log('[PlexStats] Build already in progress, skipping.');
            return;
        }
        const config = await loadFile(configPath, null);
        if (!config || !config.plexToken || !config.serverIdentifier) {
            log('[PlexStats] Not configured yet — skipping build.');
            return;
        }
        isBuildingPlexStats = true;
        markTaskStart(systemJobs.plexStats);
        log('[PlexStats] Starting background library size build...');
        try {
            const uri = await getPlexConnectionUri(config);
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 600000); // 10 min hard cap

            const crawled = await crawlPlexLibraryStats({
                uri,
                config,
                signal: controller.signal,
                log,
            });
            clearTimeout(timer);

            const storedStats = await loadFile(plexStatsCachePath, {});
            const existingStats = matchesPlexStatsCacheIdentity(storedStats, config) ? storedStats : {};

            const deltas = existingStats.deltas || {};
            if (existingStats.movies !== undefined) {
                deltas.movies = crawled.movies - (existingStats.movies || 0);
                deltas.shows = crawled.shows - (existingStats.shows || 0);
                deltas.episodes = crawled.episodes - (existingStats.episodes || 0);
                deltas.artists = crawled.artists - (existingStats.artists || 0);
                deltas.albums = crawled.albums - (existingStats.albums || 0);
                deltas.tracks = crawled.tracks - (existingStats.tracks || 0);
            }

            const stats = {
                version: PLEX_STATS_CACHE_VERSION,
                serverIdentifier: config.serverIdentifier,
                ...crawled,
                maxConcurrentStreams: existingStats.maxConcurrentStreams || 0,
                maxDirectPlays: existingStats.maxDirectPlays || 0,
                maxTranscodes: existingStats.maxTranscodes || 0,
                deltas,
                generatedAt: Date.now(),
            };
            cachedPlexStats = stats;
            await fs.writeFile(plexStatsCachePath, JSON.stringify(stats, null, 2));
            log(`[PlexStats] Cache built and saved — movies: ${crawled.movies}, shows: ${crawled.shows}, music: ${crawled.music}, episodes: ${crawled.episodes}, artists: ${crawled.artists}, albums: ${crawled.albums}, tracks: ${crawled.tracks}`);
            markTaskEnd(systemJobs.plexStats, null);
        } catch (e) {
            log(`[PlexStats] Build failed: ${e.message}`);
            markTaskEnd(systemJobs.plexStats, e);
        } finally {
            isBuildingPlexStats = false;
        }
    };

    const buildPlexStatsCache = async () => {
        if (plexStatsBuildPromise) {
            log('[PlexStats] Build already queued or in progress, reusing it.');
            return plexStatsBuildPromise;
        }
        plexStatsBuildPromise = runHeavyJob('plexStats', buildPlexStatsCacheNow)
            .finally(() => { plexStatsBuildPromise = null; });
        return plexStatsBuildPromise;
    };

    /**
     * Called once at startup.
     * 1. Loads existing cache from disk immediately (so the API responds instantly).
     * 2. If cache is older than 24 h (or missing), kicks off a fresh build.
     * 3. Schedules a rebuild every 24 hours.
     */
    const startPlexStatsBackgroundTask = async () => {
        const INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

        const scheduleRebuild = (delayMs) => {
            if (plexStatsRebuildTimer) clearTimeout(plexStatsRebuildTimer);
            const safeDelay = Math.max(0, delayMs);
            systemJobs.plexStats.nextRun = new Date(Date.now() + safeDelay).toISOString();
            plexStatsRebuildTimer = setTimeout(async () => {
                log('[PlexStats] Scheduled 24-hour rebuild starting...');
                try {
                    await buildPlexStatsCache();
                } catch (e) {
                    log(`[PlexStats] Scheduled rebuild failed: ${e.message}`);
                } finally {
                    scheduleRebuild(INTERVAL_MS);
                }
            }, safeDelay);
        };

        const existing = await loadPlexStatsFromDisk();
        if (existing) {
            const ageMs = Date.now() - (existing.generatedAt || 0);
            const remainingMs = Math.max(0, INTERVAL_MS - ageMs);
            log(`[PlexStats] Loaded existing cache (age: ${Math.round(ageMs / 60000)} min).`);
            if (ageMs >= INTERVAL_MS) {
                log('[PlexStats] Cache is stale — triggering immediate rebuild.');
                scheduleRebuild(0);
            } else {
                scheduleRebuild(remainingMs);
            }
        } else {
            log('[PlexStats] No cache found — triggering initial build.');
            scheduleRebuild(0);
        }
    };

    // Serving goes through loadPlexStatsFromDisk so the current config identity is checked.
    const getCachedPlexStats = () => null;
    const isPlexStatsBuilding = () => isBuildingPlexStats;

    return {
        loadPlexStatsFromDisk,
        buildPlexStatsCache,
        startPlexStatsBackgroundTask,
        getCachedPlexStats,
        isPlexStatsBuilding,
    };
};
