import { useCallback, useState } from 'react';

const STORAGE_KEY = 'discoveryAnimeOnly';

export function useAnimeToggle() {
    const [animeOnly, setAnimeOnlyState] = useState(() => {
        if (typeof window === 'undefined') return false;
        try {
            return localStorage.getItem(STORAGE_KEY) === 'true';
        } catch {
            return false;
        }
    });

    const setAnimeOnly = useCallback((value: boolean) => {
        setAnimeOnlyState(value);
        try {
            localStorage.setItem(STORAGE_KEY, value ? 'true' : 'false');
        } catch {
            // ignore
        }
    }, []);

    return { animeOnly, setAnimeOnly };
}
