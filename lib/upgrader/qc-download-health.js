import { getReadyArrInstances } from '../media-stack/arr-instances.js';
import { createQbitClient } from './download-clients/qbittorrent.js';
import { createSabClient } from './download-clients/sabnzbd.js';
import {
    isJunkByBlockedExtensions,
    resolveBlockedExtensions,
} from './qc-blocked-extensions.js';
import {
    QC_CLIENT_RECOMMENDED,
    summarizeQbitAlignment,
    summarizeSabAlignment,
} from './qc-client-optimize.js';
import {
    QC_REASONS,
    classifyQueueItem,
    arrItemMatchesClientRelease,
    clientDownloadIds,
    downloadIdsOverlap,
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
    nextStrikeState,
    normalizeReleaseToken,
    pruneDownloadStrikes,
    strikeGapMsForReason,
    thresholdsFromConfig,
    downloadAgeMs,
    clientItemAgeMs,
} from './qc-rules.js';
import { classifyUpgraderLibrary } from './upgrader-library.js';
import { summarizeClientQueues } from './qc-client-status.js';

const CONDEMNED_MS = 2 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
/** How often the background job rebuilds the Hunt download board. */
const SNAPSHOT_REFRESH_MS = 30 * 1000;
/** Serve a stale board this long while a refresh is in flight. */
const SNAPSHOT_STALE_MS = 5 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const BLOCKED_EXT_PROBE_CONCURRENCY = 4;

const maxStrikesForReason = (reason, defaultMax) => (
    reason === QC_REASONS.blockedExtension || reason === QC_REASONS.qualityDowngrade
        ? 1
        : Math.max(1, Number(defaultMax) || 3)
);

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

/** Human media title (movie/series), not the release/NZB string. */
const mediaTitleOf = (arrItem) => {
    const movie = arrItem?.movie?.title || '';
    if (movie) {
        const year = arrItem?.movie?.year;
        return year ? `${movie} (${year})` : movie;
    }
    return arrItem?.series?.title
        || arrItem?.album?.title
        || arrItem?.artist?.artistName
        || '';
};

const episodeLabelOf = (arrItem) => {
    const ep = arrItem?.episode;
    if (!ep || ep.seasonNumber == null || ep.episodeNumber == null) return null;
    const sn = String(ep.seasonNumber).padStart(2, '0');
    const en = String(ep.episodeNumber).padStart(2, '0');
    return `S${sn}E${en}`;
};

/** Release / client file name shown under the media title. */
const fileNameOf = (arrItem, clientItem) => (
    arrItem?.title
    || clientItem?.name
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
                    let page = 1;
                    let totalRecords = Number.POSITIVE_INFINITY;
                    while ((page - 1) * 200 < totalRecords && page <= 25) {
                        const payload = await request(
                            instance,
                            `/api/${version}/queue?page=${page}&pageSize=200&${queueQueryFor(type)}`,
                        );
                        const records = recordsOf(payload);
                        totalRecords = Number(payload?.totalRecords);
                        if (!Number.isFinite(totalRecords)) {
                            totalRecords = ((page - 1) * 200) + records.length;
                        }
                        for (const record of records) {
                            const library = classifyUpgraderLibrary(instance, record);
                            items.push({
                                ...record,
                                arrType: type,
                                arrInstanceId: instance.id,
                                arrInstanceName: instance.name,
                                arrQueueId: record.id,
                                libraryKey: library.libraryKey,
                                libraryName: library.libraryName,
                            });
                        }
                        if (records.length < 200) break;
                        page += 1;
                    }
                } catch (error) {
                    log(`[qc] ${instance.name || type} queue failed: ${error.message}`);
                }
            }
        }
        return items;
    };

    const protectedReleaseTokensFromAudit = (auditEntries = [], now = Date.now()) => {
        const cutoff = now - (6 * HOUR_MS);
        const tokens = [];
        for (const entry of auditEntries || []) {
            if (!entry || entry.success === false) continue;
            if (!['upgrade', 'missing_search', 'grabbed'].includes(String(entry.action || ''))) continue;
            const at = Date.parse(entry.at || '');
            if (Number.isFinite(at) && at < cutoff) continue;
            const token = normalizeReleaseToken(entry.releaseTitle || entry.title || '');
            if (token) tokens.push(token);
        }
        return tokens;
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
        const arrIds = clientDownloadIds({ downloadId: arrItem?.downloadId });
        return (clientItems || []).find((item) => {
            if (arrIds.length && downloadIdsOverlap(arrIds, clientDownloadIds(item))) return true;
            if (arrItemMatchesClientRelease(arrItem, item)) return true;
            return false;
        }) || null;
    };

    const loadBlockedExtensions = async (config) => {
        const live = [];
        if (qbit.isConfigured(config)) {
            try {
                live.push(await qbit.getBlockedExtensions(config));
            } catch (error) {
                log(`[qc] qbit blocked extensions read failed: ${error.message}`);
            }
        }
        if (sab.isConfigured(config)) {
            try {
                live.push(await sab.getBlockedExtensions(config));
            } catch (error) {
                log(`[qc] sab blocked extensions read failed: ${error.message}`);
            }
        }
        return resolveBlockedExtensions(config, live);
    };

    const probeClientBlockedExtensionJunk = async (config, clientItem, blockedExtensions) => {
        if (!clientItem || !blockedExtensions.length) return false;
        const state = String(clientItem.state || '').toLowerCase();
        // Magnets without metadata have no file list yet.
        if (clientItem.client === 'qbit' && (state === 'metadl' || state === 'metaDL'.toLowerCase())) {
            return isJunkByBlockedExtensions({
                names: [clientItem.name].filter(Boolean),
                blockedExtensions,
            });
        }

        const names = [];
        if (clientItem.name) names.push(String(clientItem.name));
        try {
            if (clientItem.client === 'qbit') {
                const files = await qbit.listTorrentFiles(config, clientItem.hash || clientItem.id);
                names.push(...files);
            } else if (clientItem.client === 'sab' && clientItem.source !== 'history') {
                const files = await sab.listJobFiles(config, clientItem.id);
                names.push(...files);
            }
        } catch (error) {
            log(`[qc] blocked-extension probe failed (${clientItem.client}:${clientItem.id}): ${error.message}`);
        }
        return isJunkByBlockedExtensions({ names, blockedExtensions });
    };

    const mapPool = async (items, concurrency, worker) => {
        const list = Array.isArray(items) ? items : [];
        const results = new Array(list.length);
        let next = 0;
        const runners = Array.from({ length: Math.max(1, Number(concurrency) || 1) }, async () => {
            while (next < list.length) {
                const index = next;
                next += 1;
                results[index] = await worker(list[index], index);
            }
        });
        await Promise.all(runners);
        return results;
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

    const buildSnapshot = async (config) => {
        const thresholds = thresholdsFromConfig(config);
        const now = Date.now();
        const prefs = await loadPrefs();
        const auditEntries = await loadRecentAudit();
        const [arrItems, clientBundle, blockedExtensions] = await Promise.all([
            fetchArrQueues(config),
            fetchClientItems(config),
            loadBlockedExtensions(config),
        ]);
        const { clientItems, clients, configured, networkHealth, torrents, sabQueue, sabHistory } = clientBundle;
        const arrDownloadIds = arrItems.map((item) => item.downloadId).filter(Boolean);
        const safetyContext = {
            clients,
            clientItems,
            arrItems,
            networkHealth: networkHealth || {},
            qbitConfigured: !!configured?.qbit,
            sabConfigured: !!configured?.sab,
        };

        const duplicateKeys = new Set(
            findDuplicates(arrItems).map((item) => String(item.arrQueueId ?? item.id)),
        );

        const matchedClients = arrItems.map((arrItem) => matchClient(arrItem, clientItems));
        const junkFlags = blockedExtensions.length
            ? await mapPool(
                matchedClients,
                BLOCKED_EXT_PROBE_CONCURRENCY,
                (clientItem) => probeClientBlockedExtensionJunk(config, clientItem, blockedExtensions),
            )
            : matchedClients.map(() => false);

        const items = arrItems.map((arrItem, index) => {
            const clientItem = matchedClients[index];
            let reason = duplicateKeys.has(String(arrItem.arrQueueId ?? arrItem.id))
                ? QC_REASONS.duplicate
                : classifyQueueItem({
                    arrItem,
                    clientItem,
                    now,
                    thresholds,
                    peerArrItems: arrItems,
                });
            if (junkFlags[index]) {
                reason = QC_REASONS.blockedExtension;
            }
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
                if (reason === QC_REASONS.completedNotImporting
                    && !isReasonActionable({ reason, client: clientItem, arrItem }, safetyContext)) {
                    return 'importQueueBusy';
                }
                if (reason === QC_REASONS.stalled && !isReasonActionable({ reason, client: clientItem, arrItem }, safetyContext)) {
                    return 'stallOutage';
                }
                if (reason === QC_REASONS.slowDownload && !isReasonActionable({ reason, client: clientItem, arrItem }, safetyContext)) {
                    return 'slowDownloadOutage';
                }
                if (reason === QC_REASONS.metaDL && !isReasonActionable({ reason, client: clientItem, arrItem }, safetyContext)) {
                    return 'metaDlOutage';
                }
                return null;
            })();
            const mediaTitle = mediaTitleOf(arrItem);
            const fileName = fileNameOf(arrItem, clientItem);
            const episodeLabel = episodeLabelOf(arrItem);
            return {
                key,
                reason,
                upgrade: !!upgrade,
                title: mediaTitle || fileName || clientItem?.name || 'Unknown',
                mediaTitle: mediaTitle || null,
                fileName: fileName || clientItem?.name || null,
                episodeLabel,
                arrType: arrItem.arrType,
                arrInstanceId: arrItem.arrInstanceId,
                arrInstanceName: arrItem.arrInstanceName,
                libraryKey: arrItem.libraryKey || null,
                libraryName: arrItem.libraryName || arrItem.arrInstanceName || null,
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
                seeding: isSeedingProtected(clientItem),
                safetyHold,
                ageMs: downloadAgeMs({ arrItem, clientItem, now }) || null,
                actionable: false,
            };
        });

        const maxStrikes = Math.max(1, Number(thresholds.maxStrikes) || 3);
        const strikesMap = prefs.downloadStrikes || {};

        const attachStrikes = (item, strikeEligible) => {
            const existing = strikesMap[item.key] || null;
            const itemMaxStrikes = maxStrikesForReason(item.reason, maxStrikes);
            const state = nextStrikeState({
                existing,
                reason: strikeEligible ? item.reason : null,
                now,
                gapMs: strikeGapMsForReason(item.reason, thresholds, item),
                maxStrikes: itemMaxStrikes,
                award: false,
            });
            item.strikeEligible = strikeEligible;
            item.strikes = state.count;
            item.maxStrikes = itemMaxStrikes;
            item.killReady = strikeEligible && state.killReady;
            // actionable = ready for automatic kill; manual select can still force earlier.
            item.actionable = Boolean(item.killReady);
            return item;
        };

        for (const item of items) {
            // Seeding/upload state is not a hold — only active Arr imports are.
            const strikeEligible = Boolean(
                item.reason
                && !item.snoozed
                && !item.condemned
                && isReasonActionable(item, safetyContext),
            );
            attachStrikes(item, strikeEligible);
        }

        const orphanRows = findOrphans({
            clientItems,
            arrDownloadIds,
            arrItems,
            now,
            minAgeMs: Math.max(0, Number(thresholds.orphanGraceMinutes) || 15) * MINUTE_MS,
            protectedReleaseTokens: protectedReleaseTokensFromAudit(auditEntries, now),
        });
        const orphanJunkFlags = blockedExtensions.length
            ? await mapPool(
                orphanRows,
                BLOCKED_EXT_PROBE_CONCURRENCY,
                (orphan) => probeClientBlockedExtensionJunk(config, orphan, blockedExtensions),
            )
            : orphanRows.map(() => false);

        const orphans = orphanRows.map((orphan, index) => {
            const key = itemKey(orphan);
            const withinGrace = orphan.withinGrace === true;
            const reason = orphanJunkFlags[index] ? QC_REASONS.blockedExtension : orphan.reason;
            const base = {
                ...orphan,
                key,
                reason,
                title: orphan.name || 'Orphan download',
                mediaTitle: null,
                fileName: orphan.name || null,
                episodeLabel: null,
                snoozed: isSnoozed(prefs, key, now),
                condemned: isCondemned(prefs, key, now),
                seeding: isSeedingProtected(orphan),
                safetyHold: withinGrace && reason !== QC_REASONS.blockedExtension ? 'orphanGrace' : null,
                ageMs: clientItemAgeMs(orphan, now),
            };
            const strikeEligible = (reason === QC_REASONS.blockedExtension || !withinGrace)
                && !base.snoozed
                && !base.condemned;
            return attachStrikes(base, strikeEligible);
        });

        const killReadyCount = items.filter((item) => item.actionable).length
            + orphans.filter((item) => item.actionable).length;
        const strikeEligibleCount = items.filter((item) => item.strikeEligible).length
            + orphans.filter((item) => item.strikeEligible).length;
        const metricsPreview = {
            ...getMetrics(prefs),
            queueItems: items.length,
            orphanCount: orphans.length,
            actionableCount: killReadyCount,
            strikeEligibleCount,
            maxStrikes,
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
            clientQueues: summarizeClientQueues({
                torrents,
                sabQueue,
                sabHistory,
                items,
                orphans,
                networkHealth,
            }),
            thresholds,
            generatedAt: new Date().toISOString(),
        };
    };

    /** In-memory board cache — GET serves instantly; background job + force keep it warm. */
    let snapshotCache = null; // { data, fetchedAt, inFlight }
    let snapshotTimer = null;

    const rememberSnapshot = (data) => {
        snapshotCache = {
            data,
            fetchedAt: Date.now(),
            inFlight: null,
        };
        return data;
    };

    const refreshSnapshot = async (config, { force = false } = {}) => {
        if (!force && snapshotCache?.inFlight) return snapshotCache.inFlight;
        const inFlight = buildSnapshot(config)
            .then((data) => rememberSnapshot(data))
            .catch((error) => {
                if (snapshotCache?.inFlight === inFlight) snapshotCache.inFlight = null;
                throw error;
            });
        snapshotCache = {
            data: snapshotCache?.data,
            fetchedAt: snapshotCache?.fetchedAt || 0,
            inFlight,
        };
        return inFlight;
    };

    const getSnapshot = async (config, { force = false } = {}) => {
        const now = Date.now();
        const age = snapshotCache?.data ? now - Number(snapshotCache.fetchedAt || 0) : Number.POSITIVE_INFINITY;
        if (!force && snapshotCache?.data && age < SNAPSHOT_REFRESH_MS) {
            return {
                ...snapshotCache.data,
                cache: { hit: true, stale: false, ageMs: age },
            };
        }
        if (!force && snapshotCache?.data && age < SNAPSHOT_STALE_MS) {
            if (!snapshotCache.inFlight) void refreshSnapshot(config).catch((error) => {
                log(`[qc] snapshot refresh failed: ${error.message}`);
            });
            return {
                ...snapshotCache.data,
                cache: { hit: true, stale: true, ageMs: age },
            };
        }
        const data = await refreshSnapshot(config, { force });
        return {
            ...data,
            cache: { hit: false, stale: false, ageMs: 0 },
        };
    };

    /** Prefer cached board; use force for cleanup / manual refresh. */
    const collectSnapshot = (config, options = {}) => getSnapshot(config, options);

    const invalidateSnapshotCache = () => {
        if (!snapshotCache) return;
        snapshotCache = {
            ...snapshotCache,
            fetchedAt: 0,
        };
    };

    const startSnapshotJob = (getConfig) => {
        if (snapshotTimer) return;
        const run = async () => {
            try {
                const config = await getConfig();
                if (!config?.upgraderEnabled) return;
                await refreshSnapshot(config);
            } catch (error) {
                log(`[qc] snapshot job failed: ${error.message}`);
            }
        };
        setTimeout(() => { void run(); }, 20 * 1000);
        snapshotTimer = setInterval(run, SNAPSHOT_REFRESH_MS);
        snapshotTimer.unref?.();
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
        const snapshot = await collectSnapshot(config, { force: true });
        const prefs = await loadPrefs();
        const now = Date.now();
        const thresholds = thresholdsFromConfig(config);
        const maxStrikes = Math.max(1, Number(thresholds.maxStrikes) || 3);
        const actionable = [
            ...snapshot.items.filter((item) => item.strikeEligible),
            ...snapshot.orphans.filter((item) => item.strikeEligible),
        ].map((item) => {
            const projected = nextStrikeState({
                existing: prefs.downloadStrikes?.[item.key] || null,
                reason: item.reason,
                now,
                gapMs: strikeGapMsForReason(item.reason, thresholds, item),
                maxStrikes,
                award: true,
            });
            return {
                ...item,
                strikes: projected.count,
                maxStrikes,
                killReady: projected.killReady,
                actionable: projected.killReady,
                would: {
                    ...planAction(item, prefs, thresholds, now),
                    awardStrike: projected.awarded,
                    strikes: projected.count,
                    kill: projected.killReady,
                },
            };
        });
        return {
            dryRun: true,
            generatedAt: snapshot.generatedAt,
            clients: snapshot.clients,
            metricsPreview: snapshot.metricsPreview,
            items: actionable,
            count: actionable.filter((item) => item.killReady).length,
            strikeCount: actionable.length,
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

    const persistStrike = async (key, state, now = Date.now()) => {
        if (!key) return;
        await persistPrefsPatch((prefs) => {
            const downloadStrikes = { ...(prefs.downloadStrikes || {}) };
            if (!state?.reason || !state.count) {
                delete downloadStrikes[key];
            } else {
                downloadStrikes[key] = {
                    reason: state.reason,
                    count: state.count,
                    lastStrikeAt: state.lastStrikeAt || new Date(now).toISOString(),
                };
            }
            return { ...prefs, downloadStrikes };
        });
    };

    const clearStrike = async (key) => {
        if (!key) return;
        await persistPrefsPatch((prefs) => {
            const downloadStrikes = { ...(prefs.downloadStrikes || {}) };
            delete downloadStrikes[key];
            return { ...prefs, downloadStrikes };
        });
    };

    const runCleanup = async (config, { dryRun = false, itemKeys = null } = {}) => {
        if (dryRun) return dryRunCleanup(config);
        const snapshot = await collectSnapshot(config, { force: true });
        const prefs = await loadPrefs();
        const now = Date.now();
        const thresholds = thresholdsFromConfig(config);
        const maxStrikes = Math.max(1, Number(thresholds.maxStrikes) || 3);
        const selected = itemKeys
            ? new Set((itemKeys || []).map(String))
            : null;
        const forceKill = Boolean(selected);

        const candidates = [
            ...snapshot.items.filter((item) => item.strikeEligible || (selected && selected.has(String(item.key)))),
            ...snapshot.orphans.filter((item) => item.strikeEligible || (selected && selected.has(String(item.key)))),
        ].filter((item) => (!selected || selected.has(String(item.key))));

        // Drop strike rows for downloads that left the queue.
        const activeKeys = [
            ...snapshot.items.map((item) => item.key),
            ...snapshot.orphans.map((item) => item.key),
        ].filter(Boolean);
        await persistPrefsPatch((current) => ({
            ...current,
            downloadStrikes: pruneDownloadStrikes(current.downloadStrikes || {}, activeKeys, now),
        }));

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
                let strikeState = nextStrikeState({
                    existing: (await loadPrefs()).downloadStrikes?.[item.key] || null,
                    reason: item.reason,
                    now,
                    gapMs: strikeGapMsForReason(item.reason, thresholds, item),
                    maxStrikes: maxStrikesForReason(item.reason, maxStrikes),
                    award: !forceKill,
                });
                if (!forceKill) {
                    if (strikeState.awarded) {
                        await persistStrike(item.key, strikeState, now);
                        await appendAudit({
                            action: 'qc_strike',
                            success: true,
                            reason: item.reason,
                            title: item.title,
                            key: item.key,
                            strikes: strikeState.count,
                            maxStrikes: maxStrikesForReason(item.reason, maxStrikes),
                        });
                    }
                    result.strikes = strikeState.count;
                    result.maxStrikes = maxStrikesForReason(item.reason, maxStrikes);
                    if (!strikeState.killReady) {
                        result.success = true;
                        result.struck = true;
                        result.killed = false;
                        results.push(result);
                        continue;
                    }
                } else {
                    result.strikes = Math.max(strikeState.count, maxStrikesForReason(item.reason, maxStrikes));
                    result.maxStrikes = maxStrikesForReason(item.reason, maxStrikes);
                    result.forced = true;
                }

                await markCondemned(item.key, now);
                await clearStrike(item.key);
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
                    strikes: result.strikes || maxStrikes,
                    maxStrikes,
                });
                result.success = result.errors.length === 0;
                result.killed = result.success;
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
            struck: results.filter((row) => row.struck && !row.killed).length,
            killed: results.filter((row) => row.killed).length,
            failed: results.filter((row) => !row.success).length,
            results,
            metrics: getMetrics(await loadPrefs()),
        };
        await postDigestIfEnabled(config, summary);
        invalidateSnapshotCache();
        void refreshSnapshot(config).catch((error) => {
            log(`[qc] post-cleanup snapshot refresh failed: ${error.message}`);
        });
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
        invalidateSnapshotCache();
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
        invalidateSnapshotCache();
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

    const getClientAlignment = async (config) => {
        const errors = { qbit: null, sab: null };
        let sabSummary = null;
        let qbitSummary = null;
        if (sab.isConfigured(config)) {
            try {
                const current = await sab.getDupeSettings(config);
                sabSummary = summarizeSabAlignment(current || {});
            } catch (error) {
                errors.sab = error.message || 'Failed to read SABnzbd settings';
                sabSummary = { configured: true, aligned: false, error: errors.sab, rows: [], recommended: QC_CLIENT_RECOMMENDED.sab };
            }
        } else {
            sabSummary = { configured: false, aligned: true, rows: [], recommended: QC_CLIENT_RECOMMENDED.sab };
        }
        if (qbit.isConfigured(config)) {
            try {
                const prefs = await qbit.getAppPreferences(config);
                qbitSummary = summarizeQbitAlignment(prefs || {});
            } catch (error) {
                errors.qbit = error.message || 'Failed to read qBittorrent preferences';
                qbitSummary = { configured: true, aligned: false, error: errors.qbit, rows: [], recommended: QC_CLIENT_RECOMMENDED.qbit };
            }
        } else {
            qbitSummary = { configured: false, aligned: true, rows: [], recommended: QC_CLIENT_RECOMMENDED.qbit };
        }
        return {
            recommended: QC_CLIENT_RECOMMENDED,
            sab: sabSummary,
            qbit: qbitSummary,
            aligned: Boolean(sabSummary?.aligned && qbitSummary?.aligned),
            clients: {
                qbit: qbit.isConfigured(config),
                sab: sab.isConfigured(config),
            },
            errors,
        };
    };

    const applyClientAlignment = async (config) => {
        const before = await getClientAlignment(config);
        const results = { sab: null, qbit: null, errors: { sab: null, qbit: null } };
        if (sab.isConfigured(config)) {
            try {
                results.sab = await sab.applyQcAlignment(config, QC_CLIENT_RECOMMENDED.sab);
            } catch (error) {
                results.errors.sab = error.message || 'SABnzbd apply failed';
            }
        }
        if (qbit.isConfigured(config)) {
            try {
                results.qbit = await qbit.applyQcAlignment(config, QC_CLIENT_RECOMMENDED.qbit);
            } catch (error) {
                results.errors.qbit = error.message || 'qBittorrent apply failed';
            }
        }
        const after = await getClientAlignment(config);
        await appendAudit({
            action: 'qc_client_alignment',
            title: 'Applied recommended SAB/qBit settings',
            success: !results.errors.sab && !results.errors.qbit,
            beforeAligned: before.aligned,
            afterAligned: after.aligned,
            sab: after.sab?.current || null,
            qbit: after.qbit?.current || null,
            errors: results.errors,
        });
        return { ...after, applied: results };
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
            const post = notifier.postAdminEvent || notifier.postEvent;
            await post(config, {
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
        getSnapshot,
        refreshSnapshot,
        invalidateSnapshotCache,
        dryRunCleanup,
        runCleanup,
        snoozeItem,
        clearSnooze,
        getMetrics,
        getExtensionPolicy,
        applyExtensionPolicy,
        getClientAlignment,
        applyClientAlignment,
        startCleanupJob,
        startSnapshotJob,
        postDigestIfEnabled,
        isCondemned: (prefs, key, now) => isCondemned(prefs, key, now),
        markCondemned,
        qbit,
        sab,
    };
};
