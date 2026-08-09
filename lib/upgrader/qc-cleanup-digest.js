const REASON_LABELS = Object.freeze({
    completedNotImporting: 'waiting to import',
    slowDownload: 'slow download',
    stalled: 'stalled',
    metaDL: 'stuck fetching metadata',
    failedImport: 'import failed',
    qualityDowngrade: 'resolution downgrade',
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

const formatCleanupLine = (row) => {
    const title = String(row?.title || row?.key || 'Untitled').trim() || 'Untitled';
    const bits = [
        humanQcReason(row?.reason),
        humanQcClient(row?.client),
        humanArr(row?.arrType),
        formatBytes(row?.wastedBytes),
    ].filter(Boolean);
    const detail = bits.join(' · ');
    return `**${title}**${detail ? `\n${detail}` : ''}`;
};

const joinLines = (rows, limit = 12) => {
    const list = Array.isArray(rows) ? rows : [];
    const shown = list.slice(0, limit).map(formatCleanupLine);
    if (list.length > limit) shown.push(`+${list.length - limit} more`);
    return shown.join('\n\n').slice(0, 1024);
};

export const buildQcCleanupDigest = (summary = {}) => {
    const rows = Array.isArray(summary.results) ? summary.results : [];
    const killedRows = rows.filter((row) => row?.killed);
    const failedRows = rows.filter((row) => !row?.success && !row?.struck);
    const killed = Number(summary.killed ?? killedRows.length) || 0;
    const failed = Number(summary.failed ?? failedRows.length) || 0;
    if (killed <= 0 && failed <= 0) return null;

    const noun = killed === 1 ? 'download' : 'downloads';
    const description = failed
        ? (killed
            ? `Removed **${killed}** stalled/failed ${noun}. **${failed}** remove failed.`
            : `Tried to remove stalled/failed downloads — **${failed}** failed.`)
        : `Removed **${killed}** stalled/failed ${noun}.`;

    const fields = [];
    if (killedRows.length) {
        fields.push({ name: killedRows.length === 1 ? 'Removed' : 'Removed', value: joinLines(killedRows) });
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
