import { getReadyArrInstances } from '../media-stack/arr-instances.js';
import { buildLidarrIndexItem, buildRadarrIndexItem, buildSonarrIndexItem } from './upgrader-index-builder.js';
import { createUpgraderHunt } from './upgrader-hunt.js';
import { createQcDownloadHealth } from './qc-download-health.js';
import { createQcIntegrity } from './qc-integrity.js';

const normalizeUrl = (url) => String(url || '').replace(/\/+$/, '');

export const createUpgraderService = ({
    indexPath,
    prefsPath,
    auditPath,
    integrityCachePath = null,
    loadFile,
    saveFile,
    fetchWithTimeout = fetch,
    resolveIntegrationUrlForFetch = async (url) => url,
    log = console.log,
    discordNotifier = null,
}) => {
    let running = false;
    let indexTimer = null;
    let huntTimer = null;

    const request = async (instance, path, options = {}) => {
        // Resolve base URL only — normalizeExternalBaseUrl strips query strings.
        const base = String(await resolveIntegrationUrlForFetch(normalizeUrl(instance.url)) || '').replace(/\/+$/, '');
        const suffix = path.startsWith('/') ? path : `/${path}`;
        const url = `${base}${suffix}`;
        const headers = { 'X-Api-Key': instance.apiKey, Accept: 'application/json', ...(options.headers || {}) };
        let body = options.body;
        if (body && typeof body === 'object' && !(body instanceof Buffer)) {
            headers['Content-Type'] = headers['Content-Type'] || 'application/json';
            body = JSON.stringify(body);
        }
        const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 30000;
        const { timeoutMs: _ignored, ...fetchOptions } = options;
        const response = await fetchWithTimeout(url, { ...fetchOptions, headers, body }, timeoutMs);
        if (!response.ok) {
            const detail = await response.text().catch(() => '');
            throw new Error(`${instance.name || instance.type} returned ${response.status}${detail ? `: ${detail.slice(0, 180)}` : ''}`);
        }
        if (response.status === 204) return null;
        return response.json().catch(() => null);
    };

    const mapPool = async (items, concurrency, worker) => {
        const results = new Array(items.length);
        let next = 0;
        const runners = Array.from({ length: Math.max(1, concurrency) }, async () => {
            while (next < items.length) {
                const index = next;
                next += 1;
                results[index] = await worker(items[index], index);
            }
        });
        await Promise.all(runners);
        return results;
    };

    const loadIndex = () => loadFile(indexPath, { generatedAt: null, itemCount: 0, items: [] });
    const loadPrefs = () => loadFile(prefsPath, {
        excludedRatingKeys: [],
        excludedTitles: [],
        excludedLibraries: [],
        snoozed: {},
        huntCooldowns: {},
        huntLibraryCursor: 0,
        downloadSnoozed: {},
        researchCooldowns: {},
        condemned: {},
        qcMetrics: { wastedBytes: 0, killsByReason: {} },
    });
    const savePrefs = (prefs) => saveFile(prefsPath, prefs);
    const loadAudit = () => loadFile(auditPath, { entries: [] });
    const appendAudit = async (entry) => {
        const audit = await loadAudit();
        audit.entries = [{ at: new Date().toISOString(), id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ...entry }, ...(audit.entries || [])].slice(0, 1000);
        await saveFile(auditPath, audit);
        return audit.entries[0];
    };

    const buildIndex = async (config, { actor = null } = {}) => {
        if (running) return null;
        running = true;
        try {
            const instances = getReadyArrInstances(config).filter((instance) => ['sonarr', 'radarr', 'lidarr'].includes(instance.type));
            const items = [];
            for (const instance of instances) {
                const profilePath = instance.type === 'lidarr' ? '/api/v1/qualityprofile' : '/api/v3/qualityprofile';
                const profilesResponse = await request(instance, profilePath).catch((error) => {
                    log(`[upgrader] qualityprofile failed (${instance.name || instance.type}): ${error.message}`);
                    return [];
                });
                const profileById = new Map(
                    (Array.isArray(profilesResponse) ? profilesResponse : []).map((profile) => [Number(profile.id), profile]),
                );

                if (instance.type === 'lidarr') {
                    const albumResponse = await request(instance, '/api/v1/album').catch((error) => {
                        log(`[upgrader] lidarr album list failed (${instance.name}): ${error.message}`);
                        return [];
                    });
                    const albums = Array.isArray(albumResponse) ? albumResponse : [];
                    const withFiles = albums.filter((album) => album?.anyReleaseHasFile || Number(album?.statistics?.trackFileCount || 0) > 0);
                    await mapPool(withFiles, 6, async (record) => {
                        const albumId = Number(record.id);
                        let trackFile = null;
                        try {
                            const files = await request(
                                instance,
                                `/api/v1/trackfile?albumId=${encodeURIComponent(albumId)}`,
                                { timeoutMs: 45000 },
                            );
                            const list = Array.isArray(files) ? files : [];
                            trackFile = list.reduce((best, file) => {
                                if (!best) return file;
                                return Number(file.customFormatScore || 0) >= Number(best.customFormatScore || 0) ? file : best;
                            }, null);
                        } catch (error) {
                            log(`[upgrader] lidarr trackfile failed (${instance.name} album ${albumId}): ${error.message}`);
                        }
                        const profile = profileById.get(Number(record.qualityProfileId)) || null;
                        items.push(buildLidarrIndexItem(instance, record, trackFile, profile));
                    });
                    log(`[upgrader] ${instance.name}: ${withFiles.length}/${albums.length} albums with files`);
                    continue;
                }

                if (instance.type === 'radarr') {
                    const movieResponse = await request(instance, '/api/v3/movie');
                    const records = Array.isArray(movieResponse) ? movieResponse : [];
                    // /movie leaves customFormatScore at 0 — pull /moviefile and/or score via profile.
                    const movieFileIds = records
                        .map((record) => Number(record?.movieFile?.id || record?.movieFileId))
                        .filter(Boolean);
                    const fileByMovieId = new Map();
                    const batchSize = 50;
                    for (let i = 0; i < movieFileIds.length; i += batchSize) {
                        const batch = movieFileIds.slice(i, i + batchSize);
                        const qs = batch.map((id) => `movieFileIds=${encodeURIComponent(id)}`).join('&');
                        try {
                            const files = await request(instance, `/api/v3/moviefile?${qs}`);
                            for (const file of (Array.isArray(files) ? files : [])) {
                                const movieId = Number(file?.movieId);
                                if (!movieId) continue;
                                const existing = fileByMovieId.get(movieId);
                                if (!existing || Number(file.customFormatScore || 0) >= Number(existing.customFormatScore || 0)) {
                                    fileByMovieId.set(movieId, file);
                                }
                            }
                        } catch (error) {
                            log(`[upgrader] moviefile batch failed (${instance.name}): ${error.message}`);
                        }
                    }
                    log(`[upgrader] ${instance.name}: ${fileByMovieId.size}/${movieFileIds.length} movie files scored via API`);
                    for (const record of records) {
                        const profile = profileById.get(Number(record.qualityProfileId)) || null;
                        items.push(buildRadarrIndexItem(
                            instance,
                            record,
                            fileByMovieId.get(Number(record.id)) || null,
                            profile,
                        ));
                    }
                    continue;
                }
                const seriesList = await request(instance, '/api/v3/series');
                const seriesRecords = Array.isArray(seriesList) ? seriesList : [];
                // Sonarr requires seriesId on /episodefile (bare GET is 400). Fetch per series with concurrency.
                const filesBySeriesId = new Map();
                const episodesBySeriesId = new Map();
                let episodeFileFetches = 0;
                let episodeFileFailures = 0;
                let episodeListFetches = 0;
                let episodeListFailures = 0;
                await mapPool(seriesRecords, 8, async (record) => {
                    const seriesId = Number(record.id);
                    const fileCount = Number(record.statistics?.episodeFileCount || 0);
                    const episodeCount = Number(record.statistics?.episodeCount || 0);
                    if (!Number.isFinite(seriesId)) return;

                    if (fileCount <= 0) {
                        filesBySeriesId.set(seriesId, []);
                    } else {
                        episodeFileFetches += 1;
                        try {
                            const files = await request(
                                instance,
                                `/api/v3/episodefile?seriesId=${encodeURIComponent(seriesId)}`,
                                { timeoutMs: 45000 },
                            );
                            filesBySeriesId.set(seriesId, Array.isArray(files) ? files : []);
                        } catch (error) {
                            episodeFileFailures += 1;
                            filesBySeriesId.set(seriesId, []);
                            if (episodeFileFailures <= 5) {
                                log(`[upgrader] episodefile failed (${instance.name} series ${seriesId}): ${error.message}`);
                            }
                        }
                    }

                    // Only pull episode rows when stats show a monitored/aired gap (missing hunt path).
                    const needsEpisodeList = record.monitored !== false && episodeCount > fileCount;
                    if (!needsEpisodeList) {
                        episodesBySeriesId.set(seriesId, []);
                        return;
                    }
                    episodeListFetches += 1;
                    try {
                        const episodes = await request(
                            instance,
                            `/api/v3/episode?seriesId=${encodeURIComponent(seriesId)}`,
                            { timeoutMs: 45000 },
                        );
                        episodesBySeriesId.set(seriesId, Array.isArray(episodes) ? episodes : []);
                    } catch (error) {
                        episodeListFailures += 1;
                        episodesBySeriesId.set(seriesId, []);
                        if (episodeListFailures <= 5) {
                            log(`[upgrader] episode list failed (${instance.name} series ${seriesId}): ${error.message}`);
                        }
                    }
                });
                const fileTotal = [...filesBySeriesId.values()].reduce((sum, files) => sum + files.length, 0);
                log(`[upgrader] ${instance.name}: ${fileTotal} episode files from ${episodeFileFetches} series`
                    + ` (${episodeFileFailures} fetch failures)`
                    + ` · ${episodeListFetches} episode lists for missing gaps (${episodeListFailures} failures)`);

                let sonarrWithFiles = 0;
                let sonarrScored = 0;
                let sonarrMissingEligible = 0;
                for (const record of seriesRecords) {
                    const profile = profileById.get(Number(record.qualityProfileId)) || null;
                    const episodeFiles = filesBySeriesId.get(Number(record.id)) || [];
                    const episodes = episodesBySeriesId.get(Number(record.id)) || [];
                    const item = buildSonarrIndexItem(
                        instance,
                        record,
                        episodeFiles,
                        episodes,
                        profile,
                    );
                    if (item.hasFile) sonarrWithFiles += 1;
                    if (item.hasFile && !item.scoreUnknown) sonarrScored += 1;
                    if (item.huntMissingEligible) sonarrMissingEligible += 1;
                    items.push(item);
                }
                log(`[upgrader] ${instance.name}: ${sonarrWithFiles}/${seriesRecords.length} series with files`
                    + ` · ${sonarrScored} scored · ${sonarrWithFiles - sonarrScored} score-unknown`
                    + ` · ${sonarrMissingEligible} missing-aired eligible`);
            }
            const payload = { generatedAt: new Date().toISOString(), itemCount: items.length, items };
            await saveFile(indexPath, payload);
            await appendAudit({
                action: 'index_rebuilt',
                actor: actor?.username || actor?.id || null,
                itemCount: items.length,
            });
            return payload;
        } finally {
            running = false;
        }
    };

    const hunt = createUpgraderHunt({
        request,
        loadIndex,
        loadPrefs,
        savePrefs,
        appendAudit,
        log,
    });

    const downloadHealth = createQcDownloadHealth({
        request,
        loadPrefs,
        savePrefs,
        appendAudit,
        loadAudit,
        fetchWithTimeout,
        resolveIntegrationUrlForFetch,
        log,
        getDiscordNotifier: () => discordNotifier,
    });

    const loadIntegrityCache = () => loadFile(integrityCachePath || `${indexPath}.integrity-cache.json`, {
        updatedAt: null,
        entries: {},
    });
    const saveIntegrityCache = (payload) => saveFile(
        integrityCachePath || `${indexPath}.integrity-cache.json`,
        payload,
    );

    const integrity = createQcIntegrity({
        request,
        loadIndex,
        loadPrefs,
        savePrefs,
        appendAudit,
        loadCache: loadIntegrityCache,
        saveCache: saveIntegrityCache,
        log,
    });

    const startIndexJob = (getConfig) => {
        if (indexTimer) return;
        const run = async () => {
            try {
                const config = await getConfig();
                if (config.upgraderEnabled) await buildIndex(config);
            } catch (error) {
                log(`[upgrader] index failed: ${error.message}`);
            }
        };
        void run();
        indexTimer = setInterval(run, 4 * 60 * 60 * 1000);
    };

    const startHuntJob = (getConfig) => {
        if (huntTimer) return;
        const run = async () => {
            try {
                const config = await getConfig();
                if (!config.upgraderEnabled || !config.upgraderAutomationEnabled) return;
                const result = await hunt.runHunt(config);
                if (result.grabbed) log(`[upgrader] hunt grabbed ${result.grabbed} upgrade(s)`);
            } catch (error) {
                log(`[upgrader] hunt failed: ${error.message}`);
            }
        };
        // Stagger first hunt so index can populate.
        setTimeout(() => { void run(); }, 90 * 1000);
        huntTimer = setInterval(run, 20 * 60 * 1000);
    };

    const startCleanupJob = (getConfig) => downloadHealth.startCleanupJob(getConfig);
    const startIntegrityJob = (getConfig) => integrity.startIntegrityJob(getConfig);

    return {
        get running() { return running; },
        loadIndex,
        loadPrefs,
        savePrefs,
        loadAudit,
        appendAudit,
        buildIndex,
        startIndexJob,
        startHuntJob,
        startCleanupJob,
        startIntegrityJob,
        request,
        hunt,
        downloadHealth,
        integrity,
    };
};
