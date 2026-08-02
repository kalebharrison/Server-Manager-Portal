import { getReadyArrInstances } from '../media-stack/arr-instances.js';
import { buildRadarrIndexItem, buildSonarrIndexItem } from './upgrader-index-builder.js';
import { createUpgraderHunt } from './upgrader-hunt.js';

const normalizeUrl = (url) => String(url || '').replace(/\/+$/, '');

export const createUpgraderService = ({
    indexPath,
    prefsPath,
    auditPath,
    loadFile,
    saveFile,
    fetchWithTimeout = fetch,
    resolveIntegrationUrlForFetch = async (url) => url,
    log = console.log,
}) => {
    let running = false;
    let indexTimer = null;
    let huntTimer = null;

    const request = async (instance, path, options = {}) => {
        const url = await resolveIntegrationUrlForFetch(`${normalizeUrl(instance.url)}${path}`);
        const headers = { 'X-Api-Key': instance.apiKey, Accept: 'application/json', ...(options.headers || {}) };
        let body = options.body;
        if (body && typeof body === 'object' && !(body instanceof Buffer)) {
            headers['Content-Type'] = headers['Content-Type'] || 'application/json';
            body = JSON.stringify(body);
        }
        const response = await fetchWithTimeout(url, { ...options, headers, body });
        if (!response.ok) {
            const detail = await response.text().catch(() => '');
            throw new Error(`${instance.name || instance.type} returned ${response.status}${detail ? `: ${detail.slice(0, 180)}` : ''}`);
        }
        if (response.status === 204) return null;
        return response.json().catch(() => null);
    };

    const loadIndex = () => loadFile(indexPath, { generatedAt: null, itemCount: 0, items: [] });
    const loadPrefs = () => loadFile(prefsPath, {
        excludedRatingKeys: [],
        excludedTitles: [],
        excludedLibraries: [],
        snoozed: {},
        huntCooldowns: {},
        huntLibraryCursor: 0,
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
            const instances = getReadyArrInstances(config).filter((instance) => ['sonarr', 'radarr'].includes(instance.type));
            const items = [];
            for (const instance of instances) {
                const profilesResponse = await request(instance, '/api/v3/qualityprofile').catch((error) => {
                    log(`[upgrader] qualityprofile failed (${instance.name || instance.type}): ${error.message}`);
                    return [];
                });
                const profileById = new Map(
                    (Array.isArray(profilesResponse) ? profilesResponse : []).map((profile) => [Number(profile.id), profile]),
                );

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
                for (const record of (Array.isArray(seriesList) ? seriesList : [])) {
                    const profile = profileById.get(Number(record.qualityProfileId)) || null;
                    const [episodeFiles, episodes] = await Promise.all([
                        request(instance, `/api/v3/episodefile?seriesId=${encodeURIComponent(record.id)}`).catch(() => []),
                        request(instance, `/api/v3/episode?seriesId=${encodeURIComponent(record.id)}`).catch(() => []),
                    ]);
                    items.push(buildSonarrIndexItem(
                        instance,
                        record,
                        Array.isArray(episodeFiles) ? episodeFiles : [],
                        Array.isArray(episodes) ? episodes : [],
                        profile,
                    ));
                }
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
        request,
        hunt,
    };
};
