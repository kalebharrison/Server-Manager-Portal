import { randomBytes } from 'crypto';
import { existsSync } from 'fs';

import { fetchArrInstance } from '../arr-service.js';
import { getReadyArrInstances } from '../media-stack/arr-instances.js';

export const INTEGRITY_HOOK_NAME = 'Portal Integrity';

export const notificationApiBase = (type) => (
    type === 'lidarr' ? '/api/v1/notification' : '/api/v3/notification'
);

export const buildIntegrityTriggerUrl = (baseUrl, kind) => {
    const base = String(baseUrl || '').trim().replace(/\/+$/, '');
    if (!base) return '';
    return `${base}/triggers/${kind}`;
};

const originOf = (value = '') => {
    try {
        const parsed = new URL(String(value || '').trim());
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
        return `${parsed.protocol}//${parsed.host}`;
    } catch {
        return '';
    }
};

const dockerHookBaseUrl = (env = process.env) => {
    const inDocker = existsSync('/.dockerenv') || env.SMP_USE_DOCKER_HOOK_HOST === '1';
    if (!inDocker) return '';
    const host = String(env.HOSTNAME || '').trim();
    if (!host || /^[a-f0-9]{12}$/i.test(host)) return '';
    const port = String(env.PORT || '2121').trim() || '2121';
    return `http://${host}:${port}`;
};

export const resolveIntegrityHookBaseUrl = (config = {}, { env = process.env, existingUrls = [] } = {}) => {
    const explicit = String(config.qcIntegrityWebhookBaseUrl || '').trim().replace(/\/+$/, '');
    if (explicit) return explicit;
    for (const url of existingUrls) {
        const origin = originOf(url);
        if (origin) return origin;
    }
    const dockerBase = dockerHookBaseUrl(env);
    if (dockerBase) return dockerBase;
    const publicDomain = String(config.publicDomain || '').trim().replace(/\/+$/, '');
    if (publicDomain && !/portal\.yourdomain\.com/i.test(publicDomain)) return publicDomain;
    return '';
};

export const notificationFieldValue = (notification, name) => {
    const field = (notification?.fields || []).find((entry) => entry?.name === name);
    return field?.value;
};

export const isIntegrityHookNotification = (notification, kind) => {
    const name = String(notification?.name || '').trim();
    if (/^portal integrity$/i.test(name)) return true;
    const url = String(notificationFieldValue(notification, 'url') || '');
    if (!url) return false;
    try {
        const path = new URL(url).pathname.replace(/\/+$/, '');
        return path === `/triggers/${kind}` || path.endsWith(`/triggers/${kind}`);
    } catch {
        return url.includes(`/triggers/${kind}`);
    }
};

export const setNotificationFields = (fields = [], values = {}) => {
    const next = (Array.isArray(fields) ? fields : []).map((field) => ({ ...field }));
    for (const [name, value] of Object.entries(values)) {
        if (value === undefined) continue;
        const index = next.findIndex((field) => field.name === name);
        if (index >= 0) next[index] = { ...next[index], value };
        else next.push({ name, value });
    }
    return next;
};

export const applyIntegrityHookPayload = (base = {}, { url, username, password } = {}) => {
    const payload = { ...base };
    payload.name = INTEGRITY_HOOK_NAME;
    payload.implementation = base.implementation || 'Webhook';
    payload.implementationName = base.implementationName || 'Webhook';
    payload.configContract = base.configContract || 'WebhookSettings';
    payload.tags = Array.isArray(base.tags) ? base.tags : [];
    payload.onGrab = false;
    if (base.supportsOnDownload !== false) payload.onDownload = true;
    if (base.supportsOnUpgrade !== false) payload.onUpgrade = true;
    if ('onImportComplete' in base || base.supportsOnImportComplete) payload.onImportComplete = true;
    if ('onReleaseImport' in base || base.supportsOnReleaseImport) payload.onReleaseImport = true;
    payload.fields = setNotificationFields(base.fields, {
        url,
        method: 1,
        username,
        password,
    });
    return payload;
};

export const ensureIntegrityWebhookAuth = (config = {}) => {
    const next = { ...config };
    let changed = false;
    if (!String(next.qcIntegrityWebhookUsername || '').trim()) {
        next.qcIntegrityWebhookUsername = 'portal-integrity';
        changed = true;
    }
    if (!String(next.qcIntegrityWebhookPassword || '').trim()) {
        next.qcIntegrityWebhookPassword = randomBytes(24).toString('hex');
        changed = true;
    }
    return { config: next, changed };
};

const fetchError = (result, fallback) => {
    const data = result?.data;
    if (typeof data === 'string' && data.trim()) return data.trim().slice(0, 180);
    if (data && typeof data === 'object') {
        const message = data.message || data.error || data.title;
        if (message) return String(message).slice(0, 180);
    }
    return `${fallback} (${result?.status || 0})`;
};

const triggerUrlCandidates = ({ existingUrl, kind, bases = [] }) => {
    const urls = [];
    const add = (url) => {
        const value = String(url || '').trim();
        if (value && !urls.includes(value)) urls.push(value);
    };
    if (existingUrl && isIntegrityHookNotification({ fields: [{ name: 'url', value: existingUrl }] }, kind)) {
        add(existingUrl);
    }
    for (const base of bases) add(buildIntegrityTriggerUrl(base, kind));
    return urls;
};

const looksLikeUnreachableHost = (error = '') => (
    /name does not resolve|enotfound|getaddrinfo|no such host|could not resolve/i.test(String(error || ''))
);

export const syncIntegrityHookForInstance = async (instance, {
    username,
    password,
    bases = [],
    fetchArr,
    test = false,
} = {}) => {
    const kind = instance.type;
    const api = notificationApiBase(kind);
    const listed = await fetchArr(instance, api);
    if (!listed?.ok) {
        return {
            instanceId: instance.id,
            name: instance.name,
            kind,
            ok: false,
            error: fetchError(listed, 'list notifications failed'),
        };
    }

    const existingList = Array.isArray(listed.data) ? listed.data : [];
    const existing = existingList.find((notification) => isIntegrityHookNotification(notification, kind));
    let schemaBase = existing;
    if (!existing) {
        const schemaRes = await fetchArr(instance, `${api}/schema`);
        const schemas = Array.isArray(schemaRes?.data) ? schemaRes.data : [];
        schemaBase = schemas.find((entry) => entry.implementation === 'Webhook') || {
            implementation: 'Webhook',
            implementationName: 'Webhook',
            configContract: 'WebhookSettings',
            fields: [],
            supportsOnDownload: true,
            supportsOnUpgrade: true,
        };
    }

    const urls = triggerUrlCandidates({
        existingUrl: notificationFieldValue(existing, 'url'),
        kind,
        bases,
    });
    if (!urls.length) {
        return {
            instanceId: instance.id,
            name: instance.name,
            kind,
            ok: false,
            error: 'No Arr-reachable portal URL. Set public portal URL or qcIntegrityWebhookBaseUrl.',
        };
    }

    let saved = null;
    let usedUrl = urls[0];
    let lastError = '';
    for (const url of urls) {
        const payload = applyIntegrityHookPayload(schemaBase, { url, username, password });
        saved = existing
            ? await fetchArr(instance, `${api}/${existing.id}`, { method: 'PUT', body: { ...payload, id: existing.id } })
            : await fetchArr(instance, api, { method: 'POST', body: payload });
        if (saved?.ok) {
            usedUrl = url;
            schemaBase = saved.data && typeof saved.data === 'object' ? saved.data : payload;
            break;
        }
        lastError = fetchError(saved, 'save notification failed');
        if (!looksLikeUnreachableHost(lastError)) break;
        saved = null;
    }
    if (!saved?.ok) {
        return {
            instanceId: instance.id,
            name: instance.name,
            kind,
            ok: false,
            action: existing ? 'update' : 'create',
            error: lastError || 'save notification failed',
        };
    }

    let testOk = null;
    if (test) {
        const testBody = saved.data && typeof saved.data === 'object' ? saved.data : schemaBase;
        const testRes = await fetchArr(instance, `${api}/test`, { method: 'POST', body: testBody });
        testOk = !!testRes?.ok;
    }

    return {
        instanceId: instance.id,
        name: instance.name,
        kind,
        ok: true,
        action: existing ? 'update' : 'create',
        url: usedUrl,
        testOk,
    };
};

export const listIntegrityHookNotification = async (instance, fetchArr) => {
    const api = notificationApiBase(instance.type);
    const listed = await fetchArr(instance, api);
    if (!listed?.ok) {
        return {
            ok: false,
            error: fetchError(listed, 'list notifications failed'),
            notification: null,
        };
    }
    const list = Array.isArray(listed.data) ? listed.data : [];
    return {
        ok: true,
        notification: list.find((entry) => isIntegrityHookNotification(entry, instance.type)) || null,
    };
};

export const syncIntegrityHooksToArr = async (config, {
    fetchArr = fetchArrInstance,
    resolveUrl,
    log = () => {},
    test = false,
} = {}) => {
    if (!config?.upgraderEnabled || !config?.qcIntegrityEnabled) {
        return { ok: false, error: 'Enable Quality Control and Integrity first.', results: [] };
    }
    const username = String(config.qcIntegrityWebhookUsername || '').trim();
    const password = String(config.qcIntegrityWebhookPassword || '');
    if (!username || !password) {
        return { ok: false, error: 'Integrity hook username and password are required.', results: [] };
    }

    const instances = getReadyArrInstances(config).filter((instance) => (
        instance.type === 'sonarr' || instance.type === 'radarr' || instance.type === 'lidarr'
    ));
    if (!instances.length) {
        return { ok: false, error: 'No ready Sonarr/Radarr/Lidarr instances.', results: [] };
    }

    const fallbackBase = resolveIntegrityHookBaseUrl(config, { env: process.env });
    const knownBases = [fallbackBase].filter(Boolean);
    const results = [];
    for (const instance of instances) {
        try {
            const result = await syncIntegrityHookForInstance(instance, {
                username,
                password,
                bases: knownBases,
                test,
                fetchArr: (target, endpoint, options = {}) => fetchArr(target, endpoint, {
                    resolveUrl,
                    timeoutMs: 15000,
                    ...options,
                }),
            });
            results.push(result);
            if (result.ok && result.url) {
                const origin = originOf(result.url);
                if (origin && !knownBases.includes(origin)) knownBases.push(origin);
            }
            log(result.ok
                ? `[integrity] hook sync ${result.kind} ${result.name}: ${result.action} ${result.url || ''}`
                : `[integrity] hook sync ${result.kind} ${result.name} failed: ${result.error}`);
        } catch (error) {
            results.push({
                instanceId: instance.id,
                name: instance.name,
                kind: instance.type,
                ok: false,
                error: error.message || 'sync failed',
            });
        }
    }

    return {
        ok: results.every((result) => result.ok),
        results,
    };
};
