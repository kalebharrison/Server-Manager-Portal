import { useCallback, useState } from 'react';

const STORAGE_KEY = 'discoveryShowLibraryQueue';

export function useLibraryQueueToggle() {
    const [showLibraryQueue, setShowLibraryQueueState] = useState(() => {
        if (typeof window === 'undefined') return false;
        const stored = localStorage.getItem(STORAGE_KEY);
        // Default collapsed so Discover opens on content, not the queue panel.
        if (stored === null) return false;
        return stored === 'true';
    });

    const setShowLibraryQueue = useCallback((value: boolean) => {
        setShowLibraryQueueState(value);
        localStorage.setItem(STORAGE_KEY, value ? 'true' : 'false');
    }, []);

    const toggleLibraryQueue = useCallback(() => {
        setShowLibraryQueueState((prev) => {
            const next = !prev;
            localStorage.setItem(STORAGE_KEY, next ? 'true' : 'false');
            return next;
        });
    }, []);

    return { showLibraryQueue, setShowLibraryQueue, toggleLibraryQueue };
}
