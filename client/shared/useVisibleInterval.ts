import { useEffect, useRef } from 'react';

export const useVisibleInterval = (callback: () => void | Promise<void>, intervalMs: number | null) => {
    const callbackRef = useRef(callback);

    useEffect(() => {
        callbackRef.current = callback;
    }, [callback]);

    useEffect(() => {
        if (!intervalMs) return;

        const runIfVisible = () => {
            if (document.visibilityState !== 'hidden') {
                void callbackRef.current();
            }
        };

        const interval = window.setInterval(runIfVisible, intervalMs);
        document.addEventListener('visibilitychange', runIfVisible);
        return () => {
            window.clearInterval(interval);
            document.removeEventListener('visibilitychange', runIfVisible);
        };
    }, [intervalMs]);
};
