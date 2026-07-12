const DEFAULT_NAV_ORDER = ['home', 'users', 'discover', 'status', 'analytics', 'mediastack', 'request', 'settings', 'logout'];

export const ensureMaintenanceNavOrder = (order: string[]) => {
    const base = Array.isArray(order) ? order.filter(Boolean) : [...DEFAULT_NAV_ORDER];
    if (!base.includes('users')) {
        const homeIndex = base.indexOf('home');
        base.splice(homeIndex >= 0 ? homeIndex + 1 : 0, 0, 'users');
    }
    if (!base.includes('maintenance')) {
        const requestIndex = base.indexOf('request');
        if (requestIndex >= 0) base.splice(requestIndex, 0, 'maintenance');
        else base.push('maintenance');
    }
    return base;
};

export const getDefaultSettingsNavOrder = () => ensureMaintenanceNavOrder(DEFAULT_NAV_ORDER);
