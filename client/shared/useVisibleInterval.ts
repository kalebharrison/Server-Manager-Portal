import { useEffect, useRef } from 'react';

export const useVisibleInterval = (callback: () => void | Promise<void>, intervalMs: number | null) => {
    const callbackRef = useRef(callback);
    const runningRef = useRef(false);

    useEffect(() => {
        callbackRef.current = callback;
    }, [callback]);

    useEffect(() => {
        if (!intervalMs) return;

        const runIfVisible = async () => {
            if (document.visibilityState === 'hidden' || runningRef.current) return;
            runningRef.current = true;
            try {
                await callbackRef.current();
            } finally {
                runningRef.current = false;
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
