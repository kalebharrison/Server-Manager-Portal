import {
    isFakeRemuxContainer,
    parseResolutionTier,
    resolutionRank,
} from './upgrader-quality.js';

export const QC_REASONS = Object.freeze({
    metaDL: 'metaDL',
    stalled: 'stalled',
    slowDownload: 'slowDownload',
    failedImport: 'failedImport',
    completedNotImporting: 'completedNotImporting',
    duplicate: 'duplicate',
    orphan: 'orphan',
    blockedExtension: 'blockedExtension',
    qualityDowngrade: 'qualityDowngrade',
    fakeRemux: 'fakeRemux',
});

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

const asNumber = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
};

export const thresholdsFromConfig = (config = {}) => ({
    // Per-strike windows (default maxStrikes=3 ⇒ metaDL ~1h, stalled 6h, CNI ~4.5h+, orphan ~45m).
    metaDlMinutes: asNumber(config.qcMetaDlMinutes, 20),
    stalledHours: asNumber(config.qcStalledHours, 2),
    // qBit crawling below this floor (after min age) earns slowDownload strikes.
    slowDownloadFloorKbps: asNumber(config.qcSlowDownloadFloorKbps, 100),
    slowDownloadMinAgeHours: asNumber(config.qcSlowDownloadMinAgeHours, 6),
    // Large remuxes often wait in importPending while Arr serializes copies — keep this generous.
    completedNotImportingMinutes: asNumber(config.qcCompletedNotImportingMinutes, 90),
    researchThrottleHours: asNumber(config.qcResearchThrottleHours, 24),
    snoozeDefaultHours: asNumber(config.qcSnoozeDefaultHours, 24),
    // Fresh hunt grabs often appear in the client before Arr stamps downloadId.
    orphanGraceMinutes: asNumber(config.qcOrphanGraceMinutes, 15),
    maxStrikes: Math.max(1, asNumber(config.qcMaxStrikes, 3) || 3),
});

/** Extra CNI minutes for large downloads (2 min/GB, capped) so remuxes get a real import window. */
export const cniSizeBonusMinutes = ({ arrItem = null, clientItem = null } = {}) => {
    const size = Number(clientItem?.size) || Number(arrItem?.size) || 0;
    if (!(size > 0)) return 0;
    const gb = size / (1024 ** 3);
    return Math.min(120, Math.max(0, Math.floor(gb) * 2));
};

/** Season packs take longer for Arr to unpack/import episode-by-episode. */
export const isLikelySeasonPack = ({ arrItem = null, clientItem = null } = {}) => {
    if (arrItem?.fullSeason === true) return true;
    const title = String(arrItem?.title || clientItem?.name || '');
    if (!title) return false;
    if (/\bS\d{1,2}(?:COMPLETE|PACK)\b/i.test(title)) return true;
    if (/\bS\d{1,2}E\d{1,2}[-.]E?\d{1,2}\b/i.test(title)) return true;
    // e.g. Pose.S02.1080p… (season folder, no single episode marker)
    if (/\bS\d{1,2}[.\-_ ]/i.test(title) && !/\bS\d{1,2}E\d{1,2}\b/i.test(title)) return true;
    return false;
};

export const cniSeasonPackBonusMinutes = ({ arrItem = null, clientItem = null } = {}) => (
    isLikelySeasonPack({ arrItem, clientItem }) ? 120 : 0
);

export const cniThresholdMinutes = ({
    thresholds = thresholdsFromConfig(),
    arrItem = null,
    clientItem = null,
} = {}) => {
    const base = Math.max(1, Number(thresholds.completedNotImportingMinutes) || 90);
    return base
        + cniSizeBonusMinutes({ arrItem, clientItem })
        + cniSeasonPackBonusMinutes({ arrItem, clientItem });
};

/** Inter-strike gap for a QC reason (ms). */
export const strikeGapMsForReason = (reason, thresholds = thresholdsFromConfig(), item = null) => {
    if (reason === QC_REASONS.metaDL) {
        return Math.max(MINUTE_MS, (Number(thresholds.metaDlMinutes) || 10) * MINUTE_MS);
    }
    if (reason === QC_REASONS.stalled || reason === QC_REASONS.slowDownload) {
        // Slow uses the same inter-strike gap as stalled (sustained below-floor across cycles).
        return Math.max(MINUTE_MS, (Number(thresholds.stalledHours) || 2) * HOUR_MS);
    }
    if (reason === QC_REASONS.completedNotImporting) {
        const minutes = cniThresholdMinutes({
            thresholds,
            arrItem: item?.arrItem || item,
            clientItem: item?.client || item?.clientItem || null,
        });
        return Math.max(MINUTE_MS, minutes * MINUTE_MS);
    }
    if (reason === QC_REASONS.orphan) {
        return Math.max(MINUTE_MS, (Number(thresholds.orphanGraceMinutes) || 15) * MINUTE_MS);
    }
    if (
        reason === QC_REASONS.blockedExtension
        || reason === QC_REASONS.qualityDowngrade
        || reason === QC_REASONS.fakeRemux
    ) {
        // Immediate: first cleanup cycle awards strike 1 and kills (maxStrikes forced to 1).
        return MINUTE_MS;
    }
    // duplicate / doomed import: reuse orphan gap so they are not instant one-shots
    return Math.max(MINUTE_MS, (Number(thresholds.orphanGraceMinutes) || 15) * MINUTE_MS);
};

/**
 * Pure strike counter. First strike awards as soon as the reason is eligible
 * (classify/grace already waited one gap); later strikes need another full gap.
 */
export const nextStrikeState = ({
    existing = null,
    reason = null,
    now = Date.now(),
    gapMs = 15 * MINUTE_MS,
    maxStrikes = 3,
    award = false,
} = {}) => {
    const max = Math.max(1, Number(maxStrikes) || 3);
    if (!reason) {
        return {
            count: 0,
            reason: null,
            lastStrikeAt: null,
            awarded: false,
            killReady: false,
            cleared: Boolean(existing?.count),
        };
    }
    const sameReason = existing && String(existing.reason || '') === String(reason);
    let count = sameReason ? Math.max(0, Number(existing.count) || 0) : 0;
    let lastStrikeAt = sameReason && existing?.lastStrikeAt
        ? Date.parse(existing.lastStrikeAt)
        : NaN;
    let awarded = false;
    if (award && count < max) {
        const due = count === 0
            || !Number.isFinite(lastStrikeAt)
            || (now - lastStrikeAt) >= Math.max(MINUTE_MS, Number(gapMs) || MINUTE_MS);
        if (due) {
            count += 1;
            lastStrikeAt = now;
            awarded = true;
        }
    }
    return {
        count,
        reason,
        lastStrikeAt: Number.isFinite(lastStrikeAt) ? new Date(lastStrikeAt).toISOString() : null,
        awarded,
        killReady: count >= max,
        cleared: false,
    };
};

export const pruneDownloadStrikes = (strikes = {}, activeKeys = [], now = Date.now()) => {
    const active = new Set((activeKeys || []).map(String));
    const next = {};
    const maxAge = 14 * 24 * HOUR_MS;
    for (const [key, value] of Object.entries(strikes || {})) {
        if (!active.has(String(key))) continue;
        const last = Date.parse(value?.lastStrikeAt || '');
        if (Number.isFinite(last) && (now - last) > maxAge) continue;
        next[key] = value;
    }
    return next;
};

export const normalizeReleaseToken = (value = '') => String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

const hexId = (value) => String(value || '').trim().toLowerCase();

/** qBit torrent IDs + Arr downloadIds, including hybrid v1/v2 infohashes. */
export const clientDownloadIds = (item = {}) => {
    const ids = new Set();
    const add = (value) => {
        const id = hexId(value);
        if (!id || id === '0'.repeat(id.length)) return;
        ids.add(id);
        // qBit hybrid/v2 torrent id is the first 40 hex chars of the v2 hash.
        if (/^[a-f0-9]{64}$/.test(id)) ids.add(id.slice(0, 40));
    };
    add(item.id);
    add(item.hash);
    add(item.infohashV1);
    add(item.infohash_v1);
    add(item.infohashV2);
    add(item.infohash_v2);
    add(item.nzo_id);
    add(item.downloadId);
    return [...ids];
};

export const downloadIdsOverlap = (left, right) => {
    const a = left instanceof Set ? left : new Set(
        Array.isArray(left) ? left.map(hexId).filter(Boolean) : clientDownloadIds({ id: left }),
    );
    const b = right instanceof Set ? right : new Set(
        Array.isArray(right) ? right.map(hexId).filter(Boolean) : clientDownloadIds({ id: right }),
    );
    if (!a.size || !b.size) return false;
    for (const id of a) {
        if (b.has(id)) return true;
        if (/^[a-f0-9]{64}$/.test(id) && b.has(id.slice(0, 40))) return true;
    }
    for (const id of b) {
        if (/^[a-f0-9]{64}$/.test(id) && a.has(id.slice(0, 40))) return true;
    }
    return false;
};

const releaseTokenOf = (item = {}) => normalizeReleaseToken(
    item.name
    || item.title
    || item.movie?.title
    || item.series?.title
    || '',
);

export const releaseNamesMatch = (left, right, { minLength = 16 } = {}) => {
    const a = typeof left === 'string' ? normalizeReleaseToken(left) : releaseTokenOf(left);
    const b = typeof right === 'string' ? normalizeReleaseToken(right) : releaseTokenOf(right);
    if (a.length < minLength || b.length < minLength) return false;
    return a.includes(b) || b.includes(a);
};

/** "Saw" + 2004 → saw2004 inside Saw.2004.2160p... */
export const mediaTitleInRelease = (mediaTitle, year, releaseName) => {
    const token = normalizeReleaseToken(`${mediaTitle || ''}${year || ''}`);
    if (token.length < 6) return false;
    return normalizeReleaseToken(releaseName || '').includes(token);
};

export const arrItemMatchesClientRelease = (arrItem, clientItem) => {
    if (!arrItem || !clientItem) return false;
    if (releaseNamesMatch(arrItem, clientItem)) return true;
    const releaseName = clientItem.name || clientItem.title || '';
    if (mediaTitleInRelease(arrItem?.movie?.title, arrItem?.movie?.year, releaseName)) return true;
    if (mediaTitleInRelease(arrItem?.title, arrItem?.movie?.year, releaseName)) return true;
    return false;
};

export const clientItemAgeMs = (item = {}, now = Date.now()) => {
    const candidates = [];
    if (item?.added_on) {
        const added = Number(item.added_on);
        candidates.push(added < 1e12 ? added * 1000 : added);
    }
    if (item?.completedAt) {
        const done = Number(item.completedAt);
        candidates.push(done < 1e12 ? done * 1000 : done);
    }
    const timestamps = candidates.filter((ts) => Number.isFinite(ts) && ts > 0);
    if (!timestamps.length) return null;
    return Math.max(0, now - Math.min(...timestamps));
};

export const matchesProtectedRelease = (name = '', protectedTokens = []) => {
    const token = normalizeReleaseToken(name);
    if (!token || token.length < 8) return false;
    return (protectedTokens || []).some((protectedToken) => {
        const needle = String(protectedToken || '');
        if (!needle || needle.length < 8) return false;
        return token.includes(needle) || needle.includes(token);
    });
};

export const itemKey = (item) => {
    if (!item || typeof item !== 'object') return '';
    if (item.key) return String(item.key);
    if (item.client && item.id) return `${item.client}:${String(item.id).toLowerCase()}`;
    if (item.arrType && item.arrQueueId != null) return `arr:${item.arrType}:${item.arrInstanceId || ''}:${item.arrQueueId}`;
    if (item.downloadId) return `dl:${String(item.downloadId).toLowerCase()}`;
    if (item.hash) return `qbit:${String(item.hash).toLowerCase()}`;
    if (item.nzo_id) return `sab:${item.nzo_id}`;
    return '';
};

const titleKey = (value) => String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export const mediaGroupKey = (arrItem) => {
    if (!arrItem || typeof arrItem !== 'object') return null;
    const movieId = Number(arrItem.movieId || arrItem.movie?.id);
    if (Number.isFinite(movieId) && movieId > 0) return `movie:${movieId}`;
    const seriesId = Number(arrItem.seriesId || arrItem.series?.id);
    const episodeId = Number(arrItem.episodeId || arrItem.episode?.id);
    if (Number.isFinite(seriesId) && seriesId > 0) {
        if (Number.isFinite(episodeId) && episodeId > 0) return `episode:${seriesId}:${episodeId}`;
        const season = Number(arrItem.seasonNumber ?? arrItem.episode?.seasonNumber);
        const episode = Number(arrItem.episodeNumber ?? arrItem.episode?.episodeNumber);
        if (Number.isFinite(season) && Number.isFinite(episode)) return `ep:${seriesId}:${season}x${episode}`;
        return `series:${seriesId}`;
    }
    const albumId = Number(arrItem.albumId || arrItem.album?.id);
    if (Number.isFinite(albumId) && albumId > 0) return `album:${albumId}`;
    return null;
};

const toEpochMs = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n < 1e12 ? n * 1000 : n;
};

export const downloadAgeMs = ({ arrItem, clientItem, now = Date.now() } = {}) => {
    const candidates = [];
    const addedOn = toEpochMs(clientItem?.added_on);
    if (addedOn != null) candidates.push(addedOn);
    const completionOn = toEpochMs(clientItem?.completion_on);
    if (completionOn != null) candidates.push(completionOn);
    const completedAt = toEpochMs(clientItem?.completedAt);
    if (completedAt != null) candidates.push(completedAt);
    if (arrItem?.added) candidates.push(Date.parse(arrItem.added));
    if (arrItem?.estimatedCompletionTime) candidates.push(Date.parse(arrItem.estimatedCompletionTime));
    const timestamps = candidates.filter((ts) => Number.isFinite(ts) && ts > 0);
    if (!timestamps.length) return 0;
    return Math.max(0, now - Math.min(...timestamps));
};

/** Age since the download finished (not since it was grabbed). */
const completedAgeMs = ({ arrItem, clientItem, now }) => {
    const candidates = [];
    const completionOn = toEpochMs(clientItem?.completion_on);
    if (completionOn != null) candidates.push(completionOn);
    const completedAt = toEpochMs(clientItem?.completedAt);
    if (completedAt != null) candidates.push(completedAt);
    const timestamps = candidates.filter((ts) => Number.isFinite(ts) && ts > 0);
    if (timestamps.length) {
        return Math.max(0, now - Math.max(...timestamps));
    }
    // No client completion stamp — fall back to overall age (conservative).
    return downloadAgeMs({ arrItem, clientItem, now });
};

const progressOf = ({ arrItem, clientItem }) => {
    if (clientItem && Number.isFinite(Number(clientItem.progress))) return Number(clientItem.progress);
    const size = Number(arrItem?.size);
    const sizeleft = Number(arrItem?.sizeleft);
    if (Number.isFinite(size) && size > 0 && Number.isFinite(sizeleft)) {
        return Math.max(0, Math.min(1, 1 - (sizeleft / size)));
    }
    return 0;
};

const sizeOf = ({ arrItem, clientItem }) => (
    Number(clientItem?.size) || Number(arrItem?.size) || 0
);

const statusMessagesText = (arrItem) => {
    const parts = [];
    if (arrItem?.errorMessage) parts.push(String(arrItem.errorMessage));
    if (arrItem?.failMessage) parts.push(String(arrItem.failMessage));
    const messages = arrItem?.statusMessages;
    if (Array.isArray(messages)) {
        for (const entry of messages) {
            if (typeof entry === 'string') {
                parts.push(entry);
                continue;
            }
            // Arr entries usually have both a release title and message body —
            // keep both so "Not an upgrade…" text isn't dropped when a title exists.
            if (entry?.title) parts.push(String(entry.title));
            if (Array.isArray(entry?.messages)) parts.push(...entry.messages.map(String));
            else if (entry?.message) parts.push(String(entry.message));
        }
    }
    return parts.join(' ').toLowerCase();
};

/** Import failures that are safe to auto-remove (junk / unrecoverable). */
export const DOOMED_IMPORT_PATTERNS = Object.freeze([
    /\bsample(\s+(detected|file|found))?\b/,
    /\bunwanted\s+extensions?\b/,
    /\bbanned\s+extensions?\b/,
    /\bblocked\s+extensions?\b/,
    /\bnot a valid\s+(media|video|audio|episode|movie|release|file)\b/,
    /\bno (video\s+)?files?\s+found\b/,
    /\bpassword(\s*-?\s*protected|\s+required)?\b/,
    /\b(archive\s+is\s+)?encrypted\b/,
    /\bunsupported\s+file\s+format\b/,
    /\binvalid\s+archive\b/,
    /\bpacked\s+sample\b/,
]);

export const importFailureText = (arrItem) => statusMessagesText(arrItem);

/** Parse Arr "Not an upgrade… Existing quality: X. New Quality Y." messages. */
export const parseNotAnUpgradeQualities = (text = '') => {
    const raw = String(text || '');
    const match = /existing\s+quality:\s*([^\s.]+).*?new\s+quality[:\s]+([^\s.]+)/i.exec(raw);
    if (!match) return null;
    return { existing: match[1], next: match[2] };
};

/**
 * True when Arr rejects import as not-an-upgrade and the new file is a lower resolution
 * (e.g. existing WEBDL-2160p vs new WEBDL-1080p).
 */
export const isResolutionDowngradeImportFailure = (arrItem) => {
    if (!arrItem) return false;
    const text = statusMessagesText(arrItem);
    if (!text) return false;
    if (/not a custom format upgrade/i.test(text)) return false;
    if (!/not an upgrade for existing/i.test(text)) return false;
    const parsed = parseNotAnUpgradeQualities(text);
    if (!parsed) return false;
    const existingRes = parseResolutionTier(parsed.existing);
    const nextRes = parseResolutionTier(parsed.next);
    if (existingRes === 'unknown' || nextRes === 'unknown') return false;
    return resolutionRank(nextRes) < resolutionRank(existingRes);
};

/** Arr will never import this — CF score is worse than the file already on disk. */
export const isCustomFormatDowngradeImportFailure = (arrItem) => {
    if (!arrItem) return false;
    return /not a custom format upgrade/i.test(statusMessagesText(arrItem));
};

export const isDoomedImportFailure = (arrItem) => {
    if (!arrItem) return false;
    if (isResolutionDowngradeImportFailure(arrItem)) return true;
    if (isCustomFormatDowngradeImportFailure(arrItem)) return true;
    const text = statusMessagesText(arrItem);
    if (!text) return false;
    return DOOMED_IMPORT_PATTERNS.some((pattern) => pattern.test(text));
};

const isMetaDlState = (clientItem) => {
    const state = String(clientItem?.state || '').toLowerCase();
    return state === 'metadl' || state === 'metaDL'.toLowerCase();
};

const isStalledState = ({ arrItem, clientItem }) => {
    const trackedState = String(arrItem?.trackedDownloadState || '').toLowerCase();
    // Client/network outage — never treat as a doomed stall.
    if (trackedState === 'downloadclientunavailable') return false;

    const state = String(clientItem?.state || '').toLowerCase();
    if (state === 'stalleddl' || state === 'stalled') return true;
    // qBit "error" alone is too broad; require stall/no-seeds signal.
    if (state === 'error' && /stall|no seeds|unavailable/.test(statusMessagesText(arrItem))) return true;

    const arrStatus = String(arrItem?.status || '').toLowerCase();
    const tracked = String(arrItem?.trackedDownloadStatus || '').toLowerCase();
    if (arrStatus === 'warning' && /stall/.test(statusMessagesText(arrItem))) return true;
    if (tracked === 'warning' && /stall/.test(statusMessagesText(arrItem))) return true;
    if (clientItem?.dlspeed === 0 && progressOf({ arrItem, clientItem }) < 1 && state.includes('dl')) {
        return /stall|no seeds/.test(statusMessagesText(arrItem)) || state.includes('stalled');
    }
    return false;
};

/**
 * qBit torrent crawling below the configured speed floor (not stalled, not near-done).
 * Tracker seeder counts are ignored — only measured dlspeed counts as "actively pulling".
 */
export const isSlowDownloadState = ({
    clientItem = null,
    arrItem = null,
    thresholds = thresholdsFromConfig(),
} = {}) => {
    if (!clientItem || clientItem.client !== 'qbit') return false;
    if (isMetaDlState(clientItem)) return false;
    if (String(arrItem?.trackedDownloadState || '').toLowerCase() === 'importing') return false;

    const progress = progressOf({ arrItem, clientItem });
    if (progress >= 0.95) return false;

    const state = String(clientItem.state || '').toLowerCase();
    // Actively downloading-ish, or paused/stopped while still incomplete.
    const downloading = state.includes('dl')
        || state === 'downloading'
        || state === 'forceddl'
        || state === 'queueddl'
        || state === 'stalleddl'
        || state === 'checkingdl'
        || state === 'allocating'
        || state === 'moving';
    const pausedIncomplete = progress > 0
        && progress < 1
        && (state.includes('paused') || state.includes('stopped') || state.includes('error'));
    if (!downloading && !pausedIncomplete) return false;

    const floorBytesPerSec = Math.max(0, Number(thresholds.slowDownloadFloorKbps) || 100) * 1024;
    const dlspeed = Number(clientItem.dlspeed) || 0;
    return dlspeed < floorBytesPerSec;
};

const trackedDownloadStateOf = (arrItem) => String(arrItem?.trackedDownloadState || '').toLowerCase();

/** Remux/copy in progress — never treat as stuck or failed. */
export const isActivelyImporting = (arrItem) => trackedDownloadStateOf(arrItem) === 'importing';

const sameArrInstance = (a, b) => {
    if (!a || !b) return false;
    return String(a.arrType || '') === String(b.arrType || '')
        && String(a.arrInstanceId ?? '') === String(b.arrInstanceId ?? '');
};

/**
 * Waiting to import is healthy when another queue row on the same Arr is
 * actively copying, or when an older importPending peer is still ahead in line.
 * Radarr/Sonarr serialize large remux imports.
 */
export const isImportPendingBehindActiveImport = (arrItem, peerArrItems = []) => {
    if (trackedDownloadStateOf(arrItem) !== 'importpending') return false;
    const peers = Array.isArray(peerArrItems) ? peerArrItems : [];
    const selfId = String(arrItem.arrQueueId ?? arrItem.id);
    const selfDone = Date.parse(arrItem.estimatedCompletionTime || arrItem.added || '') || 0;
    return peers.some((peer) => {
        if (!sameArrInstance(arrItem, peer)) return false;
        if (String(peer.arrQueueId ?? peer.id) === selfId) return false;
        if (isActivelyImporting(peer)) return true;
        if (trackedDownloadStateOf(peer) !== 'importpending') return false;
        const peerDone = Date.parse(peer.estimatedCompletionTime || peer.added || '') || 0;
        if (peerDone && selfDone && peerDone < selfDone) return true;
        if (peerDone === selfDone) {
            return Number(peer.arrQueueId ?? peer.id) < Number(arrItem.arrQueueId ?? arrItem.id);
        }
        return false;
    });
};

const isFailedImport = (arrItem) => {
    if (!arrItem) return false;
    // Resolution / CF downgrades often sit in importPending with a warning — still doomed.
    if (isResolutionDowngradeImportFailure(arrItem)) return true;
    if (isCustomFormatDowngradeImportFailure(arrItem)) return true;
    const trackedStatus = String(arrItem.trackedDownloadStatus || '').toLowerCase();
    const trackedState = trackedDownloadStateOf(arrItem);
    const status = String(arrItem.status || '').toLowerCase();
    const text = statusMessagesText(arrItem);
    // Arr "Waiting to import" / actively importing — not a failure.
    // Waiting uses completedNotImporting; active copy must never be killed.
    if (trackedState === 'importpending' || trackedState === 'importing') return false;
    if (trackedState === 'importfailed' || trackedState === 'failed') return true;
    if (status === 'failed') return true;
    // Require real failure language — bare "import" matches healthy "Waiting to import" warnings.
    if ((trackedStatus === 'warning' || trackedStatus === 'error') && (
        /import\s*failed|failed\s+to\s+import|unpack|sample|not a valid|no files found/.test(text)
    )) {
        return true;
    }
    if (arrItem.failMessage || /import failed|failed to import/.test(text)) return true;
    return false;
};

const isCompletedNotImporting = (arrItem) => {
    if (!arrItem) return false;
    // Active Binary/file transfer — healthy, even for multi-hour remux copies.
    if (isActivelyImporting(arrItem)) return false;
    const status = String(arrItem.status || '').toLowerCase();
    const trackedState = trackedDownloadStateOf(arrItem);
    if (trackedState === 'importpending') return true;
    if (status === 'completed' && trackedState !== 'imported') return true;
    return false;
};

/**
 * True when qBit reports a completed torrent in an upload/seed-ish state.
 * Informational only — QC may still strike/kill these. Active Arr imports are
 * protected separately via isActivelyImporting / isImportPendingBehindActiveImport.
 */
export const isSeedingProtected = (clientItem) => {
    if (!clientItem || clientItem.client !== 'qbit') return false;
    const state = String(clientItem.state || '').toLowerCase();
    const progress = Number(clientItem.progress) || 0;
    if (progress < 1) return false;
    return state === 'uploading'
        || state === 'stalledup'
        || state === 'forcedup'
        || state === 'queuedup'
        || state === 'pausedup'
        || state === 'stoppedup'
        || state === 'checkingup'
        || state === 'moving';
};

/** Successful SAB history leftovers after Arr import — never orphan-kill. */
export const isSuccessfulSabHistory = (clientItem) => {
    if (!clientItem || clientItem.client !== 'sab') return false;
    if (String(clientItem.source || '').toLowerCase() !== 'history') return false;
    const state = String(clientItem.state || '').toLowerCase();
    if (state === 'failed') return false;
    if (clientItem.failMessage) return false;
    return state === 'completed' || progressOf({ clientItem }) >= 1;
};

/**
 * metaDL kills only when qBit is reachable and DHT/network look up.
 * Unmatched / non-qBit metaDL rows still require a healthy qBit probe when qBit is configured.
 */
export const isMetaDlActionable = ({
    clientItem = null,
    clients = {},
    networkHealth = {},
    qbitConfigured = false,
} = {}) => {
    if (!qbitConfigured) return true;
    if (!clients?.qbit) return false;
    const health = networkHealth?.qbit;
    if (health && health.ok === false) return false;
    if (clientItem?.client === 'qbit') {
        return !clientNetworkDown('qbit', {
            clients,
            networkHealth,
            configured: qbitConfigured,
        });
    }
    // Unmatched Arr metaDL: hold when qBit network probe failed.
    return !(health && health.ok === false);
};

const clientNetworkDown = (name, { clients = {}, networkHealth = {}, configured = false } = {}) => {
    if (!configured) return false;
    if (!clients?.[name]) return true;
    const health = networkHealth?.[name];
    if (!health) return false;
    return health.ok === false;
};

/**
 * Stall kills only when the owning downloader is reachable and reports network up.
 * qBit: hold on unreachable / connection_status=disconnected / DHT dead with incomplete torrents.
 * SAB: hold on unreachable / DNS fail / no public IP / all active servers erroring.
 */
export const isStallActionable = ({
    clientItem = null,
    clients = {},
    networkHealth = {},
    qbitConfigured = false,
    sabConfigured = false,
} = {}) => {
    const anyConfigured = qbitConfigured || sabConfigured;
    const anyHealthy = Boolean(clients?.qbit || clients?.sab);
    if (anyConfigured && !anyHealthy) return false;

    const qbitDown = clientNetworkDown('qbit', {
        clients,
        networkHealth,
        configured: qbitConfigured,
    });
    const sabDown = clientNetworkDown('sab', {
        clients,
        networkHealth,
        configured: sabConfigured,
    });

    const clientName = clientItem?.client || null;
    if (clientName === 'qbit') return !qbitDown;
    if (clientName === 'sab') return !sabDown;

    // Unmatched Arr stall: hold only if every configured downloader looks down.
    if (qbitConfigured && sabConfigured) return !(qbitDown && sabDown);
    if (qbitConfigured) return !qbitDown;
    if (sabConfigured) return !sabDown;
    return true;
};

export const isReasonActionable = (item = {}, context = {}) => {
    const reason = item.reason;
    if (!reason) return false;
    const arrItem = item.arrItem || item;
    // Never kill while Arr is actively copying/importing this download.
    // Seeding/upload state alone is not a hold — only in-flight imports.
    if (isActivelyImporting(arrItem)) return false;
    if (reason === QC_REASONS.blockedExtension) return true;
    if (reason === QC_REASONS.qualityDowngrade) return true;
    if (reason === QC_REASONS.fakeRemux) return true;
    if (reason === QC_REASONS.failedImport) {
        return isDoomedImportFailure(arrItem);
    }
    if (reason === QC_REASONS.completedNotImporting) {
        // Waiting behind another active import is expected, not stuck.
        if (isImportPendingBehindActiveImport(arrItem, context.arrItems)) return false;
    }
    if (reason === QC_REASONS.metaDL) {
        return isMetaDlActionable({
            clientItem: item.client || item.clientItem || null,
            clients: context.clients,
            networkHealth: context.networkHealth,
            qbitConfigured: context.qbitConfigured,
        });
    }
    if (reason === QC_REASONS.stalled || reason === QC_REASONS.slowDownload) {
        return isStallActionable({
            clientItem: item.client || item.clientItem || null,
            clients: context.clients,
            networkHealth: context.networkHealth,
            qbitConfigured: context.qbitConfigured,
            sabConfigured: context.sabConfigured,
        });
    }
    return true;
};

export const classifyQueueItem = ({
    arrItem,
    clientItem,
    now = Date.now(),
    thresholds = thresholdsFromConfig(),
    peerArrItems = null,
} = {}) => {
    const age = downloadAgeMs({ arrItem, clientItem, now });
    if (isFakeRemuxContainer({
        title: arrItem?.title || arrItem?.sourceTitle || clientItem?.name,
        qualityName: arrItem?.quality?.quality?.name || arrItem?.quality?.name,
        files: [clientItem?.name].filter(Boolean),
    })) {
        return QC_REASONS.fakeRemux;
    }
    if (clientItem && isMetaDlState(clientItem) && age >= thresholds.metaDlMinutes * MINUTE_MS) {
        return QC_REASONS.metaDL;
    }
    if (isResolutionDowngradeImportFailure(arrItem)) return QC_REASONS.qualityDowngrade;
    if (isCustomFormatDowngradeImportFailure(arrItem)) return QC_REASONS.qualityDowngrade;
    if (isFailedImport(arrItem)) return QC_REASONS.failedImport;
    // Use time-since-completed so long NZB downloads are not CNI the moment they finish.
    if (isCompletedNotImporting(arrItem)) {
        const cniMinutes = cniThresholdMinutes({ thresholds, arrItem, clientItem });
        if (completedAgeMs({ arrItem, clientItem, now }) >= cniMinutes * MINUTE_MS) {
            // Still in line behind an active remux copy or older pending peer — not stuck.
            if (isImportPendingBehindActiveImport(arrItem, peerArrItems)) return null;
            return QC_REASONS.completedNotImporting;
        }
    }
    if (isStalledState({ arrItem, clientItem }) && age >= thresholds.stalledHours * HOUR_MS) {
        return QC_REASONS.stalled;
    }
    const slowMinAgeHours = Math.max(0, Number(thresholds.slowDownloadMinAgeHours) || 6);
    if (
        isSlowDownloadState({ clientItem, arrItem, thresholds })
        && age >= slowMinAgeHours * HOUR_MS
    ) {
        return QC_REASONS.slowDownload;
    }
    return null;
};

export const findDuplicates = (arrItems = []) => {
    const groups = new Map();
    for (const item of arrItems) {
        const key = mediaGroupKey(item);
        if (!key) continue;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(item);
    }
    const duplicates = [];
    for (const items of groups.values()) {
        if (items.length < 2) continue;
        const ranked = [...items].sort((a, b) => {
            const progressDelta = progressOf({ arrItem: b }) - progressOf({ arrItem: a });
            if (progressDelta !== 0) return progressDelta;
            return sizeOf({ arrItem: b }) - sizeOf({ arrItem: a });
        });
        for (const loser of ranked.slice(1)) {
            duplicates.push({
                ...loser,
                reason: QC_REASONS.duplicate,
                duplicateOf: ranked[0]?.id ?? ranked[0]?.downloadId ?? null,
            });
        }
    }
    return duplicates;
};

export const findOrphans = ({
    clientItems = [],
    arrDownloadIds = [],
    arrItems = [],
    importedDownloadIds = [],
    importedItems = [],
    now = Date.now(),
    minAgeMs = 0,
    protectedReleaseTokens = [],
} = {}) => {
    const known = new Set(
        [
            ...(arrDownloadIds || []),
            ...(arrItems || []).map((item) => item?.downloadId),
            ...(importedDownloadIds || []),
            ...(importedItems || []).map((item) => item?.downloadId),
        ].flatMap((id) => clientDownloadIds({ downloadId: id })),
    );
    const linkedArrItems = [...(arrItems || []), ...(importedItems || [])];
    const graceMs = Math.max(0, Number(minAgeMs) || 0);
    return (clientItems || [])
        .filter((item) => {
            if (!item?.id) return false;
            // Seeding torrents are fair game for orphan cleanup; only Arr-linked
            // imports (downloadId still in queue / recently imported) and recent
            // hunt grabs are held.
            if (isSuccessfulSabHistory(item)) return false;
            if (matchesProtectedRelease(item.name || item.title || '', protectedReleaseTokens)) return false;
            if (downloadIdsOverlap(clientDownloadIds(item), known)) return false;
            if (linkedArrItems.some((arrItem) => arrItemMatchesClientRelease(arrItem, item))) return false;
            return true;
        })
        .map((item) => {
            const ageMs = clientItemAgeMs(item, now);
            // Unknown age (SAB) or younger than grace → show, but do not auto-kill.
            const withinGrace = graceMs > 0 && (ageMs == null || ageMs < graceMs);
            return {
                ...item,
                reason: QC_REASONS.orphan,
                key: itemKey(item),
                withinGrace,
                ageMs,
            };
        });
};

export const isSnoozed = (prefs, key, now = Date.now()) => {
    if (!key) return false;
    const until = prefs?.downloadSnoozed?.[key] ?? prefs?.snoozed?.[key];
    if (!until) return false;
    const ts = typeof until === 'number' ? until : Date.parse(until);
    return Number.isFinite(ts) && ts > now;
};

export const isResearchThrottled = (prefs, titleOrKey, now = Date.now()) => {
    if (!titleOrKey) return false;
    const key = titleKey(titleOrKey) || String(titleOrKey);
    const until = prefs?.researchCooldowns?.[key];
    if (!until) return false;
    const ts = typeof until === 'number' ? until : Date.parse(until);
    return Number.isFinite(ts) && ts > now;
};

export const isCondemned = (prefs, key, now = Date.now()) => {
    if (!key) return false;
    const until = prefs?.condemned?.[key];
    if (!until) return false;
    const ts = typeof until === 'number' ? until : Date.parse(until);
    return Number.isFinite(ts) && ts > now;
};
