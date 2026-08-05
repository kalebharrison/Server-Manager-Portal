const DEFAULT_NAV_ORDER = ['home', 'users', 'discover', 'issues', 'status', 'analytics', 'mediastack', 'request', 'upgrader', 'settings', 'logout'];

export const ALWAYS_VISIBLE_NAV_KEYS = new Set(['home', 'settings', 'logout', 'preferences']);

/** Normalize nav order and drop retired entries such as `maintenance` and `scanner`. */
export const normalizeSettingsNavOrder = (order: string[]) => {
    const base = Array.isArray(order)
        ? order.filter((key) => Boolean(key) && key !== 'maintenance' && key !== 'scanner')
        : [...DEFAULT_NAV_ORDER];
    if (!base.includes('issues')) {
        const discoverIndex = base.indexOf('discover');
        base.splice(discoverIndex >= 0 ? discoverIndex + 1 : 1, 0, 'issues');
    }
    if (!base.includes('users')) {
        const homeIndex = base.indexOf('home');
        base.splice(homeIndex >= 0 ? homeIndex + 1 : 0, 0, 'users');
    }
    if (!base.includes('upgrader')) {
        const settingsIndex = base.indexOf('settings');
        base.splice(settingsIndex >= 0 ? settingsIndex : base.length, 0, 'upgrader');
    }
    return base;
};

export const normalizeNavHiddenKeys = (keys?: string[] | null): string[] => {
    if (!Array.isArray(keys)) return [];
    const seen = new Set<string>();
    const result: string[] = [];
    for (const raw of keys) {
        const key = String(raw || '').trim();
        if (!key || ALWAYS_VISIBLE_NAV_KEYS.has(key) || seen.has(key)) continue;
        seen.add(key);
        result.push(key);
    }
    return result;
};

export const getDefaultSettingsNavOrder = () => normalizeSettingsNavOrder(DEFAULT_NAV_ORDER);
