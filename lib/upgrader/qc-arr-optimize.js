import { createHash } from 'crypto';

import { fetchArrInstance } from '../arr-service.js';
import { getReadyArrInstances } from '../media-stack/arr-instances.js';
import {
    ensureIntegrityWebhookAuth,
    listIntegrityHookNotification,
    notificationFieldValue,
    syncIntegrityHooksToArr,
} from './arr-integrity-hook-sync.js';

export const integrityHookAuthFingerprint = (username, password) => {
    const user = String(username || '').trim();
    const pass = String(password || '');
    if (!user || !pass) return '';
    return createHash('sha256').update(`${user}\0${pass}`).digest('hex').slice(0, 24);
};

const hasImportEvent = (notification) => Boolean(
    notification?.onDownload
    || notification?.onImportComplete
    || notification?.onReleaseImport,
);

const triggerPathOk = (url, kind) => {
    const value = String(url || '');
    if (!value) return false;
    try {
        const path = new URL(value).pathname.replace(/\/+$/, '');
        return path === `/triggers/${kind}` || path.endsWith(`/triggers/${kind}`);
    } catch {
        return value.includes(`/triggers/${kind}`);
    }
};

export const summarizeIntegrityHook = (notification, {
    kind,
    username = '',
    fingerprint = '',
    syncedFingerprint = '',
} = {}) => {
    const present = !!notification;
    const url = present ? String(notificationFieldValue(notification, 'url') || '') : '';
    const hookUser = present ? String(notificationFieldValue(notification, 'username') || '').trim() : '';
    const importOn = present && hasImportEvent(notification);
    const upgradeOn = present && notification?.onUpgrade !== false && notification?.onUpgrade !== 0;
    const authOk = Boolean(fingerprint && fingerprint === syncedFingerprint);
    const rows = [
        {
            key: `${kind}-hook`,
            label: `${kind} · Portal Integrity webhook`,
            current: present ? 'present' : 'missing',
            recommended: 'present',
            ok: present,
        },
        {
            key: `${kind}-url`,
            label: `${kind} · Trigger URL`,
            current: url || '—',
            recommended: triggerPathOk(url, kind) ? url : `/triggers/${kind} on an Arr-reachable host`,
            ok: triggerPathOk(url, kind),
        },
        {
            key: `${kind}-user`,
            label: `${kind} · Hook username`,
            current: hookUser || '—',
            recommended: username || 'portal-integrity',
            ok: !!username && hookUser === username,
        },
        {
            key: `${kind}-auth`,
            label: `${kind} · Hook password`,
            current: authOk ? 'matches portal' : (syncedFingerprint ? 'out of date' : 'never synced'),
            recommended: 'matches portal',
            ok: authOk,
        },
        {
            key: `${kind}-import`,
            label: `${kind} · On import`,
            current: importOn ? 'on' : 'off',
            recommended: 'on',
            ok: importOn,
        },
        {
            key: `${kind}-upgrade`,
            label: `${kind} · On upgrade`,
            current: upgradeOn ? 'on' : 'off',
            recommended: 'on',
            ok: upgradeOn,
        },
    ];
    return {
        configured: true,
        aligned: rows.every((row) => row.ok),
        rows,
        url,
    };
};

export const recordIntegrityHookSync = async (config, result, { loadPrefs, savePrefs } = {}) => {
    if (!result?.ok || typeof loadPrefs !== 'function' || typeof savePrefs !== 'function') return null;
    const fingerprint = integrityHookAuthFingerprint(
        config.qcIntegrityWebhookUsername,
        config.qcIntegrityWebhookPassword,
    );
    if (!fingerprint) return null;
    const prefs = await loadPrefs();
    prefs.integrityHookSync = {
        fingerprint,
        at: new Date().toISOString(),
    };
    await savePrefs(prefs);
    return prefs.integrityHookSync;
};

export const getArrAlignment = async (config, {
    fetchArr = fetchArrInstance,
    resolveUrl,
    loadPrefs,
} = {}) => {
    const instances = getReadyArrInstances(config).filter((instance) => (
        instance.type === 'sonarr' || instance.type === 'radarr' || instance.type === 'lidarr'
    ));
    const username = String(config.qcIntegrityWebhookUsername || '').trim();
    const fingerprint = integrityHookAuthFingerprint(username, config.qcIntegrityWebhookPassword);
    const prefs = typeof loadPrefs === 'function' ? await loadPrefs() : {};
    const syncedFingerprint = String(prefs?.integrityHookSync?.fingerprint || '');
    const wrappedFetch = (instance, endpoint, options = {}) => fetchArr(instance, endpoint, {
        resolveUrl,
        timeoutMs: 15000,
        ...options,
    });

    const results = [];
    for (const instance of instances) {
        try {
            const listed = await listIntegrityHookNotification(instance, wrappedFetch);
            if (!listed.ok) {
                results.push({
                    instanceId: instance.id,
                    name: instance.name,
                    kind: instance.type,
                    configured: true,
                    aligned: false,
                    rows: [],
                    error: listed.error,
                });
                continue;
            }
            const summary = summarizeIntegrityHook(listed.notification, {
                kind: instance.type,
                username,
                fingerprint,
                syncedFingerprint,
            });
            results.push({
                instanceId: instance.id,
                name: instance.name,
                kind: instance.type,
                ...summary,
            });
        } catch (error) {
            results.push({
                instanceId: instance.id,
                name: instance.name,
                kind: instance.type,
                configured: true,
                aligned: false,
                rows: [],
                error: error.message || 'Failed to read Arr notifications',
            });
        }
    }

    return {
        recommended: { hook: 'Portal Integrity', import: true, upgrade: true },
        instances: results,
        aligned: results.length > 0 && results.every((entry) => entry.aligned),
        arrs: {
            sonarr: instances.some((instance) => instance.type === 'sonarr'),
            radarr: instances.some((instance) => instance.type === 'radarr'),
            lidarr: instances.some((instance) => instance.type === 'lidarr'),
        },
        syncedAt: prefs?.integrityHookSync?.at || null,
        errors: Object.fromEntries(results.filter((entry) => entry.error).map((entry) => [entry.kind, entry.error])),
    };
};

export const applyArrAlignment = async (config, {
    fetchArr = fetchArrInstance,
    resolveUrl,
    loadPrefs,
    savePrefs,
    log = () => {},
} = {}) => {
    const { config: nextConfig, changed } = ensureIntegrityWebhookAuth(config);
    const sync = await syncIntegrityHooksToArr(nextConfig, {
        fetchArr,
        resolveUrl,
        log,
        test: false,
    });
    if (sync.ok) {
        await recordIntegrityHookSync(nextConfig, sync, { loadPrefs, savePrefs });
    }
    const after = await getArrAlignment(nextConfig, { fetchArr, resolveUrl, loadPrefs });
    return {
        ...after,
        config: changed ? nextConfig : null,
        applied: sync,
    };
};
