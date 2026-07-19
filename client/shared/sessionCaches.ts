import { clearApiCache } from './api';

const VIEW_CACHE_PREFIXES = [
    'discoverLibrary:',
    'discoverCommunity:',
    'homeLibrary:',
    'homeServerStats:',
    'homeAnalytics:',
    'homeWeekCalendar:',
];

/** Drop in-memory API responses and tab session snapshots after auth changes. */
export const clearPortalViewCaches = () => {
    clearApiCache();
    if (typeof sessionStorage === 'undefined') return;
    const keys: string[] = [];
    for (let index = 0; index < sessionStorage.length; index += 1) {
        const key = sessionStorage.key(index);
        if (!key) continue;
        if (VIEW_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix))) keys.push(key);
    }
    keys.forEach((key) => sessionStorage.removeItem(key));
};
