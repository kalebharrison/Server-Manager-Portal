export const DEFAULT_DASHBOARD_LAYOUT = {
    version: 1,
    sections: ['wrapUp', 'mainGrid', 'watchRow', 'recentlyAdded'],
    mainGridOrder: [
        'adminBadge',
        'quickActions',
        'accessStatus',
        'announcement',
        'referral',
        'newsletterPrefs',
        'support',
        'libraryStats',
        'analytics',
    ],
    recentlyAddedOrder: ['recentMovies', 'recentShows', 'recentMusic'],
    hiddenSections: [],
    hiddenWidgets: [],
    recentHistoryRows: 7,
    topWatchedRows: 2,
};

const ALL_SECTIONS = ['wrapUp', 'mainGrid', 'watchRow', 'recentlyAdded'];

const uniqueValid = (values, allowed, fallback) => {
    if (!Array.isArray(values)) return [...fallback];
    const seen = new Set();
    const result = [];
    values.forEach((value) => {
        if (typeof value !== 'string' || !allowed.includes(value) || seen.has(value)) return;
        seen.add(value);
        result.push(value);
    });
    allowed.forEach((id) => {
        if (!seen.has(id)) result.push(id);
    });
    return result;
};

export const normalizeDashboardLayout = (raw) => {
    const input = raw && typeof raw === 'object' ? raw : {};
    return {
        version: 1,
        sections: uniqueValid(input.sections, ALL_SECTIONS, DEFAULT_DASHBOARD_LAYOUT.sections),
        mainGridOrder: [...DEFAULT_DASHBOARD_LAYOUT.mainGridOrder],
        recentlyAddedOrder: [...DEFAULT_DASHBOARD_LAYOUT.recentlyAddedOrder],
        hiddenSections: uniqueValid(input.hiddenSections, ALL_SECTIONS, []),
        hiddenWidgets: [],
        recentHistoryRows: typeof input.recentHistoryRows === 'number' ? input.recentHistoryRows : DEFAULT_DASHBOARD_LAYOUT.recentHistoryRows,
        topWatchedRows: typeof input.topWatchedRows === 'number' ? input.topWatchedRows : DEFAULT_DASHBOARD_LAYOUT.topWatchedRows,
    };
};

export const normalizeSectionLayout = (raw) => {
    const normalized = normalizeDashboardLayout(raw);
    const input = raw && typeof raw === 'object' ? raw : null;
    if (!input || !Array.isArray(input.hiddenSections)) {
        return { ...normalized, hiddenSections: [] };
    }
    if (normalized.hiddenSections.length >= ALL_SECTIONS.length) {
        return { ...normalized, hiddenSections: [] };
    }
    return normalized;
};
