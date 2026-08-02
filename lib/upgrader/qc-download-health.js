import { getReadyArrInstances } from '../media-stack/arr-instances.js';
import { createQbitClient } from './download-clients/qbittorrent.js';
import { createSabClient } from './download-clients/sabnzbd.js';
import {
    QC_REASONS,
    classifyQueueItem,
    findDuplicates,
    findOrphans,
    isCondemned,
    isDoomedImportFailure,
    isReasonActionable,
    isResearchThrottled,
    isSeedingProtected,
    isSnoozed,
    itemKey,
    mediaGroupKey,
    thresholdsFromConfig,
} from './qc-rules.js';

const CONDEMNED_MS = 2 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

const defaultMetrics = () => ({
    wastedBytes: 0,
    killsByReason: {},
    lastCleanupAt: null,
});

const queueQueryFor = (type) => {
    if (type === 'sonarr') return 'includeSeries=true&includeEpisode=true';
    if (type === 'radarr') return 'includeMovie=true';
    return 'includeArtist=true&includeAlbum=true';
};

const apiVersionFor = (type) => (type === 'lidarr' ? 'v1' : 'v3');

const recordsOf = (payload) => (
    Array.isArray(payload?.records) ? payload.records : Array.isArray(payload) ? payload : []
);

const titleOf = (arrItem) => (
    arrItem?.title
    || arrItem?.movie?.title
    || arrItem?.series?.title
    || arrItem?.episode?.title
    || arrItem?.album?.title
    || arrItem?.artist?.artistName
    || ''
);

const pruneMapByTime = (map = {}, now = Date.now()) => {
    const next = {};
    for (const [key, until] of Object.entries(map || {})) {
        const ts = typeof until === 'number' ? until : Date.parse(until);
        if (Number.isFinite(ts) && ts > now) next[key] = new Date(ts).toISOString();
    }
    return next;
};

const markUpgradeTag = (arrItem, auditEntries = []) => {
    const downloadId = String(arrItem?.downloadId || '').toLowerCase();
    const title = String(titleOf(arrItem) || '').toLowerCase();
    const cutoff = Date.now() - (48 * HOUR_MS);
    return (auditEntries || []).some((entry) => {
        if (!entry || (entry.action !== 'upgrade' && entry.action !== 'grabbed')) return false;
        if (entry.success === false) return false;
        const at = Date.parse(entry.at || '');
        if (Number.isFinite(at) && at < cutoff) return false;
        const releaseTitle = String(entry.releaseTitle || entry.title || '').toLowerCase();
        if (downloadId && String(entry.downloadId || '').toLowerCase() === downloadId) return true;
        if (title && releaseTitle && (releaseTitle.includes(title) || title.includes(releaseTitle))) return true;
        return false;
    });
};

export const createQcDownloadHealth = ({
    request,
    loadPrefs,
    savePrefs,
    appendAudit,
    loadAudit = null,
    fetchWithTimeout = fetch,
    resolveIntegrationUrlForFetch = async (url) => url,
    log = () => {},
    getDiscordNotifier = null,
} = {}) => {
    let cleanupTimer = null;

    const qbit = createQbitClient({ fetchWithTimeout, resolveIntegrationUrlForFetch, log });
    const sab = createSabClient({ fetchWithTimeout, resolveIntegrationUrlForFetch, log });

    const getMetrics = (prefs = {}) => ({
        ...defaultMetrics(),
        ...(prefs.qcMetrics || {}),
        killsByReason: { ...(prefs.qcMetrics?.killsByReason || {}) },
    });

    const persistPrefsPatch = async (patcher) => {
        const prefs = await loadPrefs();
        const next = patcher({ ...prefs });
        await savePrefs(next);
        return next;
    };

    const fetchArrQueues = async (config) => {
        const types = ['sonarr', 'radarr', 'lidarr'];
        const items = [];
        for (const type of types) {
            const instances = getReadyArrInstances(config, type);
            const version = apiVersionFor(type);
            for (const instance of instances) {
                try {
                    const payload = await request(
                        instance,
                        `/api/${version}/queue?page=1&pageSize=200&${queueQueryFor(type)}`,
                    );
                    for (const record of recordsOf(payload)) {
                        items.push({
                            ...record,
                            arrType: type,
                            arrInstanceId: instance.id,
                            arrInstanceName: instance.name,
                            arrQueueId: record.id,
                        });
                    }
                } catch (error) {
                    log(`[qc] ${instance.name || type} queue failed: ${error.message}`);
                }
            }
        }
        return items;
    };

    const fetchClientItems = async (config) => {
        const clients = { qbit: false, sab: false };
        const configured = {
            qbit: qbit.isConfigured(config),
            sab: sab.isConfigured(config),
        };
        const networkHealth = {
            qbit: configured.qbit ? { ok: false, reachable: false, reason: 'unchecked' } : { ok: true, reason: 'not_configured' },
            sab: configured.sab ? { ok: false, reachable: false, reason: 'unchecked' } : { ok: true, reason: 'not_configured' },
        };
        let torrents = [];
        let sabQueue = [];
        let sabHistory = [];

        if (configured.qbit) {
            try {
                torrents = await qbit.listTorrents(config);
                clients.qbit = true;
                const incompleteCount = torrents.filter((item) => Number(item?.progress) < 1).length;
                networkHealth.qbit = await qbit.getNetworkHealth(config, { incompleteCount });
                // List already succeeded; don't hold forever if only the health probe failed.
                if (networkHealth.qbit?.reason === 'unreachable') {
                    networkHealth.qbit = {
                        ...networkHealth.qbit,
                        ok: true,
                        reachable: true,
                        reason: 'health_probe_failed',
                    };
                }
            } catch (error) {
                log(`[qc] qBittorrent list failed: ${error.message}`);
                networkHealth.qbit = { ok: false, reachable: false, reason: 'unreachable', error: error.message };
            }
        }
        if (configured.sab) {
            try {
                [sabQueue, sabHistory] = await Promise.all([
                    sab.listQueue(config),
                    sab.listHistory(config),
                ]);
                clients.sab = true;
                networkHealth.sab = await sab.getNetworkHealth(config);
                if (networkHealth.sab?.reason === 'unreachable') {
                    networkHealth.sab = {
                        ...networkHealth.sab,
                        ok: true,
                        reachable: true,
                        reason: 'health_probe_failed',
                    };
                }
            } catch (error) {
                log(`[qc] SABnzbd list failed: ${error.message}`);
                networkHealth.sab = { ok: false, reachable: false, reason: 'unreachable', error: error.message };
            }
        }

        const byId = new Map();
        for (const item of [...torrents, ...sabQueue, ...sabHistory]) {
            if (!item?.id) continue;
            byId.set(`${item.client}:${String(item.id).toLowerCase()}`, item);
        }
        return {
            clientItems: [...byId.values()],
            clients,
            configured,
            networkHealth,
            torrents,
            sabQueue,
            sabHistory,
        };
    };

    const matchClient = (arrItem, clientItems) => {
        const downloadId = String(arrItem?.downloadId || '').toLowerCase();
        if (!downloadId) return null;
        return clientItems.find((item) => {
            const id = String(item.id || '').toLowerCase();
            const hash = String(item.hash || '').toLowerCase();
            return id === downloadId || hash === downloadId;
        }) || null;
    };

    const loadRecentAudit = async () => {
        if (typeof loadAudit !== 'function') return [];
        try {
            const audit = await loadAudit();
            return Array.isArray(audit?.entries) ? audit.entries : [];
        } catch {
            return [];
        }
    };

    const collectSnapshot = async (config) => {
        const thresholds = thresholdsFromConfig(config);
        const now = Date.now();
        const prefs = await loadPrefs();
        const auditEntries = await loadRecentAudit();
        const [arrItems, clientBundle] = await Promise.all([
            fetchArrQueues(config),
            fetchClientItems(config),
        ]);
        const { clientItems, clients, configured, networkHealth } = clientBundle;
        const arrDownloadIds = arrItems.map((item) => item.downloadId).filter(Boolean);
        const safetyContext = {
            clients,
            clientItems,
            networkHealth: networkHealth || {},
            qbitConfigured: !!configured?.qbit,
            sabConfigured: !!configured?.sab,
        };

        const duplicateKeys = new Set(
            findDuplicates(arrItems).map((item) => String(item.arrQueueId ?? item.id)),
        );

        const items = arrItems.map((arrItem) => {
            const clientItem = matchClient(arrItem, clientItems);
            let reason = duplicateKeys.has(String(arrItem.arrQueueId ?? arrItem.id))
                ? QC_REASONS.duplicate
                : classifyQueueItem({ arrItem, clientItem, now, thresholds });
            const key = itemKey({
                client: clientItem?.client,
                id: clientItem?.id,
                arrType: arrItem.arrType,
                arrInstanceId: arrItem.arrInstanceId,
                arrQueueId: arrItem.arrQueueId,
                downloadId: arrItem.downloadId,
            }) || `arr:${arrItem.arrType}:${arrItem.arrInstanceId}:${arrItem.arrQueueId}`;
            const upgrade = markUpgradeTag(arrItem, auditEntries);
            const size = Number(clientItem?.size) || Number(arrItem.size) || 0;
            const sizeleft = Number(clientItem?.sizeleft);
            const computedLeft = Number.isFinite(sizeleft)
                ? sizeleft
                : Math.max(0, Number(arrItem.sizeleft) || 0);
            const safetyHold = (() => {
                if (reason === QC_REASONS.failedImport && !isDoomedImportFailure(arrItem)) {
                    return 'genericImport';
                }
                if (reason === QC_REASONS.stalled && !isReasonActionable({ reason, client: clientItem, arrItem }, safetyContext)) {
                    return 'stallOutage';
                }
                return null;
            })();
            return {
                key,
                reason,
                upgrade: !!upgrade,
                title: titleOf(arrItem) || clientItem?.name || 'Unknown',
                arrType: arrItem.arrType,
                arrInstanceId: arrItem.arrInstanceId,
                arrInstanceName: arrItem.arrInstanceName,
                arrQueueId: arrItem.arrQueueId,
                downloadId: arrItem.downloadId || null,
                status: arrItem.status || null,
                trackedDownloadStatus: arrItem.trackedDownloadStatus || null,
                trackedDownloadState: arrItem.trackedDownloadState || null,
                errorMessage: arrItem.errorMessage || null,
                size,
                sizeleft: computedLeft,
                progress: clientItem?.progress ?? (
                    size > 0 ? Math.max(0, Math.min(1, 1 - (computedLeft / size))) : 0
                ),
                client: clientItem || null,
                arrItem,
                snoozed: isSnoozed(prefs, key, now),
                condemned: isCondemned(prefs, key, now),
                seedingProtected: isSeedingProtected(clientItem),
                safetyHold,
                actionable: false,
            };
        });

        for (const item of items) {
            item.actionable = Boolean(
                item.reason
                && !item.snoozed
                && !item.seedingProtected
                && !item.condemned
                && isReasonActionable(item, safetyContext),
            );
        }

        const orphans = findOrphans({ clientItems, arrDownloadIds }).map((orphan) => {
            const key = itemKey(orphan);
            return {
                ...orphan,
                key,
                title: orphan.name || 'Orphan download',
                snoozed: isSnoozed(prefs, key, now),
                condemned: isCondemned(prefs, key, now),
                seedingProtected: isSeedingProtected(orphan),
                safetyHold: null,
                actionable: !isSnoozed(prefs, key, now)
                    && !isSeedingProtected(orphan)
                    && !isCondemned(prefs, key, now),
            };
        });

        const actionableCount = items.filter((item) => item.actionable).length
            + orphans.filter((item) => item.actionable).length;
        const metricsPreview = {
            ...getMetrics(prefs),
            queueItems: items.length,
            orphanCount: orphans.length,
            actionableCount,
            byReason: Object.fromEntries(
                Object.values(QC_REASONS).map((reason) => [
                    reason,
                    items.filter((item) => item.reason === reason).length
                        + orphans.filter((item) => item.reason === reason).length,
                ]),
            ),
        };

        return {
            items,
            orphans,
            metricsPreview,
            clients,
            configured,
            networkHealth,
            thresholds,
            generatedAt: new Date().toISOString(),
        };
    };

    const resolveClientRef = (item) => {
        if (item?.client && typeof item.client === 'object') return item.client;
        if (item?.client === 'qbit' || item?.client === 'sab') return item;
        if (item?.hash || item?.nzo_id) return item;
        return null;
    };

    const researchKeyFor = (item) => (
        mediaGroupKey(item?.arrItem)
        || mediaGroupKey(item)
        || item?.title
        || item?.key
        || ''
    );

    const planAction = (item, prefs, thresholds, now) => {
        const researchKey = researchKeyFor(item);
        const research = Boolean(
            item.reason
            && item.reason !== QC_REASONS.orphan
            && item.reason !== QC_REASONS.duplicate
            && researchKey
            && !isResearchThrottled(prefs, researchKey, now),
        );
        const clientRef = resolveClientRef(item);
        return {
            removeFromArr: Boolean(item.arrQueueId != null && item.arrType),
            blocklist: true,
            skipRedownload: true, // Arr FDH would also search; we re-search once ourselves.
            deleteClient: Boolean(clientRef?.id || clientRef?.hash || clientRef?.nzo_id),
            research,
            researchKey,
            researchThrottleHours: thresholds.researchThrottleHours,
        };
    };

    const dryRunCleanup = async (config) => {
        const snapshot = await collectSnapshot(config);
        const prefs = await loadPrefs();
        const now = Date.now();
        const thresholds = thresholdsFromConfig(config);
        const actionable = [
            ...snapshot.items.filter((item) => item.actionable),
            ...snapshot.orphans.filter((item) => item.actionable),
        ].map((item) => ({
            ...item,
            would: planAction(item, prefs, thresholds, now),
        }));
        return {
            dryRun: true,
            generatedAt: snapshot.generatedAt,
            clients: snapshot.clients,
            metricsPreview: snapshot.metricsPreview,
            items: actionable,
            count: actionable.length,
        };
    };

    const findArrInstance = (config, item) => getReadyArrInstances(config, item.arrType)
        .find((instance) => String(instance.id) === String(item.arrInstanceId));

    const removeFromArr = async (config, item) => {
        if (item.arrQueueId == null || !item.arrType) return false;
        const instance = findArrInstance(config, item);
        if (!instance) throw new Error(`Arr instance not found for ${item.title}`);
        const version = apiVersionFor(item.arrType);
        await request(
            instance,
            `/api/${version}/queue/${encodeURIComponent(item.arrQueueId)}`
                + '?removeFromClient=true&blocklist=true&skipRedownload=true',
            { method: 'DELETE' },
        );
        return true;
    };

    const deleteFromClient = async (config, item) => {
        const client = resolveClientRef(item);
        if (!client) return false;
        if (client.client === 'qbit') {
            const hash = client.hash || client.id;
            if (!hash) return false;
            await qbit.deleteTorrent(config, hash, { deleteFiles: true });
            return true;
        }
        if (client.client === 'sab') {
            const nzoId = client.nzo_id || client.id;
            if (!nzoId) return false;
            await sab.deleteItem(config, nzoId, { deleteFiles: true });
            return true;
        }
        return false;
    };

    const tryResearch = async (config, item, prefs, thresholds) => {
        if (!item.arrType || !['sonarr', 'radarr', 'lidarr'].includes(item.arrType)) return false;
        const researchKey = researchKeyFor(item);
        if (!researchKey || isResearchThrottled(prefs, researchKey)) return false;
        const instance = findArrInstance(config, item);
        if (!instance) return false;
        const arrItem = item.arrItem || {};
        let body = null;
        let commandPath = '/api/v3/command';
        if (item.arrType === 'radarr') {
            const movieId = Number(arrItem.movieId || arrItem.movie?.id);
            if (!movieId) return false;
            body = { name: 'MoviesSearch', movieIds: [movieId] };
        } else if (item.arrType === 'lidarr') {
            commandPath = '/api/v1/command';
            const albumId = Number(arrItem.albumId || arrItem.album?.id);
            if (!albumId) return false;
            body = { name: 'AlbumSearch', albumIds: [albumId] };
        } else {
            const seriesId = Number(arrItem.seriesId || arrItem.series?.id);
            const episodeId = Number(arrItem.episodeId || arrItem.episode?.id);
            if (episodeId) body = { name: 'EpisodeSearch', episodeIds: [episodeId] };
            else if (seriesId) body = { name: 'SeriesSearch', seriesId };
            else return false;
        }
        try {
            await request(instance, commandPath, { method: 'POST', body });
            return true;
        } catch (error) {
            log(`[qc] research failed for ${item.title}: ${error.message}`);
            return false;
        }
    };

    const markCondemned = async (key, now = Date.now()) => {
        if (!key) return;
        await persistPrefsPatch((prefs) => ({
            ...prefs,
            condemned: {
                ...pruneMapByTime(prefs.condemned || {}, now),
                [key]: new Date(now + CONDEMNED_MS).toISOString(),
            },
        }));
    };

    const bumpMetrics = async (reason, bytes, now = Date.now()) => {
        await persistPrefsPatch((prefs) => {
            const metrics = getMetrics(prefs);
            metrics.wastedBytes = Number(metrics.wastedBytes || 0) + Math.max(0, Number(bytes) || 0);
            metrics.killsByReason = { ...(metrics.killsByReason || {}) };
            metrics.killsByReason[reason] = Number(metrics.killsByReason[reason] || 0) + 1;
            metrics.lastCleanupAt = new Date(now).toISOString();
            return { ...prefs, qcMetrics: metrics };
        });
    };

    const setResearchCooldown = async (title, hours, now = Date.now()) => {
        const key = String(title || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() || title;
        if (!key) return;
        await persistPrefsPatch((prefs) => ({
            ...prefs,
            researchCooldowns: {
                ...pruneMapByTime(prefs.researchCooldowns || {}, now),
                [key]: new Date(now + (Math.max(1, hours) * HOUR_MS)).toISOString(),
            },
        }));
    };

    const runCleanup = async (config, { dryRun = false, itemKeys = null } = {}) => {
        if (dryRun) return dryRunCleanup(config);
        const snapshot = await collectSnapshot(config);
        const prefs = await loadPrefs();
        const now = Date.now();
        const thresholds = thresholdsFromConfig(config);
        const selected = itemKeys
            ? new Set((itemKeys || []).map(String))
            : null;

        const candidates = [
            ...snapshot.items.filter((item) => item.actionable),
            ...snapshot.orphans.filter((item) => item.actionable),
        ].filter((item) => (!selected || selected.has(String(item.key))));

        const results = [];
        const researchedThisRun = new Set();
        for (const item of candidates) {
            const plan = planAction(item, prefs, thresholds, now);
            const result = {
                key: item.key,
                title: item.title,
                reason: item.reason,
                success: false,
                plan,
                errors: [],
            };
            try {
                await markCondemned(item.key, now);
                if (plan.removeFromArr) {
                    try {
                        await removeFromArr(config, item);
                        result.removedFromArr = true;
                    } catch (error) {
                        result.errors.push(`arr: ${error.message}`);
                        // Still attempt client delete if Arr remove failed after partial work.
                    }
                }
                if (plan.deleteClient) {
                    try {
                        // Arr delete with removeFromClient may already remove it; ignore missing.
                        await deleteFromClient(config, item);
                        result.deletedClient = true;
                    } catch (error) {
                        // Not fatal if Arr already removed it.
                        result.errors.push(`client: ${error.message}`);
                    }
                }
                if (plan.research) {
                    const rk = String(plan.researchKey || researchKeyFor(item) || '');
                    if (!rk || researchedThisRun.has(rk)) {
                        result.researched = false;
                        result.researchSkipped = rk ? 'already_researched' : 'no_key';
                    } else {
                        const researched = await tryResearch(config, item, prefs, thresholds);
                        result.researched = researched;
                        if (researched) {
                            researchedThisRun.add(rk);
                            await setResearchCooldown(rk, thresholds.researchThrottleHours, now);
                        }
                    }
                }
                const waste = Number(item.sizeleft) > 0 ? Number(item.sizeleft) : Number(item.size) || 0;
                await bumpMetrics(item.reason || 'unknown', waste, now);
                await appendAudit({
                    action: 'qc_cleanup',
                    success: result.errors.length === 0,
                    reason: item.reason,
                    title: item.title,
                    key: item.key,
                    arrType: item.arrType || null,
                    arrInstanceId: item.arrInstanceId || null,
                    wastedBytes: waste,
                    researched: !!result.researched,
                });
                result.success = result.errors.length === 0;
            } catch (error) {
                result.errors.push(error.message);
                result.success = false;
                log(`[qc] cleanup failed for ${item.key}: ${error.message}`);
            }
            results.push(result);
        }

        const summary = {
            dryRun: false,
            generatedAt: new Date().toISOString(),
            count: results.length,
            killed: results.filter((row) => row.success).length,
            failed: results.filter((row) => !row.success).length,
            results,
            metrics: getMetrics(await loadPrefs()),
        };
        await postDigestIfEnabled(config, summary);
        return summary;
    };

    const snoozeItem = async (prefsKey, hours = 24) => {
        const key = String(prefsKey || '');
        if (!key) throw new Error('snooze key required');
        const until = new Date(Date.now() + (Math.max(1, Number(hours) || 24) * HOUR_MS)).toISOString();
        const prefs = await persistPrefsPatch((current) => ({
            ...current,
            downloadSnoozed: {
                ...pruneMapByTime(current.downloadSnoozed || {}),
                [key]: until,
            },
        }));
        await appendAudit({ action: 'qc_snooze', key, until });
        return { key, until, prefs };
    };

    const clearSnooze = async (prefsKey) => {
        const key = String(prefsKey || '');
        if (!key) throw new Error('snooze key required');
        const prefs = await persistPrefsPatch((current) => {
            const downloadSnoozed = { ...(current.downloadSnoozed || {}) };
            delete downloadSnoozed[key];
            return { ...current, downloadSnoozed };
        });
        await appendAudit({ action: 'qc_clear_snooze', key });
        return { key, prefs };
    };

    const getExtensionPolicy = async (config) => {
        const errors = { qbit: null, sab: null };
        const [qbitExt, sabExt] = await Promise.all([
            qbit.isConfigured(config) ? qbit.getBlockedExtensions(config).catch((error) => {
                log(`[qc] qbit extensions read failed: ${error.message}`);
                errors.qbit = error.message || 'Failed to read qBittorrent blacklist';
                return [];
            }) : Promise.resolve([]),
            sab.isConfigured(config) ? sab.getBlockedExtensions(config).catch((error) => {
                log(`[qc] sab extensions read failed: ${error.message}`);
                errors.sab = error.message || 'Failed to read SABnzbd blacklist';
                return [];
            }) : Promise.resolve([]),
        ]);
        const qbitSet = new Set(qbitExt);
        const sabSet = new Set(sabExt);
        const union = [...new Set([...qbitExt, ...sabExt])].sort();
        return {
            qbit: qbitExt,
            sab: sabExt,
            union,
            onlyQbit: qbitExt.filter((ext) => !sabSet.has(ext)),
            onlySab: sabExt.filter((ext) => !qbitSet.has(ext)),
            clients: {
                qbit: qbit.isConfigured(config),
                sab: sab.isConfigured(config),
            },
            errors,
        };
    };

    const applyExtensionPolicy = async (config, extensions = []) => {
        const normalized = [...new Set(
            (Array.isArray(extensions) ? extensions : [])
                .map((entry) => String(entry || '').trim().replace(/^\*\./, '').replace(/^\./, '').toLowerCase())
                .filter(Boolean),
        )].sort();
        const results = { extensions: normalized, qbit: null, sab: null };
        if (qbit.isConfigured(config)) {
            results.qbit = await qbit.setBlockedExtensions(config, normalized);
        }
        if (sab.isConfigured(config)) {
            results.sab = await sab.setBlockedExtensions(config, normalized);
        }
        await appendAudit({
            action: 'qc_extension_policy',
            title: `Blocked extensions (${normalized.length})`,
            extensions: normalized,
            success: true,
        });
        return results;
    };

    const postDigestIfEnabled = async (config, results) => {
        if (!config?.qcDiscordDigestEnabled) return false;
        const notifier = typeof getDiscordNotifier === 'function'
            ? getDiscordNotifier()
            : getDiscordNotifier;
        if (!notifier?.postEvent) return false;
        const killed = Number(results?.killed ?? results?.results?.filter((row) => row.success).length ?? 0);
        const failed = Number(results?.failed ?? 0);
        const count = Number(results?.count ?? 0);
        if (count <= 0 && killed <= 0) return false;
        const byReason = {};
        for (const row of (results?.results || [])) {
            if (!row?.reason) continue;
            byReason[row.reason] = Number(byReason[row.reason] || 0) + 1;
        }
        const reasonText = Object.entries(byReason)
            .map(([reason, n]) => `${reason}: ${n}`)
            .join(', ') || 'none';
        try {
            await notifier.postEvent(config, {
                title: 'Quality Control cleanup',
                description: `Removed **${killed}** stalled/failed download(s)`
                    + (failed ? ` (${failed} failed)` : '')
                    + '.',
                fields: [
                    { name: 'Reasons', value: reasonText.slice(0, 1024) || '—', inline: false },
                    {
                        name: 'Wasted bytes (session)',
                        value: String(results?.metrics?.wastedBytes ?? '—'),
                        inline: true,
                    },
                ],
                color: failed ? 0xf59e0b : 0x22c55e,
            });
            return true;
        } catch (error) {
            log(`[qc] discord digest failed: ${error.message}`);
            return false;
        }
    };

    const startCleanupJob = (getConfig) => {
        if (cleanupTimer) return;
        const run = async () => {
            try {
                const config = await getConfig();
                if (!config?.upgraderEnabled || !config?.qcCleanupAutomationEnabled) return;
                const result = await runCleanup(config, { dryRun: false });
                if (result.killed) log(`[qc] cleanup removed ${result.killed} item(s)`);
            } catch (error) {
                log(`[qc] cleanup job failed: ${error.message}`);
            }
        };
        setTimeout(() => { void run(); }, 120 * 1000);
        cleanupTimer = setInterval(run, CLEANUP_INTERVAL_MS);
    };

    return {
        collectSnapshot,
        dryRunCleanup,
        runCleanup,
        snoozeItem,
        clearSnooze,
        getMetrics,
        getExtensionPolicy,
        applyExtensionPolicy,
        startCleanupJob,
        postDigestIfEnabled,
        isCondemned: (prefs, key, now) => isCondemned(prefs, key, now),
        markCondemned,
        qbit,
        sab,
    };
};
