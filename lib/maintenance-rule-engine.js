import { normalized } from './deleted-users.js';

export const MAINTENANCE_DEFAULTS = {
    enabled: false,
    dryRunByDefault: true,
    maxActionsPerRun: 25,
    requireConfirmForDestructive: true
};
export const isMaintenanceExperimentalEnabled = (config) => !!config?.maintenanceExperimentalEnabled;
export const MAINTENANCE_PREFS_DEFAULTS = {
    global: {
        dryRunByDefault: true,
        maxActionsPerRun: 25,
        requireConfirmForDestructive: true
    },
    exclusions: {
        ratingKeys: [],
        titles: [],
        libraries: []
    }
};

export const MAINTENANCE_FILTER_CATALOG = [
    { field: 'mediaType', label: 'Media Type', type: 'select', options: ['movie', 'show'], operators: ['equals', 'not_equals', 'in', 'not_in'] },
    { field: 'libraryTitle', label: 'Library', type: 'text', operators: ['equals', 'not_equals', 'contains', 'not_contains', 'in', 'not_in'] },
    { field: 'title', label: 'Title', type: 'text', operators: ['contains', 'not_contains', 'equals', 'not_equals', 'regex'] },
    { field: 'year', label: 'Year', type: 'number', operators: ['equals', 'not_equals', 'greater_than', 'less_than', 'between'] },
    { field: 'watchCount', label: 'Watch Count', type: 'number', operators: ['equals', 'not_equals', 'greater_than', 'less_than', 'between'] },
    { field: 'watchedEver', label: 'Watched Ever', type: 'boolean', operators: ['equals'] },
    { field: 'daysSinceLastWatch', label: 'Days Since Last Watch', type: 'number', operators: ['greater_than', 'less_than', 'between'] },
    { field: 'daysSinceAdded', label: 'Days Since Added', type: 'number', operators: ['greater_than', 'less_than', 'between'] },
    { field: 'durationMinutes', label: 'Duration (minutes)', type: 'number', operators: ['greater_than', 'less_than', 'between'] },
    { field: 'sizeGB', label: 'File Size (GB)', type: 'number', operators: ['greater_than', 'less_than', 'between'] },
    { field: 'videoResolution', label: 'Resolution', type: 'select', options: ['4k', '2160', '1440', '1080', '720', '576', '480', 'sd'], operators: ['equals', 'not_equals', 'in', 'not_in', 'contains'] },
    { field: 'videoCodec', label: 'Video Codec', type: 'text', operators: ['equals', 'not_equals', 'contains', 'not_contains'] },
    { field: 'audioCodec', label: 'Audio Codec', type: 'text', operators: ['equals', 'not_equals', 'contains', 'not_contains'] },
    { field: 'bitrateKbps', label: 'Bitrate (Kbps)', type: 'number', operators: ['greater_than', 'less_than', 'between'] },
    { field: 'genres', label: 'Genres', type: 'array', operators: ['contains', 'not_contains', 'in', 'not_in', 'is_empty', 'not_empty'] },
    { field: 'collections', label: 'Collections', type: 'array', operators: ['contains', 'not_contains', 'in', 'not_in', 'is_empty', 'not_empty'] },
    { field: 'labels', label: 'Labels', type: 'array', operators: ['contains', 'not_contains', 'in', 'not_in', 'is_empty', 'not_empty'] },
    { field: 'studio', label: 'Studio/Network', type: 'text', operators: ['contains', 'not_contains', 'equals', 'not_equals'] },
    { field: 'contentRating', label: 'Content Rating', type: 'text', operators: ['equals', 'not_equals', 'contains', 'not_contains'] },
    { field: 'tmdbRating', label: 'TMDB Rating', type: 'number', operators: ['equals', 'not_equals', 'greater_than', 'less_than', 'between'] },
    { field: 'rtCriticRating', label: 'Rotten Tomatoes Critic', type: 'number', operators: ['equals', 'not_equals', 'greater_than', 'less_than', 'between'] },
    { field: 'rtAudienceRating', label: 'Rotten Tomatoes Audience', type: 'number', operators: ['equals', 'not_equals', 'greater_than', 'less_than', 'between'] },
    { field: 'traktRating', label: 'Trakt Rating', type: 'number', operators: ['equals', 'not_equals', 'greater_than', 'less_than', 'between'] },
    { field: 'arrType', label: 'ARR Mapping Type', type: 'select', options: ['radarr', 'sonarr', 'none'], operators: ['equals', 'not_equals'] },
    { field: 'arrMapped', label: 'ARR Mapped', type: 'boolean', operators: ['equals'] },
    { field: 'requestStatus', label: 'Request Status', type: 'text', operators: ['equals', 'not_equals', 'contains', 'not_contains', 'is_empty', 'not_empty'] },
    { field: 'requestType', label: 'Request Type', type: 'text', operators: ['equals', 'not_equals'] },
    { field: 'daysSinceRequested', label: 'Days Since Requested', type: 'number', operators: ['greater_than', 'less_than', 'between'] },
    { field: 'requestedBy', label: 'Requested By', type: 'text', operators: ['contains', 'not_contains', 'equals', 'not_equals'] },
    { field: 'is4k', label: '4K Item', type: 'boolean', operators: ['equals'] }
];

export const mToLower = (value) => String(value ?? '').toLowerCase();
export const mAsArray = (value) => Array.isArray(value) ? value : (value === undefined || value === null ? [] : [value]);
export const mToNumber = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
};
export const daysSince = (timestamp) => {
    if (!timestamp) return null;
    const t = Date.parse(timestamp);
    if (!Number.isFinite(t)) return null;
    return Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000));
};

export const applyMaintenanceExclusions = (items = [], preferences = MAINTENANCE_PREFS_DEFAULTS) => {
    const excludedKeys = new Set((preferences?.exclusions?.ratingKeys || []).map(v => String(v)));
    const excludedTitles = new Set((preferences?.exclusions?.titles || []).map(v => normalized(v)));
    const excludedLibraries = new Set((preferences?.exclusions?.libraries || []).map(v => normalized(v)));
    return (items || []).filter((item) => {
        if (!item) return false;
        if (excludedKeys.has(String(item.ratingKey || ''))) return false;
        if (excludedTitles.has(normalized(item.title))) return false;
        if (excludedLibraries.has(normalized(item.libraryTitle))) return false;
        return true;
    });
};

export const getMaintenanceSettings = (rule) => ({
    ...MAINTENANCE_DEFAULTS,
    ...(rule?.settings || {})
});

export const computeRuleGraceRemainingDays = (rule) => {
    const minGrace = Math.max(0, Number(rule?.graceDays || 0));
    const createdAtMs = Date.parse(String(rule?.createdAt || ''));
    const hasRuleCreatedAt = Number.isFinite(createdAtMs);
    const daysSinceRuleCreated = hasRuleCreatedAt
        ? Math.max(0, Math.floor((Date.now() - createdAtMs) / (24 * 60 * 60 * 1000)))
        : minGrace;
    return Math.max(0, minGrace - daysSinceRuleCreated);
};

export const resolveMaintenanceMaxActions = (rule, preferences) => {
    const ruleMax = Number(rule?.settings?.maxActionsPerRun);
    if (Number.isFinite(ruleMax) && ruleMax > 0) return Math.max(1, Math.floor(ruleMax));
    const globalMax = Number(preferences?.global?.maxActionsPerRun);
    if (Number.isFinite(globalMax) && globalMax > 0) return Math.max(1, Math.floor(globalMax));
    return MAINTENANCE_DEFAULTS.maxActionsPerRun;
};

export const sanitizeMaintenanceRuleForPersist = (rule) => {
    if (!rule || typeof rule !== 'object') return rule;
    const { overlay, _resetGrace, ...rest } = rule;
    return rest;
};

export const maintenanceValueMap = (item, field) => {
    switch (field) {
        case 'mediaType': return item.mediaType || '';
        case 'libraryTitle': return item.libraryTitle || '';
        case 'title': return item.title || '';
        case 'year': return item.year ?? null;
        case 'watchCount': return item.watchCount ?? 0;
        case 'watchedEver': return !!item.watchedEver;
        case 'daysSinceLastWatch': return item.daysSinceLastWatch ?? null;
        case 'daysSinceAdded': return item.daysSinceAdded ?? null;
        case 'durationMinutes': return item.durationMinutes ?? null;
        case 'sizeGB': return item.sizeGB ?? null;
        case 'videoResolution': return item.videoResolution || '';
        case 'videoCodec': return item.videoCodec || '';
        case 'audioCodec': return item.audioCodec || '';
        case 'bitrateKbps': return item.bitrateKbps ?? null;
        case 'genres': return item.genres || [];
        case 'collections': return item.collections || [];
        case 'labels': return item.labels || [];
        case 'studio': return item.studio || '';
        case 'contentRating': return item.contentRating || '';
        case 'tmdbRating': return item.tmdbRating ?? null;
        case 'rtCriticRating': return item.rtCriticRating ?? null;
        case 'rtAudienceRating': return item.rtAudienceRating ?? null;
        case 'traktRating': return item.traktRating ?? null;
        case 'arrType': return item.arrType || 'none';
        case 'arrMapped': return !!item.arrMapped;
        case 'requestStatus': return item.request?.status || '';
        case 'requestType': return item.request?.type || '';
        case 'daysSinceRequested': return item.request?.daysSinceRequested ?? null;
        case 'requestedBy': return item.request?.requestedBy || '';
        case 'is4k': return !!item.is4k;
        default: return null;
    }
};

export const compareMaintenanceValue = (itemValue, operator, expectedValue) => {
    if (operator === 'is_empty') return mAsArray(itemValue).filter(Boolean).length === 0 || itemValue === '' || itemValue === null;
    if (operator === 'not_empty') return !(mAsArray(itemValue).filter(Boolean).length === 0 || itemValue === '' || itemValue === null);
    if (operator === 'equals') return mToLower(itemValue) === mToLower(expectedValue);
    if (operator === 'not_equals') return mToLower(itemValue) !== mToLower(expectedValue);
    if (operator === 'contains') {
        if (Array.isArray(itemValue)) return itemValue.map(v => mToLower(v)).includes(mToLower(expectedValue));
        return mToLower(itemValue).includes(mToLower(expectedValue));
    }
    if (operator === 'not_contains') {
        if (Array.isArray(itemValue)) return !itemValue.map(v => mToLower(v)).includes(mToLower(expectedValue));
        return !mToLower(itemValue).includes(mToLower(expectedValue));
    }
    if (operator === 'in') {
        const expectedList = mAsArray(expectedValue).map(v => mToLower(v));
        if (Array.isArray(itemValue)) return itemValue.some(v => expectedList.includes(mToLower(v)));
        return expectedList.includes(mToLower(itemValue));
    }
    if (operator === 'not_in') {
        const expectedList = mAsArray(expectedValue).map(v => mToLower(v));
        if (Array.isArray(itemValue)) return !itemValue.some(v => expectedList.includes(mToLower(v)));
        return !expectedList.includes(mToLower(itemValue));
    }
    if (operator === 'regex') {
        try {
            const patternStr = String(expectedValue || '');
            // Guard against ReDoS: reject overly-long or structurally catastrophic patterns
            if (patternStr.length > 250) return false;
            if (/\(.*[+*]\).*[+*]|\(.*[+*]\)\{/.test(patternStr)) return false; // catastrophic backtracking heuristic
            const re = new RegExp(patternStr, 'i');
            // Limit input string length to cap worst-case backtracking
            return re.test(String(itemValue || '').slice(0, 1000));
        } catch (e) {
            return false;
        }
    }
    const left = mToNumber(itemValue);
    if (operator === 'greater_than') return left !== null && left > Number(expectedValue);
    if (operator === 'less_than') return left !== null && left < Number(expectedValue);
    if (operator === 'between') {
        const expected = mAsArray(expectedValue);
        const low = Number(expected[0]);
        const high = Number(expected[1]);
        return left !== null && Number.isFinite(low) && Number.isFinite(high) && left >= low && left <= high;
    }
    return false;
};

export const evaluateMaintenanceFilterNode = (item, node) => {
    if (!node) return true;
    if (Array.isArray(node.conditions)) {
        const logic = String(node.logic || 'AND').toUpperCase();
        const outcomes = node.conditions.map((child) => evaluateMaintenanceFilterNode(item, child));
        if (logic === 'OR') return outcomes.some(Boolean);
        if (logic === 'NOT') return !outcomes.some(Boolean);
        return outcomes.every(Boolean);
    }
    const field = node.field;
    const operator = node.operator || 'equals';
    const value = node.value;
    const itemValue = maintenanceValueMap(item, field);
    return compareMaintenanceValue(itemValue, operator, value);
};

export const evaluateMaintenanceRule = (item, rule) => {
    if (!rule || rule.enabled === false) return false;
    const root = rule.filterTree || rule.filter || null;
    if (!root) return false;
    return evaluateMaintenanceFilterNode(item, root);
};
