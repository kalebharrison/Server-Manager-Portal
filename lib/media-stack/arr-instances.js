import { randomUUID } from 'crypto';

export const ARR_TYPES = Object.freeze(['sonarr', 'radarr', 'lidarr']);
const MAX_INSTANCES_PER_TYPE = 10;

const normalizeType = (value) => ARR_TYPES.includes(String(value || '').toLowerCase())
    ? String(value).toLowerCase()
    : null;

const defaultName = (type) => type.charAt(0).toUpperCase() + type.slice(1);

const normalizeOptionalId = (value) => {
    if (value == null || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
};

const normalizeTagIdList = (value) => {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.map((entry) => Number(entry)).filter((id) => Number.isFinite(id)))];
};

export const createArrInstance = ({
    id = randomUUID(),
    type,
    name = '',
    url = '',
    apiKey = '',
    enabled = true,
    isDefault = false,
    activeProfileId = null,
    activeDirectory = '',
    activeLanguageProfileId = null,
    activeAnimeProfileId = null,
    activeAnimeDirectory = '',
    tags = [],
    animeTags = [],
} = {}) => {
    const normalizedType = normalizeType(type) || 'sonarr';
    return {
        id: String(id),
        type: normalizedType,
        name: String(name || defaultName(normalizedType)).trim(),
        url: String(url || '').trim(),
        apiKey: String(apiKey || ''),
        enabled: enabled !== false,
        isDefault: !!isDefault,
        // Defaults for portal request routing.
        activeProfileId: normalizeOptionalId(activeProfileId),
        activeDirectory: String(activeDirectory || '').trim(),
        activeLanguageProfileId: normalizeOptionalId(activeLanguageProfileId),
        activeAnimeProfileId: normalizeOptionalId(activeAnimeProfileId),
        activeAnimeDirectory: String(activeAnimeDirectory || '').trim(),
        tags: normalizeTagIdList(tags),
        animeTags: normalizeTagIdList(animeTags),
    };
};

const ensureDefaults = (instances) => {
    const next = instances.map((instance) => ({ ...instance }));
    for (const type of ARR_TYPES) {
        const candidates = next.filter((instance) => instance.type === type);
        if (candidates.length === 0) continue;
        const selected = candidates.find((instance) => instance.isDefault) || candidates[0];
        for (const instance of candidates) instance.isDefault = instance.id === selected.id;
    }
    return next;
};

export const migrateArrConfig = (config = {}) => {
    if (Array.isArray(config.arrInstances)) return config;
    const instances = [];
    for (const type of ARR_TYPES) {
        const url = config[`${type}Url`] || '';
        const apiKey = config[`${type}ApiKey`] || '';
        if (!url && !apiKey) continue;
        instances.push(createArrInstance({ id: `${type}-default`, type, url, apiKey, isDefault: true }));
    }
    return { ...config, arrInstances: instances };
};

export const getArrInstances = (config = {}, { type = null, enabledOnly = false } = {}) => {
    let instances = migrateArrConfig(config).arrInstances || [];
    if (type) instances = instances.filter((instance) => instance.type === type);
    if (enabledOnly) instances = instances.filter((instance) => instance.enabled !== false);
    return instances;
};

export const getArrInstance = (config = {}, instanceId = '') => (
    getArrInstances(config).find((instance) => instance.id === String(instanceId || '')) || null
);

export const getDefaultArrInstance = (config = {}, type) => {
    const instances = getArrInstances(config, { type, enabledOnly: true });
    return instances.find((instance) => instance.isDefault)
        || instances.find((instance) => instance.url && instance.apiKey)
        || instances[0]
        || null;
};

export const getReadyArrInstances = (config = {}, type) => (
    getArrInstances(config, { type, enabledOnly: true }).filter((instance) => instance.url && instance.apiKey)
);

export const normalizeArrConfig = (config = {}) => {
    const next = { ...migrateArrConfig(config) };
    next.arrInstances = ensureDefaults(getArrInstances(next).map(createArrInstance));
    for (const type of ARR_TYPES) {
        const instance = getDefaultArrInstance(next, type);
        next[`${type}Url`] = instance?.url || '';
        next[`${type}ApiKey`] = instance?.apiKey || '';
    }
    return next;
};

export const sanitizeArrInstances = async (incoming, existingConfig, { resolveSecret, resolveUrl }) => {
    if (!Array.isArray(incoming)) return getArrInstances(existingConfig);
    const existingById = new Map(getArrInstances(existingConfig).map((instance) => [instance.id, instance]));
    const counts = Object.fromEntries(ARR_TYPES.map((type) => [type, 0]));
    const usedIds = new Set();
    const sanitized = [];
    for (const raw of incoming) {
        const type = normalizeType(raw?.type);
        if (!type) continue;
        counts[type] += 1;
        if (counts[type] > MAX_INSTANCES_PER_TYPE) throw new Error(`Too many ${type} instances (maximum ${MAX_INSTANCES_PER_TYPE}).`);
        const candidateId = String(raw?.id || randomUUID()).trim().slice(0, 80).replace(/[^a-zA-Z0-9_.-]/g, '-');
        const id = candidateId && !usedIds.has(candidateId) ? candidateId : randomUUID();
        usedIds.add(id);
        const existing = existingById.get(id) || {};
        sanitized.push(createArrInstance({
            id,
            type,
            name: String(raw?.name || existing.name || defaultName(type)).slice(0, 80),
            url: await Promise.resolve(resolveUrl(raw?.url, existing.url || '')),
            apiKey: resolveSecret(raw?.apiKey, existing.apiKey || ''),
            enabled: raw?.enabled !== false,
            isDefault: !!raw?.isDefault,
            activeProfileId: raw?.activeProfileId ?? existing.activeProfileId ?? null,
            activeDirectory: raw?.activeDirectory ?? existing.activeDirectory ?? '',
            activeLanguageProfileId: raw?.activeLanguageProfileId ?? existing.activeLanguageProfileId ?? null,
            activeAnimeProfileId: raw?.activeAnimeProfileId ?? existing.activeAnimeProfileId ?? null,
            activeAnimeDirectory: raw?.activeAnimeDirectory ?? existing.activeAnimeDirectory ?? '',
            tags: raw?.tags ?? existing.tags ?? [],
            animeTags: raw?.animeTags ?? existing.animeTags ?? [],
        }));
    }
    return ensureDefaults(sanitized);
};

export const maskArrInstances = (config = {}, secretMask = '••••••••') => (
    getArrInstances(config).map((instance) => ({
        ...instance,
        apiKey: instance.apiKey ? secretMask : '',
    }))
);
