export const QC_REASONS = Object.freeze({
    metaDL: 'metaDL',
    stalled: 'stalled',
    failedImport: 'failedImport',
    completedNotImporting: 'completedNotImporting',
    duplicate: 'duplicate',
    orphan: 'orphan',
});

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

const asNumber = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
};

export const thresholdsFromConfig = (config = {}) => ({
    metaDlMinutes: asNumber(config.qcMetaDlMinutes, 30),
    stalledHours: asNumber(config.qcStalledHours, 6),
    completedNotImportingMinutes: asNumber(config.qcCompletedNotImportingMinutes, 60),
    researchThrottleHours: asNumber(config.qcResearchThrottleHours, 24),
    snoozeDefaultHours: asNumber(config.qcSnoozeDefaultHours, 24),
    // Fresh hunt grabs often appear in the client before Arr stamps downloadId.
    orphanGraceMinutes: asNumber(config.qcOrphanGraceMinutes, 45),
});

export const normalizeReleaseToken = (value = '') => String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

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

const ageMs = ({ arrItem, clientItem, now }) => {
    const candidates = [];
    if (clientItem?.added_on) {
        const added = Number(clientItem.added_on);
        candidates.push(added < 1e12 ? added * 1000 : added);
    }
    if (clientItem?.completion_on) {
        const done = Number(clientItem.completion_on);
        candidates.push(done < 1e12 ? done * 1000 : done);
    }
    if (arrItem?.added) candidates.push(Date.parse(arrItem.added));
    if (arrItem?.estimatedCompletionTime) candidates.push(Date.parse(arrItem.estimatedCompletionTime));
    const timestamps = candidates.filter((ts) => Number.isFinite(ts) && ts > 0);
    if (!timestamps.length) return 0;
    return Math.max(0, now - Math.min(...timestamps));
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
            if (typeof entry === 'string') parts.push(entry);
            else if (entry?.title) parts.push(String(entry.title));
            else if (Array.isArray(entry?.messages)) parts.push(...entry.messages.map(String));
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

export const isDoomedImportFailure = (arrItem) => {
    if (!arrItem) return false;
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

const isFailedImport = (arrItem) => {
    if (!arrItem) return false;
    const trackedStatus = String(arrItem.trackedDownloadStatus || '').toLowerCase();
    const trackedState = String(arrItem.trackedDownloadState || '').toLowerCase();
    const status = String(arrItem.status || '').toLowerCase();
    const text = statusMessagesText(arrItem);
    if (trackedState === 'importfailed' || trackedState === 'failed') return true;
    if (status === 'failed') return true;
    if ((trackedStatus === 'warning' || trackedStatus === 'error') && /import|unpack|sample|not a valid|no files found|failed/.test(text)) {
        return true;
    }
    if (arrItem.failMessage || /import failed|failed to import/.test(text)) return true;
    return false;
};

const isCompletedNotImporting = (arrItem) => {
    if (!arrItem) return false;
    const status = String(arrItem.status || '').toLowerCase();
    const trackedState = String(arrItem.trackedDownloadState || '').toLowerCase();
    if (trackedState === 'importpending' || trackedState === 'importing') return true;
    if (status === 'completed' && trackedState !== 'imported') return true;
    return false;
};

export const isSeedingProtected = (clientItem) => {
    if (!clientItem || clientItem.client !== 'qbit') return false;
    const state = String(clientItem.state || '').toLowerCase();
    const progress = Number(clientItem.progress) || 0;
    if (progress < 1) return false;
    return state === 'uploading' || state === 'stalledup' || state === 'forcedup' || state === 'queuedup';
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
    if (reason === QC_REASONS.failedImport) {
        return isDoomedImportFailure(item.arrItem || item);
    }
    if (reason === QC_REASONS.stalled) {
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

export const classifyQueueItem = ({ arrItem, clientItem, now = Date.now(), thresholds = thresholdsFromConfig() } = {}) => {
    const age = ageMs({ arrItem, clientItem, now });
    if (clientItem && isMetaDlState(clientItem) && age >= thresholds.metaDlMinutes * MINUTE_MS) {
        return QC_REASONS.metaDL;
    }
    if (isFailedImport(arrItem)) return QC_REASONS.failedImport;
    if (isCompletedNotImporting(arrItem) && age >= thresholds.completedNotImportingMinutes * MINUTE_MS) {
        return QC_REASONS.completedNotImporting;
    }
    if (isStalledState({ arrItem, clientItem }) && age >= thresholds.stalledHours * HOUR_MS) {
        return QC_REASONS.stalled;
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
    now = Date.now(),
    minAgeMs = 0,
    protectedReleaseTokens = [],
} = {}) => {
    const known = new Set(
        (arrDownloadIds || [])
            .map((id) => String(id || '').toLowerCase())
            .filter(Boolean),
    );
    const graceMs = Math.max(0, Number(minAgeMs) || 0);
    return (clientItems || [])
        .filter((item) => {
            if (!item?.id) return false;
            if (isSeedingProtected(item)) return false;
            if (matchesProtectedRelease(item.name || item.title || '', protectedReleaseTokens)) return false;
            const id = String(item.id).toLowerCase();
            const hash = String(item.hash || '').toLowerCase();
            return !known.has(id) && !(hash && known.has(hash));
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
