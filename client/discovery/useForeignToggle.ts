import { useCallback, useState } from 'react';

const STORAGE_KEY = 'discoveryForeignOnly';

export function useForeignToggle() {
    const [foreignOnly, setForeignOnlyState] = useState(() => {
        if (typeof window === 'undefined') return false;
        try {
            return localStorage.getItem(STORAGE_KEY) === 'true';
        } catch {
            return false;
        }
    });

    const setForeignOnly = useCallback((value: boolean) => {
        setForeignOnlyState(value);
        try {
            localStorage.setItem(STORAGE_KEY, value ? 'true' : 'false');
        } catch {
            // ignore
        }
    }, []);

    return { foreignOnly, setForeignOnly };
}
