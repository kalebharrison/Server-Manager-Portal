export type IntegrityFinding = {
    key: string;
    title: string;
    reason?: string | null;
    detail?: string | null;
    mode?: string | null;
    mediaType?: string | null;
    durationSec?: number | null;
    expectedRuntimeSec?: number | null;
    qualityName?: string | null;
    sourceTitle?: string | null;
    filePath?: string | null;
    localPath?: string | null;
    arrType?: string | null;
    arrInstanceName?: string | null;
    seasonNumber?: number | null;
    episodeNumber?: number | null;
    movieFileId?: number | null;
    episodeFileId?: number | null;
    episodeId?: number | null;
    entityId?: number | null;
    arrInstanceId?: string | null;
    ratingKey?: string | null;
};

export type IntegrityFindingCategory =
    | 'broken'
    | 'runtime'
    | 'trim'
    | 'hash'
    | 'path'
    | 'other';

export type IntegrityMediaFilter = 'all' | 'movie' | 'show' | 'album';

export const FINDING_CATEGORY_META: Record<IntegrityFindingCategory, {
    label: string;
    shortLabel: string;
    blurb: string;
    defaultCollapsedAbove?: number;
}> = {
    broken: {
        label: "Won't play",
        shortLabel: 'Broken',
        blurb: 'Decode or stream probe failed — files are likely corrupt or truncated.',
    },
    runtime: {
        label: 'Runtime drift',
        shortLabel: 'Runtime',
        blurb: 'File length differs from Arr/TMDb/TVDB catalog runtime. Often extended cuts or bad metadata.',
        defaultCollapsedAbove: 15,
    },
    trim: {
        label: 'Trim / remux',
        shortLabel: 'Trim',
        blurb: 'Keep-rule remux skipped or pending — use Recheck to remux when policy allows.',
    },
    hash: {
        label: 'Fingerprint changed',
        shortLabel: 'Hash',
        blurb: 'Quick or full-file hash no longer matches the stored baseline (possible bitrot or file swap).',
    },
    path: {
        label: 'Path / index',
        shortLabel: 'Path',
        blurb: 'File missing on disk, path map issue, or stale Arr index entry.',
    },
    other: {
        label: 'Other',
        shortLabel: 'Other',
        blurb: 'Uncategorized integrity findings.',
    },
};

const CATEGORY_ORDER: IntegrityFindingCategory[] = [
    'broken',
    'path',
    'hash',
    'trim',
    'runtime',
    'other',
];

export const integrityFindingCategory = (finding: Partial<IntegrityFinding> = {}): IntegrityFindingCategory => {
    const reason = String(finding.reason || '').toLowerCase();
    if (
        reason.startsWith('decode_')
        || reason === 'probe_failed'
        || reason === 'probe_timeout'
        || reason === 'missing_video'
        || reason === 'missing_audio'
    ) {
        return 'broken';
    }
    if (reason === 'duration_mismatch') return 'runtime';
    if (reason.startsWith('trim_')) return 'trim';
    if (reason.includes('imohash') || reason.includes('xxhash')) return 'hash';
    if (reason === 'missing_file' || reason === 'missing_path' || reason === 'unsafe_path') return 'path';
    return 'other';
};

export const integrityFindingMediaType = (finding: Partial<IntegrityFinding> = {}): IntegrityMediaFilter => {
    const mt = String(finding.mediaType || '').toLowerCase();
    if (mt === 'movie') return 'movie';
    if (mt === 'show' || mt === 'episode' || mt === 'tv') return 'show';
    if (mt === 'album' || mt === 'track' || mt === 'music') return 'album';
    const arr = String(finding.arrType || '').toLowerCase();
    if (arr === 'radarr') return 'movie';
    if (arr === 'sonarr') return 'show';
    if (arr === 'lidarr') return 'album';
    return 'all';
};

export const integrityFindingReasonLabel = (reason?: string | null) => {
    const key = String(reason || '').toLowerCase();
    const labels: Record<string, string> = {
        decode_start: 'Decode failed at start',
        decode_mid: 'Decode failed in middle',
        decode_mid_timeout: 'Decode timed out in middle',
        decode_end: 'Decode failed at end',
        probe_failed: 'ffprobe failed',
        probe_timeout: 'ffprobe timed out',
        missing_video: 'No video stream',
        missing_audio: 'No audio stream',
        duration_mismatch: 'Runtime mismatch',
        missing_file: 'File missing on disk',
        missing_path: 'Path not mapped',
        unsafe_path: 'Unsafe path',
        imohash_mismatch: 'Quick fingerprint mismatch',
        xxhash_mismatch: 'Full-file hash mismatch',
        trim_native_unknown: 'Native language unknown',
        trim_not_mkv: 'Not an MKV',
        trim_pending: 'Would remux',
    };
    return labels[key] || reason || 'Unknown';
};

export const formatDurationMismatchDetail = (detail?: string | null, finding?: {
    durationSec?: number | null;
    expectedRuntimeSec?: number | null;
}) => {
    const measured = Number(finding?.durationSec);
    const expected = Number(finding?.expectedRuntimeSec);
    if (Number.isFinite(measured) && measured > 0 && Number.isFinite(expected) && expected > 0) {
        const deltaMin = Math.round((Math.abs(measured - expected) / 60) * 10) / 10;
        const measuredMin = Math.round((measured / 60) * 10) / 10;
        const expectedMin = Math.round((expected / 60) * 10) / 10;
        return `File ${measuredMin} min · catalog ${expectedMin} min · ${deltaMin} min apart`;
    }
    const raw = String(detail || '');
    const match = raw.match(/delta=([0-9.]+).*tol=([0-9.]+)/i);
    if (!match) return raw || null;
    const deltaSec = Number(match[1]);
    const tolSec = Number(match[2]);
    if (!Number.isFinite(deltaSec) || !Number.isFinite(tolSec)) return raw;
    const deltaMin = Math.round((deltaSec / 60) * 10) / 10;
    const tolMin = Math.round((tolSec / 60) * 10) / 10;
    return `${deltaMin} min off catalog (±${tolMin} min allowed)`;
};

export type IntegrityFindingSummary = Record<IntegrityFindingCategory, number> & {
    total: number;
    byMedia: Record<Exclude<IntegrityMediaFilter, 'all'>, number>;
};

export const summarizeIntegrityFindings = (findings: IntegrityFinding[] = []): IntegrityFindingSummary => {
    const summary: IntegrityFindingSummary = {
        total: findings.length,
        broken: 0,
        runtime: 0,
        trim: 0,
        hash: 0,
        path: 0,
        other: 0,
        byMedia: { movie: 0, show: 0, album: 0 },
    };
    for (const finding of findings) {
        summary[integrityFindingCategory(finding)] += 1;
        const media = integrityFindingMediaType(finding);
        if (media !== 'all') summary.byMedia[media] += 1;
    }
    return summary;
};

export const filterIntegrityFindings = (
    findings: IntegrityFinding[] = [],
    {
        category = 'all',
        media = 'all',
        query = '',
    }: {
        category?: IntegrityFindingCategory | 'all';
        media?: IntegrityMediaFilter;
        query?: string;
    } = {},
) => {
    const q = String(query || '').trim().toLowerCase();
    return findings.filter((finding) => {
        if (category !== 'all' && integrityFindingCategory(finding) !== category) return false;
        if (media !== 'all' && integrityFindingMediaType(finding) !== media) return false;
        if (!q) return true;
        const haystack = [
            finding.title,
            finding.reason,
            finding.detail,
            finding.filePath,
            finding.localPath,
            finding.arrInstanceName,
        ].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(q);
    });
};

export const groupIntegrityFindings = (
    findings: IntegrityFinding[] = [],
): Array<{ category: IntegrityFindingCategory; items: IntegrityFinding[] }> => (
    CATEGORY_ORDER
        .map((category) => ({
            category,
            items: findings.filter((finding) => integrityFindingCategory(finding) === category),
        }))
        .filter((group) => group.items.length > 0)
);

export const findingCategoryBorderClass = (category: IntegrityFindingCategory) => {
    switch (category) {
        case 'broken':
            return 'border-red-500/30 bg-red-500/10';
        case 'runtime':
            return 'border-amber-500/25 bg-amber-500/5';
        case 'trim':
            return 'border-sky-500/25 bg-sky-500/5';
        case 'hash':
            return 'border-violet-500/25 bg-violet-500/5';
        case 'path':
            return 'border-orange-500/25 bg-orange-500/5';
        default:
            return 'border-border/60 bg-white/[0.02]';
    }
};
