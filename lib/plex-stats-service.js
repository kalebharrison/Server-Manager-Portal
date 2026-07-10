import fs from 'fs/promises';
import fetch from 'node-fetch';

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

    /**
     * Reads the cached stats from disk into memory.
     * Returns the stats object, or null if no valid cache exists yet.
     */
    const loadPlexStatsFromDisk = async () => {
        try {
            const raw = await fs.readFile(plexStatsCachePath, 'utf8');
            const parsed = JSON.parse(raw);
            if (parsed && parsed.moviesBytes !== undefined) {
                cachedPlexStats = parsed;
                return parsed;
            }
        } catch (e) {
            // file doesn't exist yet — fine
        }
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

            const sectionsRes = await fetch(`${uri}/library/sections`, {
                headers: { 'X-Plex-Token': config.plexToken, 'Accept': 'application/json' },
                signal: controller.signal
            });
            if (!sectionsRes.ok) throw new Error(`Sections request failed: ${sectionsRes.status}`);
            const { MediaContainer: { Directory: directories = [] } } = await sectionsRes.json();

            let totalMoviesCount = 0, totalShowsCount = 0, totalMusicCount = 0;
            let totalEpisodesCount = 0, totalArtistsCount = 0, totalAlbumsCount = 0, totalTracksCount = 0;
            let totalMoviesBytes = 0, totalShowsBytes = 0, totalMusicBytes = 0;
            let total4kMovies = 0;
            const fourKShows = new Set();

            const resolutions = { '4K': 0, '1080p': 0, '720p': 0, 'SD': 0, 'Other': 0 };
            const codecs = { 'H.265 / HEVC': 0, 'H.264 / AVC': 0, 'AV1': 0, 'Other': 0 };
            const fileSizes = {
                '0 - 500 MB': { movies: 0, shows: 0 },
                '500 MB - 1.5 GB': { movies: 0, shows: 0 },
                '1.5 GB - 5 GB': { movies: 0, shows: 0 },
                '5 GB - 10 GB': { movies: 0, shows: 0 },
                '10 GB+': { movies: 0, shows: 0 }
            };

            for (const dir of directories) {
                try {
                    // ── Item count (single zero-size request) ──
                    const countRes = await fetch(
                        `${uri}/library/sections/${dir.key}/all?X-Plex-Container-Start=0&X-Plex-Container-Size=0`,
                        { headers: { 'X-Plex-Token': config.plexToken, 'Accept': 'application/json' }, signal: controller.signal }
                    );
                    if (countRes.ok) {
                        const { MediaContainer: mc } = await countRes.json();
                        const count = mc.totalSize || mc.size || 0;
                        if (dir.type === 'movie') {
                            totalMoviesCount += count;
                        } else if (dir.type === 'show') {
                            totalShowsCount += count;
                        } else if (dir.type === 'artist') {
                            totalMusicCount += count;
                            totalArtistsCount += count;
                            // Also fetch album count (type 9)
                            const albCountRes = await fetch(
                                `${uri}/library/sections/${dir.key}/all?type=9&X-Plex-Container-Start=0&X-Plex-Container-Size=1`,
                                { headers: { 'X-Plex-Token': config.plexToken, 'Accept': 'application/json' }, signal: controller.signal }
                            );
                            if (albCountRes.ok) {
                                const { MediaContainer: albMc } = await albCountRes.json();
                                totalAlbumsCount += albMc.totalSize || albMc.size || 0;
                            }
                        }
                    }

                    // ── Bytes (paginated) ──
                    const typeParam = dir.type === 'movie' ? '?type=1' : dir.type === 'show' ? '?type=4' : dir.type === 'artist' ? '?type=10' : '';
                    if (!typeParam) continue;

                    let start = 0, bytes = 0;
                    const PAGE = 1000;
                    while (true) {
                        const pageRes = await fetch(
                            `${uri}/library/sections/${dir.key}/all${typeParam}&X-Plex-Container-Start=${start}&X-Plex-Container-Size=${PAGE}`,
                            { headers: { 'X-Plex-Token': config.plexToken, 'Accept': 'application/json' }, signal: controller.signal }
                        );
                        if (!pageRes.ok) break;
                        const { MediaContainer: { Metadata: items = [] } } = await pageRes.json();
                        if (items.length === 0) break;
                        
                        if (dir.type === 'show') totalEpisodesCount += items.length;
                        else if (dir.type === 'artist') totalTracksCount += items.length;

                        for (const item of items) {
                            let is4k = false;
                            for (const media of item.Media || []) {
                                if (media.videoResolution === '4k') is4k = true;

                                if (dir.type === 'movie' || dir.type === 'show') {
                                    const res = String(media.videoResolution || '').toLowerCase();
                                    if (res === '4k' || res === '2160') resolutions['4K']++;
                                    else if (res === '1080') resolutions['1080p']++;
                                    else if (res === '720') resolutions['720p']++;
                                    else if (res === '576' || res === '480' || res === 'sd') resolutions['SD']++;
                                    else resolutions['Other']++;

                                    const codec = String(media.videoCodec || '').toLowerCase();
                                    if (codec === 'hevc' || codec === 'h265') codecs['H.265 / HEVC']++;
                                    else if (codec === 'h264' || codec === 'avc') codecs['H.264 / AVC']++;
                                    else if (codec === 'av1') codecs['AV1']++;
                                    else codecs['Other']++;
                                }

                                for (const part of media.Part || []) {
                                    if (part.size) {
                                        const partSize = parseInt(part.size);
                                        bytes += partSize;

                                        if (dir.type === 'movie') {
                                            const sizeMB = partSize / (1024 * 1024);
                                            if (sizeMB < 500) fileSizes['0 - 500 MB'].movies++;
                                            else if (sizeMB < 1500) fileSizes['500 MB - 1.5 GB'].movies++;
                                            else if (sizeMB < 5000) fileSizes['1.5 GB - 5 GB'].movies++;
                                            else if (sizeMB < 10000) fileSizes['5 GB - 10 GB'].movies++;
                                            else fileSizes['10 GB+'].movies++;
                                        } else if (dir.type === 'show') {
                                            const sizeMB = partSize / (1024 * 1024);
                                            if (sizeMB < 500) fileSizes['0 - 500 MB'].shows++;
                                            else if (sizeMB < 1500) fileSizes['500 MB - 1.5 GB'].shows++;
                                            else if (sizeMB < 5000) fileSizes['1.5 GB - 5 GB'].shows++;
                                            else if (sizeMB < 10000) fileSizes['5 GB - 10 GB'].shows++;
                                            else fileSizes['10 GB+'].shows++;
                                        }
                                    }
                                }
                            }
                            if (is4k) {
                                if (dir.type === 'movie') total4kMovies++;
                                else if (dir.type === 'show') fourKShows.add(item.grandparentRatingKey || item.parentRatingKey || item.title);
                            }
                        }
                        start += PAGE;
                    }
                    if (dir.type === 'movie') totalMoviesBytes += bytes;
                    else if (dir.type === 'show') totalShowsBytes += bytes;
                    else if (dir.type === 'artist') totalMusicBytes += bytes;
                } catch (e) {
                    log(`[PlexStats] Failed to fetch section "${dir.title}": ${e.message}`);
                }
            }
            clearTimeout(timer);

            const totalVideoTitles = totalMoviesCount + totalShowsCount;
            const total4kTitles = total4kMovies + fourKShows.size;
            const existingStats = await loadFile(plexStatsCachePath, {});

            const deltas = existingStats.deltas || {};
            if (existingStats.movies !== undefined) {
                deltas.movies = totalMoviesCount - (existingStats.movies || 0);
                deltas.shows = totalShowsCount - (existingStats.shows || 0);
                deltas.episodes = totalEpisodesCount - (existingStats.episodes || 0);
                deltas.artists = totalArtistsCount - (existingStats.artists || 0);
                deltas.albums = totalAlbumsCount - (existingStats.albums || 0);
                deltas.tracks = totalTracksCount - (existingStats.tracks || 0);
            }

            const stats = {
                movies: totalMoviesCount, shows: totalShowsCount, music: totalMusicCount,
                episodes: totalEpisodesCount, artists: totalArtistsCount, albums: totalAlbumsCount, tracks: totalTracksCount,
                moviesBytes: totalMoviesBytes, showsBytes: totalShowsBytes, musicBytes: totalMusicBytes,
                fourKPercent: totalVideoTitles > 0 ? Math.round((total4kTitles / totalVideoTitles) * 100) : 0,
                maxConcurrentStreams: existingStats.maxConcurrentStreams || 0,
                maxDirectPlays: existingStats.maxDirectPlays || 0,
                maxTranscodes: existingStats.maxTranscodes || 0,
                deltas,
                resolutions,
                codecs,
                fileSizes,
                generatedAt: Date.now()
            };
            cachedPlexStats = stats;
            await fs.writeFile(plexStatsCachePath, JSON.stringify(stats, null, 2));
            log(`[PlexStats] Cache built and saved — movies: ${totalMoviesCount}, shows: ${totalShowsCount}, music: ${totalMusicCount}, episodes: ${totalEpisodesCount}, artists: ${totalArtistsCount}, albums: ${totalAlbumsCount}, tracks: ${totalTracksCount}`);
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

        const existing = await loadPlexStatsFromDisk();
        if (existing) {
            const ageMs = Date.now() - (existing.generatedAt || 0);
            const remainingMs = Math.max(0, INTERVAL_MS - ageMs);
            systemJobs.plexStats.nextRun = new Date(Date.now() + (ageMs >= INTERVAL_MS ? 0 : remainingMs)).toISOString();
            log(`[PlexStats] Loaded existing cache (age: ${Math.round(ageMs / 60000)} min).`);
            if (ageMs >= INTERVAL_MS) {
                log('[PlexStats] Cache is stale — triggering immediate rebuild.');
                buildPlexStatsCache(); // async, don't await
            }
        } else {
            systemJobs.plexStats.nextRun = new Date(Date.now() + INTERVAL_MS).toISOString();
            log('[PlexStats] No cache found — triggering initial build.');
            buildPlexStatsCache(); // async, don't await
        }

        // Schedule recurring rebuild every 24 hours
        setInterval(() => {
            log('[PlexStats] Scheduled 24-hour rebuild starting...');
            systemJobs.plexStats.nextRun = new Date(Date.now() + INTERVAL_MS).toISOString();
            buildPlexStatsCache();
        }, INTERVAL_MS);
    };

    const getCachedPlexStats = () => cachedPlexStats;
    const isPlexStatsBuilding = () => isBuildingPlexStats;

    return {
        loadPlexStatsFromDisk,
        buildPlexStatsCache,
        startPlexStatsBackgroundTask,
        getCachedPlexStats,
        isPlexStatsBuilding,
    };
};
