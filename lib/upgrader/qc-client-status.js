const QBIT_SEEDING_STATES = new Set([
    'uploading',
    'stalledup',
    'forcedup',
    'queuedup',
    'pausedup',
    'stoppedup',
]);

const QBIT_DOWNLOAD_STATES = new Set([
    'downloading',
    'stalleddl',
    'forceddl',
    'queueddl',
    'metadl',
    'allocating',
    'checkingdl',
    'checkingresume',
]);

const QBIT_ERROR_STATES = new Set(['error', 'missingfiles', 'unknown']);

const asList = (value) => (Array.isArray(value) ? value : []);

const clientNameOf = (item) => String(item?.client?.client || item?.client || '').toLowerCase();

const qbitBucket = (state) => {
    const normalized = String(state || '').toLowerCase();
    if (QBIT_ERROR_STATES.has(normalized)) return 'error';
    if (QBIT_SEEDING_STATES.has(normalized) || normalized.endsWith('up')) return 'seeding';
    if (normalized === 'pauseddl' || normalized === 'stoppeddl') return 'paused';
    if (normalized.startsWith('checking')) return 'checking';
    if (QBIT_DOWNLOAD_STATES.has(normalized) || normalized.endsWith('dl')) return 'downloading';
    return 'other';
};

const sabBucket = (item) => {
    const source = String(item?.source || '').toLowerCase();
    const state = String(item?.state || '').toLowerCase();
    if (source === 'history') {
        if (state === 'failed' || item?.failMessage) return 'failed';
        if (state === 'completed') return 'completed';
        return 'history';
    }
    if (state === 'paused') return 'paused';
    if (state === 'extracting' || state === 'verifying') return state;
    if (state === 'downloading' || state === 'queued' || state === 'grabbing') return 'downloading';
    return 'other';
};

const qcIssueCount = (name, items = [], orphans = []) => (
    [...asList(items), ...asList(orphans)].filter((item) => {
        if (clientNameOf(item) !== name) return false;
        return Boolean(item.actionable || item.strikeEligible || item.killReady);
    }).length
);

export const summarizeQbitQueue = (torrents = []) => {
    const rows = asList(torrents).filter((item) => String(item?.client || '') === 'qbit' || !item?.client);
    const summary = {
        total: rows.length,
        downloading: 0,
        seeding: 0,
        paused: 0,
        error: 0,
        checking: 0,
        other: 0,
        dlSpeed: 0,
        upSpeed: 0,
    };
    for (const item of rows) {
        const bucket = qbitBucket(item.state);
        if (summary[bucket] != null) summary[bucket] += 1;
        else summary.other += 1;
        summary.dlSpeed += Number(item.dlspeed) || 0;
        summary.upSpeed += Number(item.upspeed) || 0;
    }
    return summary;
};

export const summarizeSabQueue = (queue = [], history = []) => {
    const queued = asList(queue).filter((item) => String(item?.client || '') === 'sab' || !item?.client);
    const historic = asList(history).filter((item) => String(item?.client || '') === 'sab' || !item?.client);
    const summary = {
        total: queued.length,
        downloading: 0,
        paused: 0,
        extracting: 0,
        verifying: 0,
        other: 0,
        history: historic.length,
        completed: 0,
        failed: 0,
    };
    for (const item of queued) {
        const bucket = sabBucket(item);
        if (summary[bucket] != null) summary[bucket] += 1;
        else summary.other += 1;
    }
    for (const item of historic) {
        const bucket = sabBucket(item);
        if (bucket === 'failed') summary.failed += 1;
        else if (bucket === 'completed') summary.completed += 1;
    }
    return summary;
};

export const summarizeClientQueues = ({
    torrents = [],
    sabQueue = [],
    sabHistory = [],
    items = [],
    orphans = [],
    networkHealth = {},
} = {}) => ({
    qbit: {
        ...summarizeQbitQueue(torrents),
        qcIssues: qcIssueCount('qbit', items, orphans),
        health: networkHealth?.qbit || null,
    },
    sab: {
        ...summarizeSabQueue(sabQueue, sabHistory),
        qcIssues: qcIssueCount('sab', items, orphans),
        health: networkHealth?.sab || null,
    },
});
