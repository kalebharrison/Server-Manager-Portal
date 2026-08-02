const PHASE_RANK = {
    Failed: 0,
    Stalled: 1,
    'Needs Attention': 2,
    Paused: 3,
    Waiting: 4,
    Downloading: 5,
    Importing: 6,
};

const onTheWayGroupKey = (item = {}) => {
    if (item?.type !== 'tv') return `solo:${item.id}`;
    // Prefer season so packs and per-episode queue rows collapse to one card.
    if (item.seriesId != null && item.seasonNumber != null) {
        return `season:${item.service || 'Sonarr'}:${item.seriesId}:${item.seasonNumber}`;
    }
    const title = String(item.title || '').trim().toLowerCase();
    if (title && item.seasonNumber != null) {
        return `title-season:${item.service || 'Sonarr'}:${title}:${item.seasonNumber}`;
    }
    const downloadId = String(item.downloadId || '').trim().toLowerCase();
    if (downloadId) return `dl:${item.service || 'Sonarr'}:${downloadId}`;
    return `solo:${item.id}`;
};

/** Collapse Sonarr episode queue rows into one Discover card per season / pack. */
export const groupOnTheWayDownloads = (items = []) => {
    const buckets = new Map();
    const order = [];
    for (const item of items || []) {
        const key = onTheWayGroupKey(item);
        if (!buckets.has(key)) {
            buckets.set(key, []);
            order.push(key);
        }
        buckets.get(key).push(item);
    }

    return order.map((key) => {
        const group = buckets.get(key) || [];
        if (group.length <= 1) return group[0];

        const first = group[0];
        const total = group.reduce((sum, item) => sum + (Number(item.total) || 0), 0);
        const downloaded = group.reduce((sum, item) => sum + (Number(item.downloaded) || 0), 0);
        const progress = total > 0
            ? Math.max(0, Math.min(100, (downloaded / total) * 100))
            : group.reduce((sum, item) => sum + (Number(item.progress) || 0), 0) / group.length;

        const phase = group
            .map((item) => String(item.phase || 'Waiting'))
            .sort((a, b) => (PHASE_RANK[a] ?? 50) - (PHASE_RANK[b] ?? 50))[0];

        const acquisitionKind = group.some((item) => item.acquisitionKind === 'upgrade')
            ? 'upgrade'
            : group.every((item) => item.acquisitionKind === 'new')
                ? 'new'
                : group.some((item) => item.acquisitionKind === 'new')
                    ? 'new'
                    : 'unknown';

        const seasonNumber = first.seasonNumber;
        const episodes = group
            .map((item) => Number(item.episodeNumber))
            .filter((n) => Number.isFinite(n))
            .sort((a, b) => a - b);
        const epRange = episodes.length
            ? (episodes[0] === episodes[episodes.length - 1]
                ? `E${String(episodes[0]).padStart(2, '0')}`
                : `E${String(episodes[0]).padStart(2, '0')}–E${String(episodes[episodes.length - 1]).padStart(2, '0')}`)
            : '';
        const seasonLabel = Number.isFinite(Number(seasonNumber))
            ? `Season ${Number(seasonNumber)}`
            : 'Season';
        const compactSubtitle = epRange
            ? `${seasonLabel} · ${epRange}`
            : `${seasonLabel} · ${group.length} episodes`;

        return {
            ...first,
            id: key,
            subtitle: compactSubtitle,
            progress,
            phase,
            downloaded,
            total,
            acquisitionKind,
            acquisitionLabel: acquisitionKind === 'upgrade' ? 'Upgrade' : acquisitionKind === 'new' ? 'New' : 'Checking',
            episodeCount: group.length,
            groupedKeys: group.map((item) => item.id),
        };
    });
};
