const DEFAULT_NAV_ORDER = ['home', 'users', 'discover', 'issues', 'status', 'analytics', 'mediastack', 'request', 'settings', 'logout'];

/** Normalize nav order and drop retired entries such as `maintenance`. */
export const normalizeSettingsNavOrder = (order: string[]) => {
    const base = Array.isArray(order)
        ? order.filter((key) => Boolean(key) && key !== 'maintenance')
        : [...DEFAULT_NAV_ORDER];
    if (!base.includes('issues')) {
        const discoverIndex = base.indexOf('discover');
        base.splice(discoverIndex >= 0 ? discoverIndex + 1 : 1, 0, 'issues');
    }
    if (!base.includes('users')) {
        const homeIndex = base.indexOf('home');
        base.splice(homeIndex >= 0 ? homeIndex + 1 : 0, 0, 'users');
    }
    return base;
};

export const getDefaultSettingsNavOrder = () => normalizeSettingsNavOrder(DEFAULT_NAV_ORDER);
