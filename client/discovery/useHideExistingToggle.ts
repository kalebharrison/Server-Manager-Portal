import { useCallback, useState } from 'react';

const STORAGE_KEY = 'discoveryHideExisting';
const LEGACY_KEY = 'discoveryHideRequested';

const readInitial = (): boolean => {
    if (typeof window === 'undefined') return true;
    try {
        const next = localStorage.getItem(STORAGE_KEY);
        if (next === 'true') return true;
        if (next === 'false') return false;
        const legacy = localStorage.getItem(LEGACY_KEY);
        if (legacy === 'true') return true;
        if (legacy === 'false') return false;
    } catch {
        // ignore
    }
    // Default on so large libraries aren't dominated by owned titles.
    return true;
};

/** Toolbar "Hide Existing" — hides library-available titles (not pending requests). */
export function useHideExistingToggle() {
    const [hideExisting, setHideExistingState] = useState(readInitial);

    const setHideExisting = useCallback((value: boolean) => {
        setHideExistingState(value);
        try {
            localStorage.setItem(STORAGE_KEY, value ? 'true' : 'false');
        } catch {
            // ignore
        }
    }, []);

    return { hideExisting, setHideExisting };
}
