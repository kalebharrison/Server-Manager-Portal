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
    | 'runtime_short'
    | 'runtime_long'
    | 'trim'
    | 'hash'
    | 'path'
    | 'other';

export type IntegrityFindingCategoryFilter = IntegrityFindingCategory | 'all' | 'runtime';

export type IntegrityFindingSeverity = 'critical' | 'high' | 'medium' | 'low';

export type IntegrityFindingSeverityFilter = IntegrityFindingSeverity | 'all';

export type IntegrityMediaFilter = 'all' | 'movie' | 'show' | 'album';

export type IntegrityRuntimeDirection = 'short' | 'long' | null;

export const FINDING_SEVERITY_META: Record<IntegrityFindingSeverity, {
    label: string;
    shortLabel: string;
    rank: number;
}> = {
    critical: { label: 'Critical', shortLabel: 'Critical', rank: 0 },
    high: { label: 'High', shortLabel: 'High', rank: 1 },
    medium: { label: 'Medium', shortLabel: 'Medium', rank: 2 },
    low: { label: 'Low', shortLabel: 'Low', rank: 3 },
};

export const FINDING_CATEGORY_META: Record<IntegrityFindingCategory, {
    label: string;
    shortLabel: string;
    blurb: string;
    severity: IntegrityFindingSeverity;
    defaultCollapsedAbove?: number;
}> = {
    broken: {
        label: "Won't play",
        shortLabel: 'Broken',
        blurb: 'Decode or stream probe failed — files are likely corrupt or truncated.',
        severity: 'critical',
    },
    runtime_short: {
        label: 'Shorter than catalog',
        shortLabel: 'Shorter',
        blurb: 'File is shorter than Arr/TMDb/TVDB runtime — possible truncation or incomplete download. Medium priority.',
        severity: 'medium',
    },
    runtime_long: {
        label: 'Longer than catalog',
        shortLabel: 'Longer',
        blurb: 'File is longer than catalog — often extended cuts, credits, or edition metadata drift. Lower priority.',
        severity: 'low',
        defaultCollapsedAbove: 12,
    },
    trim: {
        label: 'Trim / remux',
        shortLabel: 'Trim',
        blurb: 'Keep-rule remux skipped or pending — use Recheck to remux when policy allows. Set native language when lookup fails.',
        severity: 'low',
    },
    hash: {
        label: 'Fingerprint changed',
        shortLabel: 'Hash',
        blurb: 'Quick or full-file hash no longer matches the stored baseline (possible bitrot or file swap).',
        severity: 'high',
    },
    path: {
        label: 'Path / index',
        shortLabel: 'Path',
        blurb: 'File missing on disk, path map issue, or stale Arr index entry.',
        severity: 'high',
    },
    other: {
        label: 'Other',
        shortLabel: 'Other',
        blurb: 'Uncategorized integrity findings.',
        severity: 'low',
    },
};

const CATEGORY_ORDER: IntegrityFindingCategory[] = [
    'broken',
    'path',
    'hash',
    'runtime_short',
    'trim',
    'runtime_long',
    'other',
];

export const integrityRuntimeDirection = (
    finding: Partial<IntegrityFinding> = {},
): IntegrityRuntimeDirection => {
    if (String(finding.reason || '').toLowerCase() !== 'duration_mismatch') return null;
    const measured = Number(finding.durationSec);
    const expected = Number(finding.expectedRuntimeSec);
    if (!Number.isFinite(measured) || measured <= 0 || !Number.isFinite(expected) || expected <= 0) {
        return null;
    }
    if (measured < expected) return 'short';
    if (measured > expected) return 'long';
    return null;
};

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
    if (reason === 'duration_mismatch') {
        return integrityRuntimeDirection(finding) === 'short' ? 'runtime_short' : 'runtime_long';
    }
    if (reason.startsWith('trim_')) return 'trim';
    if (reason.includes('imohash') || reason.includes('xxhash')) return 'hash';
    if (reason === 'missing_file' || reason === 'missing_path' || reason === 'unsafe_path') return 'path';
    return 'other';
};

export const integrityFindingSeverity = (
    finding: Partial<IntegrityFinding> = {},
): IntegrityFindingSeverity => FINDING_CATEGORY_META[integrityFindingCategory(finding)].severity;

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

export const integrityFindingReasonLabel = (
    finding: Partial<IntegrityFinding> | string | null = {},
): string => {
    if (typeof finding === 'string' || finding == null) {
        const key = String(finding || '').toLowerCase();
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
        return labels[key] || String(finding || 'Unknown');
    }
    const reason = String(finding.reason || '').toLowerCase();
    if (reason === 'duration_mismatch') {
        const direction = integrityRuntimeDirection(finding);
        if (direction === 'short') return 'Shorter than catalog';
        if (direction === 'long') return 'Longer than catalog';
        return 'Runtime mismatch';
    }
    return integrityFindingReasonLabel(finding.reason || null);
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
        const direction = measured < expected ? 'shorter' : measured > expected ? 'longer' : 'apart';
        return `File ${measuredMin} min · catalog ${expectedMin} min · ${deltaMin} min ${direction}`;
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
    runtime: number;
    byMedia: Record<Exclude<IntegrityMediaFilter, 'all'>, number>;
    bySeverity: Record<IntegrityFindingSeverity, number>;
};

export const summarizeIntegrityFindings = (findings: IntegrityFinding[] = []): IntegrityFindingSummary => {
    const summary: IntegrityFindingSummary = {
        total: findings.length,
        broken: 0,
        runtime_short: 0,
        runtime_long: 0,
        trim: 0,
        hash: 0,
        path: 0,
        other: 0,
        runtime: 0,
        byMedia: { movie: 0, show: 0, album: 0 },
        bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
    };
    for (const finding of findings) {
        const category = integrityFindingCategory(finding);
        summary[category] += 1;
        if (category === 'runtime_short' || category === 'runtime_long') summary.runtime += 1;
        summary.bySeverity[FINDING_CATEGORY_META[category].severity] += 1;
        const media = integrityFindingMediaType(finding);
        if (media !== 'all') summary.byMedia[media] += 1;
    }
    return summary;
};

const categoryMatchesFilter = (
    category: IntegrityFindingCategory,
    filter: IntegrityFindingCategoryFilter,
) => {
    if (filter === 'all') return true;
    if (filter === 'runtime') return category === 'runtime_short' || category === 'runtime_long';
    return category === filter;
};

export const filterIntegrityFindings = (
    findings: IntegrityFinding[] = [],
    {
        category = 'all',
        media = 'all',
        severity = 'all',
        query = '',
    }: {
        category?: IntegrityFindingCategoryFilter;
        media?: IntegrityMediaFilter;
        severity?: IntegrityFindingSeverityFilter;
        query?: string;
    } = {},
) => {
    const q = String(query || '').trim().toLowerCase();
    return findings.filter((finding) => {
        const cat = integrityFindingCategory(finding);
        if (!categoryMatchesFilter(cat, category)) return false;
        if (severity !== 'all' && FINDING_CATEGORY_META[cat].severity !== severity) return false;
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

export const sortIntegrityFindingsBySeverity = (findings: IntegrityFinding[] = []) => (
    [...findings].sort((a, b) => {
        const rankA = FINDING_SEVERITY_META[integrityFindingSeverity(a)].rank;
        const rankB = FINDING_SEVERITY_META[integrityFindingSeverity(b)].rank;
        if (rankA !== rankB) return rankA - rankB;
        return String(a.title || '').localeCompare(String(b.title || ''));
    })
);

export const groupIntegrityFindings = (
    findings: IntegrityFinding[] = [],
): Array<{ category: IntegrityFindingCategory; items: IntegrityFinding[] }> => (
    CATEGORY_ORDER
        .map((category) => ({
            category,
            items: sortIntegrityFindingsBySeverity(
                findings.filter((finding) => integrityFindingCategory(finding) === category),
            ),
        }))
        .filter((group) => group.items.length > 0)
);

export const findingCategoryBorderClass = (category: IntegrityFindingCategory) => {
    switch (category) {
        case 'broken':
            return 'border-red-500/40 bg-red-500/15';
        case 'runtime_short':
            return 'border-amber-500/35 bg-amber-500/10';
        case 'runtime_long':
            return 'border-yellow-500/20 bg-yellow-500/5';
        case 'trim':
            return 'border-sky-500/25 bg-sky-500/5';
        case 'hash':
            return 'border-violet-500/30 bg-violet-500/10';
        case 'path':
            return 'border-orange-500/30 bg-orange-500/10';
        default:
            return 'border-border/60 bg-white/[0.02]';
    }
};

export const findingSeverityLabel = (categoryOrFinding: IntegrityFindingCategory | Partial<IntegrityFinding>) => {
    const severity = typeof categoryOrFinding === 'string'
        ? FINDING_CATEGORY_META[categoryOrFinding].severity
        : integrityFindingSeverity(categoryOrFinding);
    return FINDING_SEVERITY_META[severity].label;
};

export const AUTO_REPLACE_CATEGORY_OPTIONS: Array<{
    key: Exclude<IntegrityFindingCategory, 'other'>;
    label: string;
    severity: IntegrityFindingSeverity;
    blurb: string;
}> = [
    { key: 'broken', label: "Won't play", severity: 'critical', blurb: 'Decode / probe failures' },
    { key: 'hash', label: 'Fingerprint', severity: 'high', blurb: 'imohash / xxhash mismatches' },
    { key: 'path', label: 'Path / index', severity: 'high', blurb: 'Missing file or path map issues' },
    { key: 'runtime_short', label: 'Shorter than catalog', severity: 'medium', blurb: 'Possible truncation — off by default' },
    { key: 'runtime_long', label: 'Longer than catalog', severity: 'low', blurb: 'Extended cuts / metadata drift' },
    { key: 'trim', label: 'Trim / remux', severity: 'low', blurb: 'Not Arr Replace — leave off' },
];
