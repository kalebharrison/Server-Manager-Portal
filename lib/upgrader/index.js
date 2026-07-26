import { getReadyArrInstances } from '../media-stack/arr-instances.js';

const normalizeUrl = (url) => String(url || '').replace(/\/+$/, '');
const isHevc = (codec) => /hevc|h\.?265|x265/i.test(String(codec || ''));
const toGb = (bytes) => Math.round((Number(bytes || 0) / 1024 / 1024 / 1024) * 100) / 100;

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
    let timer = null;
    const request = async (instance, path, options = {}) => {
        const url = await resolveIntegrationUrlForFetch(`${normalizeUrl(instance.url)}${path}`);
        const response = await fetchWithTimeout(url, {
            ...options,
            headers: { 'X-Api-Key': instance.apiKey, ...(options.headers || {}) },
        });
        if (!response.ok) throw new Error(`${instance.name || instance.type} returned ${response.status}`);
        return response.json();
    };
    const loadIndex = () => loadFile(indexPath, { generatedAt: null, itemCount: 0, items: [] });
    const loadPrefs = () => loadFile(prefsPath, { excludedRatingKeys: [], excludedTitles: [], excludedLibraries: [], snoozed: {} });
    const loadAudit = () => loadFile(auditPath, { entries: [] });
    const appendAudit = async (entry) => {
        const audit = await loadAudit();
        audit.entries = [{ at: new Date().toISOString(), ...entry }, ...(audit.entries || [])].slice(0, 1000);
        await saveFile(auditPath, audit);
        return audit.entries[0];
    };
    const buildIndex = async (config, { actor = null } = {}) => {
        if (running) return;
        running = true;
        try {
            const instances = getReadyArrInstances(config).filter((instance) => ['sonarr', 'radarr'].includes(instance.type));
            const items = [];
            for (const instance of instances) {
                const records = await request(instance, instance.type === 'radarr' ? '/api/v3/movie' : '/api/v3/series');
                for (const record of records) {
                    const file = instance.type === 'radarr' ? record.movieFile : null;
                    const codec = file?.mediaInfo?.videoCodec || '';
                    const sizeGB = toGb(file?.size);
                    items.push({
                        ratingKey: `${instance.type}:${instance.id}:${record.id}`,
                        entityId: record.id,
                        arrType: instance.type,
                        arrInstanceId: instance.id,
                        arrInstanceName: instance.name,
                        mediaType: instance.type === 'radarr' ? 'movie' : 'show',
                        title: record.title,
                        year: record.year,
                        overview: record.overview || '',
                        monitored: record.monitored !== false,
                        videoCodec: codec,
                        isHevc: isHevc(codec),
                        sizeGB,
                        addedAt: record.added || null,
                        qualityProfileId: record.qualityProfileId || null,
                        thumbUrl: record.images?.find((image) => image.coverType === 'poster')?.remoteUrl || '',
                        arrDeepUrl: `${normalizeUrl(instance.url)}/${instance.type === 'radarr' ? 'movie' : 'series'}/${record.id}`,
                    });
                }
            }
            const payload = { generatedAt: new Date().toISOString(), itemCount: items.length, items };
            await saveFile(indexPath, payload);
            await appendAudit({ action: 'index_rebuilt', actor: actor?.username || actor?.id || null, itemCount: items.length });
            return payload;
        } finally {
            running = false;
        }
    };
    const startIndexJob = (getConfig) => {
        if (timer) return;
        const run = async () => {
            try {
                const config = await getConfig();
                if (config.upgraderEnabled) await buildIndex(config);
            } catch (error) {
                log(`[upgrader] index failed: ${error.message}`);
            }
        };
        void run();
        timer = setInterval(run, 4 * 60 * 60 * 1000);
    };
    return {
        get running() { return running; },
        loadIndex,
        loadPrefs,
        savePrefs: (prefs) => saveFile(prefsPath, prefs),
        loadAudit,
        appendAudit,
        buildIndex,
        startIndexJob,
        request,
    };
};
