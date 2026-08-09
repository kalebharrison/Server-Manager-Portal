const REASON_LABELS = Object.freeze({
    completedNotImporting: 'waiting to import',
    slowDownload: 'slow download',
    stalled: 'stalled',
    metaDL: 'stuck fetching metadata',
    failedImport: 'import failed',
    qualityDowngrade: 'not an upgrade',
    fakeRemux: 'fake remux (mp4)',
    blockedExtension: 'blocked extension',
    duplicate: 'duplicate',
    orphan: 'orphan',
});

const CLIENT_LABELS = Object.freeze({
    qbit: 'qBit',
    sab: 'SAB',
});

const ARR_LABELS = Object.freeze({
    sonarr: 'Sonarr',
    radarr: 'Radarr',
    lidarr: 'Lidarr',
});

export const humanQcReason = (reason) => REASON_LABELS[String(reason || '')] || String(reason || '').trim() || 'unknown';

export const humanQcClient = (client) => {
    const key = String(client || '').toLowerCase();
    return CLIENT_LABELS[key] || (key || '');
};

const humanArr = (arrType) => ARR_LABELS[String(arrType || '').toLowerCase()] || String(arrType || '').trim();

const formatBytes = (bytes) => {
    const n = Number(bytes);
    if (!Number.isFinite(n) || n <= 0) return '';
    if (n >= 1024 ** 3) return `${(n / (1024 ** 3)).toFixed(n >= 10 * 1024 ** 3 ? 0 : 1)} GB`;
    if (n >= 1024 ** 2) return `${(n / (1024 ** 2)).toFixed(n >= 10 * 1024 ** 2 ? 0 : 1)} MB`;
    return `${Math.max(1, Math.round(n / 1024))} KB`;
};

const clientOf = (row) => {
    if (typeof row?.client === 'string') return row.client;
    return row?.client?.client || '';
};

const titleOf = (row) => String(row?.mediaTitle || row?.title || row?.key || 'Untitled').trim() || 'Untitled';

const groupKeyOf = (row) => {
    const downloadId = String(row?.downloadId || '').trim().toLowerCase();
    if (downloadId) return `dl:${downloadId}`;
    const title = titleOf(row).toLowerCase();
    const reason = String(row?.reason || '').toLowerCase();
    const client = String(clientOf(row) || '').toLowerCase();
    const arrType = String(row?.arrType || '').toLowerCase();
    return `t:${title}|${reason}|${client}|${arrType}`;
};

/** Collapse season-pack / multi-episode queue rows into one download. */
export const collapseQcCleanupRows = (rows = []) => {
    const groups = new Map();
    for (const row of (Array.isArray(rows) ? rows : [])) {
        if (!row || row.struck) continue;
        const key = groupKeyOf(row);
        const existing = groups.get(key);
        if (!existing) {
            groups.set(key, {
                title: titleOf(row),
                reason: row.reason || '',
                client: clientOf(row),
                arrType: row.arrType || '',
                wastedBytes: Number(row.wastedBytes) || 0,
                count: 1,
                killed: !!row.killed,
                failed: !row.success && !row.struck,
            });
            continue;
        }
        existing.count += 1;
        existing.killed = existing.killed || !!row.killed;
        existing.failed = existing.failed || (!row.success && !row.struck);
        existing.wastedBytes = Math.max(existing.wastedBytes, Number(row.wastedBytes) || 0);
        if (!existing.title || existing.title === 'Untitled') existing.title = titleOf(row);
    }
    return [...groups.values()];
};

const formatCleanupLine = (row) => {
    const title = String(row?.title || 'Untitled').trim() || 'Untitled';
    const count = Number(row?.count) || 1;
    const bits = [
        humanQcReason(row?.reason),
        humanQcClient(row?.client),
        humanArr(row?.arrType),
        formatBytes(row?.wastedBytes),
        count > 1 ? `${count} items` : '',
    ].filter(Boolean);
    return `**${title}**${bits.length ? `\n${bits.join(' · ')}` : ''}`;
};

const joinLines = (rows, limit = 12) => {
    const list = Array.isArray(rows) ? rows : [];
    const shown = list.slice(0, limit).map(formatCleanupLine);
    if (list.length > limit) shown.push(`+${list.length - limit} more`);
    return shown.join('\n\n').slice(0, 1024);
};

export const buildQcCleanupDigest = (summary = {}) => {
    const collapsed = collapseQcCleanupRows(summary.results);
    const killedRows = collapsed.filter((row) => row.killed);
    const failedRows = collapsed.filter((row) => row.failed && !row.killed);
    const killed = killedRows.length;
    const failed = failedRows.length;
    if (killed <= 0 && failed <= 0) return null;

    const noun = killed === 1 ? 'download' : 'downloads';
    const description = failed
        ? (killed
            ? `Removed **${killed}** stalled/failed ${noun}. **${failed}** remove failed.`
            : `Tried to remove stalled/failed downloads — **${failed}** failed.`)
        : `Removed **${killed}** stalled/failed ${noun}.`;

    const fields = [];
    if (killedRows.length) {
        fields.push({ name: 'Removed', value: joinLines(killedRows) });
    }
    if (failedRows.length) {
        fields.push({ name: 'Remove failed', value: joinLines(failedRows) });
    }

    return {
        title: 'Quality Control cleanup',
        description,
        fields,
        color: failed ? 0xf59e0b : 0x22c55e,
    };
};
