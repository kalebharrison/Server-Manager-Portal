const DEFAULT_NAV_ORDER = ['home', 'users', 'discover', 'request', 'issues', 'status', 'analytics', 'mediastack', 'upgrader', 'settings', 'logout'];

export const ALWAYS_VISIBLE_NAV_KEYS = new Set(['home', 'settings', 'logout', 'preferences']);

/** Keep Request Content immediately under Discover. */
export const placeRequestAfterDiscover = (order: string[]) => {
    const next = Array.isArray(order) ? [...order] : [];
    const requestIdx = next.indexOf('request');
    if (requestIdx >= 0) next.splice(requestIdx, 1);
    const discoverIdx = next.indexOf('discover');
    if (discoverIdx >= 0) {
        next.splice(discoverIdx + 1, 0, 'request');
    } else if (!next.includes('request')) {
        next.splice(Math.min(1, next.length), 0, 'request');
    }
    return next;
};

/** Normalize nav order and drop retired entries such as `maintenance` and `scanner`. */
export const normalizeSettingsNavOrder = (order: string[]) => {
    let base = Array.isArray(order)
        ? order.filter((key) => Boolean(key) && key !== 'maintenance' && key !== 'scanner')
        : [...DEFAULT_NAV_ORDER];
    base = placeRequestAfterDiscover(base);
    if (!base.includes('issues')) {
        const requestIndex = base.indexOf('request');
        const discoverIndex = base.indexOf('discover');
        const insertAt = requestIndex >= 0
            ? requestIndex + 1
            : (discoverIndex >= 0 ? discoverIndex + 1 : 1);
        base.splice(insertAt, 0, 'issues');
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
