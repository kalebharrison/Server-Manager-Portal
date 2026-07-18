export const DEFAULT_DASHBOARD_LAYOUT = {
    version: 1,
    sections: ['wrapUp', 'mainGrid', 'weekCalendar', 'watchRow', 'recentlyAdded'],
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

const ALL_SECTIONS = ['wrapUp', 'mainGrid', 'weekCalendar', 'watchRow', 'recentlyAdded'];
const ALL_MAIN_GRID = [...DEFAULT_DASHBOARD_LAYOUT.mainGridOrder, 'tempAccessSetup'];
const ALL_RECENTLY_ADDED = [...DEFAULT_DASHBOARD_LAYOUT.recentlyAddedOrder];
const ALL_WIDGETS = [...ALL_MAIN_GRID, ...ALL_RECENTLY_ADDED];

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

const validSubset = (values, allowed) => {
    if (!Array.isArray(values)) return [];
    return [...new Set(values.filter((value) => typeof value === 'string' && allowed.includes(value)))];
};

export const normalizeDashboardLayout = (raw) => {
    const input = raw && typeof raw === 'object' ? raw : {};
    return {
        version: 1,
        sections: uniqueValid(input.sections, ALL_SECTIONS, DEFAULT_DASHBOARD_LAYOUT.sections),
        mainGridOrder: uniqueValid(input.mainGridOrder, ALL_MAIN_GRID, DEFAULT_DASHBOARD_LAYOUT.mainGridOrder),
        recentlyAddedOrder: uniqueValid(input.recentlyAddedOrder, ALL_RECENTLY_ADDED, DEFAULT_DASHBOARD_LAYOUT.recentlyAddedOrder),
        hiddenSections: validSubset(input.hiddenSections, ALL_SECTIONS),
        hiddenWidgets: validSubset(input.hiddenWidgets, ALL_WIDGETS),
        recentHistoryRows: typeof input.recentHistoryRows === 'number' ? input.recentHistoryRows : DEFAULT_DASHBOARD_LAYOUT.recentHistoryRows,
        topWatchedRows: typeof input.topWatchedRows === 'number' ? input.topWatchedRows : DEFAULT_DASHBOARD_LAYOUT.topWatchedRows,
    };
};

/** Widget order/visibility is fixed; only section order + visibility is customizable. */
export const lockWidgetLayout = (layout) => ({
    ...layout,
    mainGridOrder: [...DEFAULT_DASHBOARD_LAYOUT.mainGridOrder],
    recentlyAddedOrder: [...DEFAULT_DASHBOARD_LAYOUT.recentlyAddedOrder],
    hiddenWidgets: [],
});

export const normalizeSectionLayout = (raw) => {
    const normalized = lockWidgetLayout(normalizeDashboardLayout(raw));
    const input = raw && typeof raw === 'object' ? raw : null;
    if (!input || !Array.isArray(input.hiddenSections)) {
        return { ...normalized, hiddenSections: [] };
    }
    if (normalized.hiddenSections.length >= ALL_SECTIONS.length) {
        return { ...normalized, hiddenSections: [] };
    }
    return normalized;
};
