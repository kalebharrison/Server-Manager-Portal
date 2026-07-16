export type LocalPortalPreferences = {
    clock: 'server' | '12' | '24';
    posterBadges: 'server' | 'show' | 'hide';
    motion: 'server' | 'full' | 'reduced';
    requestMediaType: 'all' | 'movie' | 'tv';
    requestIncludeExisting: boolean;
    calendarMediaType: 'all' | 'tv' | 'movie';
    calendarView: 'list' | 'month';
};

const STORAGE_KEY = 'portal-user-preferences';
export const USER_PREFERENCES_EVENT = 'portal-user-preferences-updated';

const defaults: LocalPortalPreferences = {
    clock: 'server',
    posterBadges: 'server',
    motion: 'server',
    requestMediaType: 'all',
    requestIncludeExisting: true,
    calendarMediaType: 'all',
    calendarView: 'list',
};

const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T => (
    allowed.includes(value as T) ? value as T : fallback
);

export const loadLocalPortalPreferences = (): LocalPortalPreferences => {
    if (typeof window === 'undefined') return { ...defaults };
    try {
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        return {
            clock: oneOf(stored.clock, ['server', '12', '24'] as const, defaults.clock),
            posterBadges: oneOf(stored.posterBadges, ['server', 'show', 'hide'] as const, defaults.posterBadges),
            motion: oneOf(stored.motion, ['server', 'full', 'reduced'] as const, defaults.motion),
            requestMediaType: oneOf(stored.requestMediaType, ['all', 'movie', 'tv'] as const, defaults.requestMediaType),
            requestIncludeExisting: stored.requestIncludeExisting !== false,
            calendarMediaType: oneOf(stored.calendarMediaType, ['all', 'tv', 'movie'] as const, defaults.calendarMediaType),
            calendarView: oneOf(stored.calendarView, ['list', 'month'] as const, defaults.calendarView),
        };
    } catch {
        return { ...defaults };
    }
};

export const saveLocalPortalPreferences = (preferences: LocalPortalPreferences) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    window.dispatchEvent(new CustomEvent(USER_PREFERENCES_EVENT, { detail: preferences }));
};

export const applyLocalPortalPreferences = (config: any, preferences: LocalPortalPreferences) => ({
    ...config,
    use24HourClock: preferences.clock === 'server' ? !!config?.use24HourClock : preferences.clock === '24',
    showPosterQualityBadges: preferences.posterBadges === 'server' ? config?.showPosterQualityBadges !== false : preferences.posterBadges === 'show',
    useScrollRevealAnimations: preferences.motion === 'server' ? !!config?.useScrollRevealAnimations : preferences.motion === 'full',
    useCinematicLoading: preferences.motion === 'reduced' ? false : !!config?.useCinematicLoading,
    useBrandedSkeleton: preferences.motion === 'reduced' ? false : config?.useBrandedSkeleton !== false,
});
