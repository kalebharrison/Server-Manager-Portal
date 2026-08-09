import { randomBytes } from 'crypto';

import { fetchArrInstance } from '../arr-service.js';
import { getReadyArrInstances } from '../media-stack/arr-instances.js';

export const INTEGRITY_HOOK_NAME = 'Portal Integrity';

export const notificationApiBase = (type) => (
    type === 'lidarr' ? '/api/v1/notification' : '/api/v3/notification'
);

export const buildIntegrityTriggerUrl = (publicDomain, kind) => {
    const base = String(publicDomain || '').trim().replace(/\/+$/, '');
    if (!base) return '';
    return `${base}/triggers/${kind}`;
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
        next.qcIntegrityWebhookUsername = 'integrity';
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

export const syncIntegrityHookForInstance = async (instance, {
    triggerUrl,
    username,
    password,
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

    const payload = applyIntegrityHookPayload(schemaBase, { url: triggerUrl, username, password });
    const saved = existing
        ? await fetchArr(instance, `${api}/${existing.id}`, { method: 'PUT', body: { ...payload, id: existing.id } })
        : await fetchArr(instance, api, { method: 'POST', body: payload });
    if (!saved?.ok) {
        return {
            instanceId: instance.id,
            name: instance.name,
            kind,
            ok: false,
            action: existing ? 'update' : 'create',
            error: fetchError(saved, 'save notification failed'),
        };
    }

    let testOk = null;
    if (test) {
        const testBody = saved.data && typeof saved.data === 'object' ? saved.data : payload;
        const testRes = await fetchArr(instance, `${api}/test`, { method: 'POST', body: testBody });
        testOk = !!testRes?.ok;
    }

    return {
        instanceId: instance.id,
        name: instance.name,
        kind,
        ok: true,
        action: existing ? 'update' : 'create',
        testOk,
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
    const publicDomain = String(config.publicDomain || '').trim().replace(/\/+$/, '');
    if (!publicDomain || /portal\.yourdomain\.com/i.test(publicDomain)) {
        return { ok: false, error: 'Set the public portal URL in Settings first.', results: [] };
    }

    const instances = getReadyArrInstances(config).filter((instance) => (
        instance.type === 'sonarr' || instance.type === 'radarr' || instance.type === 'lidarr'
    ));
    if (!instances.length) {
        return { ok: false, error: 'No ready Sonarr/Radarr/Lidarr instances.', results: [] };
    }

    const results = [];
    for (const instance of instances) {
        try {
            const result = await syncIntegrityHookForInstance(instance, {
                triggerUrl: buildIntegrityTriggerUrl(publicDomain, instance.type),
                username,
                password,
                test,
                fetchArr: (target, endpoint, options = {}) => fetchArr(target, endpoint, {
                    resolveUrl,
                    timeoutMs: 15000,
                    ...options,
                }),
            });
            results.push(result);
            log(result.ok
                ? `[integrity] hook sync ${result.kind} ${result.name}: ${result.action}`
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
